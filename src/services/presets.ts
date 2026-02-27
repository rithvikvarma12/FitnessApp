import { db, getActiveUserId } from "../db/db";
import { applyEquipmentToDayTemplates, remapDayTemplatesForTargetDays } from "./planGenerator";
import type {
  DayTemplate,
  ExerciseTemplate,
  PlanTemplate,
  PlannedExercise,
  SetEntry,
  WeekPlan,
  WorkoutDay
} from "../db/types";

const uid = () => crypto.randomUUID();

function mondayOfThisWeekISO(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon.toISOString().slice(0, 10);
}

function addDaysISO(startISO: string, days: number): string {
  const d = new Date(startISO + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function roundToNearest(value: number, step: number): number {
  return Math.round(value / step) * step;
}

async function getOrCreateExercise(
  name: string,
  defaultSets: number,
  repRange: { min: number; max: number }
): Promise<ExerciseTemplate> {
  const existing = await db.exerciseTemplates.where("name").equals(name).first();
  if (existing) return existing;

  const ex: ExerciseTemplate = { id: uid(), name, defaultSets, repRange };
  await db.exerciseTemplates.add(ex);
  return ex;
}

async function exId(name: string): Promise<string> {
  const ex = await db.exerciseTemplates.where("name").equals(name).first();
  if (!ex) throw new Error(`Missing exercise template: ${name}`);
  return ex.id;
}

function normalizeName(name: string): string {
  return name.toLowerCase().trim();
}

function isCompoundName(name: string): boolean {
  const n = normalizeName(name);
  return [
    "bench",
    "press",
    "row",
    "pulldown",
    "squat",
    "deadlift",
    "lunge",
    "leg press"
  ].some((k) => n.includes(k));
}

function isIsolationName(name: string): boolean {
  const n = normalizeName(name);
  return [
    "curl",
    "raise",
    "extension",
    "pressdown",
    "crossover",
    "fly"
  ].some((k) => n.includes(k));
}

function exerciseBaseWeightKg(name: string, equipment: "gym" | "home" | "minimal"): { base: number; increment: number } {
  const n = normalizeName(name);
  if (n.includes("flat bench")) return { base: 45, increment: 1.0 };
  if (n.includes("incline bench")) return { base: 40, increment: 0.8 };
  if (n.includes("lat pulldown")) return { base: 50, increment: 1.0 };
  if (n.includes("seated cable row")) return { base: 45, increment: 1.0 };
  if (n.includes("one-arm dumbbell row")) return { base: 22.5, increment: 0.5 };
  if (n.includes("shoulder press")) return { base: equipment === "gym" ? 30 : 20, increment: 0.5 };
  if (n.includes("leg press")) return { base: 100, increment: 2.5 };
  if (n.includes("goblet squat")) return { base: 20, increment: 1.0 };
  if (n.includes("romanian deadlift")) return { base: 35, increment: 1.0 };
  if (n.includes("barbell curls")) return { base: 20, increment: 0.5 };
  if (n.includes("dumbbell bicep curl")) return { base: 10, increment: 0.5 };
  if (n.includes("tricep pressdown")) return { base: 25, increment: 0.5 };
  if (n.includes("tricep extension")) return { base: 12.5, increment: 0.5 };
  if (n.includes("side lateral raise") || n.includes("dumbbell raise")) return { base: 7.5, increment: 0.5 };

  if (isCompoundName(name)) return { base: 30, increment: 0.8 };
  if (isIsolationName(name)) return { base: 12.5, increment: 0.4 };
  return { base: 15, increment: 0.4 };
}

function fillExerciseWithDemoActuals(
  exercise: PlannedExercise,
  weekIndex: number,
  dayIndex: number,
  equipment: "gym" | "home" | "minimal"
): PlannedExercise {
  const progression = exerciseBaseWeightKg(exercise.name, equipment);
  const workingWeight = roundToNearest(progression.base + progression.increment * weekIndex, 0.5);

  const sets = exercise.sets.map((set, setIdx) => {
    const completed = ((weekIndex + dayIndex + setIdx) % 7) !== 0; // mostly complete
    const repSpan = Math.max(0, set.plannedRepsMax - set.plannedRepsMin);
    const reps = completed
      ? set.plannedRepsMin + ((weekIndex + setIdx) % (repSpan + 1 || 1))
      : undefined;

    const perSetAdj = isCompoundName(exercise.name)
      ? (setIdx >= Math.floor(exercise.sets.length / 2) ? 2.5 : 0)
      : 0;
    const actualWeightKg = completed
      ? roundToNearest(Math.max(0, workingWeight + perSetAdj), 0.5)
      : undefined;

    return {
      ...set,
      plannedWeightKg: roundToNearest(Math.max(0, workingWeight), 0.5),
      completed,
      actualReps: reps,
      actualWeightKg
    };
  });

  return {
    ...exercise,
    plannedWeightKg: roundToNearest(Math.max(0, workingWeight), 0.5),
    sets
  };
}

function decorateWeekWithDemoActuals(
  week: WeekPlan,
  weekIndex: number,
  equipment: "gym" | "home" | "minimal"
): WeekPlan {
  const days = week.days.map((day, dayIndex) => {
    const exercises = day.exercises.map((ex) =>
      fillExerciseWithDemoActuals(ex, weekIndex, dayIndex, equipment)
    );
    const totalSets = exercises.reduce((acc, ex) => acc + ex.sets.length, 0);
    const doneSets = exercises.reduce((acc, ex) => acc + ex.sets.filter((s) => s.completed).length, 0);
    const isComplete = totalSets === 0 ? false : doneSets / totalSets >= 0.7;
    return { ...day, exercises, isComplete };
  });

  return {
    ...week,
    isLocked: week.weekNumber < 10,
    days
  };
}

async function seedDemoWeightEntries(userId: string, goal: "cut" | "maintain" | "bulk" | "gain") {
  await db.weightEntries.where("userId").equals(userId).delete();

  const today = new Date();
  const entries: Array<{
    id: string;
    userId: string;
    dateISO: string;
    weightKg: number;
    createdAtISO: string;
  }> = [];

  const startWeightKg = goal === "cut" ? 86 : goal === "maintain" ? 80 : 78;

  for (let i = 59; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateISO = d.toISOString().slice(0, 10);

    const trendDelta =
      goal === "cut"
        ? -0.03 * (59 - i)
        : goal === "maintain"
          ? 0
          : 0.02 * (59 - i);
    const noise = ((i % 5) - 2) * 0.05;
    const weightKg = roundToNearest(startWeightKg + trendDelta + noise, 0.1);

    entries.push({
      id: uid(),
      userId,
      dateISO,
      weightKg,
      createdAtISO: new Date(d.getTime() + 1000 * 60 * 60 * 12).toISOString()
    });
  }

  await db.weightEntries.bulkPut(entries);
}

export async function initDemoPresetForUser(userId: string): Promise<void> {
  const weekCount = await db.weekPlans.where("userId").equals(userId).count();
  if (weekCount > 0) {
    throw new Error("Weeks already exist for this profile.");
  }

  const plan = await db.planTemplates.toCollection().first();
  if (!plan) throw new Error("No plan template found.");

  const profile = await db.userProfiles.get(userId);
  if (!profile) throw new Error("Profile not found.");
  const resolvedGoal = profile.goalMode ?? (profile.goal === "gain" ? "bulk" : profile.goal) ?? "maintain";
  const defaultTargetKg =
    resolvedGoal === "cut"
      ? 78
      : resolvedGoal === "maintain"
        ? profile.currentWeightKg ?? 80
        : 84;
  await db.userProfiles.update(userId, {
    goalMode: resolvedGoal,
    goal: resolvedGoal === "bulk" ? "gain" : resolvedGoal,
    currentWeightKg: profile.currentWeightKg ?? 86,
    targetWeightKg: profile.targetWeightKg ?? defaultTargetKg
  });

  const targetDays = profile.daysPerWeek ?? 5;
  const equipment = profile.equipment ?? "gym";
  const monday = mondayOfThisWeekISO();
  const startWeek1ISO = addDaysISO(monday, -63); // 10 weeks ending on current week

  const weeks: WeekPlan[] = [];
  for (let weekNum = 1; weekNum <= 10; weekNum += 1) {
    const startDateISO = addDaysISO(startWeek1ISO, (weekNum - 1) * 7);
    const rawWeek = await buildWeekFromTemplate(plan, weekNum, startDateISO, userId, targetDays);
    const withActuals = decorateWeekWithDemoActuals(rawWeek, weekNum - 1, equipment);
    weeks.push(withActuals);
  }

  await db.weekPlans.bulkAdd(weeks);
  await seedDemoWeightEntries(userId, resolvedGoal);
}

function makePlannedExercise(exTemplate: ExerciseTemplate): PlannedExercise {
  const plannedSets = exTemplate.defaultSets;
  const sets: SetEntry[] = Array.from({ length: plannedSets }).map((_, i) => ({
    setNumber: i + 1,
    plannedRepsMin: exTemplate.repRange.min,
    plannedRepsMax: exTemplate.repRange.max,
    plannedWeightKg: undefined,
    actualReps: undefined,
    actualWeightKg: undefined,
    completed: false
  }));

  return {
    id: uid(),
    name: exTemplate.name,
    plannedSets,
    repRange: { ...exTemplate.repRange },
    plannedWeightKg: undefined,
    sets
  };
}

async function buildWeekFromTemplate(
  plan: PlanTemplate,
  weekNumber: number,
  startDateISO: string,
  userId: string,
  targetDays: 3 | 4 | 5
): Promise<WeekPlan> {
  const exTemplates = await db.exerciseTemplates.toArray();
  const exById = new Map(exTemplates.map((e) => [e.id, e]));
  const remappedDays = remapDayTemplatesForTargetDays(plan, targetDays, exTemplates);
  const profile = await db.userProfiles.get(userId);
  const equipment = profile?.equipment ?? "gym";
  const finalDays = applyEquipmentToDayTemplates(remappedDays, exTemplates, equipment);

  const days: WorkoutDay[] = finalDays
    .slice()
    .sort((a, b) => a.weekdayIndex - b.weekdayIndex)
    .map((dt) => ({
      id: uid(),
      title: dt.title,
      dateISO: addDaysISO(startDateISO, dt.weekdayIndex),
      isComplete: false,
      exercises: dt.exerciseTemplateIds
        .map((id) => exById.get(id))
        .filter((x): x is ExerciseTemplate => !!x)
        .map(makePlannedExercise)
    }));

  return {
    id: uid(),
    userId,
    weekNumber,
    startDateISO,
    createdAtISO: new Date().toISOString(),
    isLocked: false,
    days
  };
}

async function getOrCreateRithvikPresetTemplate(): Promise<PlanTemplate> {
  await getOrCreateExercise("Middle Cable Crossover", 3, { min: 12, max: 15 });
  await getOrCreateExercise("Low to High Cable Crossover", 3, { min: 12, max: 15 });
  await getOrCreateExercise("High to Low Cable Crossover", 3, { min: 12, max: 15 });
  await getOrCreateExercise("Flat Bench Press", 3, { min: 8, max: 12 });
  await getOrCreateExercise("Incline Bench Press", 3, { min: 8, max: 12 });
  await getOrCreateExercise("Barbell Curls", 3, { min: 12, max: 15 });
  await getOrCreateExercise("Preacher Curls", 3, { min: 12, max: 15 });
  await getOrCreateExercise("Hammer Curls", 3, { min: 12, max: 15 });
  await getOrCreateExercise("Reverse Barbell Curls", 3, { min: 12, max: 15 });
  await getOrCreateExercise("Shoulder Press", 3, { min: 8, max: 12 });
  await getOrCreateExercise("Side Lateral Raise", 3, { min: 12, max: 15 });
  await getOrCreateExercise("Rear Delt Pec Fly", 3, { min: 12, max: 15 });
  await getOrCreateExercise("Dumbbell Raise", 3, { min: 12, max: 15 });
  await getOrCreateExercise("Tricep Pressdown", 3, { min: 10, max: 12 });
  await getOrCreateExercise("Cable Tricep Extension", 3, { min: 10, max: 12 });
  await getOrCreateExercise("Lat Pulldown", 3, { min: 10, max: 15 });
  await getOrCreateExercise("Seated Cable Row", 3, { min: 10, max: 15 });
  await getOrCreateExercise("Leg Press", 3, { min: 10, max: 15 });
  await getOrCreateExercise("Leg Extension", 3, { min: 12, max: 15 });
  await getOrCreateExercise("Leg Curl", 3, { min: 12, max: 15 });
  await getOrCreateExercise("Calf Raises", 3, { min: 12, max: 15 });

  const existing = await db.planTemplates.where("name").equals("Rithvik Preset (Week 6)").first();
  if (existing) return existing;

  const dayTemplates: DayTemplate[] = [
    {
      id: uid(),
      weekdayIndex: 0,
      title: "Chest / Biceps",
      exerciseTemplateIds: [
        await exId("Middle Cable Crossover"),
        await exId("Flat Bench Press"),
        await exId("Barbell Curls"),
        await exId("Preacher Curls"),
        await exId("Hammer Curls"),
        await exId("Reverse Barbell Curls")
      ]
    },
    {
      id: uid(),
      weekdayIndex: 1,
      title: "Shoulders / Triceps",
      exerciseTemplateIds: [
        await exId("Shoulder Press"),
        await exId("Incline Bench Press"),
        await exId("Side Lateral Raise"),
        await exId("Rear Delt Pec Fly"),
        await exId("Dumbbell Raise"),
        await exId("Cable Tricep Extension"),
        await exId("Tricep Pressdown")
      ]
    },
    {
      id: uid(),
      weekdayIndex: 2,
      title: "Back / Legs",
      exerciseTemplateIds: [
        await exId("Lat Pulldown"),
        await exId("Seated Cable Row"),
        await exId("Leg Extension"),
        await exId("Leg Press"),
        await exId("Leg Curl"),
        await exId("Calf Raises")
      ]
    },
    {
      id: uid(),
      weekdayIndex: 3,
      title: "Chest / Biceps",
      exerciseTemplateIds: [
        await exId("Low to High Cable Crossover"),
        await exId("Flat Bench Press"),
        await exId("Barbell Curls"),
        await exId("Preacher Curls"),
        await exId("Hammer Curls")
      ]
    },
    {
      id: uid(),
      weekdayIndex: 4,
      title: "Shoulders / Triceps",
      exerciseTemplateIds: [
        await exId("Incline Bench Press"),
        await exId("Shoulder Press"),
        await exId("Side Lateral Raise"),
        await exId("Rear Delt Pec Fly"),
        await exId("Tricep Pressdown"),
        await exId("Cable Tricep Extension")
      ]
    }
  ];

  const plan: PlanTemplate = { id: uid(), name: "Rithvik Preset (Week 6)", dayTemplates };
  await db.planTemplates.add(plan);
  return plan;
}

export async function initRithvikPresetWeek6ForUser(userId: string): Promise<void> {
  const weekCount = await db.weekPlans.where("userId").equals(userId).count();
  if (weekCount > 0) {
    throw new Error("Weeks already exist for this profile.");
  }

  const plan = await getOrCreateRithvikPresetTemplate();
  const profile = await db.userProfiles.get(userId);
  const targetDays = profile?.daysPerWeek ?? 5;
  const week = await buildWeekFromTemplate(plan, 6, mondayOfThisWeekISO(), userId, targetDays);
  await db.weekPlans.add(week);
}

export async function initRithvikPresetWeek6(): Promise<void> {
  const activeUserId = await getActiveUserId();
  if (!activeUserId) throw new Error("No active profile selected.");
  await initRithvikPresetWeek6ForUser(activeUserId);
}
