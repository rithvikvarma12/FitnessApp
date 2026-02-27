import { db } from "./db";
import type { ExerciseTemplate, PlanTemplate, DayTemplate, ExerciseMeta } from "./types";

const uid = () => crypto.randomUUID();

type ExerciseMetaSeed = Omit<ExerciseMeta, "exerciseTemplateId" | "alternatives"> & {
  alternativesByName?: string[];
};

const homeMinimalPack: Array<Omit<ExerciseTemplate, "id">> = [
  { name: "Push-Ups", defaultSets: 3, repRange: { min: 10, max: 20 } },
  { name: "Bodyweight Squat", defaultSets: 3, repRange: { min: 12, max: 20 } },
  { name: "Walking Lunges", defaultSets: 3, repRange: { min: 10, max: 16 } },
  { name: "Glute Bridge", defaultSets: 3, repRange: { min: 12, max: 20 } },
  { name: "Pike Push-Up", defaultSets: 3, repRange: { min: 6, max: 15 } },
  { name: "Plank", defaultSets: 3, repRange: { min: 20, max: 60 } },
  { name: "One-Arm Dumbbell Row", defaultSets: 3, repRange: { min: 8, max: 15 } },
  { name: "Dumbbell Floor Press", defaultSets: 3, repRange: { min: 8, max: 15 } },
  { name: "Goblet Squat", defaultSets: 3, repRange: { min: 8, max: 15 } },
  { name: "Romanian Deadlift (Dumbbell)", defaultSets: 3, repRange: { min: 8, max: 15 } },
  { name: "Dumbbell Shoulder Press", defaultSets: 3, repRange: { min: 8, max: 12 } },
  { name: "Dumbbell Bicep Curl", defaultSets: 3, repRange: { min: 10, max: 15 } },
  { name: "Dumbbell Overhead Tricep Extension", defaultSets: 3, repRange: { min: 10, max: 15 } }
];

const EXERCISE_META_BY_NAME: Record<string, ExerciseMetaSeed> = {
  "Flat Bench Press": {
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps", "front delts"],
    movementPattern: "push",
    equipment: "gym",
    type: "compound",
    cues: ["Shoulders pinned back", "Control bar path and lockout"],
    videoUrl: "https://www.youtube.com/results?search_query=flat+barbell+bench+press+form",
    alternativesByName: ["Incline Bench Press", "Dumbbell Floor Press", "Push-Ups"]
  },
  "Incline Bench Press": {
    primaryMuscles: ["upper chest"],
    secondaryMuscles: ["triceps", "front delts"],
    movementPattern: "push",
    equipment: "gym",
    type: "compound",
    cues: ["Keep wrists stacked over elbows", "Press up and slightly back"],
    videoUrl: "https://www.youtube.com/results?search_query=incline+bench+press+form",
    alternativesByName: ["Flat Bench Press", "Dumbbell Floor Press", "Push-Ups"]
  },
  "Cable Crossover (Middle)": {
    primaryMuscles: ["chest"],
    secondaryMuscles: ["front delts"],
    movementPattern: "isolation",
    equipment: "gym",
    type: "isolation",
    videoUrl: "https://www.youtube.com/results?search_query=cable+crossover+middle+form",
    alternativesByName: ["Cable Crossover (Low-to-High)", "Cable Crossover (High-to-Low)", "Push-Ups"]
  },
  "Cable Crossover (Low-to-High)": {
    primaryMuscles: ["upper chest"],
    secondaryMuscles: ["front delts"],
    movementPattern: "isolation",
    equipment: "gym",
    type: "isolation",
    videoUrl: "https://www.youtube.com/results?search_query=low+to+high+cable+crossover+form",
    alternativesByName: ["Cable Crossover (Middle)", "Cable Crossover (High-to-Low)", "Push-Ups"]
  },
  "Cable Crossover (High-to-Low)": {
    primaryMuscles: ["lower chest"],
    secondaryMuscles: ["front delts"],
    movementPattern: "isolation",
    equipment: "gym",
    type: "isolation",
    videoUrl: "https://www.youtube.com/results?search_query=high+to+low+cable+crossover+form",
    alternativesByName: ["Cable Crossover (Middle)", "Cable Crossover (Low-to-High)", "Push-Ups"]
  },
  "Barbell Curls": {
    primaryMuscles: ["biceps"],
    secondaryMuscles: ["forearms"],
    movementPattern: "isolation",
    equipment: "either",
    type: "isolation",
    videoUrl: "https://www.youtube.com/results?search_query=barbell+bicep+curl+form",
    alternativesByName: ["Dumbbell Bicep Curl", "Hammer Curls", "Preacher Curls"]
  },
  "Preacher Curls": {
    primaryMuscles: ["biceps"],
    secondaryMuscles: ["forearms"],
    movementPattern: "isolation",
    equipment: "gym",
    type: "isolation",
    videoUrl: "https://www.youtube.com/results?search_query=preacher+curl+form",
    alternativesByName: ["Barbell Curls", "Dumbbell Bicep Curl", "Hammer Curls"]
  },
  "Hammer Curls": {
    primaryMuscles: ["brachialis"],
    secondaryMuscles: ["biceps", "forearms"],
    movementPattern: "isolation",
    equipment: "either",
    type: "isolation",
    videoUrl: "https://www.youtube.com/results?search_query=hammer+curl+form",
    alternativesByName: ["Dumbbell Bicep Curl", "Barbell Curls", "Preacher Curls"]
  },
  "Shoulder Press": {
    primaryMuscles: ["shoulders"],
    secondaryMuscles: ["triceps", "upper chest"],
    movementPattern: "push",
    equipment: "gym",
    type: "compound",
    cues: ["Brace torso", "Press without shrugging early"],
    videoUrl: "https://www.youtube.com/results?search_query=shoulder+press+form",
    alternativesByName: ["Dumbbell Shoulder Press", "Pike Push-Up"]
  },
  "Side Lateral Raise": {
    primaryMuscles: ["side delts"],
    secondaryMuscles: ["upper traps"],
    movementPattern: "isolation",
    equipment: "either",
    type: "isolation",
    videoUrl: "https://www.youtube.com/results?search_query=dumbbell+lateral+raise+form",
    alternativesByName: ["Rear Delt Pec Fly", "Dumbbell Shoulder Press"]
  },
  "Rear Delt Pec Fly": {
    primaryMuscles: ["rear delts"],
    secondaryMuscles: ["upper back"],
    movementPattern: "isolation",
    equipment: "gym",
    type: "isolation",
    videoUrl: "https://www.youtube.com/results?search_query=rear+delt+pec+fly+form",
    alternativesByName: ["Side Lateral Raise", "One-Arm Dumbbell Row"]
  },
  "Tricep Pressdown": {
    primaryMuscles: ["triceps"],
    secondaryMuscles: ["forearms"],
    movementPattern: "isolation",
    equipment: "gym",
    type: "isolation",
    videoUrl: "https://www.youtube.com/results?search_query=tricep+pressdown+form",
    alternativesByName: ["Dumbbell Tricep Extension", "Dumbbell Overhead Tricep Extension"]
  },
  "Dumbbell Tricep Extension": {
    primaryMuscles: ["triceps"],
    secondaryMuscles: ["forearms"],
    movementPattern: "isolation",
    equipment: "either",
    type: "isolation",
    videoUrl: "https://www.youtube.com/results?search_query=dumbbell+tricep+extension+form",
    alternativesByName: ["Dumbbell Overhead Tricep Extension", "Tricep Pressdown"]
  },
  "Lat Pulldown": {
    primaryMuscles: ["lats"],
    secondaryMuscles: ["biceps", "upper back"],
    movementPattern: "pull",
    equipment: "gym",
    type: "compound",
    cues: ["Pull elbows to hips", "Avoid leaning back excessively"],
    videoUrl: "https://www.youtube.com/results?search_query=lat+pulldown+form",
    alternativesByName: ["Seated Cable Row", "One-Arm Dumbbell Row"]
  },
  "Seated Cable Row": {
    primaryMuscles: ["mid back"],
    secondaryMuscles: ["lats", "biceps"],
    movementPattern: "pull",
    equipment: "gym",
    type: "compound",
    cues: ["Lead with elbows", "Keep chest tall"],
    videoUrl: "https://www.youtube.com/results?search_query=seated+cable+row+form",
    alternativesByName: ["One-Arm Dumbbell Row", "Lat Pulldown"]
  },
  "Leg Press": {
    primaryMuscles: ["quads"],
    secondaryMuscles: ["glutes", "hamstrings"],
    movementPattern: "squat",
    equipment: "gym",
    type: "compound",
    cues: ["Full foot contact", "Control the bottom range"],
    videoUrl: "https://www.youtube.com/results?search_query=leg+press+form",
    alternativesByName: ["Goblet Squat", "Bodyweight Squat", "Walking Lunges"]
  },
  "Push-Ups": {
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps", "shoulders", "core"],
    movementPattern: "push",
    equipment: "minimal",
    type: "compound",
    videoUrl: "https://www.youtube.com/results?search_query=push+up+form",
    alternativesByName: ["Dumbbell Floor Press", "Flat Bench Press"]
  },
  "Bodyweight Squat": {
    primaryMuscles: ["quads"],
    secondaryMuscles: ["glutes", "core"],
    movementPattern: "squat",
    equipment: "minimal",
    type: "compound",
    videoUrl: "https://www.youtube.com/results?search_query=bodyweight+squat+form",
    alternativesByName: ["Goblet Squat", "Walking Lunges", "Leg Press"]
  },
  "Walking Lunges": {
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["hamstrings", "core"],
    movementPattern: "squat",
    equipment: "minimal",
    type: "compound",
    videoUrl: "https://www.youtube.com/results?search_query=walking+lunges+form",
    alternativesByName: ["Bodyweight Squat", "Goblet Squat", "Leg Press"]
  },
  "Glute Bridge": {
    primaryMuscles: ["glutes"],
    secondaryMuscles: ["hamstrings", "core"],
    movementPattern: "hinge",
    equipment: "minimal",
    type: "compound",
    videoUrl: "https://www.youtube.com/results?search_query=glute+bridge+form",
    alternativesByName: ["Romanian Deadlift (Dumbbell)", "Walking Lunges", "Leg Press"]
  },
  "Pike Push-Up": {
    primaryMuscles: ["shoulders"],
    secondaryMuscles: ["triceps", "upper chest"],
    movementPattern: "push",
    equipment: "minimal",
    type: "compound",
    videoUrl: "https://www.youtube.com/results?search_query=pike+push+up+form",
    alternativesByName: ["Dumbbell Shoulder Press", "Shoulder Press", "Push-Ups"]
  },
  "Plank": {
    primaryMuscles: ["core"],
    secondaryMuscles: ["shoulders", "glutes"],
    movementPattern: "core",
    equipment: "minimal",
    type: "isolation",
    videoUrl: "https://www.youtube.com/results?search_query=plank+form",
    alternativesByName: ["Glute Bridge"]
  },
  "One-Arm Dumbbell Row": {
    primaryMuscles: ["lats"],
    secondaryMuscles: ["mid back", "biceps"],
    movementPattern: "pull",
    equipment: "home",
    type: "compound",
    cues: ["Brace on bench/support", "Pull elbow toward hip"],
    videoUrl: "https://www.youtube.com/results?search_query=one+arm+dumbbell+row+form",
    alternativesByName: ["Seated Cable Row", "Lat Pulldown"]
  },
  "Dumbbell Floor Press": {
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps", "front delts"],
    movementPattern: "push",
    equipment: "home",
    type: "compound",
    cues: ["Pause elbows lightly on floor", "Press with neutral wrists"],
    videoUrl: "https://www.youtube.com/results?search_query=dumbbell+floor+press+form",
    alternativesByName: ["Push-Ups", "Flat Bench Press", "Incline Bench Press"]
  },
  "Goblet Squat": {
    primaryMuscles: ["quads"],
    secondaryMuscles: ["glutes", "core"],
    movementPattern: "squat",
    equipment: "home",
    type: "compound",
    cues: ["Keep chest tall", "Sit between hips"],
    videoUrl: "https://www.youtube.com/results?search_query=goblet+squat+form",
    alternativesByName: ["Bodyweight Squat", "Walking Lunges", "Leg Press"]
  },
  "Romanian Deadlift (Dumbbell)": {
    primaryMuscles: ["hamstrings"],
    secondaryMuscles: ["glutes", "lower back"],
    movementPattern: "hinge",
    equipment: "home",
    type: "compound",
    cues: ["Hinge hips back", "Keep dumbbells close to legs"],
    videoUrl: "https://www.youtube.com/results?search_query=dumbbell+romanian+deadlift+form",
    alternativesByName: ["Glute Bridge", "Walking Lunges"]
  },
  "Dumbbell Shoulder Press": {
    primaryMuscles: ["shoulders"],
    secondaryMuscles: ["triceps", "upper chest"],
    movementPattern: "push",
    equipment: "home",
    type: "compound",
    cues: ["Brace core", "Press through full range"],
    videoUrl: "https://www.youtube.com/results?search_query=dumbbell+shoulder+press+form",
    alternativesByName: ["Shoulder Press", "Pike Push-Up"]
  },
  "Dumbbell Bicep Curl": {
    primaryMuscles: ["biceps"],
    secondaryMuscles: ["forearms"],
    movementPattern: "isolation",
    equipment: "home",
    type: "isolation",
    videoUrl: "https://www.youtube.com/results?search_query=dumbbell+bicep+curl+form",
    alternativesByName: ["Barbell Curls", "Hammer Curls", "Preacher Curls"]
  },
  "Dumbbell Overhead Tricep Extension": {
    primaryMuscles: ["triceps"],
    secondaryMuscles: ["core"],
    movementPattern: "isolation",
    equipment: "home",
    type: "isolation",
    videoUrl: "https://www.youtube.com/results?search_query=overhead+dumbbell+tricep+extension+form",
    alternativesByName: ["Dumbbell Tricep Extension", "Tricep Pressdown"]
  },
  "Cable Tricep Extension": {
    primaryMuscles: ["triceps"],
    secondaryMuscles: ["forearms"],
    movementPattern: "isolation",
    equipment: "gym",
    type: "isolation",
    videoUrl: "https://www.youtube.com/results?search_query=cable+tricep+extension+form",
    alternativesByName: ["Tricep Pressdown", "Dumbbell Tricep Extension"]
  },
  "Reverse Barbell Curls": {
    primaryMuscles: ["forearms"],
    secondaryMuscles: ["biceps"],
    movementPattern: "isolation",
    equipment: "either",
    type: "isolation",
    videoUrl: "https://www.youtube.com/results?search_query=reverse+barbell+curl+form",
    alternativesByName: ["Barbell Curls", "Hammer Curls"]
  },
  "Leg Extension": {
    primaryMuscles: ["quads"],
    secondaryMuscles: ["hip flexors"],
    movementPattern: "isolation",
    equipment: "gym",
    type: "isolation",
    videoUrl: "https://www.youtube.com/results?search_query=leg+extension+form",
    alternativesByName: ["Leg Press", "Bodyweight Squat", "Goblet Squat"]
  },
  "Leg Curl": {
    primaryMuscles: ["hamstrings"],
    secondaryMuscles: ["calves"],
    movementPattern: "isolation",
    equipment: "gym",
    type: "isolation",
    videoUrl: "https://www.youtube.com/results?search_query=leg+curl+form",
    alternativesByName: ["Romanian Deadlift (Dumbbell)", "Glute Bridge"]
  },
  "Calf Raises": {
    primaryMuscles: ["calves"],
    secondaryMuscles: ["ankle stabilizers"],
    movementPattern: "isolation",
    equipment: "either",
    type: "isolation",
    videoUrl: "https://www.youtube.com/results?search_query=calf+raises+form",
    alternativesByName: ["Walking Lunges"]
  },
  "Middle Cable Crossover": {
    primaryMuscles: ["chest"],
    secondaryMuscles: ["front delts"],
    movementPattern: "isolation",
    equipment: "gym",
    type: "isolation",
    videoUrl: "https://www.youtube.com/results?search_query=cable+crossover+middle+form",
    alternativesByName: ["Cable Crossover (Middle)", "Low to High Cable Crossover", "High to Low Cable Crossover"]
  },
  "Low to High Cable Crossover": {
    primaryMuscles: ["upper chest"],
    secondaryMuscles: ["front delts"],
    movementPattern: "isolation",
    equipment: "gym",
    type: "isolation",
    videoUrl: "https://www.youtube.com/results?search_query=low+to+high+cable+crossover+form",
    alternativesByName: ["Cable Crossover (Low-to-High)", "Middle Cable Crossover", "High to Low Cable Crossover"]
  },
  "High to Low Cable Crossover": {
    primaryMuscles: ["lower chest"],
    secondaryMuscles: ["front delts"],
    movementPattern: "isolation",
    equipment: "gym",
    type: "isolation",
    videoUrl: "https://www.youtube.com/results?search_query=high+to+low+cable+crossover+form",
    alternativesByName: ["Cable Crossover (High-to-Low)", "Middle Cable Crossover", "Low to High Cable Crossover"]
  },
  "Dumbbell Raise": {
    primaryMuscles: ["side delts"],
    secondaryMuscles: ["upper traps"],
    movementPattern: "isolation",
    equipment: "home",
    type: "isolation",
    videoUrl: "https://www.youtube.com/results?search_query=dumbbell+lateral+raise+form",
    alternativesByName: ["Side Lateral Raise", "Rear Delt Pec Fly"]
  }
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

  const existing = await db.planTemplates.count();
  if (existing > 0) {
    await ensureExerciseMetaSeed();
    return;
  }

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
  await ensureExerciseTemplatesByName(homeMinimalPack);
  await db.planTemplates.add(plan);
  await db.settings.put({ key: "unit", value: "kg" });
  await ensureExerciseMetaSeed();
}
