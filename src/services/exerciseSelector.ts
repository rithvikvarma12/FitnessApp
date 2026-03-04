import type { DayTemplate, ExerciseTemplate, PlanTemplate } from "../db/types";

const uid = () => crypto.randomUUID();

export type MuscleBucket = "chest" | "back" | "legs" | "shoulders" | "biceps" | "triceps" | "other";
export type EquipmentType = "gym" | "home" | "minimal";
export type GoalMode = "cut" | "maintain" | "bulk";

export const MAX_EXERCISES_PER_DAY_HARD = 8;

const SLOT_RULES = {
  min: 5,
  max: MAX_EXERCISES_PER_DAY_HARD,
  target: 6
};

const MUSCLE_KEYWORDS: Record<Exclude<MuscleBucket, "other">, string[]> = {
  chest: ["bench", "crossover", "fly"],
  back: ["row", "pulldown", "lat"],
  legs: ["press", "extension", "curl", "calf", "squat"],
  shoulders: ["shoulder", "lateral", "delt", "raise"],
  biceps: ["curl", "preacher", "hammer"],
  triceps: ["tricep", "pressdown", "extension"]
};

const COMPOUND_KEYWORDS = [
  "bench", "row", "pulldown", "lat", "press", "squat",
  "deadlift", "lunge", "pull-up", "pullup", "chin-up", "chinup"
];

// ─── Classification ────────────────────────────────────────────────────────────

export function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

export function classifyMuscleBucket(name: string): MuscleBucket {
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

  if (MUSCLE_KEYWORDS.triceps.some((k) => n.includes(k))) return "triceps";
  if (n.includes("overhead tricep")) return "triceps";
  if (n.includes("bicep") || MUSCLE_KEYWORDS.biceps.some((k) => n.includes(k))) return "biceps";
  if (n.includes("dumbbell bicep")) return "biceps";
  if (n.includes("pike push-up") || n.includes("pike push up")) return "shoulders";
  if (n.includes("dumbbell shoulder press")) return "shoulders";
  if (MUSCLE_KEYWORDS.shoulders.some((k) => n.includes(k))) return "shoulders";
  if (n.includes("push-up") || n.includes("push up")) return "chest";
  if (n.includes("floor press")) return "chest";
  if (MUSCLE_KEYWORDS.chest.some((k) => n.includes(k))) return "chest";
  if (MUSCLE_KEYWORDS.back.some((k) => n.includes(k))) return "back";
  if ((n.includes("extension") || n.includes("curl")) && n.includes("leg")) return "legs";
  if (n.includes("press") && n.includes("leg")) return "legs";
  if (n.includes("row")) return "back";

  return "other";
}

export function isCompoundExercise(name: string): boolean {
  const n = name.toLowerCase();
  return COMPOUND_KEYWORDS.some((k) => n.includes(k));
}

export function isIsolationExercise(name: string): boolean {
  const n = name.toLowerCase();
  const isolationKeywords = [
    "crossover", "lateral", "pressdown", "curl",
    "rear delt", "fly", "calf raise", "calf raises", "preacher", "hammer"
  ];
  return isolationKeywords.some((k) => n.includes(k));
}

export function isGymOnlyExercise(name: string): boolean {
  const n = name.toLowerCase();
  return [
    "cable", "machine", "leg press", "lat pulldown", "pulldown",
    "seated cable", "pec fly machine", "leg extension", "leg curl"
  ].some((k) => n.includes(k));
}

export function isHomeFriendly(name: string): boolean {
  const n = name.toLowerCase();
  return [
    "push-up", "push up", "dumbbell", "bodyweight", "band", "plank",
    "squat", "lunge", "split squat", "rdl", "romanian deadlift",
    "glute bridge", "pull-up", "pull up"
  ].some((k) => n.includes(k));
}

function isTopCompoundExercise(name: string): boolean {
  const n = name.toLowerCase();
  return ["bench", "incline", "row", "pulldown", "leg press", "shoulder press", "press"]
    .some((k) => n.includes(k));
}

export function requiredGroupsForDayTitle(title: string): MuscleBucket[] {
  const t = title.toLowerCase();
  if (t.includes("upper") && t.includes("push")) return ["chest", "shoulders"];
  if (t.includes("lower + back")) return ["legs", "back"];
  if (t.includes("upper") && t.includes("pull")) return ["back", "shoulders"];
  if (t === "lower" || t.includes("lower (")) return ["legs"];
  return [];
}

export function preferredGroupsFromDayTitle(title: string): MuscleBucket[] {
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

// ─── Equipment substitution ────────────────────────────────────────────────────

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

export function cloneDayTemplates(days: DayTemplate[]): DayTemplate[] {
  return days.map((d) => ({
    ...d,
    exerciseTemplateIds: [...d.exerciseTemplateIds]
  }));
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

// ─── Set count computation ─────────────────────────────────────────────────────

export function computePlannedSets(exName: string, dayTypeOrTitle?: string, goalMode: GoalMode = "maintain"): number {
  const compound = isCompoundExercise(exName);
  const isolation = isIsolationExercise(exName);
  const dayTitle = (dayTypeOrTitle ?? "").toLowerCase();
  const condensedThreeDay =
    dayTitle.includes("upper push + arms") ||
    dayTitle.includes("lower + back") ||
    dayTitle.includes("upper pull + shoulders/arms");

  if (compound) {
    if (goalMode === "cut") return 3;
    if (goalMode === "bulk") return 4;
    return 4;
  }
  if (isolation) {
    if (goalMode === "cut") return 2;
    if (goalMode === "bulk") return 4;
    return 3;
  }
  if (condensedThreeDay && (dayTitle.includes("upper") || dayTitle.includes("lower"))) {
    return 4;
  }
  return 3;
}

// ─── Split day selection ───────────────────────────────────────────────────────

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

function pickTemplateDays(dayTemplates: DayTemplate[], targetDays: number): DayTemplate[] {
  const map: Record<number, number[]> = {
    5: [0, 1, 2, 3, 4],
    4: [0, 1, 3, 4],
    3: [0, 2, 4]
  };
  const idxs = map[targetDays] ?? map[5];
  return dayTemplates
    .filter((dt) => idxs.includes(dt.weekdayIndex))
    .sort((a, b) => a.weekdayIndex - b.weekdayIndex);
}

function buildExerciseLibraryCandidates(
  plan: PlanTemplate,
  exTemplates: ExerciseTemplate[]
): Record<MuscleBucket, CandidateExercise[]> {
  const byGroup: Record<MuscleBucket, CandidateExercise[]> = {
    chest: [], back: [], legs: [], shoulders: [],
    biceps: [], triceps: [], other: []
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

  for (const group of config.primaryGroups) {
    const pool = pools[group] ?? [];
    const compound = pool.find((c) => c.compound && canUse(c, false, false));
    if (compound && selected.length < SLOT_RULES.target) {
      pushCandidate(compound);
    }
  }

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

  for (const group of config.secondaryGroups ?? []) {
    const pool = pools[group] ?? [];
    for (const c of pool) {
      if (selected.length >= SLOT_RULES.target) break;
      if (!canUse(c, false, false)) continue;
      pushCandidate(c);
    }
  }

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

  if (selected.length < SLOT_RULES.min) {
    for (const group of allowedGroups) {
      for (const c of pools[group] ?? []) {
        if (selected.length >= SLOT_RULES.min) break;
        if (!canUse(c, true, false)) continue;
        pushCandidate(c, false);
      }
    }
  }

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
