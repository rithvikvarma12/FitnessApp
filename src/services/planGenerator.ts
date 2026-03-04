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
  CustomExercise
} from "../db/types";
import {
  normalizeName,
  classifyMuscleBucket,
  isGymOnlyExercise,
  isHomeFriendly,
  preferredGroupsFromDayTitle,
  cloneDayTemplates,
  applyEquipmentToDayTemplates,
  computePlannedSets,
  remapDayTemplatesForTargetDays,
  type EquipmentType,
  type GoalMode,
  type MuscleBucket
} from "./exerciseSelector";
import {
  computeNextProgressionSuggestion,
  buildPlannedSetWeightsFromBase,
  type WeightUnit
} from "./progressionEngine";

export { applyEquipmentToDayTemplates, remapDayTemplatesForTargetDays };

const uid = () => crypto.randomUUID();

type NoteGroup = "chest" | "back" | "legs" | "arms" | "shoulders";
type GenerationConstraints = {
  targetDays: 3 | 4 | 5;
  focusGroups: NoteGroup[];
  avoidGroups: NoteGroup[];
  timeCapMinutes?: number;
};

// ─── Note parsing ──────────────────────────────────────────────────────────────

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
    /\bfor\s+week\s+\d+\s+(?:do\s+)?([345])\b/g
  ];
  for (const re of priorityPatterns) {
    const matches = Array.from(text.matchAll(re));
    if (matches.length > 0) {
      const last = matches[matches.length - 1];
      return Number(last[1]) as 3 | 4 | 5;
    }
  }

  const fallbackPatterns = [
    /\b([345])\s*days?\b/g,
    /\b([345])\s*x\b/g
  ];
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
    { key: "shoulders", aliases: ["shoulders", "shoulder", "delts", "delt"] }
  ];

  const focusGroups: NoteGroup[] = [];
  const avoidGroups: NoteGroup[] = [];

  for (const group of groups) {
    const wantsAvoid = group.aliases.some((alias) =>
      containsAny(text, [
        `no ${alias}`, `avoid ${alias}`, `skip ${alias}`,
        `without ${alias}`, `${alias} sore`, `${alias} hurts`, `${alias} hurt`
      ])
    );

    if (wantsAvoid) {
      avoidGroups.push(group.key);
      continue;
    }

    const wantsFocus = group.aliases.some((alias) =>
      containsAny(text, [
        `focus ${alias}`, `focus on ${alias}`, `prioritize ${alias}`,
        `more ${alias}`, `extra ${alias}`, `${alias} focus`
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

// ─── Week building helpers ─────────────────────────────────────────────────────

function mondayOfTodayISO(): string {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = (day === 0 ? -6 : 1 - day);
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
    completed: false
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

// ─── Goal/cardio helpers ───────────────────────────────────────────────────────

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

// ─── Core week generator ───────────────────────────────────────────────────────

async function generateWeekFromTemplate(
  plan: PlanTemplate,
  exTemplates: ExerciseTemplate[],
  weekNumber: number,
  startDateISO: string,
  prevWeek: WeekPlan | undefined,
  userId: string,
  explicitTargetDays?: 3 | 4 | 5
): Promise<WeekPlan> {
  const start = parseISO(startDateISO);
  const userProfile = await db.userProfiles.get(userId);
  const userUnit: WeightUnit = userProfile?.unit ?? "kg";
  const userEquipment: EquipmentType = userProfile?.equipment ?? "gym";
  const goalMode: GoalMode = normalizeGoal(userProfile?.goalMode ?? userProfile?.goal);
  const exerciseCap = exerciseCapForGoal(goalMode);

  const constraints = explicitTargetDays
    ? parseGenerationConstraints(undefined, explicitTargetDays)
    : parseGenerationConstraints(prevWeek?.notes, prevWeek?.nextWeekDays);
  const chosenBase = remapDayTemplatesForTargetDays(plan, constraints.targetDays, exTemplates);
  const chosen = applyGenerationConstraintsToDayTemplates(chosenBase, plan, exTemplates, constraints);
  const equipmentAdjusted = applyEquipmentToDayTemplates(chosen, exTemplates, userEquipment);
  const minExercisesPerDay = constraints.targetDays === 5 ? 1 : 5;
  const finalizedTemplates = equipmentAdjusted
    .map((day) => dedupeAndRefillDayByName(day, exTemplates, userEquipment, minExercisesPerDay))
    .map((day) => ({
      ...day,
      exerciseTemplateIds: day.exerciseTemplateIds.slice(0, exerciseCap)
    }));

  const days: WorkoutDay[] = finalizedTemplates.map((dt) => {
    const date = addDays(start, dt.weekdayIndex);
    const dateISO = format(date, "yyyy-MM-dd");

    const plannedExercises: PlannedExercise[] = dt.exerciseTemplateIds.map((id: string) => {
      const exT = exTemplates.find((e) => e.id === id);
      if (!exT) throw new Error("Missing exercise template");

      const prevEx = lastWeekExerciseSnapshot(prevWeek, exT.name);
      const computedSets = computePlannedSets(exT.name, dt.title, goalMode);
      const plannedSets = Number.isFinite(computedSets) && computedSets > 0
        ? computedSets
        : exT.defaultSets;
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
        sets: makeSets(plannedSets, exT, nextWeight, perSetPlannedWeights)
      };
    });

    return {
      id: uid(),
      dateISO,
      title: dt.title,
      exercises: plannedExercises,
      isComplete: false
    };
  });

  const daysWithCardio = attachCardioBlocks(days, goalMode);

  return {
    id: uid(),
    userId,
    weekNumber,
    startDateISO,
    createdAtISO: new Date().toISOString(),
    days: daysWithCardio,
    isLocked: false
  };
}

// ─── Public API ────────────────────────────────────────────────────────────────

export async function getLatestWeek(userId?: string): Promise<WeekPlan | undefined> {
  const activeUserId = userId ?? await getActiveUserId();
  if (!activeUserId) return undefined;
  const all = await db.weekPlans.where("userId").equals(activeUserId).toArray();
  all.sort((a, b) => b.weekNumber - a.weekNumber);
  return all[0];
}

export async function createFirstWeekIfMissing(options?: { userId?: string; weekNumber?: number }) {
  const activeUserId = options?.userId ?? await getActiveUserId();
  if (!activeUserId) throw new Error("No active profile selected.");
  const existing = await db.weekPlans.where("userId").equals(activeUserId).count();
  if (existing > 0) return;

  const planTemplate = await db.planTemplates.toCollection().first();
  if (!planTemplate) throw new Error("No plan template found. Seed failed?");

  const builtinExercises = await db.exerciseTemplates.toArray();
  const customExercisesRaw: CustomExercise[] = await db.customExercises.where("userId").equals(activeUserId).toArray();
  const exercises: ExerciseTemplate[] = [
    ...builtinExercises,
    ...customExercisesRaw.map((cx) => ({
      id: cx.id,
      name: cx.name,
      defaultSets: cx.type === "compound" ? 4 : 3,
      repRange: cx.type === "compound" ? { min: 6, max: 10 } : { min: 10, max: 15 }
    }))
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
  const customExercisesRaw: CustomExercise[] = await db.customExercises.where("userId").equals(activeUserId).toArray();
  const exTemplates: ExerciseTemplate[] = [
    ...builtinTemplates,
    ...customExercisesRaw.map((cx) => ({
      id: cx.id,
      name: cx.name,
      defaultSets: cx.type === "compound" ? 4 : 3,
      repRange: cx.type === "compound" ? { min: 6, max: 10 } : { min: 10, max: 15 }
    }))
  ];
  const latest = await getLatestWeek(activeUserId);

  if (latest && !latest.isLocked) {
    await db.weekPlans.update(latest.id, { isLocked: true });
  }

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
    activeUserId
  );

  await db.weekPlans.add(newWeek);
  return newWeek;
}
