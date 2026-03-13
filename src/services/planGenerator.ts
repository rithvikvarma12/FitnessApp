import { addDays, format, parseISO } from "date-fns";
import { db, getActiveUserId } from "../db/db";
import type {
  PlannedExercise,
  SetEntry,
  WeekPlan,
  WorkoutDay,
  ExerciseTemplate,
  PlanTemplate,
  DayTemplate,
  CustomExercise,
  NoteChip,
  ActiveInjury,
} from "../db/types";
import {
  normalizeName,
  classifyMuscleBucket,
  isGymOnlyExercise,
  isHomeFriendly,
  isIsolationExercise,
  preferredGroupsFromDayTitle,
  cloneDayTemplates,
  applyEquipmentToDayTemplates,
  computePlannedSets,
  remapDayTemplatesForTargetDays,
  type EquipmentType,
  type GoalMode,
  type MuscleBucket,
} from "./exerciseSelector";
import {
  computeNextProgressionSuggestion,
  buildPlannedSetWeightsFromBase,
  type WeightUnit,
} from "./progressionEngine";
import { getExerciseExclusions, downgradeSeverity, getActiveInjuries, updateInjuryStatus } from "./injuryMemory";

export { applyEquipmentToDayTemplates, remapDayTemplatesForTargetDays };

const uid = () => crypto.randomUUID();

type NoteGroup = "chest" | "back" | "legs" | "arms" | "shoulders";
type GenerationConstraints = {
  targetDays: 3 | 4 | 5;
  focusGroups: NoteGroup[];
  avoidGroups: NoteGroup[];
  timeCapMinutes?: number;
};

// --- Note parsing ---

function inferNextWeekDays(notes?: string, explicit?: number | string | null): number {
  const explicitNum =
    typeof explicit === "number"
      ? explicit
      : typeof explicit === "string"
        ? Number(explicit.trim())
        : undefined;
  if (explicitNum === 3 || explicitNum === 4 || explicitNum === 5) return explicitNum;

  const text = (notes ?? "").toLowerCase();

  const priorityPatterns = [
    /\b([345])\s*(?:x|days?)?\s*next\s*week\b/g,
    /\bnext\s*week\s*(?:for\s*)?([345])\b/g,
    /\bfor\s+week\s+\d+\s+(?:do\s+)?([345])\b/g,
  ];
  for (const re of priorityPatterns) {
    const matches = Array.from(text.matchAll(re));
    if (matches.length > 0) {
      const last = matches[matches.length - 1];
      return Number(last[1]) as 3 | 4 | 5;
    }
  }

  const fallbackPatterns = [/\b([345])\s*days?\b/g, /\b([345])\s*x\b/g];
  for (const re of fallbackPatterns) {
    const matches = Array.from(text.matchAll(re));
    if (matches.length > 0) {
      const last = matches[matches.length - 1];
      return Number(last[1]) as 3 | 4 | 5;
    }
  }

  return 5;
}

function parseTimeCapMinutes(notes?: string): number | undefined {
  const text = (notes ?? "").toLowerCase();
  const minMatch = text.match(/\b(\d{1,3})\s*(min|mins|minute|minutes)\b/);
  if (minMatch) return Number(minMatch[1]);
  const hourMatch = text.match(/\b(\d{1,2})\s*(hour|hours|hr|hrs)\b/);
  if (hourMatch) return Number(hourMatch[1]) * 60;
  return undefined;
}

function containsAny(text: string, patterns: string[]): boolean {
  return patterns.some((p) => text.includes(p));
}

function parseGroupMentions(notes?: string): Pick<GenerationConstraints, "focusGroups" | "avoidGroups"> {
  const text = (notes ?? "").toLowerCase();
  const groups: Array<{ key: NoteGroup; aliases: string[] }> = [
    { key: "chest", aliases: ["chest", "pec"] },
    { key: "back", aliases: ["back", "lats", "lat"] },
    { key: "legs", aliases: ["legs", "leg", "quads", "hamstrings", "calves", "calf"] },
    { key: "arms", aliases: ["arms", "arm", "biceps", "triceps"] },
    { key: "shoulders", aliases: ["shoulders", "shoulder", "delts", "delt"] },
  ];

  const focusGroups: NoteGroup[] = [];
  const avoidGroups: NoteGroup[] = [];

  for (const group of groups) {
    const wantsAvoid = group.aliases.some((alias) =>
      containsAny(text, [
        "no " + alias, "avoid " + alias, "skip " + alias,
        "without " + alias, alias + " sore", alias + " hurts", alias + " hurt",
      ])
    );

    if (wantsAvoid) {
      avoidGroups.push(group.key);
      continue;
    }

    const wantsFocus = group.aliases.some((alias) =>
      containsAny(text, [
        "focus " + alias, "focus on " + alias, "prioritize " + alias,
        "more " + alias, "extra " + alias, alias + " focus",
      ])
    );

    if (wantsFocus) focusGroups.push(group.key);
  }

  return { focusGroups, avoidGroups };
}

function parseGenerationConstraints(notes?: string, explicitDays?: number): GenerationConstraints {
  const parsedDays = inferNextWeekDays(notes, explicitDays);
  const targetDays = (parsedDays === 3 || parsedDays === 4 || parsedDays === 5 ? parsedDays : 5) as 3 | 4 | 5;
  const { focusGroups, avoidGroups } = parseGroupMentions(notes);
  return { targetDays, focusGroups, avoidGroups, timeCapMinutes: parseTimeCapMinutes(notes) };
}

// --- Week building helpers ---

function mondayOfTodayISO(): string {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = addDays(now, diffToMonday);
  return format(monday, "yyyy-MM-dd");
}

function makeSets(
  plannedSets: number,
  ex: ExerciseTemplate,
  plannedWeightKg?: number,
  perSetPlannedWeightKg?: Array<number | undefined>
): SetEntry[] {
  return Array.from({ length: plannedSets }, (_, i) => ({
    setNumber: i + 1,
    plannedRepsMin: ex.repRange.min,
    plannedRepsMax: ex.repRange.max,
    plannedWeightKg: perSetPlannedWeightKg?.[i] ?? plannedWeightKg,
    actualReps: undefined,
    actualWeightKg: undefined,
    completed: false,
  }));
}

function lastWeekExerciseSnapshot(prevWeek: WeekPlan | undefined, name: string): PlannedExercise | undefined {
  if (!prevWeek) return undefined;
  for (const d of prevWeek.days) {
    const found = d.exercises.find((e) => e.name === name);
    if (found) return found;
  }
  return undefined;
}

function dedupeAndRefillDayByName(
  day: DayTemplate,
  exTemplates: ExerciseTemplate[],
  equipment: EquipmentType,
  minExercises: number
): DayTemplate {
  const exById = new Map(exTemplates.map((e) => [e.id, e]));
  const seen = new Set<string>();
  const uniqueIds: string[] = [];

  for (const id of day.exerciseTemplateIds) {
    const ex = exById.get(id);
    if (!ex) continue;
    const key = normalizeName(ex.name);
    if (seen.has(key)) continue;
    if (equipment !== "gym" && isGymOnlyExercise(ex.name)) continue;
    if (day.title.toLowerCase().includes("upper") && classifyMuscleBucket(ex.name) === "legs") continue;
    seen.add(key);
    uniqueIds.push(id);
  }

  if (uniqueIds.length < minExercises) {
    const preferredGroups = preferredGroupsFromDayTitle(day.title);
    const refillPool = exTemplates
      .filter((ex) => !seen.has(normalizeName(ex.name)))
      .filter((ex) => equipment === "gym" || !isGymOnlyExercise(ex.name))
      .filter((ex) => equipment === "gym" || isHomeFriendly(ex.name))
      .sort((a, b) => {
        const ga = classifyMuscleBucket(a.name);
        const gb = classifyMuscleBucket(b.name);
        const ia = preferredGroups.indexOf(ga as MuscleBucket);
        const ib = preferredGroups.indexOf(gb as MuscleBucket);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });

    for (const ex of refillPool) {
      if (uniqueIds.length >= minExercises) break;
      if (day.title.toLowerCase().includes("upper") && classifyMuscleBucket(ex.name) === "legs") continue;
      const key = normalizeName(ex.name);
      if (seen.has(key)) continue;
      uniqueIds.push(ex.id);
      seen.add(key);
    }
  }

  return { ...day, exerciseTemplateIds: uniqueIds };
}

function applyGenerationConstraintsToDayTemplates(
  dayTemplates: DayTemplate[],
  plan: PlanTemplate,
  exTemplates: ExerciseTemplate[],
  constraints: GenerationConstraints
): DayTemplate[] {
  const exById = new Map(exTemplates.map((e) => [e.id, e]));
  const constrained = cloneDayTemplates(dayTemplates);

  if (constraints.avoidGroups.includes("legs")) {
    for (const day of constrained) {
      day.exerciseTemplateIds = day.exerciseTemplateIds.filter((exId) => {
        const ex = exById.get(exId);
        return ex ? classifyMuscleBucket(ex.name) !== "legs" : true;
      });
    }
  }

  if (constraints.focusGroups.includes("chest")) {
    const extraSlotsTarget = constraints.targetDays >= 4 ? 2 : 1;
    const allPlannedIds = new Set(constrained.flatMap((d) => d.exerciseTemplateIds));
    const chestCandidates = plan.dayTemplates
      .slice()
      .sort((a, b) => a.weekdayIndex - b.weekdayIndex)
      .flatMap((d) => d.exerciseTemplateIds)
      .filter((exId, idx, arr) => arr.indexOf(exId) === idx)
      .filter((exId) => {
        const ex = exById.get(exId);
        return ex ? classifyMuscleBucket(ex.name) === "chest" : false;
      });

    const targetDays = constrained
      .filter((d) => !d.title.toLowerCase().includes("lower"))
      .sort((a, b) => a.exerciseTemplateIds.length - b.exerciseTemplateIds.length);

    let added = 0;
    for (const day of targetDays) {
      if (added >= extraSlotsTarget) break;
      const nextChestId =
        chestCandidates.find((id) => !day.exerciseTemplateIds.includes(id) && !allPlannedIds.has(id)) ??
        chestCandidates.find((id) => !day.exerciseTemplateIds.includes(id)) ??
        chestCandidates[0];
      if (!nextChestId) continue;
      day.exerciseTemplateIds.push(nextChestId);
      allPlannedIds.add(nextChestId);
      added += 1;
    }
  }

  return constrained;
}

// --- Goal/cardio helpers ---

function normalizeGoal(goal?: "cut" | "maintain" | "gain" | "bulk"): GoalMode {
  if (goal === "cut") return "cut";
  if (goal === "gain" || goal === "bulk") return "bulk";
  return "maintain";
}

function exerciseCapForGoal(goal: GoalMode): number {
  if (goal === "cut") return 6;
  if (goal === "bulk") return 8;
  return 7;
}

function cardioPrescriptionForGoal(goal: GoalMode): {
  sessionsPerWeek: number;
  minutes: number;
  intensity: "easy" | "moderate" | "hard";
} {
  if (goal === "cut") return { sessionsPerWeek: 4, minutes: 25, intensity: "moderate" };
  if (goal === "bulk") return { sessionsPerWeek: 2, minutes: 15, intensity: "easy" };
  return { sessionsPerWeek: 3, minutes: 20, intensity: "easy" };
}

function isLegDayTitle(title: string): boolean {
  const t = title.toLowerCase();
  return t.includes("leg") || t.includes("lower");
}

function attachCardioBlocks(days: WorkoutDay[], goal: GoalMode): WorkoutDay[] {
  const plan = cardioPrescriptionForGoal(goal);
  const targetSessions = Math.min(plan.sessionsPerWeek, days.length);
  if (targetSessions <= 0) return days;

  const preferred = days.filter((d) => !isLegDayTitle(d.title));
  const fallback = days.filter((d) => isLegDayTitle(d.title));
  const chosen = [...preferred, ...fallback].slice(0, targetSessions);
  const chosenIds = new Set(chosen.map((d) => d.id));
  const modalities: Array<"Treadmill" | "Stairmaster" | "Bike" | "Row"> = ["Treadmill", "Stairmaster", "Bike"];
  let modalityIdx = 0;

  return days.map((day) => {
    if (!chosenIds.has(day.id)) return day;
    const modality = modalities[modalityIdx % modalities.length];
    modalityIdx += 1;
    return { ...day, cardio: { modality, minutes: plan.minutes, intensity: plan.intensity } };
  });
}

// --- Chip helpers ---

function chipEquipmentToEquipmentType(chipEquip: string): EquipmentType {
  const map: Record<string, EquipmentType> = {
    "Full Gym": "gym",
    "Hotel Gym": "gym",
    "Bodyweight Only": "minimal",
    "Home (bands + dumbbells)": "home",
    "Dumbbells Only": "home",
  };
  return map[chipEquip] ?? "gym";
}

function chipMuscleGroupToBuckets(group: string): MuscleBucket[] {
  const g = group.toLowerCase();
  if (g === "chest") return ["chest"];
  if (g === "back") return ["back"];
  if (g === "shoulders") return ["shoulders"];
  if (g === "legs") return ["legs"];
  if (g === "arms") return ["biceps", "triceps"];
  return [];
}

function injuryAdaptationNote(area: string, severity: string): string {
  const a = area.toLowerCase();
  const s = severity.toLowerCase();
  const cap = a.charAt(0).toUpperCase() + a.slice(1);
  if (a === "shoulder") {
    if (s === "mild") return cap + " injury (" + s + ") — no overhead pressing";
    if (s === "moderate") return cap + " injury (" + s + ") — no overhead pressing or incline work";
    return cap + " injury (" + s + ") — no shoulder-loading exercises";
  }
  if (a === "knee") {
    if (s === "mild") return cap + " injury (" + s + ") — avoiding deep squats";
    if (s === "moderate") return cap + " injury (" + s + ") — no squats or lunges";
    return cap + " injury (" + s + ") — no quad-dominant leg work";
  }
  if (a === "back") {
    if (s === "mild") return cap + " injury (" + s + ") — no heavy deadlifts";
    if (s === "moderate") return cap + " injury (" + s + ") — no deadlifts or heavy rows";
    return cap + " injury (" + s + ") — no back-loading exercises";
  }
  if (a === "elbow") {
    if (s === "severe") return cap + " injury (" + s + ") — no direct arm isolation";
    return cap + " injury (" + s + ") — reduced arm isolation work";
  }
  if (a === "wrist") return cap + " injury (" + s + ") — barbell exercises substituted";
  if (a === "hip") {
    if (s === "severe") return cap + " injury (" + s + ") — no hip-hinge movements";
    return cap + " injury (" + s + ") — no lunges or deep hip work";
  }
  return cap + " injury (" + s + ") — modified exercise selection";
}

function applyChipAdjustments(
  days: WorkoutDay[],
  chips: NoteChip[],
  activeInjuries: ActiveInjury[],
  adaptations: string[]
): { days: WorkoutDay[]; isDeload: boolean; injuriesApplied: { area: string; severity: string }[] } {
  const isDeloadWeek = chips.some((c) => c.type === "deload");
  const isFatiguedWeek = !isDeloadWeek && chips.some((c) => c.type === "fatigued");
  const focusChip = chips.find((c) => c.type === "focus");
  const injuryChip = chips.find((c) => c.type === "injury");
  const travelChip = chips.find((c) => c.type === "traveling");

  const allInjuries: Array<{ area: string; severity: string; label: string }> = [];
  if (injuryChip?.area && injuryChip?.severity) {
    allInjuries.push({
      area: injuryChip.area,
      severity: injuryChip.severity,
      label: injuryChip.area + " (" + injuryChip.severity + ")",
    });
  }
  for (const inj of activeInjuries) {
    if (allInjuries.some((i) => i.area.toLowerCase() === inj.area.toLowerCase())) continue;
    const eff = inj.status === "improving" ? downgradeSeverity(inj.severity) : inj.severity;
    allInjuries.push({ area: inj.area, severity: eff, label: inj.area + " (" + inj.severity + ")" });
  }

  let result = days;

  // 1. Injury exclusions
  if (allInjuries.length > 0) {
    const allExclusions = allInjuries.flatMap((i) => getExerciseExclusions(i.area, i.severity));
    if (allExclusions.length > 0) {
      result = result.map((day) => ({
        ...day,
        exercises: day.exercises.filter(
          (ex) => !allExclusions.some((pattern) => ex.name.toLowerCase().includes(pattern.toLowerCase()))
        ),
      }));
    }
    for (const inj of allInjuries) {
      adaptations.push(injuryAdaptationNote(inj.area, inj.severity));
    }
  }

  // 2. Deload: reduce sets by 1, reduce weights by 12.5%
  if (isDeloadWeek) {
    result = result.map((day) => ({
      ...day,
      exercises: day.exercises.map((ex) => {
        const newSets = Math.max(1, ex.plannedSets - 1);
        const newWeight =
          ex.plannedWeightKg !== undefined ? Math.round(ex.plannedWeightKg * 0.875) : undefined;
        return {
          ...ex,
          plannedSets: newSets,
          plannedWeightKg: newWeight,
          sets: ex.sets.slice(0, newSets).map((s) => ({
            ...s,
            plannedWeightKg: newWeight ?? s.plannedWeightKg,
          })),
        };
      }),
    }));
    adaptations.push("Deload week — reduced volume and intensity");
  }

  // 3. Fatigued: remove last isolation exercise per day, or drop 1 set
  if (isFatiguedWeek) {
    result = result.map((day) => {
      const isolationIdxs = day.exercises
        .map((ex, i) => ({ ex, i }))
        .filter(({ ex }) => isIsolationExercise(ex.name))
        .map(({ i }) => i);
      if (isolationIdxs.length > 0) {
        const removeIdx = isolationIdxs[isolationIdxs.length - 1];
        return { ...day, exercises: day.exercises.filter((_, i) => i !== removeIdx) };
      }
      return {
        ...day,
        exercises: day.exercises.map((ex) => {
          const newSets = Math.max(1, ex.plannedSets - 1);
          return { ...ex, plannedSets: newSets, sets: ex.sets.slice(0, newSets) };
        }),
      };
    });
    adaptations.push("Fatigue recovery — reduced accessory work");
  }

  // 4. Focus: add 1 extra set to target muscle group exercises
  if (focusChip?.muscleGroup) {
    const focusBuckets = chipMuscleGroupToBuckets(focusChip.muscleGroup);
    if (focusBuckets.length > 0) {
      result = result.map((day) => ({
        ...day,
        exercises: day.exercises.map((ex) => {
          const bucket = classifyMuscleBucket(ex.name);
          if (!focusBuckets.includes(bucket)) return ex;
          const newSets = ex.plannedSets + 1;
          const lastSet = ex.sets[ex.sets.length - 1];
          return {
            ...ex,
            plannedSets: newSets,
            sets: [
              ...ex.sets,
              {
                setNumber: newSets,
                plannedRepsMin: lastSet?.plannedRepsMin ?? 8,
                plannedRepsMax: lastSet?.plannedRepsMax ?? 12,
                plannedWeightKg: ex.plannedWeightKg,
                actualReps: undefined,
                actualWeightKg: undefined,
                completed: false,
              },
            ],
          };
        }),
      }));
      adaptations.push("Focus: " + focusChip.muscleGroup + " — added volume");
    }
  }

  // 5. Traveling note
  if (travelChip) {
    const parts = ["Traveling"];
    if (travelChip.days) parts.push(travelChip.days + " days");
    if (travelChip.equipment) parts.push(travelChip.equipment + " equipment");
    adaptations.push(parts.join(", "));
  }

  return { days: result, isDeload: isDeloadWeek, injuriesApplied: allInjuries.map(i => ({ area: i.area, severity: i.severity })) };
}

// --- Core week generator ---

async function generateWeekFromTemplate(
  plan: PlanTemplate,
  exTemplates: ExerciseTemplate[],
  weekNumber: number,
  startDateISO: string,
  prevWeek: WeekPlan | undefined,
  userId: string,
  explicitTargetDays?: 3 | 4 | 5,
  chips?: NoteChip[],
  activeInjuries?: ActiveInjury[]
): Promise<WeekPlan> {
  const start = parseISO(startDateISO);
  const userProfile = await db.userProfiles.get(userId);
  const userUnit: WeightUnit = userProfile?.unit ?? "kg";
  const userEquipment: EquipmentType = userProfile?.equipment ?? "gym";
  const goalMode: GoalMode = normalizeGoal(userProfile?.goalMode ?? userProfile?.goal);
  const exerciseCap = exerciseCapForGoal(goalMode);

  const activeChips = chips ?? [];
  const chipDays =
    activeChips.find((c) => c.type === "days_override")?.days ??
    activeChips.find((c) => c.type === "traveling")?.days;
  const chipEquipStr =
    activeChips.find((c) => c.type === "equipment_change")?.equipment ??
    activeChips.find((c) => c.type === "traveling")?.equipment;

  const effectiveEquipment: EquipmentType = chipEquipStr
    ? chipEquipmentToEquipmentType(chipEquipStr)
    : userEquipment;

  const constraints = chipDays
    ? parseGenerationConstraints(prevWeek?.notes, chipDays)
    : explicitTargetDays
      ? parseGenerationConstraints(undefined, explicitTargetDays)
      : parseGenerationConstraints(prevWeek?.notes, prevWeek?.nextWeekDays);
  if (chipDays && (chipDays === 3 || chipDays === 4 || chipDays === 5)) {
    constraints.targetDays = chipDays;
  }

  const chosenBase = remapDayTemplatesForTargetDays(plan, constraints.targetDays, exTemplates);
  const chosen = applyGenerationConstraintsToDayTemplates(chosenBase, plan, exTemplates, constraints);
  const equipmentAdjusted = applyEquipmentToDayTemplates(chosen, exTemplates, effectiveEquipment);
  const minExercisesPerDay = constraints.targetDays === 5 ? 1 : 5;
  const finalizedTemplates = equipmentAdjusted
    .map((day) => dedupeAndRefillDayByName(day, exTemplates, effectiveEquipment, minExercisesPerDay))
    .map((day) => ({
      ...day,
      exerciseTemplateIds: day.exerciseTemplateIds.slice(0, exerciseCap),
    }));

  const days: WorkoutDay[] = finalizedTemplates.map((dt) => {
    const date = addDays(start, dt.weekdayIndex);
    const dateISO = format(date, "yyyy-MM-dd");

    const plannedExercises: PlannedExercise[] = dt.exerciseTemplateIds.map((id: string) => {
      const exT = exTemplates.find((e) => e.id === id);
      if (!exT) throw new Error("Missing exercise template");

      const prevEx = lastWeekExerciseSnapshot(prevWeek, exT.name);
      const computedSets = computePlannedSets(exT.name, dt.title, goalMode);
      const plannedSets =
        Number.isFinite(computedSets) && computedSets > 0 ? computedSets : exT.defaultSets;
      const progression = computeNextProgressionSuggestion(prevEx, exT.name, userUnit);
      const nextWeight = progression?.baseWeightKg;
      const perSetPlannedWeights = buildPlannedSetWeightsFromBase(
        plannedSets,
        nextWeight,
        progression?.rampOffsetsKg
      );

      return {
        id: uid(),
        name: exT.name,
        plannedSets,
        repRange: exT.repRange,
        plannedWeightKg: nextWeight,
        sets: makeSets(plannedSets, exT, nextWeight, perSetPlannedWeights),
      };
    });

    return {
      id: uid(),
      dateISO,
      title: dt.title,
      exercises: plannedExercises,
      isComplete: false,
    };
  });

  // Apply female-specific modifications
  const userGender = userProfile?.gender;
  if (userGender === "female") {
    // 1. Increase rep ranges on all exercises by 4
    for (const day of days) {
      for (const ex of day.exercises) {
        ex.repRange = { min: ex.repRange.min + 4, max: ex.repRange.max + 4 };
        for (const set of ex.sets) { set.plannedRepsMin += 4; set.plannedRepsMax += 4; }
      }
    }
    // 2. Insert Hip Thrust or Glute Bridge at start of Lower days
    const gluteTemplate =
      exTemplates.find((e) => e.name.toLowerCase() === "hip thrust") ??
      exTemplates.find((e) => e.name.toLowerCase() === "glute bridge");
    if (gluteTemplate) {
      for (const day of days) {
        if (day.title.toLowerCase().includes("lower") && !day.exercises.some((e) => e.name.toLowerCase() === gluteTemplate.name.toLowerCase())) {
          const prevEx = lastWeekExerciseSnapshot(prevWeek, gluteTemplate.name);
          const ps = computePlannedSets(gluteTemplate.name, day.title, goalMode);
          const prog = computeNextProgressionSuggestion(prevEx, gluteTemplate.name, userUnit);
          const nw = prog?.baseWeightKg;
          const boostedRange = { min: gluteTemplate.repRange.min + 4, max: gluteTemplate.repRange.max + 4 };
          day.exercises.unshift({
            id: uid(), name: gluteTemplate.name, plannedSets: ps, repRange: boostedRange,
            plannedWeightKg: nw,
            sets: makeSets(ps, { ...gluteTemplate, repRange: boostedRange }, nw, buildPlannedSetWeightsFromBase(ps, nw, prog?.rampOffsetsKg)),
          });
        }
      }
    }
    // 3. Replace last exercise on Chest days with a shoulders exercise
    for (const day of days) {
      if (day.title.toLowerCase().includes("chest") && day.exercises.length > 0) {
        const shoulderTemplate = exTemplates.find((e) =>
          classifyMuscleBucket(e.name) === "shoulders" &&
          !day.exercises.some((ex) => ex.name.toLowerCase() === e.name.toLowerCase())
        );
        if (shoulderTemplate) {
          day.exercises.pop();
          const prevEx = lastWeekExerciseSnapshot(prevWeek, shoulderTemplate.name);
          const ps = computePlannedSets(shoulderTemplate.name, day.title, goalMode);
          const prog = computeNextProgressionSuggestion(prevEx, shoulderTemplate.name, userUnit);
          const nw = prog?.baseWeightKg;
          const boostedRange = { min: shoulderTemplate.repRange.min + 4, max: shoulderTemplate.repRange.max + 4 };
          day.exercises.push({
            id: uid(), name: shoulderTemplate.name, plannedSets: ps, repRange: boostedRange,
            plannedWeightKg: nw,
            sets: makeSets(ps, { ...shoulderTemplate, repRange: boostedRange }, nw, buildPlannedSetWeightsFromBase(ps, nw, prog?.rampOffsetsKg)),
          });
        }
      }
    }
  }

  const daysWithCardio = attachCardioBlocks(days, goalMode);

  const adaptations: string[] = [];
  const { days: adjustedDays, isDeload, injuriesApplied } = applyChipAdjustments(
    daysWithCardio,
    activeChips,
    activeInjuries ?? [],
    adaptations
  );

  return {
    id: uid(),
    userId,
    weekNumber,
    startDateISO,
    createdAtISO: new Date().toISOString(),
    days: adjustedDays,
    isLocked: false,
    ...(isDeload ? { isDeload: true } : {}),
    ...(adaptations.length > 0 ? { adaptations } : {}),
    ...(injuriesApplied.length > 0 ? { activeInjuriesSnapshot: injuriesApplied } : {}),
  };
}

// --- Public API ---

export async function getLatestWeek(userId?: string): Promise<WeekPlan | undefined> {
  const activeUserId = userId ?? (await getActiveUserId());
  if (!activeUserId) return undefined;
  const all = await db.weekPlans.where("userId").equals(activeUserId).toArray();
  all.sort((a, b) => b.weekNumber - a.weekNumber);
  return all[0];
}

export async function createFirstWeekIfMissing(options?: { userId?: string; weekNumber?: number }) {
  const activeUserId = options?.userId ?? (await getActiveUserId());
  if (!activeUserId) throw new Error("No active profile selected.");
  const existing = await db.weekPlans.where("userId").equals(activeUserId).count();
  if (existing > 0) return;

  const planTemplate = await db.planTemplates.toCollection().first();
  if (!planTemplate) throw new Error("No plan template found. Seed failed?");

  const builtinExercises = await db.exerciseTemplates.toArray();
  const customExercisesRaw: CustomExercise[] = await db.customExercises
    .where("userId")
    .equals(activeUserId)
    .toArray();
  const exercises: ExerciseTemplate[] = [
    ...builtinExercises,
    ...customExercisesRaw.map((cx) => ({
      id: cx.id,
      name: cx.name,
      defaultSets: cx.type === "compound" ? 4 : 3,
      repRange: cx.type === "compound" ? { min: 6, max: 10 } : { min: 10, max: 15 },
    })),
  ];
  const profile = await db.userProfiles.get(activeUserId);
  const explicitTargetDays = profile?.daysPerWeek ?? 5;
  const weekNumber = options?.weekNumber ?? 1;
  const startDateISO = mondayOfTodayISO();
  const week = await generateWeekFromTemplate(
    planTemplate,
    exercises,
    weekNumber,
    startDateISO,
    undefined,
    activeUserId,
    explicitTargetDays
  );

  await db.weekPlans.add(week);
}

export async function generateNextWeek() {
  const activeUserId = await getActiveUserId();
  if (!activeUserId) throw new Error("No active profile selected.");
  const planTemplate = await db.planTemplates.toCollection().first();
  if (!planTemplate) throw new Error("No plan template found.");

  const builtinTemplates = await db.exerciseTemplates.toArray();
  const customExercisesRaw: CustomExercise[] = await db.customExercises
    .where("userId")
    .equals(activeUserId)
    .toArray();
  const exTemplates: ExerciseTemplate[] = [
    ...builtinTemplates,
    ...customExercisesRaw.map((cx) => ({
      id: cx.id,
      name: cx.name,
      defaultSets: cx.type === "compound" ? 4 : 3,
      repRange: cx.type === "compound" ? { min: 6, max: 10 } : { min: 10, max: 15 },
    })),
  ];
  const latest = await getLatestWeek(activeUserId);

  if (latest && !latest.isLocked) {
    await db.weekPlans.update(latest.id, { isLocked: true });
  }

  const chips: NoteChip[] = latest?.noteChips ?? [];

  const equipChip = chips.find((c) => c.type === "equipment_change");
  if (equipChip?.equipment && equipChip.duration === "until_changed") {
    const eqMap: Record<string, "gym" | "home" | "minimal"> = {
      "Full Gym": "gym",
      "Dumbbells Only": "home",
      "Home (bands + dumbbells)": "home",
      "Bodyweight Only": "minimal",
    };
    const newEq = eqMap[equipChip.equipment];
    if (newEq) await db.userProfiles.update(activeUserId, { equipment: newEq });
  }

  const activeInjuries = await getActiveInjuries(activeUserId);

  // Natural language injury resolution: scan notes for recovery phrases before chip processing
  const RECOVERY_PHRASES = [
    "no more injury", "injury gone", "recovered", "healed",
    "no longer hurting", "pain free", "pain gone", "feeling better",
    "fully recovered", "injury resolved",
  ];
  const notesText = (latest?.notes ?? "").toLowerCase();
  const injuriesCleared =
    activeInjuries.length > 0 &&
    RECOVERY_PHRASES.some((p) => notesText.includes(p));
  if (injuriesCleared) {
    await Promise.all(activeInjuries.map((inj) => updateInjuryStatus(inj.id, "resolved")));
  }
  const injuriesForPlan = injuriesCleared ? [] : activeInjuries;

  const nextWeekNumber = (latest?.weekNumber ?? 0) + 1;
  const nextStart = latest
    ? format(addDays(parseISO(latest.startDateISO), 7), "yyyy-MM-dd")
    : mondayOfTodayISO();

  const newWeek = await generateWeekFromTemplate(
    planTemplate,
    exTemplates,
    nextWeekNumber,
    nextStart,
    latest,
    activeUserId,
    undefined,
    chips,
    injuriesForPlan
  );

  if (injuriesCleared) {
    newWeek.adaptations = [
      "Injuries cleared based on notes — full exercise selection restored",
      ...(newWeek.adaptations ?? []),
    ];
  }

  await db.weekPlans.add(newWeek);
  return newWeek;
}

// Returns the set of muscle buckets a completed day title covers.
// Handles all common title formats: plain group names, slash/plus combos, Upper Push/Pull, Full Body.
function musclesFromDayTitle(title: string): MuscleBucket[] {
  const t = title.toLowerCase();

  // Full Body covers everything
  if (t.includes("full body") || t.includes("fullbody"))
    return ["chest", "back", "legs", "shoulders", "biceps", "triceps"];

  const covered = new Set<MuscleBucket>();

  // Leg / lower variants
  if (t.includes("lower") || t.includes("leg") || t.includes("glute")) covered.add("legs");

  // Push patterns: Upper Push, Chest days
  if (
    (t.includes("upper") && (t.includes("push") || t.includes("push focus"))) ||
    t.includes("chest")
  ) {
    covered.add("chest");
    covered.add("shoulders");
    covered.add("triceps");
  }

  // Pull patterns: Upper Pull, Back days
  if (
    (t.includes("upper") && (t.includes("pull") || t.includes("pull focus"))) ||
    t.includes("back") ||
    t.includes("pull + shoulder") ||
    t.includes("lower + back")
  ) {
    covered.add("back");
    covered.add("biceps");
  }

  // Standalone shoulder day
  if (t.includes("shoulder")) {
    covered.add("shoulders");
    covered.add("triceps");
  }

  // Bicep day
  if (t.includes("bicep")) {
    covered.add("biceps");
    covered.add("back"); // typically paired
  }

  // Tricep day
  if (t.includes("tricep")) {
    covered.add("triceps");
    covered.add("chest"); // typically paired
  }

  // Arms day
  if (t.includes("arm")) {
    covered.add("biceps");
    covered.add("triceps");
  }

  // If nothing matched, fall back to exercise-name analysis below (return empty for now)
  return Array.from(covered);
}

export async function generateAdjustedRemainingDays(
  currentWeek: WeekPlan,
  targetRemainingCount: 1 | 2 | 3
): Promise<WorkoutDay[]> {
  const activeUserId = currentWeek.userId;
  const planTemplate = await db.planTemplates.toCollection().first();
  if (!planTemplate) throw new Error("No plan template found.");

  const builtinTemplates = await db.exerciseTemplates.toArray();
  const customExercisesRaw: CustomExercise[] = await db.customExercises
    .where("userId").equals(activeUserId).toArray();
  const exTemplates: ExerciseTemplate[] = [
    ...builtinTemplates,
    ...customExercisesRaw.map((cx) => ({
      id: cx.id,
      name: cx.name,
      defaultSets: cx.type === "compound" ? 4 : 3,
      repRange: cx.type === "compound" ? { min: 6, max: 10 } : { min: 10, max: 15 },
    })),
  ];

  const completedDays = currentWeek.days.filter((d) => d.isComplete);
  const incompleteDays = currentWeek.days
    .filter((d) => !d.isComplete)
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));

  // The date slots we will fill (up to targetRemainingCount)
  const slotDates = incompleteDays
    .slice(0, targetRemainingCount)
    .map((d) => d.dateISO);

  if (slotDates.length === 0) return currentWeek.days;

  // Build the full set of muscle buckets already trained this week.
  // Use both title-based mapping and actual exercise names for maximum accuracy.
  const coveredMuscles = new Set<MuscleBucket>();
  for (const day of completedDays) {
    // Title-based coverage
    for (const m of musclesFromDayTitle(day.title)) coveredMuscles.add(m);
    // Exercise-name-based coverage (catches custom/unusual day titles)
    for (const ex of day.exercises) {
      const bucket = classifyMuscleBucket(ex.name);
      if (bucket !== "other") coveredMuscles.add(bucket);
    }
  }

  // Generate 3 template days — covers push, lower+back, and pull archetypes
  const tempWeek = await generateWeekFromTemplate(
    planTemplate,
    exTemplates,
    currentWeek.weekNumber,
    currentWeek.startDateISO,
    currentWeek,
    activeUserId,
    3
  );

  // Score each generated day: higher = more untrained muscle coverage.
  // Count exercises that hit muscles NOT yet covered this week.
  function scoreDay(day: WorkoutDay): number {
    let score = 0;
    const seenInDay = new Set<MuscleBucket>();
    for (const ex of day.exercises) {
      const bucket = classifyMuscleBucket(ex.name);
      if (bucket !== "other" && !coveredMuscles.has(bucket) && !seenInDay.has(bucket)) {
        score += 1;
        seenInDay.add(bucket);
      }
    }
    return score;
  }

  // Sort: highest untrained-muscle score first
  const prioritized = [...tempWeek.days].sort((a, b) => scoreDay(b) - scoreDay(a));

  // Take the first N days, remap dates to the available incomplete slots
  const newDays: WorkoutDay[] = prioritized
    .slice(0, slotDates.length)
    .map((day, i) => ({
      ...day,
      id: crypto.randomUUID(),
      dateISO: slotDates[i] ?? day.dateISO,
      isComplete: false,
    }));

  return [...completedDays, ...newDays].sort((a, b) =>
    a.dateISO.localeCompare(b.dateISO)
  );
}

