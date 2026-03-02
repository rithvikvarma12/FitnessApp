import { addDays, format, parseISO } from "date-fns";
import { db, getActiveUserId } from "../db/db";
import type {
  PlannedExercise,
  SetEntry,
  WeekPlan,
  WorkoutDay,
  ExerciseTemplate,
  PlanTemplate,
  DayTemplate
} from "../db/types";

const uid = () => crypto.randomUUID();
type WeightUnit = "kg" | "lb";
type NoteGroup = "chest" | "back" | "legs" | "arms" | "shoulders";
type GenerationConstraints = {
  targetDays: 3 | 4 | 5;
  focusGroups: NoteGroup[];
  avoidGroups: NoteGroup[];
  timeCapMinutes?: number;
};
type EquipmentType = "gym" | "home" | "minimal";
type GoalMode = "cut" | "maintain" | "bulk";
const MAX_EXERCISES_PER_DAY_HARD = 8;

function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

function inferNextWeekDays(notes?: string, explicit?: number | string | null): number {
  const explicitNum =
    typeof explicit === "number"
      ? explicit
      : typeof explicit === "string"
        ? Number(explicit.trim())
        : undefined;
  if (explicitNum === 3 || explicitNum === 4 || explicitNum === 5) return explicitNum;

  const text = (notes ?? "").toLowerCase();

  // Prefer patterns where "next week" appears near the number.
  const priorityPatterns = [
    /\b([345])\s*(?:x|days?)?\s*next\s*week\b/g, // "4 next week", "4x next week", "4 days next week"
    /\bnext\s*week\s*(?:for\s*)?([345])\b/g, // "next week 3"
    /\bfor\s+week\s+\d+\s+(?:do\s+)?([345])\b/g // "for week 7 do 4"
  ];
  for (const re of priorityPatterns) {
    const matches = Array.from(text.matchAll(re));
    if (matches.length > 0) {
      const last = matches[matches.length - 1];
      return Number(last[1]) as 3 | 4 | 5;
    }
  }

  // Fallback: generic day-count mentions.
  const fallbackPatterns = [
    /\b([345])\s*days?\b/g, // "3 day", "3 days"
    /\b([345])\s*x\b/g // "4x"
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
        `no ${alias}`,
        `avoid ${alias}`,
        `skip ${alias}`,
        `without ${alias}`,
        `${alias} sore`,
        `${alias} hurts`,
        `${alias} hurt`
      ])
    );

    if (wantsAvoid) {
      avoidGroups.push(group.key);
      continue;
    }

    const wantsFocus = group.aliases.some((alias) =>
      containsAny(text, [
        `focus ${alias}`,
        `focus on ${alias}`,
        `prioritize ${alias}`,
        `more ${alias}`,
        `extra ${alias}`,
        `${alias} focus`
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

  return {
    targetDays,
    focusGroups,
    avoidGroups,
    timeCapMinutes: parseTimeCapMinutes(notes)
  };
}

function pickTemplateDays(dayTemplates: DayTemplate[], targetDays: number): DayTemplate[] {
  const map: Record<number, number[]> = {
    5: [0, 1, 2, 3, 4],
    4: [0, 1, 3, 4],
    3: [0, 2, 4]
  };

  const idxs = map[targetDays] ?? map[5];

  return dayTemplates
    .filter(dt => idxs.includes(dt.weekdayIndex))
    .sort((a, b) => a.weekdayIndex - b.weekdayIndex);
}

type MuscleBucket = "chest" | "back" | "legs" | "shoulders" | "biceps" | "triceps" | "other";

const MUSCLE_KEYWORDS: Record<Exclude<MuscleBucket, "other">, string[]> = {
  chest: ["bench", "crossover", "fly"],
  back: ["row", "pulldown", "lat"],
  legs: ["press", "extension", "curl", "calf", "squat"],
  shoulders: ["shoulder", "lateral", "delt", "raise"],
  biceps: ["curl", "preacher", "hammer"],
  triceps: ["tricep", "pressdown", "extension"]
};

const COMPOUND_KEYWORDS = [
  "bench",
  "row",
  "pulldown",
  "lat",
  "press",
  "squat",
  "deadlift",
  "lunge",
  "pull-up",
  "pullup",
  "chin-up",
  "chinup"
];

function classifyMuscleBucket(name: string): MuscleBucket {
  const n = name.toLowerCase();

  if (
    n.includes("leg") ||
    n.includes("calf") ||
    n.includes("squat") ||
    n.includes("lunge") ||
    n.includes("glute bridge") ||
    n.includes("romanian deadlift") ||
    n.includes("rdl")
  ) return "legs";

  if (MUSCLE_KEYWORDS.triceps.some(k => n.includes(k))) return "triceps";
  if (n.includes("overhead tricep")) return "triceps";
  if (n.includes("bicep") || MUSCLE_KEYWORDS.biceps.some(k => n.includes(k))) return "biceps";
  if (n.includes("dumbbell bicep")) return "biceps";
  if (n.includes("pike push-up") || n.includes("pike push up")) return "shoulders";
  if (n.includes("dumbbell shoulder press")) return "shoulders";
  if (MUSCLE_KEYWORDS.shoulders.some(k => n.includes(k))) return "shoulders";
  if (n.includes("push-up") || n.includes("push up")) return "chest";
  if (n.includes("floor press")) return "chest";
  if (MUSCLE_KEYWORDS.chest.some(k => n.includes(k))) return "chest";
  if (MUSCLE_KEYWORDS.back.some(k => n.includes(k))) return "back";
  if ((n.includes("extension") || n.includes("curl")) && n.includes("leg")) return "legs";
  if (n.includes("press") && n.includes("leg")) return "legs";
  if (n.includes("row")) return "back";

  return "other";
}

function isCompoundExercise(name: string): boolean {
  const n = name.toLowerCase();
  return COMPOUND_KEYWORDS.some(k => n.includes(k));
}

function isIsolationExercise(name: string): boolean {
  const n = name.toLowerCase();
  const isolationKeywords = [
    "crossover",
    "lateral",
    "pressdown",
    "curl",
    "rear delt",
    "fly",
    "calf raise",
    "calf raises",
    "preacher",
    "hammer"
  ];
  return isolationKeywords.some((k) => n.includes(k));
}

function isGymOnlyExercise(name: string): boolean {
  const n = name.toLowerCase();
  return [
    "cable",
    "machine",
    "leg press",
    "lat pulldown",
    "pulldown",
    "seated cable",
    "pec fly machine",
    "leg extension",
    "leg curl"
  ].some((k) => n.includes(k));
}

function isHomeFriendly(name: string): boolean {
  const n = name.toLowerCase();
  return [
    "push-up",
    "push up",
    "dumbbell",
    "bodyweight",
    "band",
    "plank",
    "squat",
    "lunge",
    "split squat",
    "rdl",
    "romanian deadlift",
    "glute bridge",
    "pull-up",
    "pull up"
  ].some((k) => n.includes(k));
}

function requiredGroupsForDayTitle(title: string): MuscleBucket[] {
  const t = title.toLowerCase();
  if (t.includes("upper") && t.includes("push")) return ["chest", "shoulders"];
  if (t.includes("lower + back")) return ["legs", "back"];
  if (t.includes("upper") && t.includes("pull")) return ["back", "shoulders"];
  if (t === "lower" || t.includes("lower (")) return ["legs"];
  return [];
}

function substitutionNameCandidates(sourceName: string): string[] {
  const n = sourceName.toLowerCase();
  if (n.includes("flat bench press")) return ["Dumbbell Floor Press", "Push-Ups"];
  if (n.includes("cable crossover")) return ["Dumbbell Fly", "Push-Ups"];
  if (n.includes("lat pulldown") || n.includes("pulldown")) {
    return ["Band Lat Pulldown", "Pull-Ups", "One-Arm Dumbbell Row"];
  }
  if (n.includes("seated cable row")) return ["One-Arm Dumbbell Row"];
  if (n.includes("leg press")) return ["Goblet Squat", "Bodyweight Squat"];
  if (n.includes("leg extension")) return ["Split Squat", "Lunge"];
  if (n.includes("leg curl")) return ["RDL", "Romanian Deadlift", "Glute Bridge"];
  if (n.includes("machine")) return ["Dumbbell", "Bodyweight", "Band"];
  if (n.includes("cable")) return ["Dumbbell", "Band", "Push-Ups"];
  return [];
}

function findExistingExerciseIdByNames(
  exTemplates: ExerciseTemplate[],
  candidateNames: string[],
  excludedIds: Set<string>
): string | undefined {
  if (candidateNames.length === 0) return undefined;

  const lowerCandidates = candidateNames.map((x) => x.toLowerCase());
  const exact = exTemplates.find((ex) =>
    !excludedIds.has(ex.id) && lowerCandidates.includes(ex.name.toLowerCase())
  );
  if (exact && !isGymOnlyExercise(exact.name)) return exact.id;

  for (const candidate of lowerCandidates) {
    const partial = exTemplates.find((ex) =>
      !excludedIds.has(ex.id) &&
      ex.name.toLowerCase().includes(candidate) &&
      !isGymOnlyExercise(ex.name)
    );
    if (partial) return partial.id;
  }

  return undefined;
}

function preferredGroupsFromDayTitle(title: string): MuscleBucket[] {
  const t = title.toLowerCase();
  if (t.includes("upper") && t.includes("push")) return ["chest", "shoulders", "triceps", "biceps"];
  if (t.includes("upper") && t.includes("pull")) return ["back", "biceps", "shoulders", "triceps"];
  if (t.includes("lower + back")) return ["legs", "back"];
  if (t.includes("lower")) return ["legs", "back"];
  if (t.includes("chest")) return ["chest", "biceps", "triceps"];
  if (t.includes("back")) return ["back", "biceps"];
  if (t.includes("shoulder")) return ["shoulders", "triceps", "chest"];
  return ["other", "chest", "back", "legs", "shoulders", "biceps", "triceps"];
}

export function applyEquipmentToDayTemplates(
  dayTemplates: DayTemplate[],
  exTemplates: ExerciseTemplate[],
  equipment: EquipmentType
): DayTemplate[] {
  if (equipment === "gym") return cloneDayTemplates(dayTemplates);

  const exById = new Map(exTemplates.map((e) => [e.id, e]));
  const adapted = cloneDayTemplates(dayTemplates);

  for (const day of adapted) {
    const nextIds: string[] = [];
    const usedDayIds = new Set<string>();
    const usedDayNames = new Set<string>();

    for (const exId of day.exerciseTemplateIds) {
      const ex = exById.get(exId);
      if (!ex) continue;

      if (!isGymOnlyExercise(ex.name)) {
        if (usedDayIds.has(exId)) continue;
        const key = normalizeName(ex.name);
        if (usedDayNames.has(key)) continue;
        nextIds.push(exId);
        usedDayIds.add(exId);
        usedDayNames.add(key);
        continue;
      }

      const substituteId = findExistingExerciseIdByNames(
        exTemplates,
        substitutionNameCandidates(ex.name),
        usedDayIds
      );

      if (substituteId) {
        const sub = exById.get(substituteId);
        const key = sub ? normalizeName(sub.name) : "";
        if (key && usedDayNames.has(key)) continue;
        nextIds.push(substituteId);
        usedDayIds.add(substituteId);
        if (sub) usedDayNames.add(normalizeName(sub.name));
      } else {
        console.warn(`[planGenerator] Dropping gym-only exercise for ${equipment} profile: ${ex.name}`);
      }
    }

    day.exerciseTemplateIds = Array.from(new Set(nextIds));

    // Try to satisfy must-have groups first (3-day/4-day builders and similar titles).
    const mustHaveGroups = requiredGroupsForDayTitle(day.title);
    const presentGroups = new Set(day.exerciseTemplateIds
      .map((id) => exById.get(id))
      .filter((x): x is ExerciseTemplate => !!x)
      .map((ex) => classifyMuscleBucket(ex.name)));

    for (const requiredGroup of mustHaveGroups) {
      if (presentGroups.has(requiredGroup)) continue;
      const candidate = exTemplates
        .filter((ex) => !usedDayIds.has(ex.id))
        .filter((ex) => !isGymOnlyExercise(ex.name))
        .filter((ex) => equipment === "home" ? true : isHomeFriendly(ex.name))
        .find((ex) => classifyMuscleBucket(ex.name) === requiredGroup);

      if (candidate) {
        const key = normalizeName(candidate.name);
        if (usedDayNames.has(key)) continue;
        day.exerciseTemplateIds.push(candidate.id);
        usedDayIds.add(candidate.id);
        usedDayNames.add(key);
        presentGroups.add(requiredGroup);
      }
    }

    // Try to refill day using home-friendly / non-gym-only options, but never reintroduce gym-only moves.
    const preferredGroups = preferredGroupsFromDayTitle(day.title);
    const canUseLegs = !day.title.toLowerCase().includes("upper");
    const refillPool = exTemplates
      .filter((ex) => !usedDayIds.has(ex.id))
      .filter((ex) => !isGymOnlyExercise(ex.name))
      .filter((ex) => isHomeFriendly(ex.name) || equipment === "home")
      .sort((a, b) => {
        const ga = classifyMuscleBucket(a.name);
        const gb = classifyMuscleBucket(b.name);
        const ia = preferredGroups.indexOf(ga);
        const ib = preferredGroups.indexOf(gb);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });

    for (const ex of refillPool) {
      if (day.exerciseTemplateIds.length >= MAX_EXERCISES_PER_DAY_HARD) break;
      const group = classifyMuscleBucket(ex.name);
      if (!canUseLegs && group === "legs") continue;
      if (usedDayIds.has(ex.id)) continue;
      const key = normalizeName(ex.name);
      if (usedDayNames.has(key)) continue;
      day.exerciseTemplateIds.push(ex.id);
      usedDayIds.add(ex.id);
      usedDayNames.add(key);
      if (day.exerciseTemplateIds.length >= 5) break;
    }

    // Final strict pass: remove gym-only (paranoia) + dedupe.
    const finalSeenNames = new Set<string>();
    day.exerciseTemplateIds = day.exerciseTemplateIds.filter((id, idx, arr) => {
      if (arr.indexOf(id) !== idx) return false;
      const ex = exById.get(id);
      if (!ex) return false;
      const key = normalizeName(ex.name);
      if (finalSeenNames.has(key)) return false;
      if (isGymOnlyExercise(ex.name)) return false;
      if (day.title.toLowerCase().includes("upper") && classifyMuscleBucket(ex.name) === "legs") return false;
      finalSeenNames.add(key);
      return true;
    });

    // If still underfilled, add best available unique home-friendly exercises (at least 4 if possible).
    if (day.exerciseTemplateIds.length < 4) {
      const emergencyPool = exTemplates
        .filter((ex) => !day.exerciseTemplateIds.includes(ex.id))
        .filter((ex) => !isGymOnlyExercise(ex.name))
        .filter((ex) => equipment === "home" ? true : isHomeFriendly(ex.name));
      for (const ex of emergencyPool) {
        if (day.title.toLowerCase().includes("upper") && classifyMuscleBucket(ex.name) === "legs") continue;
        const key = normalizeName(ex.name);
        if (day.exerciseTemplateIds.some((id) => {
          const existing = exById.get(id);
          return existing ? normalizeName(existing.name) === key : false;
        })) continue;
        day.exerciseTemplateIds.push(ex.id);
        if (day.exerciseTemplateIds.length >= 4) break;
      }
    }
  }

  return adapted;
}

export function computePlannedSets(exName: string, dayTypeOrTitle?: string, goalMode: GoalMode = "maintain"): number {
  const isCompound = isCompoundExercise(exName);
  const isIsolation = isIsolationExercise(exName);
  const dayTitle = (dayTypeOrTitle ?? "").toLowerCase();
  const condensedThreeDay =
    dayTitle.includes("upper push + arms") ||
    dayTitle.includes("lower + back") ||
    dayTitle.includes("upper pull + shoulders/arms");

  if (isCompound) {
    if (goalMode === "cut") return 3;
    if (goalMode === "bulk") return 4;
    return 4;
  }
  if (isIsolation) {
    if (goalMode === "cut") return 2;
    if (goalMode === "bulk") return 4;
    return 3;
  }

  if (condensedThreeDay && (dayTitle.includes("upper") || dayTitle.includes("lower"))) {
    return 4;
  }

  return 3;
}

type SplitDayConfig = {
  weekdayIndex: number;
  title: string;
  primaryGroups: MuscleBucket[];
  secondaryGroups?: MuscleBucket[];
  upperOnly?: boolean;
};

type CandidateExercise = {
  id: string;
  name: string;
  normalizedName: string;
  group: MuscleBucket;
  sourceOrder: number;
  compound: boolean;
  topCompound: boolean;
};

const SLOT_RULES = {
  min: 5,
  max: MAX_EXERCISES_PER_DAY_HARD,
  target: 6
};

function splitConfigsForTargetDays(targetDays: 3 | 4): SplitDayConfig[] {
  if (targetDays === 3) {
    return [
      {
        weekdayIndex: 0,
        title: "Upper (Push focus)",
        primaryGroups: ["chest", "shoulders", "triceps"],
        secondaryGroups: ["biceps"],
        upperOnly: true
      },
      {
        weekdayIndex: 2,
        title: "Lower + Back",
        primaryGroups: ["legs", "back"]
      },
      {
        weekdayIndex: 4,
        title: "Upper (Pull + Shoulders)",
        primaryGroups: ["back", "shoulders", "biceps"],
        secondaryGroups: ["triceps"],
        upperOnly: true
      }
    ];
  }

  return [
    {
      weekdayIndex: 0,
      title: "Upper (Push focus)",
      primaryGroups: ["chest", "shoulders", "triceps"],
      upperOnly: true
    },
    {
      weekdayIndex: 1,
      title: "Lower",
      primaryGroups: ["legs"]
    },
    {
      weekdayIndex: 3,
      title: "Upper (Pull focus)",
      primaryGroups: ["back", "biceps", "shoulders"],
      upperOnly: true
    },
    {
      weekdayIndex: 4,
      title: "Lower (Posterior + Calves)",
      primaryGroups: ["legs"],
      secondaryGroups: ["back"]
    }
  ];
}

function isTopCompoundExercise(name: string): boolean {
  const n = name.toLowerCase();
  return ["bench", "incline", "row", "pulldown", "leg press", "shoulder press", "press"]
    .some((k) => n.includes(k));
}

function buildExerciseLibraryCandidates(
  plan: PlanTemplate,
  exTemplates: ExerciseTemplate[]
): Record<MuscleBucket, CandidateExercise[]> {
  const byGroup: Record<MuscleBucket, CandidateExercise[]> = {
    chest: [],
    back: [],
    legs: [],
    shoulders: [],
    biceps: [],
    triceps: [],
    other: []
  };

  const sourceOrderById = new Map<string, number>();
  let order = 0;
  for (const day of plan.dayTemplates.slice().sort((a, b) => a.weekdayIndex - b.weekdayIndex)) {
    for (const exId of day.exerciseTemplateIds) {
      if (!sourceOrderById.has(exId)) sourceOrderById.set(exId, order++);
    }
  }

  exTemplates.forEach((ex, idx) => {
    const group = classifyMuscleBucket(ex.name);
    byGroup[group].push({
      id: ex.id,
      name: ex.name,
      normalizedName: normalizeName(ex.name),
      group,
      sourceOrder: sourceOrderById.get(ex.id) ?? (1000 + idx),
      compound: isCompoundExercise(ex.name),
      topCompound: isTopCompoundExercise(ex.name)
    });
  });

  (Object.keys(byGroup) as MuscleBucket[]).forEach((group) => {
    byGroup[group].sort((a, b) => {
      if (a.topCompound !== b.topCompound) return a.topCompound ? -1 : 1;
      if (a.compound !== b.compound) return a.compound ? -1 : 1;
      return a.sourceOrder - b.sourceOrder;
    });
  });

  return byGroup;
}

function isUpperDayConfig(config: SplitDayConfig): boolean {
  return !!config.upperOnly;
}

function allowedGroupsForConfig(config: SplitDayConfig): MuscleBucket[] {
  return [...config.primaryGroups, ...(config.secondaryGroups ?? [])]
    .filter((g, idx, arr) => arr.indexOf(g) === idx);
}

function selectExercisesForDay(
  config: SplitDayConfig,
  pools: Record<MuscleBucket, CandidateExercise[]>,
  usedWeekIds: Set<string>
): string[] {
  const selected: string[] = [];
  const selectedIds = new Set<string>();
  const selectedNames = new Set<string>();
  const allowedGroups = allowedGroupsForConfig(config);
  const groupPointers = new Map<MuscleBucket, number>();
  const fallbackPointers = new Map<MuscleBucket, number>();

  const canUse = (c: CandidateExercise, allowWeekDuplicates: boolean, allowDayDuplicates: boolean) => {
    if (!allowedGroups.includes(c.group)) return false;
    if (isUpperDayConfig(config) && c.group === "legs") return false;
    if (!allowDayDuplicates && selectedIds.has(c.id)) return false;
    if (!allowDayDuplicates && selectedNames.has(c.normalizedName)) return false;
    if (!allowWeekDuplicates && usedWeekIds.has(c.id)) return false;
    return true;
  };

  const pushCandidate = (c: CandidateExercise, countAsUsed = true) => {
    selected.push(c.id);
    selectedIds.add(c.id);
    selectedNames.add(c.normalizedName);
    if (countAsUsed) usedWeekIds.add(c.id);
  };

  // 1) Seed compounds first from primary groups
  for (const group of config.primaryGroups) {
    const pool = pools[group] ?? [];
    const compound = pool.find((c) => c.compound && canUse(c, false, false));
    if (compound && selected.length < SLOT_RULES.target) {
      pushCandidate(compound);
    }
  }

  // 2) Round-robin primary groups until target count
  let safety = 0;
  while (selected.length < SLOT_RULES.target && safety < 100) {
    safety += 1;
    let addedThisPass = false;
    for (const group of config.primaryGroups) {
      const pool = pools[group] ?? [];
      let ptr = groupPointers.get(group) ?? 0;
      while (ptr < pool.length && !canUse(pool[ptr], false, false)) ptr += 1;
      groupPointers.set(group, ptr + 1);
      if (ptr < pool.length) {
        pushCandidate(pool[ptr]);
        addedThisPass = true;
        if (selected.length >= SLOT_RULES.target) break;
      }
    }
    if (!addedThisPass) break;
  }

  // 3) Fill using secondary groups to minimum/target
  for (const group of config.secondaryGroups ?? []) {
    const pool = pools[group] ?? [];
    for (const c of pool) {
      if (selected.length >= SLOT_RULES.target) break;
      if (!canUse(c, false, false)) continue;
      pushCandidate(c);
    }
  }

  // 4) Fill from any allowed groups up to min if still short
  for (const group of allowedGroups) {
    const pool = pools[group] ?? [];
    let ptr = fallbackPointers.get(group) ?? 0;
    while (selected.length < SLOT_RULES.min && ptr < pool.length) {
      const c = pool[ptr++];
      if (!canUse(c, false, false)) continue;
      pushCandidate(c);
    }
    fallbackPointers.set(group, ptr);
  }

  // 5) Relax week-duplicate constraint (still avoid duplicates within same day) to hit min
  if (selected.length < SLOT_RULES.min) {
    for (const group of allowedGroups) {
      for (const c of pools[group] ?? []) {
        if (selected.length >= SLOT_RULES.min) break;
        if (!canUse(c, true, false)) continue;
        pushCandidate(c, false);
      }
    }
  }

  // 6) Last resort: allow same exercise repeated within the same day to guarantee no tiny day
  if (selected.length < SLOT_RULES.min) {
    const fallbackGroup = config.primaryGroups[0];
    const fallbackPool = pools[fallbackGroup] ?? [];
    let idx = 0;
    while (selected.length < SLOT_RULES.min && fallbackPool.length > 0) {
      const c = fallbackPool[idx % fallbackPool.length];
      if (isUpperDayConfig(config) && c.group === "legs") break;
      if (selectedNames.has(c.normalizedName)) {
        idx += 1;
        if (idx > fallbackPool.length * 2) break;
        continue;
      }
      selected.push(c.id);
      selectedNames.add(c.normalizedName);
      idx += 1;
    }
  }

  return selected.slice(0, SLOT_RULES.max);
}

function buildIntentionalSplitDays(
  plan: PlanTemplate,
  exTemplates: ExerciseTemplate[],
  targetDays: 3 | 4
): DayTemplate[] | null {
  const configs = splitConfigsForTargetDays(targetDays);
  const pools = buildExerciseLibraryCandidates(plan, exTemplates);
  const usedWeekIds = new Set<string>();

  const built = configs.map((config) => ({
    id: uid(),
    title: config.title,
    weekdayIndex: config.weekdayIndex,
    exerciseTemplateIds: selectExercisesForDay(config, pools, usedWeekIds)
  }));

  const validCounts = built.every(
    (d) => d.exerciseTemplateIds.length >= SLOT_RULES.min && d.exerciseTemplateIds.length <= SLOT_RULES.max
  );
  const noUpperLegs = built.every((day) => {
    const config = configs.find((c) => c.weekdayIndex === day.weekdayIndex);
    if (!config?.upperOnly) return true;
    return day.exerciseTemplateIds.every((id) => {
      const ex = exTemplates.find((e) => e.id === id);
      return !ex || classifyMuscleBucket(ex.name) !== "legs";
    });
  });

  if (!validCounts || !noUpperLegs) return null;
  return built;
}

export function remapDayTemplatesForTargetDays(
  plan: PlanTemplate,
  targetDays: number,
  exTemplates: ExerciseTemplate[]
): DayTemplate[] {
  const sorted = plan.dayTemplates.slice().sort((a, b) => a.weekdayIndex - b.weekdayIndex);
  if (targetDays === 5) return pickTemplateDays(sorted, 5);
  if (targetDays !== 3 && targetDays !== 4) return pickTemplateDays(sorted, 5);

  const built = buildIntentionalSplitDays(plan, exTemplates, targetDays);
  if (built) return built;

  // Safe fallback: preserve original 3/4-day picks but update titles
  const fallback = pickTemplateDays(sorted, targetDays);
  const titleMap = new Map(
    splitConfigsForTargetDays(targetDays).map((c) => [c.weekdayIndex, c.title] as const)
  );

  return fallback.map((d) => ({
    ...d,
    title: titleMap.get(d.weekdayIndex) ?? d.title,
    exerciseTemplateIds: d.exerciseTemplateIds.slice(0, SLOT_RULES.max)
  }));
}

function mondayOfTodayISO(): string {
  const now = new Date();
  const day = now.getDay(); // 0 Sun .. 6 Sat
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

function lastWeekExerciseSnapshot(prevWeek: WeekPlan | undefined, name: string) {
  if (!prevWeek) return undefined;
  for (const d of prevWeek.days) {
    const found = d.exercises.find(e => e.name === name);
    if (found) return found;
  }
  return undefined;
}

function incrementKgForUnit(unit: WeightUnit): number {
  const lbIncrementKg = 5 * 0.45359237;
  return roundToNearest(unit === "lb" ? lbIncrementKg : 2.5, 0.5);
}

function lastDefinedNumber(values: Array<number | undefined>): number | undefined {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (typeof values[i] === "number") return values[i];
  }
  return undefined;
}

function cloneDayTemplates(days: DayTemplate[]): DayTemplate[] {
  return days.map((d) => ({
    ...d,
    exerciseTemplateIds: [...d.exerciseTemplateIds]
  }));
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
        const ia = preferredGroups.indexOf(ga);
        const ib = preferredGroups.indexOf(gb);
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

  return {
    ...day,
    exerciseTemplateIds: uniqueIds
  };
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

function inferPrevBaseWeightKg(prev: PlannedExercise): number | undefined {
  if (typeof prev.plannedWeightKg === "number") return prev.plannedWeightKg;
  const firstPlannedSet = prev.sets.find((s) => typeof s.plannedWeightKg === "number")?.plannedWeightKg;
  if (typeof firstPlannedSet === "number") return firstPlannedSet;

  return lastDefinedNumber(prev.sets.map((s) => s.actualWeightKg));
}

function getPrevRampedOffsetsKg(prev: PlannedExercise, baseKg: number): number[] | undefined {
  if (prev.sets.length === 0) return undefined;
  const plannedSetWeights = prev.sets.map((s) => s.plannedWeightKg);
  if (plannedSetWeights.some((w) => typeof w !== "number")) return undefined;

  const offsets = plannedSetWeights.map((w) => roundToNearest((w as number) - baseKg, 0.5));
  const hasRamp = offsets.some((o) => Math.abs(o) >= 0.01);
  return hasRamp ? offsets : undefined;
}

function buildPlannedSetWeightsFromBase(
  plannedSets: number,
  baseKg: number | undefined,
  rampOffsetsKg?: number[]
): Array<number | undefined> {
  if (typeof baseKg !== "number") {
    return Array.from({ length: plannedSets }, () => undefined);
  }

  if (!rampOffsetsKg || rampOffsetsKg.length === 0) {
    return Array.from({ length: plannedSets }, () => baseKg);
  }

  return Array.from({ length: plannedSets }, (_, idx) => {
    const offset = rampOffsetsKg[idx] ?? 0;
    return roundToNearest(baseKg + offset, 0.5);
  });
}

type ProgressionSuggestion = {
  baseWeightKg?: number;
  rampOffsetsKg?: number[];
};

function computeNextProgressionSuggestion(
  prev: PlannedExercise | undefined,
  exName: string,
  unit: WeightUnit
): ProgressionSuggestion {
  if (!prev) return {};
  const incrementKg = incrementKgForUnit(unit);
  const baseKg = inferPrevBaseWeightKg(prev);
  const rampOffsetsKg = typeof baseKg === "number" ? getPrevRampedOffsetsKg(prev, baseKg) : undefined;
  if (prev.sets.length === 0) return { baseWeightKg: baseKg, rampOffsetsKg };

  const evaluated = prev.sets.map((s) => ({
    hitMin: !!s.completed && typeof s.actualReps === "number" && s.actualReps >= prev.repRange.min,
    completed: s.completed,
    actualReps: s.actualReps,
    usedWeightKg: s.actualWeightKg ?? s.plannedWeightKg ?? baseKg
  }));

  const totalSets = evaluated.length;
  const hitMinCount = evaluated.filter((s) => s.hitMin).length;
  const completedCount = evaluated.filter((s) => s.completed).length;
  const majorityMissed = (totalSets - hitMinCount) > totalSets / 2;
  const mostHitMin = hitMinCount >= Math.ceil(totalSets / 2);
  const allHitMin = hitMinCount === totalSets;
  const lastSetMissed = totalSets > 0 ? !evaluated[totalSets - 1].hitMin : false;
  const avgReps =
    (() => {
      const repSets = evaluated.filter((s): s is typeof s & { actualReps: number } => typeof s.actualReps === "number");
      if (repSets.length === 0) return undefined;
      return repSets.reduce((sum, s) => sum + s.actualReps, 0) / repSets.length;
    })();

  let nextBaseKg = baseKg;
  const compound = isCompoundExercise(exName);
  const isolation = isIsolationExercise(exName);

  if (compound) {
    if (typeof nextBaseKg !== "number") {
      nextBaseKg = lastDefinedNumber(evaluated.map((s) => s.usedWeightKg));
    }

    if (typeof nextBaseKg === "number") {
      if (allHitMin) {
        nextBaseKg = roundToNearest(nextBaseKg + incrementKg, 0.5);
      } else if (majorityMissed) {
        nextBaseKg = roundToNearest(Math.max(0, nextBaseKg - incrementKg), 0.5);
      } else if (mostHitMin && lastSetMissed) {
        nextBaseKg = roundToNearest(nextBaseKg, 0.5);
      }
    }
  } else if (isolation) {
    if (typeof nextBaseKg !== "number") {
      nextBaseKg = lastDefinedNumber(evaluated.map((s) => s.usedWeightKg));
    }

    const mostCompleted = completedCount >= Math.ceil(totalSets / 2);
    if (
      typeof nextBaseKg === "number" &&
      mostCompleted &&
      typeof avgReps === "number" &&
      avgReps >= prev.repRange.max
    ) {
      nextBaseKg = roundToNearest(nextBaseKg + incrementKg, 0.5);
    }
  } else if (typeof nextBaseKg !== "number") {
    nextBaseKg = lastDefinedNumber(evaluated.map((s) => s.usedWeightKg));
  }

  return { baseWeightKg: nextBaseKg, rampOffsetsKg };
}

function roundToNearest(value: number, step: number) {
  return Math.round(value / step) * step;
}

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
    return {
      ...day,
      cardio: {
        modality,
        minutes: plan.minutes,
        intensity: plan.intensity
      }
    };
  });
}

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

  const exercises = await db.exerciseTemplates.toArray();
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
  const chosenBase: DayTemplate[] = remapDayTemplatesForTargetDays(plan, constraints.targetDays, exTemplates);
  const chosen: DayTemplate[] = applyGenerationConstraintsToDayTemplates(
    chosenBase,
    plan,
    exTemplates,
    constraints
  );
  const equipmentAdjusted: DayTemplate[] = applyEquipmentToDayTemplates(chosen, exTemplates, userEquipment);
  const minExercisesPerDay = constraints.targetDays === 5 ? 1 : 5;
  const finalizedTemplates = equipmentAdjusted
    .map((day) => dedupeAndRefillDayByName(day, exTemplates, userEquipment, minExercisesPerDay))
    .map((day) => ({
      ...day,
      exerciseTemplateIds: day.exerciseTemplateIds.slice(0, exerciseCap)
    }));

  const days: WorkoutDay[] = finalizedTemplates.map(dt => {
    const date = addDays(start, dt.weekdayIndex);
    const dateISO = format(date, "yyyy-MM-dd");

    const plannedExercises: PlannedExercise[] = dt.exerciseTemplateIds.map((id: string) => {
      const exT = exTemplates.find(e => e.id === id);
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

export async function generateNextWeek() {
  const activeUserId = await getActiveUserId();
  if (!activeUserId) throw new Error("No active profile selected.");
  const planTemplate = await db.planTemplates.toCollection().first();
  if (!planTemplate) throw new Error("No plan template found.");

  const exTemplates = await db.exerciseTemplates.toArray();
  const latest = await getLatestWeek(activeUserId);

  // Always lock previous week when moving forward
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
