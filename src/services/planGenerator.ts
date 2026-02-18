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

function mondayOfTodayISO(): string {
  const now = new Date();
  const day = now.getDay(); // 0 Sun .. 6 Sat
  const diffToMonday = (day === 0 ? -6 : 1 - day);
  const monday = addDays(now, diffToMonday);
  return format(monday, "yyyy-MM-dd");
}

function makeSets(ex: ExerciseTemplate, plannedWeightKg?: number): SetEntry[] {
  return Array.from({ length: ex.defaultSets }, (_, i) => ({
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
  const chosen: DayTemplate[] = pickTemplateDays(plan.dayTemplates.slice(), targetDays);

  const days: WorkoutDay[] = chosen.map(dt => {
    const date = addDays(start, dt.weekdayIndex);
    const dateISO = format(date, "yyyy-MM-dd");

    const plannedExercises: PlannedExercise[] = dt.exerciseTemplateIds.map((id: string) => {
      const exT = exTemplates.find(e => e.id === id);
      if (!exT) throw new Error("Missing exercise template");

      const prevEx = lastWeekExerciseSnapshot(prevWeek, exT.name);
      const nextWeight = computeNextPlannedWeightKg(prevEx);

      return {
        id: uid(),
        name: exT.name,
        plannedSets: exT.defaultSets,
        repRange: exT.repRange,
        plannedWeightKg: nextWeight,
        sets: makeSets(exT, nextWeight)
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