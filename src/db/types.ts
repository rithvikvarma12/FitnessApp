export type UUID = string;

export type RepRange = { min: number; max: number };

export type UserProfile = {
  id: UUID;
  name?: string;
  unit: "kg" | "lb";
  daysPerWeek: 3 | 4 | 5;
  goalMode: "cut" | "maintain" | "bulk";
  goal?: "cut" | "maintain" | "gain"; // legacy
  currentWeightKg?: number;
  targetWeightKg?: number;
  experience: "beginner" | "intermediate";
  equipment: "gym" | "home" | "minimal";
  cardioGoalAuto: boolean;
  cardioType: "LISS" | "Intervals" | "Mixed";
  cardioSessionsPerWeek: number;
  cardioMinutesPerSession: number;
  notes?: string;
  createdAtISO: string;
  // nutrition body stats (optional — added in v0.8)
  heightCm?: number;
  age?: number;
  gender?: "male" | "female";
  activityMultiplier?: number;
};

export type NutritionSettings = {
  id: string;           // same as userId
  userId: string;
  enabled: boolean;
  calorieTarget: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  trackProtein: boolean;
  trackCarbs: boolean;
  trackFat: boolean;
  isCustom: boolean;
  calculatedTDEE?: number;
};

export type DailyNutritionLog = {
  id: string;           // `${userId}-${dateISO}`
  userId: string;
  dateISO: string;      // YYYY-MM-DD
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  hitTarget: boolean;
  notes?: string;
};

export type ExerciseTemplate = {
  id: UUID;
  name: string;
  defaultSets: number;
  repRange: RepRange;
  // optional default increment rules etc. later
};

export type MovementPattern =
  | "push"
  | "pull"
  | "squat"
  | "hinge"
  | "carry"
  | "isolation"
  | "core"
  | "cardio";

export type ExerciseEquipment = "gym" | "home" | "minimal" | "either";
export type ExerciseMetaType = "compound" | "isolation";

export type ExerciseMeta = {
  exerciseTemplateId: string;
  primaryMuscles: string[];
  secondaryMuscles?: string[];
  movementPattern: MovementPattern;
  equipment: ExerciseEquipment;
  type: ExerciseMetaType;
  description?: string;
  cues?: string[];
  videoUrl?: string;
  imageUrl?: string;
  alternatives?: string[];
};

export type DayTemplate = {
  id: UUID;
  title: string;          // "Chest / Biceps"
  weekdayIndex: number;   // 0=Mon .. 6=Sun
  exerciseTemplateIds: UUID[];
};

export type PlanTemplate = {
  id: UUID;
  name: string;
  dayTemplates: DayTemplate[];
};

export type SetEntry = {
  setNumber: number;
  plannedRepsMin: number;
  plannedRepsMax: number;
  plannedWeightKg?: number;
  actualReps?: number;
  actualWeightKg?: number;
  completed: boolean;
};

export type PlannedExercise = {
  id: UUID;
  name: string;
  plannedSets: number;
  repRange: RepRange;
  plannedWeightKg?: number;
  sets: SetEntry[];
};

export type WorkoutDay = {
  id: UUID;
  dateISO: string; // YYYY-MM-DD
  title: string;
  exercises: PlannedExercise[];
  cardio?: {
    modality: "Treadmill" | "Stairmaster" | "Bike" | "Row";
    minutes: number;
    intensity?: "easy" | "moderate" | "hard";
  };
  isComplete: boolean;
  workoutStartedAt?: string; // ISO timestamp of first set completion
  workoutDurationMinutes?: number; // saved on day completion
};

export type WeekPlan = {
  id: UUID;
  userId: UUID;
  weekNumber: number;
  startDateISO: string;  // Monday
  createdAtISO: string;
  days: WorkoutDay[];
  isLocked: boolean;   
  notes?: string;
  nextWeekDays?: number; // 3,4,5
  // lock when generating next week
};

export type WeightEntry = {
  id: UUID;
  userId: UUID;
  dateISO: string;       // YYYY-MM-DD
  weightKg: number;
  createdAtISO: string;
};

export type CustomExercise = {
  id: string;
  userId: string;
  name: string;
  muscleGroup: string; // "chest"|"back"|"shoulders"|"legs"|"biceps"|"triceps"|"core"|"other"
  type: string;        // "compound"|"isolation"
  equipment: string;   // "barbell"|"dumbbell"|"cable"|"machine"|"bodyweight"|"other"
  notes?: string;
  createdAtISO: string;
};
