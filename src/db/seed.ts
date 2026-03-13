import { db } from "./db";
import type { ExerciseTemplate, PlanTemplate, DayTemplate, ExerciseMeta } from "./types";

const uid = () => crypto.randomUUID();

type ExerciseMetaSeed = Omit<ExerciseMeta, "exerciseTemplateId" | "alternatives"> & {
  alternativesByName?: string[];
};

// ─── Equipment tag definitions ───────────────────────────────────────────────
// Tags: "barbell" | "dumbbell" | "cable" | "machine" | "bodyweight"
//       | "kettlebell" | "resistance_band" | "bench_required" | "pull_up_bar"
// homeEquipment checklist items map to these tags.

const homeMinimalPack: Array<Omit<ExerciseTemplate, "id">> = [
  { name: "Push-Ups",                              defaultSets: 3, repRange: { min: 10, max: 20 } },
  { name: "Bodyweight Squat",                      defaultSets: 3, repRange: { min: 12, max: 20 } },
  { name: "Walking Lunges",                        defaultSets: 3, repRange: { min: 10, max: 16 } },
  { name: "Glute Bridge",                          defaultSets: 3, repRange: { min: 12, max: 20 } },
  { name: "Pike Push-Up",                          defaultSets: 3, repRange: { min: 6,  max: 15 } },
  { name: "Plank",                                 defaultSets: 3, repRange: { min: 20, max: 60 } },
  { name: "One-Arm Dumbbell Row",                  defaultSets: 3, repRange: { min: 8,  max: 15 } },
  { name: "Dumbbell Floor Press",                  defaultSets: 3, repRange: { min: 8,  max: 15 } },
  { name: "Goblet Squat",                          defaultSets: 3, repRange: { min: 8,  max: 15 } },
  { name: "Romanian Deadlift (Dumbbell)",          defaultSets: 3, repRange: { min: 8,  max: 15 } },
  { name: "Dumbbell Shoulder Press",               defaultSets: 3, repRange: { min: 8,  max: 12 } },
  { name: "Dumbbell Bicep Curl",                   defaultSets: 3, repRange: { min: 10, max: 15 } },
  { name: "Dumbbell Overhead Tricep Extension",    defaultSets: 3, repRange: { min: 10, max: 15 } },

  // NEW HOME/MINIMAL EXERCISES
  { name: "Diamond Push-Ups",                      defaultSets: 3, repRange: { min: 8,  max: 15 } },
  { name: "Wide Push-Ups",                         defaultSets: 3, repRange: { min: 10, max: 20 } },
  { name: "Decline Push-Ups",                      defaultSets: 3, repRange: { min: 8,  max: 15 } },
  { name: "Incline Push-Ups",                      defaultSets: 3, repRange: { min: 10, max: 20 } },
  { name: "Bulgarian Split Squat (Bodyweight)",    defaultSets: 3, repRange: { min: 8,  max: 15 } },
  { name: "Bulgarian Split Squat (Dumbbell)",      defaultSets: 3, repRange: { min: 8,  max: 12 } },
  { name: "Step-Ups (Bodyweight)",                 defaultSets: 3, repRange: { min: 10, max: 16 } },
  { name: "Step-Ups (Dumbbell)",                   defaultSets: 3, repRange: { min: 8,  max: 12 } },
  { name: "Single-Leg Glute Bridge",               defaultSets: 3, repRange: { min: 10, max: 16 } },
  { name: "Hip Thrust (Dumbbell)",                 defaultSets: 3, repRange: { min: 10, max: 15 } },
  { name: "Sumo Squat (Dumbbell)",                 defaultSets: 3, repRange: { min: 10, max: 15 } },
  { name: "Lateral Lunge",                         defaultSets: 3, repRange: { min: 8,  max: 14 } },
  { name: "Reverse Lunge (Dumbbell)",              defaultSets: 3, repRange: { min: 8,  max: 12 } },
  { name: "Calf Raises (Bodyweight)",              defaultSets: 3, repRange: { min: 15, max: 25 } },
  { name: "Calf Raises (Dumbbell)",                defaultSets: 3, repRange: { min: 12, max: 20 } },
  { name: "Dumbbell Deadlift",                     defaultSets: 3, repRange: { min: 8,  max: 12 } },
  { name: "Dumbbell Sumo Deadlift",                defaultSets: 3, repRange: { min: 8,  max: 12 } },
  { name: "Dumbbell Lateral Raise",                defaultSets: 3, repRange: { min: 12, max: 20 } },
  { name: "Dumbbell Front Raise",                  defaultSets: 3, repRange: { min: 10, max: 15 } },
  { name: "Dumbbell Rear Delt Fly",                defaultSets: 3, repRange: { min: 12, max: 20 } },
  { name: "Dumbbell Arnold Press",                 defaultSets: 3, repRange: { min: 8,  max: 12 } },
  { name: "Dumbbell Upright Row",                  defaultSets: 3, repRange: { min: 10, max: 15 } },
  { name: "Hammer Curls",                          defaultSets: 3, repRange: { min: 10, max: 15 } },
  { name: "Dumbbell Concentration Curl",           defaultSets: 3, repRange: { min: 10, max: 15 } },
  { name: "Dumbbell Zottman Curl",                 defaultSets: 3, repRange: { min: 10, max: 15 } },
  { name: "Dumbbell Chest Fly (Floor)",            defaultSets: 3, repRange: { min: 10, max: 15 } },
  { name: "Dumbbell Incline Press",                defaultSets: 3, repRange: { min: 8,  max: 12 } },
  { name: "Renegade Row",                          defaultSets: 3, repRange: { min: 6,  max: 10 } },
  { name: "Dumbbell Bent-Over Row",                defaultSets: 3, repRange: { min: 8,  max: 12 } },
  { name: "Dumbbell Pullover",                     defaultSets: 3, repRange: { min: 10, max: 15 } },
  { name: "Tricep Dips (Chair)",                   defaultSets: 3, repRange: { min: 8,  max: 15 } },
  { name: "Dumbbell Kickback",                     defaultSets: 3, repRange: { min: 12, max: 20 } },
  { name: "Mountain Climbers",                     defaultSets: 3, repRange: { min: 20, max: 40 } },
  { name: "Bicycle Crunches",                      defaultSets: 3, repRange: { min: 15, max: 30 } },
  { name: "Dead Bug",                              defaultSets: 3, repRange: { min: 8,  max: 16 } },
  { name: "Hollow Body Hold",                      defaultSets: 3, repRange: { min: 20, max: 45 } },
  { name: "Side Plank",                            defaultSets: 3, repRange: { min: 20, max: 45 } },
  { name: "Pull-Ups",                              defaultSets: 3, repRange: { min: 4,  max: 10 } },
  { name: "Chin-Ups",                              defaultSets: 3, repRange: { min: 4,  max: 10 } },
  { name: "Inverted Rows",                         defaultSets: 3, repRange: { min: 8,  max: 15 } },
  { name: "Band Pull-Apart",                       defaultSets: 3, repRange: { min: 15, max: 25 } },
  { name: "Band Face Pull",                        defaultSets: 3, repRange: { min: 12, max: 20 } },
  { name: "Band Bicep Curl",                       defaultSets: 3, repRange: { min: 12, max: 20 } },
  { name: "Band Tricep Pressdown",                 defaultSets: 3, repRange: { min: 12, max: 20 } },
  { name: "Band Lateral Walk",                     defaultSets: 3, repRange: { min: 12, max: 20 } },
  { name: "Band Hip Abduction",                    defaultSets: 3, repRange: { min: 15, max: 25 } },
  { name: "Kettlebell Swing",                      defaultSets: 3, repRange: { min: 10, max: 20 } },
  { name: "Kettlebell Goblet Squat",               defaultSets: 3, repRange: { min: 8,  max: 15 } },
  { name: "Kettlebell Romanian Deadlift",          defaultSets: 3, repRange: { min: 8,  max: 12 } },
  { name: "Kettlebell Press",                      defaultSets: 3, repRange: { min: 8,  max: 12 } },
  { name: "Kettlebell Row",                        defaultSets: 3, repRange: { min: 8,  max: 12 } },
  { name: "Kettlebell Snatch",                     defaultSets: 3, repRange: { min: 5,  max: 10 } },
];

// ─── GYM exercise templates ───────────────────────────────────────────────────
const gymPack: Array<Omit<ExerciseTemplate, "id">> = [
  // Chest
  { name: "Flat Bench Press",                      defaultSets: 3, repRange: { min: 8,  max: 12 } },
  { name: "Incline Bench Press",                   defaultSets: 3, repRange: { min: 8,  max: 12 } },
  { name: "Decline Bench Press",                   defaultSets: 3, repRange: { min: 8,  max: 12 } },
  { name: "Dumbbell Bench Press",                  defaultSets: 3, repRange: { min: 8,  max: 12 } },
  { name: "Dumbbell Incline Press",                defaultSets: 3, repRange: { min: 8,  max: 12 } },
  { name: "Cable Crossover (Middle)",              defaultSets: 3, repRange: { min: 12, max: 15 } },
  { name: "Cable Crossover (Low-to-High)",         defaultSets: 3, repRange: { min: 12, max: 15 } },
  { name: "Cable Crossover (High-to-Low)",         defaultSets: 3, repRange: { min: 12, max: 15 } },
  { name: "Pec Deck Fly",                          defaultSets: 3, repRange: { min: 12, max: 15 } },
  { name: "Machine Chest Press",                   defaultSets: 3, repRange: { min: 10, max: 15 } },
  { name: "Smith Machine Bench Press",             defaultSets: 3, repRange: { min: 8,  max: 12 } },
  // Back
  { name: "Barbell Bent-Over Row",                 defaultSets: 3, repRange: { min: 8,  max: 12 } },
  { name: "T-Bar Row",                             defaultSets: 3, repRange: { min: 8,  max: 12 } },
  { name: "Lat Pulldown",                          defaultSets: 3, repRange: { min: 10, max: 15 } },
  { name: "Seated Cable Row",                      defaultSets: 3, repRange: { min: 10, max: 15 } },
  { name: "Wide-Grip Pulldown",                    defaultSets: 3, repRange: { min: 10, max: 15 } },
  { name: "Straight-Arm Pulldown",                 defaultSets: 3, repRange: { min: 12, max: 15 } },
  { name: "Machine Row",                           defaultSets: 3, repRange: { min: 10, max: 15 } },
  { name: "Cable Row (Wide Grip)",                 defaultSets: 3, repRange: { min: 10, max: 15 } },
  { name: "Deadlift",                              defaultSets: 3, repRange: { min: 4,  max: 8  } },
  { name: "Romanian Deadlift (Barbell)",           defaultSets: 3, repRange: { min: 8,  max: 12 } },
  // Shoulders
  { name: "Shoulder Press",                        defaultSets: 3, repRange: { min: 10, max: 12 } },
  { name: "Barbell Overhead Press",                defaultSets: 3, repRange: { min: 6,  max: 10 } },
  { name: "Smith Machine Shoulder Press",          defaultSets: 3, repRange: { min: 8,  max: 12 } },
  { name: "Side Lateral Raise",                    defaultSets: 3, repRange: { min: 12, max: 20 } },
  { name: "Cable Lateral Raise",                   defaultSets: 3, repRange: { min: 12, max: 20 } },
  { name: "Rear Delt Pec Fly",                     defaultSets: 3, repRange: { min: 12, max: 15 } },
  { name: "Cable Face Pull",                       defaultSets: 3, repRange: { min: 12, max: 20 } },
  { name: "Machine Lateral Raise",                 defaultSets: 3, repRange: { min: 12, max: 20 } },
  { name: "Machine Rear Delt",                     defaultSets: 3, repRange: { min: 12, max: 20 } },
  // Biceps
  { name: "Barbell Curls",                         defaultSets: 3, repRange: { min: 10, max: 15 } },
  { name: "Preacher Curls",                        defaultSets: 3, repRange: { min: 10, max: 15 } },
  { name: "Cable Curl",                            defaultSets: 3, repRange: { min: 12, max: 15 } },
  { name: "Cable Hammer Curl",                     defaultSets: 3, repRange: { min: 12, max: 15 } },
  { name: "Machine Bicep Curl",                    defaultSets: 3, repRange: { min: 12, max: 15 } },
  { name: "EZ-Bar Curl",                           defaultSets: 3, repRange: { min: 10, max: 15 } },
  // Triceps
  { name: "Tricep Pressdown",                      defaultSets: 3, repRange: { min: 12, max: 15 } },
  { name: "Cable Tricep Extension",                defaultSets: 3, repRange: { min: 12, max: 15 } },
  { name: "Dumbbell Tricep Extension",             defaultSets: 3, repRange: { min: 10, max: 15 } },
  { name: "Skull Crushers",                        defaultSets: 3, repRange: { min: 10, max: 15 } },
  { name: "Close-Grip Bench Press",                defaultSets: 3, repRange: { min: 8,  max: 12 } },
  // Legs
  { name: "Barbell Back Squat",                    defaultSets: 3, repRange: { min: 6,  max: 10 } },
  { name: "Barbell Front Squat",                   defaultSets: 3, repRange: { min: 6,  max: 10 } },
  { name: "Leg Press",                             defaultSets: 3, repRange: { min: 10, max: 15 } },
  { name: "Leg Extension",                         defaultSets: 3, repRange: { min: 12, max: 15 } },
  { name: "Leg Curl",                              defaultSets: 3, repRange: { min: 12, max: 15 } },
  { name: "Hack Squat",                            defaultSets: 3, repRange: { min: 10, max: 15 } },
  { name: "Smith Machine Squat",                   defaultSets: 3, repRange: { min: 8,  max: 12 } },
  { name: "Hip Thrust (Barbell)",                  defaultSets: 3, repRange: { min: 10, max: 15 } },
  { name: "Hip Abduction Machine",                 defaultSets: 3, repRange: { min: 15, max: 20 } },
  { name: "Calf Raises",                           defaultSets: 3, repRange: { min: 12, max: 20 } },
  { name: "Seated Calf Raise",                     defaultSets: 3, repRange: { min: 15, max: 25 } },
  // Core
  { name: "Cable Crunch",                          defaultSets: 3, repRange: { min: 12, max: 20 } },
  { name: "Hanging Leg Raise",                     defaultSets: 3, repRange: { min: 8,  max: 15 } },
  { name: "Ab Wheel Rollout",                      defaultSets: 3, repRange: { min: 6,  max: 12 } },
  // Misc
  { name: "Middle Cable Crossover",                defaultSets: 3, repRange: { min: 12, max: 15 } },
  { name: "Low to High Cable Crossover",           defaultSets: 3, repRange: { min: 12, max: 15 } },
  { name: "High to Low Cable Crossover",           defaultSets: 3, repRange: { min: 12, max: 15 } },
  { name: "Dumbbell Raise",                        defaultSets: 3, repRange: { min: 12, max: 20 } },
  { name: "Reverse Barbell Curls",                 defaultSets: 3, repRange: { min: 12, max: 15 } },
];

const EXERCISE_META_BY_NAME: Record<string, ExerciseMetaSeed> = {
  // ── CHEST ──────────────────────────────────────────────────────────────────
  "Flat Bench Press": {
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps", "front delts"],
    movementPattern: "push", equipment: "gym", type: "compound",
    equipmentTags: ["barbell", "bench_required"],
    cues: ["Shoulders pinned back", "Control bar path and lockout"],
    videoUrl: "https://www.youtube.com/results?search_query=flat+barbell+bench+press+form",
    alternativesByName: ["Dumbbell Bench Press", "Dumbbell Floor Press", "Push-Ups"]
  },
  "Incline Bench Press": {
    primaryMuscles: ["upper chest"],
    secondaryMuscles: ["triceps", "front delts"],
    movementPattern: "push", equipment: "gym", type: "compound",
    equipmentTags: ["barbell", "bench_required"],
    cues: ["Keep wrists stacked over elbows", "Press up and slightly back"],
    videoUrl: "https://www.youtube.com/results?search_query=incline+bench+press+form",
    alternativesByName: ["Dumbbell Incline Press", "Dumbbell Floor Press", "Incline Push-Ups"]
  },
  "Decline Bench Press": {
    primaryMuscles: ["lower chest"],
    secondaryMuscles: ["triceps", "front delts"],
    movementPattern: "push", equipment: "gym", type: "compound",
    equipmentTags: ["barbell", "bench_required"],
    videoUrl: "https://www.youtube.com/results?search_query=decline+bench+press+form",
    alternativesByName: ["Flat Bench Press", "Dumbbell Floor Press"]
  },
  "Dumbbell Bench Press": {
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps", "front delts"],
    movementPattern: "push", equipment: "home", type: "compound",
    equipmentTags: ["dumbbell", "bench_required"],
    cues: ["Full range of motion", "Controlled descent"],
    videoUrl: "https://www.youtube.com/results?search_query=dumbbell+bench+press+form",
    alternativesByName: ["Dumbbell Floor Press", "Push-Ups", "Flat Bench Press"]
  },
  "Dumbbell Incline Press": {
    primaryMuscles: ["upper chest"],
    secondaryMuscles: ["triceps", "front delts"],
    movementPattern: "push", equipment: "home", type: "compound",
    equipmentTags: ["dumbbell", "bench_required"],
    videoUrl: "https://www.youtube.com/results?search_query=dumbbell+incline+press+form",
    alternativesByName: ["Incline Push-Ups", "Incline Bench Press", "Pike Push-Up"]
  },
  "Dumbbell Floor Press": {
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps", "front delts"],
    movementPattern: "push", equipment: "home", type: "compound",
    equipmentTags: ["dumbbell"],
    cues: ["Pause elbows lightly on floor", "Press with neutral wrists"],
    videoUrl: "https://www.youtube.com/results?search_query=dumbbell+floor+press+form",
    alternativesByName: ["Push-Ups", "Dumbbell Bench Press"]
  },
  "Dumbbell Chest Fly (Floor)": {
    primaryMuscles: ["chest"],
    secondaryMuscles: ["front delts"],
    movementPattern: "isolation", equipment: "home", type: "isolation",
    equipmentTags: ["dumbbell"],
    videoUrl: "https://www.youtube.com/results?search_query=dumbbell+chest+fly+floor+form",
    alternativesByName: ["Dumbbell Floor Press", "Push-Ups"]
  },
  "Cable Crossover (Middle)": {
    primaryMuscles: ["chest"], secondaryMuscles: ["front delts"],
    movementPattern: "isolation", equipment: "gym", type: "isolation",
    equipmentTags: ["cable"],
    videoUrl: "https://www.youtube.com/results?search_query=cable+crossover+middle+form",
    alternativesByName: ["Pec Deck Fly", "Push-Ups"]
  },
  "Cable Crossover (Low-to-High)": {
    primaryMuscles: ["upper chest"], secondaryMuscles: ["front delts"],
    movementPattern: "isolation", equipment: "gym", type: "isolation",
    equipmentTags: ["cable"],
    videoUrl: "https://www.youtube.com/results?search_query=low+to+high+cable+crossover+form",
    alternativesByName: ["Cable Crossover (Middle)", "Incline Push-Ups"]
  },
  "Cable Crossover (High-to-Low)": {
    primaryMuscles: ["lower chest"], secondaryMuscles: ["front delts"],
    movementPattern: "isolation", equipment: "gym", type: "isolation",
    equipmentTags: ["cable"],
    videoUrl: "https://www.youtube.com/results?search_query=high+to+low+cable+crossover+form",
    alternativesByName: ["Cable Crossover (Middle)", "Decline Push-Ups"]
  },
  "Pec Deck Fly": {
    primaryMuscles: ["chest"], secondaryMuscles: ["front delts"],
    movementPattern: "isolation", equipment: "gym", type: "isolation",
    equipmentTags: ["machine"],
    videoUrl: "https://www.youtube.com/results?search_query=pec+deck+fly+form",
    alternativesByName: ["Cable Crossover (Middle)", "Dumbbell Chest Fly (Floor)", "Push-Ups"]
  },
  "Machine Chest Press": {
    primaryMuscles: ["chest"], secondaryMuscles: ["triceps", "front delts"],
    movementPattern: "push", equipment: "gym", type: "compound",
    equipmentTags: ["machine"],
    videoUrl: "https://www.youtube.com/results?search_query=machine+chest+press+form",
    alternativesByName: ["Flat Bench Press", "Dumbbell Bench Press", "Push-Ups"]
  },
  "Smith Machine Bench Press": {
    primaryMuscles: ["chest"], secondaryMuscles: ["triceps", "front delts"],
    movementPattern: "push", equipment: "gym", type: "compound",
    equipmentTags: ["machine", "bench_required"],
    videoUrl: "https://www.youtube.com/results?search_query=smith+machine+bench+press+form",
    alternativesByName: ["Flat Bench Press", "Dumbbell Bench Press"]
  },
  "Push-Ups": {
    primaryMuscles: ["chest"], secondaryMuscles: ["triceps", "shoulders", "core"],
    movementPattern: "push", equipment: "minimal", type: "compound",
    equipmentTags: ["bodyweight"],
    videoUrl: "https://www.youtube.com/results?search_query=push+up+form",
    alternativesByName: ["Dumbbell Floor Press", "Flat Bench Press"]
  },
  "Diamond Push-Ups": {
    primaryMuscles: ["triceps"], secondaryMuscles: ["chest", "shoulders"],
    movementPattern: "push", equipment: "minimal", type: "compound",
    equipmentTags: ["bodyweight"],
    cues: ["Hands form diamond shape", "Elbows track over hands"],
    videoUrl: "https://www.youtube.com/results?search_query=diamond+push+up+form",
    alternativesByName: ["Push-Ups", "Dumbbell Overhead Tricep Extension", "Tricep Dips (Chair)"]
  },
  "Wide Push-Ups": {
    primaryMuscles: ["chest"], secondaryMuscles: ["shoulders", "core"],
    movementPattern: "push", equipment: "minimal", type: "compound",
    equipmentTags: ["bodyweight"],
    videoUrl: "https://www.youtube.com/results?search_query=wide+push+up+form",
    alternativesByName: ["Push-Ups", "Dumbbell Floor Press"]
  },
  "Decline Push-Ups": {
    primaryMuscles: ["upper chest"], secondaryMuscles: ["triceps", "shoulders"],
    movementPattern: "push", equipment: "minimal", type: "compound",
    equipmentTags: ["bodyweight"],
    videoUrl: "https://www.youtube.com/results?search_query=decline+push+up+form",
    alternativesByName: ["Push-Ups", "Dumbbell Incline Press"]
  },
  "Incline Push-Ups": {
    primaryMuscles: ["lower chest"], secondaryMuscles: ["triceps"],
    movementPattern: "push", equipment: "minimal", type: "compound",
    equipmentTags: ["bodyweight"],
    videoUrl: "https://www.youtube.com/results?search_query=incline+push+up+form",
    alternativesByName: ["Push-Ups", "Dumbbell Floor Press"]
  },
  "Renegade Row": {
    primaryMuscles: ["lats"], secondaryMuscles: ["biceps", "core", "chest"],
    movementPattern: "pull", equipment: "home", type: "compound",
    equipmentTags: ["dumbbell"],
    cues: ["Hips level throughout", "Row elbow to hip"],
    videoUrl: "https://www.youtube.com/results?search_query=renegade+row+form",
    alternativesByName: ["One-Arm Dumbbell Row", "Dumbbell Bent-Over Row"]
  },

  // ── BACK ───────────────────────────────────────────────────────────────────
  "Barbell Bent-Over Row": {
    primaryMuscles: ["mid back", "lats"], secondaryMuscles: ["biceps", "rear delts"],
    movementPattern: "pull", equipment: "gym", type: "compound",
    equipmentTags: ["barbell"],
    cues: ["Hinge forward ~45°", "Lead with elbows"],
    videoUrl: "https://www.youtube.com/results?search_query=barbell+bent+over+row+form",
    alternativesByName: ["One-Arm Dumbbell Row", "Seated Cable Row", "T-Bar Row"]
  },
  "T-Bar Row": {
    primaryMuscles: ["mid back", "lats"], secondaryMuscles: ["biceps", "rear delts"],
    movementPattern: "pull", equipment: "gym", type: "compound",
    equipmentTags: ["barbell", "machine"],
    videoUrl: "https://www.youtube.com/results?search_query=t+bar+row+form",
    alternativesByName: ["Barbell Bent-Over Row", "Seated Cable Row"]
  },
  "Lat Pulldown": {
    primaryMuscles: ["lats"], secondaryMuscles: ["biceps", "upper back"],
    movementPattern: "pull", equipment: "gym", type: "compound",
    equipmentTags: ["cable", "machine"],
    cues: ["Pull elbows to hips", "Avoid leaning back excessively"],
    videoUrl: "https://www.youtube.com/results?search_query=lat+pulldown+form",
    alternativesByName: ["Pull-Ups", "Chin-Ups", "One-Arm Dumbbell Row"]
  },
  "Wide-Grip Pulldown": {
    primaryMuscles: ["lats"], secondaryMuscles: ["upper back", "biceps"],
    movementPattern: "pull", equipment: "gym", type: "compound",
    equipmentTags: ["cable", "machine"],
    videoUrl: "https://www.youtube.com/results?search_query=wide+grip+pulldown+form",
    alternativesByName: ["Lat Pulldown", "Pull-Ups"]
  },
  "Seated Cable Row": {
    primaryMuscles: ["mid back"], secondaryMuscles: ["lats", "biceps"],
    movementPattern: "pull", equipment: "gym", type: "compound",
    equipmentTags: ["cable"],
    cues: ["Lead with elbows", "Keep chest tall"],
    videoUrl: "https://www.youtube.com/results?search_query=seated+cable+row+form",
    alternativesByName: ["One-Arm Dumbbell Row", "Dumbbell Bent-Over Row", "Inverted Rows"]
  },
  "Cable Row (Wide Grip)": {
    primaryMuscles: ["upper back", "rear delts"], secondaryMuscles: ["mid back", "biceps"],
    movementPattern: "pull", equipment: "gym", type: "compound",
    equipmentTags: ["cable"],
    videoUrl: "https://www.youtube.com/results?search_query=wide+grip+cable+row+form",
    alternativesByName: ["Seated Cable Row", "Dumbbell Bent-Over Row"]
  },
  "Straight-Arm Pulldown": {
    primaryMuscles: ["lats"], secondaryMuscles: ["core"],
    movementPattern: "pull", equipment: "gym", type: "isolation",
    equipmentTags: ["cable"],
    videoUrl: "https://www.youtube.com/results?search_query=straight+arm+pulldown+form",
    alternativesByName: ["Lat Pulldown", "Dumbbell Pullover"]
  },
  "Machine Row": {
    primaryMuscles: ["mid back", "lats"], secondaryMuscles: ["biceps"],
    movementPattern: "pull", equipment: "gym", type: "compound",
    equipmentTags: ["machine"],
    videoUrl: "https://www.youtube.com/results?search_query=machine+row+form",
    alternativesByName: ["Seated Cable Row", "Barbell Bent-Over Row"]
  },
  "Deadlift": {
    primaryMuscles: ["hamstrings", "lower back", "glutes"], secondaryMuscles: ["quads", "traps", "lats"],
    movementPattern: "hinge", equipment: "gym", type: "compound",
    equipmentTags: ["barbell"],
    cues: ["Push the floor away", "Keep bar close", "Brace and hinge"],
    videoUrl: "https://www.youtube.com/results?search_query=deadlift+form",
    alternativesByName: ["Romanian Deadlift (Barbell)", "Dumbbell Deadlift", "Romanian Deadlift (Dumbbell)"]
  },
  "Romanian Deadlift (Barbell)": {
    primaryMuscles: ["hamstrings"], secondaryMuscles: ["glutes", "lower back"],
    movementPattern: "hinge", equipment: "gym", type: "compound",
    equipmentTags: ["barbell"],
    cues: ["Push hips back", "Keep slight knee bend"],
    videoUrl: "https://www.youtube.com/results?search_query=barbell+romanian+deadlift+form",
    alternativesByName: ["Romanian Deadlift (Dumbbell)", "Leg Curl", "Glute Bridge"]
  },
  "One-Arm Dumbbell Row": {
    primaryMuscles: ["lats"], secondaryMuscles: ["mid back", "biceps"],
    movementPattern: "pull", equipment: "home", type: "compound",
    equipmentTags: ["dumbbell"],
    cues: ["Brace on bench/support", "Pull elbow toward hip"],
    videoUrl: "https://www.youtube.com/results?search_query=one+arm+dumbbell+row+form",
    alternativesByName: ["Dumbbell Bent-Over Row", "Seated Cable Row", "Inverted Rows"]
  },
  "Dumbbell Bent-Over Row": {
    primaryMuscles: ["mid back", "lats"], secondaryMuscles: ["biceps", "rear delts"],
    movementPattern: "pull", equipment: "home", type: "compound",
    equipmentTags: ["dumbbell"],
    videoUrl: "https://www.youtube.com/results?search_query=dumbbell+bent+over+row+form",
    alternativesByName: ["One-Arm Dumbbell Row", "Barbell Bent-Over Row", "Inverted Rows"]
  },
  "Dumbbell Pullover": {
    primaryMuscles: ["lats"], secondaryMuscles: ["chest", "triceps"],
    movementPattern: "pull", equipment: "home", type: "isolation",
    equipmentTags: ["dumbbell"],
    videoUrl: "https://www.youtube.com/results?search_query=dumbbell+pullover+form",
    alternativesByName: ["Straight-Arm Pulldown", "Lat Pulldown"]
  },
  "Pull-Ups": {
    primaryMuscles: ["lats"], secondaryMuscles: ["biceps", "upper back"],
    movementPattern: "pull", equipment: "home", type: "compound",
    equipmentTags: ["pull_up_bar"],
    cues: ["Full hang to chin above bar", "Squeeze lats at top"],
    videoUrl: "https://www.youtube.com/results?search_query=pull+up+form",
    alternativesByName: ["Chin-Ups", "Lat Pulldown", "Inverted Rows"]
  },
  "Chin-Ups": {
    primaryMuscles: ["biceps", "lats"], secondaryMuscles: ["upper back"],
    movementPattern: "pull", equipment: "home", type: "compound",
    equipmentTags: ["pull_up_bar"],
    cues: ["Supinated grip", "Lead with chest"],
    videoUrl: "https://www.youtube.com/results?search_query=chin+up+form",
    alternativesByName: ["Pull-Ups", "Lat Pulldown", "Dumbbell Bicep Curl"]
  },
  "Inverted Rows": {
    primaryMuscles: ["mid back", "lats"], secondaryMuscles: ["biceps", "rear delts"],
    movementPattern: "pull", equipment: "minimal", type: "compound",
    equipmentTags: ["bodyweight"],
    cues: ["Keep body rigid", "Pull chest to bar"],
    videoUrl: "https://www.youtube.com/results?search_query=inverted+row+form",
    alternativesByName: ["One-Arm Dumbbell Row", "Seated Cable Row", "Dumbbell Bent-Over Row"]
  },
  "Kettlebell Row": {
    primaryMuscles: ["mid back", "lats"], secondaryMuscles: ["biceps"],
    movementPattern: "pull", equipment: "home", type: "compound",
    equipmentTags: ["kettlebell"],
    videoUrl: "https://www.youtube.com/results?search_query=kettlebell+row+form",
    alternativesByName: ["One-Arm Dumbbell Row", "Dumbbell Bent-Over Row"]
  },

  // ── SHOULDERS ──────────────────────────────────────────────────────────────
  "Shoulder Press": {
    primaryMuscles: ["shoulders"], secondaryMuscles: ["triceps", "upper chest"],
    movementPattern: "push", equipment: "gym", type: "compound",
    equipmentTags: ["machine", "dumbbell"],
    cues: ["Brace torso", "Press without shrugging early"],
    videoUrl: "https://www.youtube.com/results?search_query=shoulder+press+form",
    alternativesByName: ["Dumbbell Shoulder Press", "Barbell Overhead Press", "Pike Push-Up"]
  },
  "Barbell Overhead Press": {
    primaryMuscles: ["shoulders"], secondaryMuscles: ["triceps", "upper chest"],
    movementPattern: "push", equipment: "gym", type: "compound",
    equipmentTags: ["barbell"],
    cues: ["Bar path slightly arc", "Brace glutes and core"],
    videoUrl: "https://www.youtube.com/results?search_query=barbell+overhead+press+form",
    alternativesByName: ["Dumbbell Shoulder Press", "Shoulder Press", "Pike Push-Up"]
  },
  "Smith Machine Shoulder Press": {
    primaryMuscles: ["shoulders"], secondaryMuscles: ["triceps"],
    movementPattern: "push", equipment: "gym", type: "compound",
    equipmentTags: ["machine"],
    videoUrl: "https://www.youtube.com/results?search_query=smith+machine+shoulder+press+form",
    alternativesByName: ["Shoulder Press", "Dumbbell Shoulder Press"]
  },
  "Dumbbell Shoulder Press": {
    primaryMuscles: ["shoulders"], secondaryMuscles: ["triceps", "upper chest"],
    movementPattern: "push", equipment: "home", type: "compound",
    equipmentTags: ["dumbbell"],
    cues: ["Brace core", "Press through full range"],
    videoUrl: "https://www.youtube.com/results?search_query=dumbbell+shoulder+press+form",
    alternativesByName: ["Dumbbell Arnold Press", "Shoulder Press", "Pike Push-Up"]
  },
  "Dumbbell Arnold Press": {
    primaryMuscles: ["shoulders"], secondaryMuscles: ["triceps", "front delts"],
    movementPattern: "push", equipment: "home", type: "compound",
    equipmentTags: ["dumbbell"],
    cues: ["Rotate palms outward as you press", "Full range of motion"],
    videoUrl: "https://www.youtube.com/results?search_query=arnold+press+form",
    alternativesByName: ["Dumbbell Shoulder Press", "Shoulder Press"]
  },
  "Side Lateral Raise": {
    primaryMuscles: ["side delts"], secondaryMuscles: ["upper traps"],
    movementPattern: "isolation", equipment: "either", type: "isolation",
    equipmentTags: ["dumbbell"],
    videoUrl: "https://www.youtube.com/results?search_query=dumbbell+lateral+raise+form",
    alternativesByName: ["Cable Lateral Raise", "Machine Lateral Raise", "Dumbbell Lateral Raise"]
  },
  "Dumbbell Lateral Raise": {
    primaryMuscles: ["side delts"], secondaryMuscles: ["upper traps"],
    movementPattern: "isolation", equipment: "home", type: "isolation",
    equipmentTags: ["dumbbell"],
    videoUrl: "https://www.youtube.com/results?search_query=dumbbell+lateral+raise+form",
    alternativesByName: ["Side Lateral Raise", "Band Pull-Apart"]
  },
  "Cable Lateral Raise": {
    primaryMuscles: ["side delts"], secondaryMuscles: ["upper traps"],
    movementPattern: "isolation", equipment: "gym", type: "isolation",
    equipmentTags: ["cable"],
    videoUrl: "https://www.youtube.com/results?search_query=cable+lateral+raise+form",
    alternativesByName: ["Side Lateral Raise", "Machine Lateral Raise", "Dumbbell Lateral Raise"]
  },
  "Machine Lateral Raise": {
    primaryMuscles: ["side delts"], secondaryMuscles: ["upper traps"],
    movementPattern: "isolation", equipment: "gym", type: "isolation",
    equipmentTags: ["machine"],
    videoUrl: "https://www.youtube.com/results?search_query=machine+lateral+raise+form",
    alternativesByName: ["Side Lateral Raise", "Cable Lateral Raise"]
  },
  "Rear Delt Pec Fly": {
    primaryMuscles: ["rear delts"], secondaryMuscles: ["upper back"],
    movementPattern: "isolation", equipment: "gym", type: "isolation",
    equipmentTags: ["machine"],
    videoUrl: "https://www.youtube.com/results?search_query=rear+delt+pec+fly+form",
    alternativesByName: ["Dumbbell Rear Delt Fly", "Cable Face Pull", "Band Face Pull"]
  },
  "Dumbbell Rear Delt Fly": {
    primaryMuscles: ["rear delts"], secondaryMuscles: ["upper back"],
    movementPattern: "isolation", equipment: "home", type: "isolation",
    equipmentTags: ["dumbbell"],
    cues: ["Bend at hips", "Lead with elbows"],
    videoUrl: "https://www.youtube.com/results?search_query=dumbbell+rear+delt+fly+form",
    alternativesByName: ["Rear Delt Pec Fly", "Band Face Pull", "Band Pull-Apart"]
  },
  "Cable Face Pull": {
    primaryMuscles: ["rear delts", "upper back"], secondaryMuscles: ["biceps"],
    movementPattern: "pull", equipment: "gym", type: "isolation",
    equipmentTags: ["cable"],
    cues: ["Pull to forehead level", "External rotate at end"],
    videoUrl: "https://www.youtube.com/results?search_query=cable+face+pull+form",
    alternativesByName: ["Band Face Pull", "Dumbbell Rear Delt Fly", "Rear Delt Pec Fly"]
  },
  "Machine Rear Delt": {
    primaryMuscles: ["rear delts"], secondaryMuscles: ["upper back"],
    movementPattern: "isolation", equipment: "gym", type: "isolation",
    equipmentTags: ["machine"],
    videoUrl: "https://www.youtube.com/results?search_query=machine+rear+delt+form",
    alternativesByName: ["Rear Delt Pec Fly", "Dumbbell Rear Delt Fly", "Cable Face Pull"]
  },
  "Dumbbell Front Raise": {
    primaryMuscles: ["front delts"], secondaryMuscles: ["side delts"],
    movementPattern: "isolation", equipment: "home", type: "isolation",
    equipmentTags: ["dumbbell"],
    videoUrl: "https://www.youtube.com/results?search_query=dumbbell+front+raise+form",
    alternativesByName: ["Dumbbell Lateral Raise", "Side Lateral Raise"]
  },
  "Dumbbell Upright Row": {
    primaryMuscles: ["side delts", "upper traps"], secondaryMuscles: ["biceps"],
    movementPattern: "pull", equipment: "home", type: "isolation",
    equipmentTags: ["dumbbell"],
    videoUrl: "https://www.youtube.com/results?search_query=dumbbell+upright+row+form",
    alternativesByName: ["Dumbbell Lateral Raise", "Side Lateral Raise"]
  },
  "Pike Push-Up": {
    primaryMuscles: ["shoulders"], secondaryMuscles: ["triceps", "upper chest"],
    movementPattern: "push", equipment: "minimal", type: "compound",
    equipmentTags: ["bodyweight"],
    videoUrl: "https://www.youtube.com/results?search_query=pike+push+up+form",
    alternativesByName: ["Dumbbell Shoulder Press", "Push-Ups"]
  },
  "Band Face Pull": {
    primaryMuscles: ["rear delts", "upper back"], secondaryMuscles: ["biceps"],
    movementPattern: "pull", equipment: "home", type: "isolation",
    equipmentTags: ["resistance_band"],
    videoUrl: "https://www.youtube.com/results?search_query=band+face+pull+form",
    alternativesByName: ["Cable Face Pull", "Dumbbell Rear Delt Fly", "Band Pull-Apart"]
  },
  "Band Pull-Apart": {
    primaryMuscles: ["rear delts", "upper back"], secondaryMuscles: ["rotator cuff"],
    movementPattern: "pull", equipment: "home", type: "isolation",
    equipmentTags: ["resistance_band"],
    videoUrl: "https://www.youtube.com/results?search_query=band+pull+apart+form",
    alternativesByName: ["Band Face Pull", "Dumbbell Rear Delt Fly"]
  },

  // ── BICEPS ─────────────────────────────────────────────────────────────────
  "Barbell Curls": {
    primaryMuscles: ["biceps"], secondaryMuscles: ["forearms"],
    movementPattern: "isolation", equipment: "either", type: "isolation",
    equipmentTags: ["barbell"],
    videoUrl: "https://www.youtube.com/results?search_query=barbell+bicep+curl+form",
    alternativesByName: ["Dumbbell Bicep Curl", "EZ-Bar Curl", "Cable Curl"]
  },
  "EZ-Bar Curl": {
    primaryMuscles: ["biceps"], secondaryMuscles: ["forearms"],
    movementPattern: "isolation", equipment: "gym", type: "isolation",
    equipmentTags: ["barbell"],
    videoUrl: "https://www.youtube.com/results?search_query=ez+bar+curl+form",
    alternativesByName: ["Barbell Curls", "Dumbbell Bicep Curl", "Preacher Curls"]
  },
  "Preacher Curls": {
    primaryMuscles: ["biceps"], secondaryMuscles: ["forearms"],
    movementPattern: "isolation", equipment: "gym", type: "isolation",
    equipmentTags: ["barbell", "machine"],
    videoUrl: "https://www.youtube.com/results?search_query=preacher+curl+form",
    alternativesByName: ["Dumbbell Concentration Curl", "Cable Curl", "Dumbbell Bicep Curl"]
  },
  "Cable Curl": {
    primaryMuscles: ["biceps"], secondaryMuscles: ["forearms"],
    movementPattern: "isolation", equipment: "gym", type: "isolation",
    equipmentTags: ["cable"],
    videoUrl: "https://www.youtube.com/results?search_query=cable+curl+form",
    alternativesByName: ["Barbell Curls", "Dumbbell Bicep Curl"]
  },
  "Cable Hammer Curl": {
    primaryMuscles: ["brachialis"], secondaryMuscles: ["biceps", "forearms"],
    movementPattern: "isolation", equipment: "gym", type: "isolation",
    equipmentTags: ["cable"],
    videoUrl: "https://www.youtube.com/results?search_query=cable+hammer+curl+form",
    alternativesByName: ["Hammer Curls", "Dumbbell Zottman Curl"]
  },
  "Machine Bicep Curl": {
    primaryMuscles: ["biceps"], secondaryMuscles: ["forearms"],
    movementPattern: "isolation", equipment: "gym", type: "isolation",
    equipmentTags: ["machine"],
    videoUrl: "https://www.youtube.com/results?search_query=machine+bicep+curl+form",
    alternativesByName: ["Preacher Curls", "Dumbbell Bicep Curl"]
  },
  "Hammer Curls": {
    primaryMuscles: ["brachialis"], secondaryMuscles: ["biceps", "forearms"],
    movementPattern: "isolation", equipment: "either", type: "isolation",
    equipmentTags: ["dumbbell"],
    videoUrl: "https://www.youtube.com/results?search_query=hammer+curl+form",
    alternativesByName: ["Dumbbell Zottman Curl", "Cable Hammer Curl", "Dumbbell Bicep Curl"]
  },
  "Dumbbell Bicep Curl": {
    primaryMuscles: ["biceps"], secondaryMuscles: ["forearms"],
    movementPattern: "isolation", equipment: "home", type: "isolation",
    equipmentTags: ["dumbbell"],
    videoUrl: "https://www.youtube.com/results?search_query=dumbbell+bicep+curl+form",
    alternativesByName: ["Hammer Curls", "Band Bicep Curl", "Barbell Curls"]
  },
  "Dumbbell Concentration Curl": {
    primaryMuscles: ["biceps"], secondaryMuscles: ["forearms"],
    movementPattern: "isolation", equipment: "home", type: "isolation",
    equipmentTags: ["dumbbell"],
    cues: ["Brace elbow on inner thigh", "Full squeeze at top"],
    videoUrl: "https://www.youtube.com/results?search_query=concentration+curl+form",
    alternativesByName: ["Dumbbell Bicep Curl", "Preacher Curls"]
  },
  "Dumbbell Zottman Curl": {
    primaryMuscles: ["biceps", "brachialis"], secondaryMuscles: ["forearms"],
    movementPattern: "isolation", equipment: "home", type: "isolation",
    equipmentTags: ["dumbbell"],
    cues: ["Supinate up, pronate down"],
    videoUrl: "https://www.youtube.com/results?search_query=zottman+curl+form",
    alternativesByName: ["Dumbbell Bicep Curl", "Hammer Curls"]
  },
  "Band Bicep Curl": {
    primaryMuscles: ["biceps"], secondaryMuscles: ["forearms"],
    movementPattern: "isolation", equipment: "home", type: "isolation",
    equipmentTags: ["resistance_band"],
    videoUrl: "https://www.youtube.com/results?search_query=band+bicep+curl+form",
    alternativesByName: ["Dumbbell Bicep Curl", "Hammer Curls"]
  },
  "Reverse Barbell Curls": {
    primaryMuscles: ["forearms"], secondaryMuscles: ["biceps"],
    movementPattern: "isolation", equipment: "either", type: "isolation",
    equipmentTags: ["barbell"],
    videoUrl: "https://www.youtube.com/results?search_query=reverse+barbell+curl+form",
    alternativesByName: ["Barbell Curls", "Hammer Curls"]
  },

  // ── TRICEPS ────────────────────────────────────────────────────────────────
  "Tricep Pressdown": {
    primaryMuscles: ["triceps"], secondaryMuscles: ["forearms"],
    movementPattern: "isolation", equipment: "gym", type: "isolation",
    equipmentTags: ["cable"],
    videoUrl: "https://www.youtube.com/results?search_query=tricep+pressdown+form",
    alternativesByName: ["Cable Tricep Extension", "Dumbbell Overhead Tricep Extension", "Band Tricep Pressdown"]
  },
  "Cable Tricep Extension": {
    primaryMuscles: ["triceps"], secondaryMuscles: ["forearms"],
    movementPattern: "isolation", equipment: "gym", type: "isolation",
    equipmentTags: ["cable"],
    videoUrl: "https://www.youtube.com/results?search_query=cable+tricep+extension+form",
    alternativesByName: ["Tricep Pressdown", "Dumbbell Tricep Extension"]
  },
  "Skull Crushers": {
    primaryMuscles: ["triceps"], secondaryMuscles: ["forearms"],
    movementPattern: "isolation", equipment: "gym", type: "isolation",
    equipmentTags: ["barbell", "bench_required"],
    cues: ["Lower to just above forehead", "Keep elbows in"],
    videoUrl: "https://www.youtube.com/results?search_query=skull+crushers+form",
    alternativesByName: ["Dumbbell Overhead Tricep Extension", "Dumbbell Tricep Extension", "Cable Tricep Extension"]
  },
  "Close-Grip Bench Press": {
    primaryMuscles: ["triceps"], secondaryMuscles: ["chest", "front delts"],
    movementPattern: "push", equipment: "gym", type: "compound",
    equipmentTags: ["barbell", "bench_required"],
    cues: ["Elbows tucked ~30°", "Full lockout"],
    videoUrl: "https://www.youtube.com/results?search_query=close+grip+bench+press+form",
    alternativesByName: ["Diamond Push-Ups", "Skull Crushers", "Dumbbell Overhead Tricep Extension"]
  },
  "Dumbbell Tricep Extension": {
    primaryMuscles: ["triceps"], secondaryMuscles: ["forearms"],
    movementPattern: "isolation", equipment: "either", type: "isolation",
    equipmentTags: ["dumbbell"],
    videoUrl: "https://www.youtube.com/results?search_query=dumbbell+tricep+extension+form",
    alternativesByName: ["Dumbbell Overhead Tricep Extension", "Tricep Pressdown", "Band Tricep Pressdown"]
  },
  "Dumbbell Overhead Tricep Extension": {
    primaryMuscles: ["triceps"], secondaryMuscles: ["core"],
    movementPattern: "isolation", equipment: "home", type: "isolation",
    equipmentTags: ["dumbbell"],
    videoUrl: "https://www.youtube.com/results?search_query=overhead+dumbbell+tricep+extension+form",
    alternativesByName: ["Dumbbell Tricep Extension", "Tricep Dips (Chair)", "Diamond Push-Ups"]
  },
  "Dumbbell Kickback": {
    primaryMuscles: ["triceps"],
    movementPattern: "isolation", equipment: "home", type: "isolation",
    equipmentTags: ["dumbbell"],
    cues: ["Keep upper arm parallel to floor", "Full extension"],
    videoUrl: "https://www.youtube.com/results?search_query=dumbbell+kickback+form",
    alternativesByName: ["Dumbbell Tricep Extension", "Band Tricep Pressdown"]
  },
  "Tricep Dips (Chair)": {
    primaryMuscles: ["triceps"], secondaryMuscles: ["chest", "shoulders"],
    movementPattern: "push", equipment: "minimal", type: "compound",
    equipmentTags: ["bodyweight"],
    cues: ["Lower until 90° elbow angle", "Keep hips close to chair"],
    videoUrl: "https://www.youtube.com/results?search_query=tricep+dips+chair+form",
    alternativesByName: ["Diamond Push-Ups", "Dumbbell Overhead Tricep Extension", "Band Tricep Pressdown"]
  },
  "Band Tricep Pressdown": {
    primaryMuscles: ["triceps"],
    movementPattern: "isolation", equipment: "home", type: "isolation",
    equipmentTags: ["resistance_band"],
    videoUrl: "https://www.youtube.com/results?search_query=band+tricep+pressdown+form",
    alternativesByName: ["Tricep Pressdown", "Dumbbell Overhead Tricep Extension"]
  },

  // ── LEGS ───────────────────────────────────────────────────────────────────
  "Barbell Back Squat": {
    primaryMuscles: ["quads"], secondaryMuscles: ["glutes", "hamstrings", "core"],
    movementPattern: "squat", equipment: "gym", type: "compound",
    equipmentTags: ["barbell"],
    cues: ["Chest up", "Drive knees out", "Break parallel"],
    videoUrl: "https://www.youtube.com/results?search_query=barbell+back+squat+form",
    alternativesByName: ["Barbell Front Squat", "Goblet Squat", "Hack Squat", "Leg Press"]
  },
  "Barbell Front Squat": {
    primaryMuscles: ["quads"], secondaryMuscles: ["glutes", "core"],
    movementPattern: "squat", equipment: "gym", type: "compound",
    equipmentTags: ["barbell"],
    cues: ["Elbows high", "Stay upright"],
    videoUrl: "https://www.youtube.com/results?search_query=barbell+front+squat+form",
    alternativesByName: ["Barbell Back Squat", "Goblet Squat", "Leg Press"]
  },
  "Leg Press": {
    primaryMuscles: ["quads"], secondaryMuscles: ["glutes", "hamstrings"],
    movementPattern: "squat", equipment: "gym", type: "compound",
    equipmentTags: ["machine"],
    cues: ["Full foot contact", "Control the bottom range"],
    videoUrl: "https://www.youtube.com/results?search_query=leg+press+form",
    alternativesByName: ["Barbell Back Squat", "Goblet Squat", "Bulgarian Split Squat (Dumbbell)"]
  },
  "Hack Squat": {
    primaryMuscles: ["quads"], secondaryMuscles: ["glutes", "hamstrings"],
    movementPattern: "squat", equipment: "gym", type: "compound",
    equipmentTags: ["machine"],
    videoUrl: "https://www.youtube.com/results?search_query=hack+squat+form",
    alternativesByName: ["Leg Press", "Barbell Back Squat", "Goblet Squat"]
  },
  "Smith Machine Squat": {
    primaryMuscles: ["quads"], secondaryMuscles: ["glutes", "hamstrings"],
    movementPattern: "squat", equipment: "gym", type: "compound",
    equipmentTags: ["machine"],
    videoUrl: "https://www.youtube.com/results?search_query=smith+machine+squat+form",
    alternativesByName: ["Barbell Back Squat", "Leg Press", "Goblet Squat"]
  },
  "Leg Extension": {
    primaryMuscles: ["quads"], secondaryMuscles: ["hip flexors"],
    movementPattern: "isolation", equipment: "gym", type: "isolation",
    equipmentTags: ["machine"],
    videoUrl: "https://www.youtube.com/results?search_query=leg+extension+form",
    alternativesByName: ["Goblet Squat", "Bulgarian Split Squat (Bodyweight)"]
  },
  "Leg Curl": {
    primaryMuscles: ["hamstrings"], secondaryMuscles: ["calves"],
    movementPattern: "isolation", equipment: "gym", type: "isolation",
    equipmentTags: ["machine"],
    videoUrl: "https://www.youtube.com/results?search_query=leg+curl+form",
    alternativesByName: ["Romanian Deadlift (Dumbbell)", "Glute Bridge", "Kettlebell Romanian Deadlift"]
  },
  "Hip Thrust (Barbell)": {
    primaryMuscles: ["glutes"], secondaryMuscles: ["hamstrings", "core"],
    movementPattern: "hinge", equipment: "gym", type: "compound",
    equipmentTags: ["barbell", "bench_required"],
    cues: ["Drive through heels", "Full hip extension at top"],
    videoUrl: "https://www.youtube.com/results?search_query=barbell+hip+thrust+form",
    alternativesByName: ["Hip Thrust (Dumbbell)", "Glute Bridge", "Single-Leg Glute Bridge"]
  },
  "Hip Abduction Machine": {
    primaryMuscles: ["glutes"], secondaryMuscles: ["hip abductors"],
    movementPattern: "isolation", equipment: "gym", type: "isolation",
    equipmentTags: ["machine"],
    videoUrl: "https://www.youtube.com/results?search_query=hip+abduction+machine+form",
    alternativesByName: ["Band Hip Abduction", "Band Lateral Walk"]
  },
  "Calf Raises": {
    primaryMuscles: ["calves"], secondaryMuscles: ["ankle stabilizers"],
    movementPattern: "isolation", equipment: "either", type: "isolation",
    equipmentTags: ["machine", "barbell"],
    videoUrl: "https://www.youtube.com/results?search_query=calf+raises+form",
    alternativesByName: ["Calf Raises (Bodyweight)", "Seated Calf Raise", "Calf Raises (Dumbbell)"]
  },
  "Seated Calf Raise": {
    primaryMuscles: ["calves"], secondaryMuscles: [],
    movementPattern: "isolation", equipment: "gym", type: "isolation",
    equipmentTags: ["machine"],
    videoUrl: "https://www.youtube.com/results?search_query=seated+calf+raise+form",
    alternativesByName: ["Calf Raises", "Calf Raises (Bodyweight)"]
  },
  "Bodyweight Squat": {
    primaryMuscles: ["quads"], secondaryMuscles: ["glutes", "core"],
    movementPattern: "squat", equipment: "minimal", type: "compound",
    equipmentTags: ["bodyweight"],
    videoUrl: "https://www.youtube.com/results?search_query=bodyweight+squat+form",
    alternativesByName: ["Goblet Squat", "Bulgarian Split Squat (Bodyweight)"]
  },
  "Goblet Squat": {
    primaryMuscles: ["quads"], secondaryMuscles: ["glutes", "core"],
    movementPattern: "squat", equipment: "home", type: "compound",
    equipmentTags: ["dumbbell", "kettlebell"],
    cues: ["Keep chest tall", "Sit between hips"],
    videoUrl: "https://www.youtube.com/results?search_query=goblet+squat+form",
    alternativesByName: ["Bodyweight Squat", "Bulgarian Split Squat (Dumbbell)", "Leg Press"]
  },
  "Kettlebell Goblet Squat": {
    primaryMuscles: ["quads"], secondaryMuscles: ["glutes", "core"],
    movementPattern: "squat", equipment: "home", type: "compound",
    equipmentTags: ["kettlebell"],
    videoUrl: "https://www.youtube.com/results?search_query=kettlebell+goblet+squat+form",
    alternativesByName: ["Goblet Squat", "Bodyweight Squat"]
  },
  "Walking Lunges": {
    primaryMuscles: ["quads", "glutes"], secondaryMuscles: ["hamstrings", "core"],
    movementPattern: "squat", equipment: "minimal", type: "compound",
    equipmentTags: ["bodyweight"],
    videoUrl: "https://www.youtube.com/results?search_query=walking+lunges+form",
    alternativesByName: ["Reverse Lunge (Dumbbell)", "Bulgarian Split Squat (Bodyweight)", "Leg Press"]
  },
  "Reverse Lunge (Dumbbell)": {
    primaryMuscles: ["quads", "glutes"], secondaryMuscles: ["hamstrings"],
    movementPattern: "squat", equipment: "home", type: "compound",
    equipmentTags: ["dumbbell"],
    videoUrl: "https://www.youtube.com/results?search_query=reverse+lunge+dumbbell+form",
    alternativesByName: ["Walking Lunges", "Bulgarian Split Squat (Dumbbell)"]
  },
  "Bulgarian Split Squat (Bodyweight)": {
    primaryMuscles: ["quads", "glutes"], secondaryMuscles: ["hamstrings", "core"],
    movementPattern: "squat", equipment: "minimal", type: "compound",
    equipmentTags: ["bodyweight"],
    cues: ["Front shin vertical", "Rear foot elevated"],
    videoUrl: "https://www.youtube.com/results?search_query=bulgarian+split+squat+form",
    alternativesByName: ["Bulgarian Split Squat (Dumbbell)", "Walking Lunges", "Goblet Squat"]
  },
  "Bulgarian Split Squat (Dumbbell)": {
    primaryMuscles: ["quads", "glutes"], secondaryMuscles: ["hamstrings", "core"],
    movementPattern: "squat", equipment: "home", type: "compound",
    equipmentTags: ["dumbbell"],
    cues: ["Rear foot elevated", "Control descent"],
    videoUrl: "https://www.youtube.com/results?search_query=bulgarian+split+squat+dumbbell+form",
    alternativesByName: ["Bulgarian Split Squat (Bodyweight)", "Goblet Squat", "Leg Press"]
  },
  "Step-Ups (Bodyweight)": {
    primaryMuscles: ["quads", "glutes"], secondaryMuscles: ["hamstrings"],
    movementPattern: "squat", equipment: "minimal", type: "compound",
    equipmentTags: ["bodyweight"],
    videoUrl: "https://www.youtube.com/results?search_query=step+ups+form",
    alternativesByName: ["Walking Lunges", "Bulgarian Split Squat (Bodyweight)"]
  },
  "Step-Ups (Dumbbell)": {
    primaryMuscles: ["quads", "glutes"], secondaryMuscles: ["hamstrings"],
    movementPattern: "squat", equipment: "home", type: "compound",
    equipmentTags: ["dumbbell"],
    videoUrl: "https://www.youtube.com/results?search_query=dumbbell+step+ups+form",
    alternativesByName: ["Step-Ups (Bodyweight)", "Bulgarian Split Squat (Dumbbell)"]
  },
  "Lateral Lunge": {
    primaryMuscles: ["quads", "glutes"], secondaryMuscles: ["groin", "hamstrings"],
    movementPattern: "squat", equipment: "minimal", type: "compound",
    equipmentTags: ["bodyweight"],
    videoUrl: "https://www.youtube.com/results?search_query=lateral+lunge+form",
    alternativesByName: ["Walking Lunges", "Bodyweight Squat"]
  },
  "Sumo Squat (Dumbbell)": {
    primaryMuscles: ["quads", "glutes", "groin"], secondaryMuscles: ["hamstrings"],
    movementPattern: "squat", equipment: "home", type: "compound",
    equipmentTags: ["dumbbell"],
    videoUrl: "https://www.youtube.com/results?search_query=dumbbell+sumo+squat+form",
    alternativesByName: ["Goblet Squat", "Bodyweight Squat"]
  },
  "Romanian Deadlift (Dumbbell)": {
    primaryMuscles: ["hamstrings"], secondaryMuscles: ["glutes", "lower back"],
    movementPattern: "hinge", equipment: "home", type: "compound",
    equipmentTags: ["dumbbell"],
    cues: ["Hinge hips back", "Keep dumbbells close to legs"],
    videoUrl: "https://www.youtube.com/results?search_query=dumbbell+romanian+deadlift+form",
    alternativesByName: ["Glute Bridge", "Single-Leg Glute Bridge", "Leg Curl"]
  },
  "Dumbbell Deadlift": {
    primaryMuscles: ["hamstrings", "glutes", "lower back"], secondaryMuscles: ["quads", "traps"],
    movementPattern: "hinge", equipment: "home", type: "compound",
    equipmentTags: ["dumbbell"],
    videoUrl: "https://www.youtube.com/results?search_query=dumbbell+deadlift+form",
    alternativesByName: ["Romanian Deadlift (Dumbbell)", "Kettlebell Romanian Deadlift", "Deadlift"]
  },
  "Dumbbell Sumo Deadlift": {
    primaryMuscles: ["glutes", "hamstrings"], secondaryMuscles: ["quads", "groin"],
    movementPattern: "hinge", equipment: "home", type: "compound",
    equipmentTags: ["dumbbell"],
    videoUrl: "https://www.youtube.com/results?search_query=dumbbell+sumo+deadlift+form",
    alternativesByName: ["Dumbbell Deadlift", "Romanian Deadlift (Dumbbell)"]
  },
  "Glute Bridge": {
    primaryMuscles: ["glutes"], secondaryMuscles: ["hamstrings", "core"],
    movementPattern: "hinge", equipment: "minimal", type: "compound",
    equipmentTags: ["bodyweight"],
    videoUrl: "https://www.youtube.com/results?search_query=glute+bridge+form",
    alternativesByName: ["Single-Leg Glute Bridge", "Hip Thrust (Dumbbell)", "Hip Thrust (Barbell)"]
  },
  "Single-Leg Glute Bridge": {
    primaryMuscles: ["glutes"], secondaryMuscles: ["hamstrings", "core"],
    movementPattern: "hinge", equipment: "minimal", type: "compound",
    equipmentTags: ["bodyweight"],
    cues: ["Keep hips level", "Drive through heel"],
    videoUrl: "https://www.youtube.com/results?search_query=single+leg+glute+bridge+form",
    alternativesByName: ["Glute Bridge", "Hip Thrust (Dumbbell)"]
  },
  "Hip Thrust (Dumbbell)": {
    primaryMuscles: ["glutes"], secondaryMuscles: ["hamstrings", "core"],
    movementPattern: "hinge", equipment: "home", type: "compound",
    equipmentTags: ["dumbbell"],
    cues: ["Drive through heels", "Full hip extension at top"],
    videoUrl: "https://www.youtube.com/results?search_query=dumbbell+hip+thrust+form",
    alternativesByName: ["Glute Bridge", "Single-Leg Glute Bridge", "Hip Thrust (Barbell)"]
  },
  "Calf Raises (Bodyweight)": {
    primaryMuscles: ["calves"],
    movementPattern: "isolation", equipment: "minimal", type: "isolation",
    equipmentTags: ["bodyweight"],
    videoUrl: "https://www.youtube.com/results?search_query=calf+raises+form",
    alternativesByName: ["Calf Raises (Dumbbell)", "Calf Raises"]
  },
  "Calf Raises (Dumbbell)": {
    primaryMuscles: ["calves"],
    movementPattern: "isolation", equipment: "home", type: "isolation",
    equipmentTags: ["dumbbell"],
    videoUrl: "https://www.youtube.com/results?search_query=dumbbell+calf+raise+form",
    alternativesByName: ["Calf Raises (Bodyweight)", "Calf Raises"]
  },
  "Kettlebell Swing": {
    primaryMuscles: ["glutes", "hamstrings"], secondaryMuscles: ["lower back", "core", "shoulders"],
    movementPattern: "hinge", equipment: "home", type: "compound",
    equipmentTags: ["kettlebell"],
    cues: ["Hip hinge, not squat", "Snap hips forcefully"],
    videoUrl: "https://www.youtube.com/results?search_query=kettlebell+swing+form",
    alternativesByName: ["Romanian Deadlift (Dumbbell)", "Glute Bridge", "Kettlebell Romanian Deadlift"]
  },
  "Kettlebell Romanian Deadlift": {
    primaryMuscles: ["hamstrings"], secondaryMuscles: ["glutes", "lower back"],
    movementPattern: "hinge", equipment: "home", type: "compound",
    equipmentTags: ["kettlebell"],
    videoUrl: "https://www.youtube.com/results?search_query=kettlebell+romanian+deadlift+form",
    alternativesByName: ["Romanian Deadlift (Dumbbell)", "Glute Bridge", "Kettlebell Swing"]
  },
  "Kettlebell Press": {
    primaryMuscles: ["shoulders"], secondaryMuscles: ["triceps", "core"],
    movementPattern: "push", equipment: "home", type: "compound",
    equipmentTags: ["kettlebell"],
    videoUrl: "https://www.youtube.com/results?search_query=kettlebell+press+form",
    alternativesByName: ["Dumbbell Shoulder Press", "Pike Push-Up"]
  },
  "Band Lateral Walk": {
    primaryMuscles: ["glutes"], secondaryMuscles: ["hip abductors"],
    movementPattern: "isolation", equipment: "home", type: "isolation",
    equipmentTags: ["resistance_band"],
    videoUrl: "https://www.youtube.com/results?search_query=band+lateral+walk+form",
    alternativesByName: ["Band Hip Abduction", "Hip Abduction Machine"]
  },
  "Band Hip Abduction": {
    primaryMuscles: ["glutes"], secondaryMuscles: ["hip abductors"],
    movementPattern: "isolation", equipment: "home", type: "isolation",
    equipmentTags: ["resistance_band"],
    videoUrl: "https://www.youtube.com/results?search_query=band+hip+abduction+form",
    alternativesByName: ["Band Lateral Walk", "Hip Abduction Machine"]
  },
  "Kettlebell Snatch": {
    primaryMuscles: ["glutes", "hamstrings"], secondaryMuscles: ["shoulders", "core", "lats"],
    movementPattern: "hinge", equipment: "home", type: "compound",
    equipmentTags: ["kettlebell"],
    cues: ["Full hip extension before pull", "Punch through at top"],
    videoUrl: "https://www.youtube.com/results?search_query=kettlebell+snatch+form",
    alternativesByName: ["Kettlebell Swing", "Kettlebell Romanian Deadlift"]
  },

  // ── CORE ───────────────────────────────────────────────────────────────────
  "Plank": {
    primaryMuscles: ["core"], secondaryMuscles: ["shoulders", "glutes"],
    movementPattern: "core", equipment: "minimal", type: "isolation",
    equipmentTags: ["bodyweight"],
    videoUrl: "https://www.youtube.com/results?search_query=plank+form",
    alternativesByName: ["Side Plank", "Dead Bug", "Hollow Body Hold"]
  },
  "Side Plank": {
    primaryMuscles: ["core"], secondaryMuscles: ["glutes", "shoulders"],
    movementPattern: "core", equipment: "minimal", type: "isolation",
    equipmentTags: ["bodyweight"],
    videoUrl: "https://www.youtube.com/results?search_query=side+plank+form",
    alternativesByName: ["Plank", "Dead Bug"]
  },
  "Dead Bug": {
    primaryMuscles: ["core"], secondaryMuscles: ["hip flexors"],
    movementPattern: "core", equipment: "minimal", type: "isolation",
    equipmentTags: ["bodyweight"],
    cues: ["Lower back pressed to floor", "Move opposite arm/leg"],
    videoUrl: "https://www.youtube.com/results?search_query=dead+bug+form",
    alternativesByName: ["Plank", "Hollow Body Hold"]
  },
  "Hollow Body Hold": {
    primaryMuscles: ["core"], secondaryMuscles: ["hip flexors"],
    movementPattern: "core", equipment: "minimal", type: "isolation",
    equipmentTags: ["bodyweight"],
    videoUrl: "https://www.youtube.com/results?search_query=hollow+body+hold+form",
    alternativesByName: ["Plank", "Dead Bug"]
  },
  "Mountain Climbers": {
    primaryMuscles: ["core"], secondaryMuscles: ["shoulders", "quads", "glutes"],
    movementPattern: "core", equipment: "minimal", type: "isolation",
    equipmentTags: ["bodyweight"],
    videoUrl: "https://www.youtube.com/results?search_query=mountain+climbers+form",
    alternativesByName: ["Plank", "Bicycle Crunches"]
  },
  "Bicycle Crunches": {
    primaryMuscles: ["core"], secondaryMuscles: ["hip flexors"],
    movementPattern: "core", equipment: "minimal", type: "isolation",
    equipmentTags: ["bodyweight"],
    videoUrl: "https://www.youtube.com/results?search_query=bicycle+crunches+form",
    alternativesByName: ["Plank", "Dead Bug", "Mountain Climbers"]
  },
  "Cable Crunch": {
    primaryMuscles: ["core"],
    movementPattern: "core", equipment: "gym", type: "isolation",
    equipmentTags: ["cable"],
    videoUrl: "https://www.youtube.com/results?search_query=cable+crunch+form",
    alternativesByName: ["Ab Wheel Rollout", "Hollow Body Hold"]
  },
  "Hanging Leg Raise": {
    primaryMuscles: ["core"], secondaryMuscles: ["hip flexors", "lats"],
    movementPattern: "core", equipment: "gym", type: "isolation",
    equipmentTags: ["pull_up_bar"],
    videoUrl: "https://www.youtube.com/results?search_query=hanging+leg+raise+form",
    alternativesByName: ["Ab Wheel Rollout", "Hollow Body Hold", "Cable Crunch"]
  },
  "Ab Wheel Rollout": {
    primaryMuscles: ["core"], secondaryMuscles: ["lats", "shoulders"],
    movementPattern: "core", equipment: "gym", type: "isolation",
    equipmentTags: ["machine"],
    videoUrl: "https://www.youtube.com/results?search_query=ab+wheel+rollout+form",
    alternativesByName: ["Plank", "Hollow Body Hold", "Cable Crunch"]
  },

  // ── MISC / LEGACY entries ──────────────────────────────────────────────────
  "Middle Cable Crossover": {
    primaryMuscles: ["chest"], secondaryMuscles: ["front delts"],
    movementPattern: "isolation", equipment: "gym", type: "isolation",
    equipmentTags: ["cable"],
    videoUrl: "https://www.youtube.com/results?search_query=cable+crossover+middle+form",
    alternativesByName: ["Cable Crossover (Middle)", "Low to High Cable Crossover"]
  },
  "Low to High Cable Crossover": {
    primaryMuscles: ["upper chest"], secondaryMuscles: ["front delts"],
    movementPattern: "isolation", equipment: "gym", type: "isolation",
    equipmentTags: ["cable"],
    videoUrl: "https://www.youtube.com/results?search_query=low+to+high+cable+crossover+form",
    alternativesByName: ["Cable Crossover (Low-to-High)", "Middle Cable Crossover"]
  },
  "High to Low Cable Crossover": {
    primaryMuscles: ["lower chest"], secondaryMuscles: ["front delts"],
    movementPattern: "isolation", equipment: "gym", type: "isolation",
    equipmentTags: ["cable"],
    videoUrl: "https://www.youtube.com/results?search_query=high+to+low+cable+crossover+form",
    alternativesByName: ["Cable Crossover (High-to-Low)", "Middle Cable Crossover"]
  },
  "Dumbbell Raise": {
    primaryMuscles: ["side delts"], secondaryMuscles: ["upper traps"],
    movementPattern: "isolation", equipment: "home", type: "isolation",
    equipmentTags: ["dumbbell"],
    videoUrl: "https://www.youtube.com/results?search_query=dumbbell+lateral+raise+form",
    alternativesByName: ["Side Lateral Raise", "Dumbbell Lateral Raise"]
  },
};

async function ensureExerciseTemplatesByName(items: Array<Omit<ExerciseTemplate, "id">>) {
  const existing = await db.exerciseTemplates.toArray();
  const existingNames = new Set(existing.map((e) => e.name.toLowerCase()));
  const missing: ExerciseTemplate[] = items
    .filter((item) => !existingNames.has(item.name.toLowerCase()))
    .map((item) => ({ id: uid(), ...item }));

  if (missing.length > 0) {
    await db.exerciseTemplates.bulkAdd(missing);
  }
}

async function ensureExerciseMetaSeed() {
  const templates = await db.exerciseTemplates.toArray();
  const idByName = new Map(templates.map((t) => [t.name, t.id]));

  const rows: ExerciseMeta[] = templates
    .filter((t) => !!EXERCISE_META_BY_NAME[t.name])
    .map((t) => {
      const seed = EXERCISE_META_BY_NAME[t.name];
      const alternatives = (seed.alternativesByName ?? [])
        .map((name) => idByName.get(name))
        .filter((id): id is string => !!id)
        .filter((id, idx, arr) => arr.indexOf(id) === idx);

      return {
        exerciseTemplateId: t.id,
        primaryMuscles: seed.primaryMuscles,
        secondaryMuscles: seed.secondaryMuscles,
        movementPattern: seed.movementPattern,
        equipment: seed.equipment,
        equipmentTags: seed.equipmentTags,
        type: seed.type,
        description: seed.description,
        cues: seed.cues,
        videoUrl: seed.videoUrl,
        imageUrl: seed.imageUrl,
        alternatives
      };
    });

  if (rows.length > 0) {
    await db.exerciseMeta.bulkPut(rows);
  }
}

export async function ensureSeedData() {
  await ensureExerciseTemplatesByName(homeMinimalPack);
  await ensureExerciseTemplatesByName(gymPack);

  const existing = await db.planTemplates.count();
  if (existing > 0) {
    await ensureExerciseMetaSeed();
    return;
  }

  // Baseline based on your split from this project (edit anytime later)
  const ex: ExerciseTemplate[] = [
    { id: uid(), name: "Flat Bench Press",            defaultSets: 3, repRange: { min: 8,  max: 12 } },
    { id: uid(), name: "Incline Bench Press",          defaultSets: 3, repRange: { min: 8,  max: 12 } },
    { id: uid(), name: "Cable Crossover (Middle)",     defaultSets: 3, repRange: { min: 12, max: 15 } },
    { id: uid(), name: "Cable Crossover (Low-to-High)",defaultSets: 3, repRange: { min: 12, max: 15 } },
    { id: uid(), name: "Cable Crossover (High-to-Low)",defaultSets: 3, repRange: { min: 12, max: 15 } },

    { id: uid(), name: "Barbell Curls",               defaultSets: 3, repRange: { min: 12, max: 15 } },
    { id: uid(), name: "Preacher Curls",              defaultSets: 3, repRange: { min: 12, max: 15 } },
    { id: uid(), name: "Hammer Curls",                defaultSets: 3, repRange: { min: 12, max: 15 } },

    { id: uid(), name: "Shoulder Press",              defaultSets: 3, repRange: { min: 10, max: 12 } },
    { id: uid(), name: "Side Lateral Raise",          defaultSets: 3, repRange: { min: 12, max: 15 } },
    { id: uid(), name: "Rear Delt Pec Fly",           defaultSets: 3, repRange: { min: 12, max: 15 } },

    { id: uid(), name: "Tricep Pressdown",            defaultSets: 3, repRange: { min: 10, max: 12 } },
    { id: uid(), name: "Dumbbell Tricep Extension",   defaultSets: 3, repRange: { min: 10, max: 12 } },

    { id: uid(), name: "Lat Pulldown",                defaultSets: 3, repRange: { min: 10, max: 15 } },
    { id: uid(), name: "Seated Cable Row",            defaultSets: 3, repRange: { min: 10, max: 15 } },
    { id: uid(), name: "Leg Press",                   defaultSets: 3, repRange: { min: 12, max: 15 } }
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
  await ensureExerciseTemplatesByName(homeMinimalPack);
  await ensureExerciseTemplatesByName(gymPack);
  await db.planTemplates.add(plan);
  await db.settings.put({ key: "unit", value: "kg" });
  await ensureExerciseMetaSeed();
}
