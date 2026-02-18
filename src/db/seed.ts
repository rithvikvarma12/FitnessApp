import { db } from "./db";
import type { ExerciseTemplate, PlanTemplate, DayTemplate } from "./types";

const uid = () => crypto.randomUUID();

export async function ensureSeedData() {
  const existing = await db.planTemplates.count();
  if (existing > 0) return;

  // Baseline based on your split from this project (edit anytime later)
  const ex: ExerciseTemplate[] = [
    { id: uid(), name: "Flat Bench Press", defaultSets: 3, repRange: { min: 8, max: 12 } },
    { id: uid(), name: "Incline Bench Press", defaultSets: 3, repRange: { min: 8, max: 12 } },
    { id: uid(), name: "Cable Crossover (Middle)", defaultSets: 3, repRange: { min: 12, max: 15 } },
    { id: uid(), name: "Cable Crossover (Low-to-High)", defaultSets: 3, repRange: { min: 12, max: 15 } },
    { id: uid(), name: "Cable Crossover (High-to-Low)", defaultSets: 3, repRange: { min: 12, max: 15 } },

    { id: uid(), name: "Barbell Curls", defaultSets: 3, repRange: { min: 12, max: 15 } },
    { id: uid(), name: "Preacher Curls", defaultSets: 3, repRange: { min: 12, max: 15 } },
    { id: uid(), name: "Hammer Curls", defaultSets: 3, repRange: { min: 12, max: 15 } },

    { id: uid(), name: "Shoulder Press", defaultSets: 3, repRange: { min: 10, max: 12 } },
    { id: uid(), name: "Side Lateral Raise", defaultSets: 3, repRange: { min: 12, max: 15 } },
    { id: uid(), name: "Rear Delt Pec Fly", defaultSets: 3, repRange: { min: 12, max: 15 } },

    { id: uid(), name: "Tricep Pressdown", defaultSets: 3, repRange: { min: 10, max: 12 } },
    { id: uid(), name: "Dumbbell Tricep Extension", defaultSets: 3, repRange: { min: 10, max: 12 } },

    { id: uid(), name: "Lat Pulldown", defaultSets: 3, repRange: { min: 10, max: 15 } },
    { id: uid(), name: "Seated Cable Row", defaultSets: 3, repRange: { min: 10, max: 15 } },
    { id: uid(), name: "Leg Press", defaultSets: 3, repRange: { min: 12, max: 15 } }
  ];

  const byName = (name: string) => ex.find(e => e.name === name)!.id;

  const days: DayTemplate[] = [
    {
      id: uid(),
      title: "Chest / Biceps",
      weekdayIndex: 0,
      exerciseTemplateIds: [
        byName("Flat Bench Press"),
        byName("Cable Crossover (Middle)"),
        byName("Barbell Curls"),
        byName("Preacher Curls")
      ]
    },
    {
      id: uid(),
      title: "Shoulders / Triceps",
      weekdayIndex: 1,
      exerciseTemplateIds: [
        byName("Shoulder Press"),
        byName("Side Lateral Raise"),
        byName("Rear Delt Pec Fly"),
        byName("Tricep Pressdown")
      ]
    },
    {
      id: uid(),
      title: "Back / Legs",
      weekdayIndex: 2,
      exerciseTemplateIds: [
        byName("Lat Pulldown"),
        byName("Seated Cable Row"),
        byName("Leg Press")
      ]
    },
    {
      id: uid(),
      title: "Chest / Biceps",
      weekdayIndex: 3,
      exerciseTemplateIds: [
        byName("Incline Bench Press"),
        byName("Cable Crossover (Low-to-High)"),
        byName("Cable Crossover (High-to-Low)"),
        byName("Hammer Curls")
      ]
    },
    {
      id: uid(),
      title: "Shoulders / Triceps",
      weekdayIndex: 4,
      exerciseTemplateIds: [
        byName("Incline Bench Press"),
        byName("Side Lateral Raise"),
        byName("Rear Delt Pec Fly"),
        byName("Dumbbell Tricep Extension")
      ]
    }
  ];

  const plan: PlanTemplate = {
    id: uid(),
    name: "5-Day Split (Project Baseline)",
    dayTemplates: days
  };

  await db.exerciseTemplates.bulkAdd(ex);
  await db.planTemplates.add(plan);
  await db.settings.put({ key: "unit", value: "kg" });
}