export type UUID = string;

export type RepRange = { min: number; max: number };

export type UserProfile = {
  id: UUID;
  name?: string;
  unit: "kg" | "lb";
  daysPerWeek: 3 | 4 | 5;
  goal: "cut" | "maintain" | "gain";
  experience: "beginner" | "intermediate";
  equipment: "gym" | "home" | "minimal";
  notes?: string;
  createdAtISO: string;
};

export type ExerciseTemplate = {
  id: UUID;
  name: string;
  defaultSets: number;
  repRange: RepRange;
  // optional default increment rules etc. later
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
  isComplete: boolean;
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
