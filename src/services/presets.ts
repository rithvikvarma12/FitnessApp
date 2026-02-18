import { db } from "../db/db";
import type {
  DayTemplate,
  ExerciseTemplate,
  PlanTemplate,
  PlannedExercise,
  SetEntry,
  WeekPlan,
  WorkoutDay
} from "../db/types";

// ---------- helpers ----------
const uid = () => crypto.randomUUID();

function mondayOfThisWeekISO(): string {
  const now = new Date();
  const day = now.getDay(); // Sun=0
  const diff = (day === 0 ? -6 : 1) - day; // move to Monday
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

async function getOrCreateExercise(
  name: string,
  defaultSets: number,
  repRange: { min: number; max: number }
): Promise<ExerciseTemplate> {
  const existing = await db.exerciseTemplates.where("name").equals(name).first();
  if (existing) return existing;

  const ex: ExerciseTemplate = {
    id: uid(),
    name,
    defaultSets,
    repRange
  };
  await db.exerciseTemplates.add(ex);
  return ex;
}

async function exId(name: string): Promise<string> {
  const ex = await db.exerciseTemplates.where("name").equals(name).first();
  if (!ex) throw new Error(`Missing exercise template: ${name}`);
  return ex.id;
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
  startDateISO: string
): Promise<WeekPlan> {
  const exTemplates = await db.exerciseTemplates.toArray();
  const exById = new Map(exTemplates.map(e => [e.id, e]));

  const days: WorkoutDay[] = plan.dayTemplates
    .slice()
    .sort((a, b) => a.weekdayIndex - b.weekdayIndex)
    .map((dt) => {
      const dateISO = addDaysISO(startDateISO, dt.weekdayIndex);

      const exercises: PlannedExercise[] = dt.exerciseTemplateIds
        .map((id) => exById.get(id))
        .filter((x): x is ExerciseTemplate => !!x)
        .map(makePlannedExercise);

      return {
        id: uid(),
        title: dt.title,
        dateISO,
        isComplete: false,
        exercises
      };
    });

  return {
    id: uid(),
    weekNumber,
    startDateISO,
    createdAtISO: new Date().toISOString(),
    isLocked: false,
    days
  };
}

// ---------- main preset ----------
export async function initRithvikPresetWeek6(): Promise<void> {
  // If you already have weeks, don't overwrite anything.
  const weekCount = await db.weekPlans.count();
  if (weekCount > 0) {
    throw new Error("Weeks already exist. Clear app data if you want to re-initialize.");
  }

  // Create exercise templates (minimal list based on your project split)
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

  // Create or reuse template
  const existingTemplate = await db.planTemplates.where("name").equals("Rithvik Preset (Week 6)").first();
  if (existingTemplate) {
    // should never happen if weekCount is 0, but safe
    throw new Error("Preset template already exists but weeks do not. Please clear app data.");
  }

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

  const plan: PlanTemplate = {
    id: uid(),
    name: "Rithvik Preset (Week 6)",
    dayTemplates
  };

  await db.planTemplates.add(plan);

  // Create Week 6 starting this Monday
  const weekNumber = 6;
  const startDateISO = mondayOfThisWeekISO();
  const week = await buildWeekFromTemplate(plan, weekNumber, startDateISO);

  await db.weekPlans.add(week);
}