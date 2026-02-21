import { addDays, format, parseISO } from "date-fns";
import { db } from "../db/db";
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

function inferNextWeekDays(notes?: string, explicit?: number): number {
  if (explicit && [3, 4, 5].includes(explicit)) return explicit;

  const text = (notes ?? "").toLowerCase();

  // 1) Prefer patterns that explicitly talk about next week
  const nextWeekMatches = Array.from(
    text.matchAll(/next\s*week[^0-9]{0,20}([345])\s*[- ]?\s*day(s)?/g)
  );
  if (nextWeekMatches.length > 0) {
    const last = nextWeekMatches[nextWeekMatches.length - 1];
    return Number(last[1]) as 3 | 4 | 5;
  }

  // 2) Fallback: take the last generic match anywhere
  const matches = Array.from(text.matchAll(/([345])\s*[- ]?\s*day(s)?/g));
  if (matches.length > 0) {
    const last = matches[matches.length - 1];
    return Number(last[1]) as 3 | 4 | 5;
  }

  return 5;
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

  if (MUSCLE_KEYWORDS.triceps.some(k => n.includes(k))) return "triceps";
  if (n.includes("bicep") || MUSCLE_KEYWORDS.biceps.some(k => n.includes(k))) return "biceps";
  if (MUSCLE_KEYWORDS.shoulders.some(k => n.includes(k))) return "shoulders";
  if (MUSCLE_KEYWORDS.chest.some(k => n.includes(k))) return "chest";
  if (MUSCLE_KEYWORDS.back.some(k => n.includes(k))) return "back";
  if (n.includes("leg") || n.includes("calf") || n.includes("squat")) return "legs";
  if ((n.includes("extension") || n.includes("curl")) && n.includes("leg")) return "legs";
  if (n.includes("press") && n.includes("leg")) return "legs";

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

export function computePlannedSets(exName: string, dayTypeOrTitle?: string): number {
  const isCompound = isCompoundExercise(exName);
  const isIsolation = isIsolationExercise(exName);
  const dayTitle = (dayTypeOrTitle ?? "").toLowerCase();
  const condensedThreeDay =
    dayTitle.includes("upper push + arms") ||
    dayTitle.includes("lower + back") ||
    dayTitle.includes("upper pull + shoulders/arms");

  if (isCompound) return 4;
  if (isIsolation) return 3;

  if (condensedThreeDay && (dayTitle.includes("upper") || dayTitle.includes("lower"))) {
    return 4;
  }

  return 3;
}

type DayLayout = { weekdayIndex: number; title: string };
type BucketItem = { id: string; order: number; compound: boolean };
type DayBucket = { items: BucketItem[]; idSet: Set<string> };

function preferredBucketsFor3Days(group: MuscleBucket, sourceWeekday: number): number[] {
  switch (group) {
    case "chest":
      return [0, 2];
    case "triceps":
      return [0, 2];
    case "biceps":
      return [0, 2];
    case "legs":
      return [1];
    case "back":
      return [1, 2];
    case "shoulders":
      return [2, 0];
    default:
      return sourceWeekday <= 1 ? [0, 2, 1] : sourceWeekday === 2 ? [1, 2, 0] : [2, 0, 1];
  }
}

function preferredBucketsFor4Days(group: MuscleBucket, sourceWeekday: number): number[] {
  switch (group) {
    case "legs":
      return [1, 3];
    case "back":
      return [2, 0];
    case "chest":
      return [0, 2];
    case "shoulders":
      return [0, 2];
    case "biceps":
      return [2, 0];
    case "triceps":
      return [0, 2];
    default:
      return sourceWeekday <= 1 ? [0, 2, 1, 3] : [2, 0, 3, 1];
  }
}

function pickBucketIndex(
  buckets: DayBucket[],
  preferred: number[],
  exerciseId: string,
  maxPerDay: number
): number {
  const preferredCandidates = preferred
    .map((idx) => ({ idx, b: buckets[idx] }))
    .filter(({ b }) => b.items.length < maxPerDay && !b.idSet.has(exerciseId));

  if (preferredCandidates.length > 0) {
    preferredCandidates.sort((a, b) => a.b.items.length - b.b.items.length);
    return preferredCandidates[0].idx;
  }

  const fallbackCandidates = buckets
    .map((b, idx) => ({ idx, b }))
    .filter(({ b }) => b.items.length < maxPerDay && !b.idSet.has(exerciseId));

  if (fallbackCandidates.length === 0) return -1;

  fallbackCandidates.sort((a, b) => a.b.items.length - b.b.items.length);
  return fallbackCandidates[0].idx;
}

export function remapDayTemplatesForTargetDays(
  plan: PlanTemplate,
  targetDays: number,
  exTemplates: ExerciseTemplate[]
): DayTemplate[] {
  const sorted = plan.dayTemplates.slice().sort((a, b) => a.weekdayIndex - b.weekdayIndex);
  if (targetDays === 5) return pickTemplateDays(sorted, 5);
  if (targetDays !== 3 && targetDays !== 4) return pickTemplateDays(sorted, 5);

  const dayLayout: DayLayout[] =
    targetDays === 3
      ? [
          { weekdayIndex: 0, title: "Upper Push + Arms" },
          { weekdayIndex: 2, title: "Lower + Back" },
          { weekdayIndex: 4, title: "Upper Pull + Shoulders/Arms" }
        ]
      : [
          { weekdayIndex: 0, title: "Upper A (Push)" },
          { weekdayIndex: 1, title: "Lower A" },
          { weekdayIndex: 3, title: "Upper B (Pull)" },
          { weekdayIndex: 4, title: "Lower B" }
        ];

  const exById = new Map(exTemplates.map((e) => [e.id, e]));
  const maxExercisesPerDay = 8;
  const buckets: DayBucket[] = dayLayout.map(() => ({ items: [], idSet: new Set<string>() }));
  let orderCounter = 0;

  for (const sourceDay of sorted) {
    for (const exId of sourceDay.exerciseTemplateIds) {
      const exTemplate = exById.get(exId);
      if (!exTemplate) continue;

      const group = classifyMuscleBucket(exTemplate.name);
      const preferred =
        targetDays === 3
          ? preferredBucketsFor3Days(group, sourceDay.weekdayIndex)
          : preferredBucketsFor4Days(group, sourceDay.weekdayIndex);

      const idx = pickBucketIndex(buckets, preferred, exId, maxExercisesPerDay);
      if (idx === -1) continue;

      buckets[idx].items.push({
        id: exId,
        order: orderCounter++,
        compound: isCompoundExercise(exTemplate.name)
      });
      buckets[idx].idSet.add(exId);
    }
  }

  return dayLayout.map((layout, idx) => {
    const orderedExerciseIds = buckets[idx].items
      .slice()
      .sort((a, b) => {
        if (a.compound !== b.compound) return a.compound ? -1 : 1;
        return a.order - b.order;
      })
      .map((item) => item.id);

    return {
      id: uid(),
      title: layout.title,
      weekdayIndex: layout.weekdayIndex,
      exerciseTemplateIds: orderedExerciseIds
    };
  });
}

function mondayOfTodayISO(): string {
  const now = new Date();
  const day = now.getDay(); // 0 Sun .. 6 Sat
  const diffToMonday = (day === 0 ? -6 : 1 - day);
  const monday = addDays(now, diffToMonday);
  return format(monday, "yyyy-MM-dd");
}

function makeSets(plannedSets: number, ex: ExerciseTemplate, plannedWeightKg?: number): SetEntry[] {
  return Array.from({ length: plannedSets }, (_, i) => ({
    setNumber: i + 1,
    plannedRepsMin: ex.repRange.min,
    plannedRepsMax: ex.repRange.max,
    plannedWeightKg,
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

function computeNextPlannedWeightKg(prev: PlannedExercise | undefined): number | undefined {
  if (!prev) return undefined;

  const completedSets = prev.sets.filter(s => s.completed && typeof s.actualReps === "number");
  if (completedSets.length === 0) return prev.plannedWeightKg;

  const avgReps =
    completedSets.reduce((sum, s) => sum + (s.actualReps ?? 0), 0) / completedSets.length;

  const allSetsCompleted = prev.sets.every(s => s.completed);

  const lastUsedWeight =
    completedSets
      .map(s => s.actualWeightKg)
      .filter((x): x is number => typeof x === "number")
      .slice(-1)[0] ?? prev.plannedWeightKg;

  if (typeof lastUsedWeight !== "number") return prev.plannedWeightKg;

  const shouldIncrease = allSetsCompleted && avgReps >= prev.repRange.max;
  return shouldIncrease ? roundToNearest(lastUsedWeight + 2.5, 0.5) : lastUsedWeight;
}

function roundToNearest(value: number, step: number) {
  return Math.round(value / step) * step;
}

export async function getLatestWeek(): Promise<WeekPlan | undefined> {
  const all = await db.weekPlans.orderBy("weekNumber").reverse().toArray();
  return all[0];
}

export async function createFirstWeekIfMissing() {
  const existing = await db.weekPlans.count();
  if (existing > 0) return;

  const planTemplate = await db.planTemplates.toCollection().first();
  if (!planTemplate) throw new Error("No plan template found. Seed failed?");

  const exercises = await db.exerciseTemplates.toArray();
  const weekNumber = 1;
  const startDateISO = mondayOfTodayISO();
  const week = await generateWeekFromTemplate(planTemplate, exercises, weekNumber, startDateISO, undefined);

  await db.weekPlans.add(week);
}

async function generateWeekFromTemplate(
  plan: PlanTemplate,
  exTemplates: ExerciseTemplate[],
  weekNumber: number,
  startDateISO: string,
  prevWeek: WeekPlan | undefined
): Promise<WeekPlan> {
  const start = parseISO(startDateISO);

  const targetDays = inferNextWeekDays(prevWeek?.notes, prevWeek?.nextWeekDays);
  const chosen: DayTemplate[] = remapDayTemplatesForTargetDays(plan, targetDays, exTemplates);

  const days: WorkoutDay[] = chosen.map(dt => {
    const date = addDays(start, dt.weekdayIndex);
    const dateISO = format(date, "yyyy-MM-dd");

    const plannedExercises: PlannedExercise[] = dt.exerciseTemplateIds.map((id: string) => {
      const exT = exTemplates.find(e => e.id === id);
      if (!exT) throw new Error("Missing exercise template");

      const prevEx = lastWeekExerciseSnapshot(prevWeek, exT.name);
      const nextWeight = computeNextPlannedWeightKg(prevEx);
      const computedSets = computePlannedSets(exT.name, dt.title);
      const plannedSets = Number.isFinite(computedSets) && computedSets > 0
        ? computedSets
        : exT.defaultSets;

      return {
        id: uid(),
        name: exT.name,
        plannedSets,
        repRange: exT.repRange,
        plannedWeightKg: nextWeight,
        sets: makeSets(plannedSets, exT, nextWeight)
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

  return {
    id: uid(),
    weekNumber,
    startDateISO,
    createdAtISO: new Date().toISOString(),
    days,
    isLocked: false
  };
}

export async function generateNextWeek() {
  const planTemplate = await db.planTemplates.toCollection().first();
  if (!planTemplate) throw new Error("No plan template found.");

  const exTemplates = await db.exerciseTemplates.toArray();
  const latest = await getLatestWeek();

  // Always lock previous week when moving forward
  if (latest && !latest.isLocked) {
    await db.weekPlans.update(latest.id, { isLocked: true });
  }

  const nextWeekNumber = (latest?.weekNumber ?? 0) + 1;
  const nextStart = latest
    ? format(addDays(parseISO(latest.startDateISO), 7), "yyyy-MM-dd")
    : mondayOfTodayISO();

  const newWeek = await generateWeekFromTemplate(planTemplate, exTemplates, nextWeekNumber, nextStart, latest);

  await db.weekPlans.add(newWeek);
  return newWeek;
}
