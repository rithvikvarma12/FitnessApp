import type { WeekPlan } from "../db/types";
import { toDisplay } from "./units";
import type { Unit } from "./units";

// ─── Exported Types ───────────────────────────────────────────────────────────

export type PRRecord = {
  exerciseName: string;
  weightKg: number;
  reps: number;
  e1rm: number;
  weekNumber: number;
  dateISO: string;
};

export type PRComparison = {
  exerciseName: string;
  newWeightKg: number;
  newReps: number;
  prevWeightKg: number;
  prevReps: number;
  deltaKg: number;
  weekNumber: number;
};

export type ExerciseSummary = {
  name: string;
  totalSets: number;
  completedSets: number;
  totalReps: number;
  totalVolumeKg: number;
  bestWeightKg: number;
  bestReps: number;
  e1rm: number;
};

export type WeeklySummary = {
  weekNumber: number;
  startDateISO: string;
  totalWorkouts: number;
  completedWorkouts: number;
  totalSets: number;
  completedSets: number;
  totalVolumeKg: number;
  cardioMinutes: number;
  exercises: ExerciseSummary[];
  newPRs: PRComparison[];
};

export type StreakInfo = {
  currentStreak: number;
  longestStreak: number;
  totalWorkoutsCompleted: number;
  totalWorkoutsPlanned: number;
  overallCompletionRate: number;
};

export type MuscleGroupVolume = {
  group: string;
  totalSets: number;
  totalVolumeKg: number;
};

export type ProgressSnapshot = {
  allTimePRs: Map<string, PRRecord>;
  recentPRs: PRComparison[];
  weeklySummaries: WeeklySummary[];
  streak: StreakInfo;
  muscleGroupVolumes: MuscleGroupVolume[];
  topExercises: ExerciseSummary[];
};

// ─── PR Threshold Helpers ─────────────────────────────────────────────────────

const COMPOUND_KEYWORDS_PR = [
  "bench", "press", "row", "pulldown", "pull-up", "pull up",
  "chin-up", "chin up", "squat", "deadlift", "rdl", "lunge",
  "leg press", "carry", "push-up", "push up",
];

function isCompoundForPR(name: string): boolean {
  const lower = name.toLowerCase();
  return COMPOUND_KEYWORDS_PR.some((k) => lower.includes(k));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function computeE1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  return weight * (1 + reps / 30);
}

export function formatWeightDisplay(weightKg: number, unit: Unit): string {
  const val = toDisplay(weightKg, unit);
  return `${val.toFixed(1)} ${unit}`;
}

export function formatVolumeDisplay(volumeKg: number, unit: Unit): string {
  const val = toDisplay(volumeKg, unit);
  if (val >= 1000) return `${(val / 1000).toFixed(1)}k ${unit}`;
  return `${Math.round(val)} ${unit}`;
}

// ─── Muscle Group Classification ─────────────────────────────────────────────

const MUSCLE_MAP: Record<string, string> = {
  chest: "Chest",
  pec: "Chest",
  "bench press": "Chest",
  "incline press": "Chest",
  "decline press": "Chest",
  "chest fly": "Chest",
  "cable fly": "Chest",
  "cable crossover": "Chest",
  "push-up": "Chest",
  "push up": "Chest",
  "dip": "Chest",

  deadlift: "Back",
  row: "Back",
  "pull-up": "Back",
  "pull up": "Back",
  pulldown: "Back",
  "chin-up": "Back",
  "chin up": "Back",
  "lat ": "Back",
  rhomboid: "Back",
  "t-bar": "Back",
  "rack pull": "Back",
  "face pull": "Back",
  "reverse fly": "Back",

  squat: "Legs",
  lunge: "Legs",
  "leg press": "Legs",
  "leg extension": "Legs",
  "leg curl": "Legs",
  "calf raise": "Legs",
  "hip thrust": "Legs",
  rdl: "Legs",
  "romanian deadlift": "Legs",
  "step up": "Legs",
  "glute bridge": "Legs",
  "hack squat": "Legs",
  "split squat": "Legs",

  "shoulder press": "Shoulders",
  "overhead press": "Shoulders",
  "lateral raise": "Shoulders",
  "front raise": "Shoulders",
  "arnold press": "Shoulders",
  "military press": "Shoulders",
  upright: "Shoulders",

  curl: "Biceps",
  "bicep curl": "Biceps",
  "hammer curl": "Biceps",
  preacher: "Biceps",
  "incline curl": "Biceps",

  "tricep pressdown": "Triceps",
  "triceps pressdown": "Triceps",
  "tricep extension": "Triceps",
  "triceps extension": "Triceps",
  "skull crusher": "Triceps",
  "overhead tricep": "Triceps",
  "close grip bench": "Triceps",

  plank: "Core",
  crunch: "Core",
  "ab ": "Core",
  "abs ": "Core",
  "cable crunch": "Core",
  "hanging leg": "Core",
  "russian twist": "Core",
};

function classifyMuscleGroup(name: string): string {
  const lower = name.toLowerCase();
  for (const [keyword, group] of Object.entries(MUSCLE_MAP)) {
    if (lower.includes(keyword)) return group;
  }
  return "Other";
}

// ─── Core Functions ───────────────────────────────────────────────────────────

export function computeAllTimePRs(weeks: WeekPlan[]): Map<string, PRRecord> {
  const prs = new Map<string, PRRecord>();

  for (const week of weeks) {
    for (const day of week.days) {
      for (const exercise of day.exercises) {
        for (const set of exercise.sets) {
          if (!set.completed) continue;
          const w = set.actualWeightKg ?? set.plannedWeightKg ?? 0;
          const r = set.actualReps ?? set.plannedRepsMax ?? 0;
          if (w <= 0 || r <= 0) continue;

          const e1rm = computeE1RM(w, r);
          const existing = prs.get(exercise.name);
          if (!existing || e1rm > existing.e1rm) {
            prs.set(exercise.name, {
              exerciseName: exercise.name,
              weightKg: w,
              reps: r,
              e1rm,
              weekNumber: week.weekNumber,
              dateISO: day.dateISO,
            });
          }
        }
      }
    }
  }

  return prs;
}

export function findRecentPRs(
  weeks: WeekPlan[],
  targetWeekNumber?: number,
  options?: { applyThreshold?: boolean }
): PRComparison[] {
  if (weeks.length === 0) return [];

  const sorted = [...weeks].sort((a, b) => a.weekNumber - b.weekNumber);
  const targetWeek =
    targetWeekNumber != null
      ? sorted.find((w) => w.weekNumber === targetWeekNumber)
      : sorted[sorted.length - 1];

  if (!targetWeek) return [];

  const priorWeeks = sorted.filter(
    (w) => w.weekNumber < targetWeek.weekNumber
  );
  const priorPRs = computeAllTimePRs(priorWeeks);

  // Best per exercise in target week
  const weekBest = new Map<string, { weightKg: number; reps: number; e1rm: number }>();
  for (const day of targetWeek.days) {
    for (const exercise of day.exercises) {
      for (const set of exercise.sets) {
        if (!set.completed) continue;
        const w = set.actualWeightKg ?? set.plannedWeightKg ?? 0;
        const r = set.actualReps ?? set.plannedRepsMax ?? 0;
        if (w <= 0 || r <= 0) continue;
        const e1rm = computeE1RM(w, r);
        const existing = weekBest.get(exercise.name);
        if (!existing || e1rm > existing.e1rm) {
          weekBest.set(exercise.name, { weightKg: w, reps: r, e1rm });
        }
      }
    }
  }

  const comparisons: PRComparison[] = [];
  for (const [name, curr] of weekBest) {
    const prior = priorPRs.get(name);
    if (!prior) {
      // First time this exercise appeared — treat as PR vs 0
      comparisons.push({
        exerciseName: name,
        newWeightKg: curr.weightKg,
        newReps: curr.reps,
        prevWeightKg: 0,
        prevReps: 0,
        deltaKg: curr.weightKg,
        weekNumber: targetWeek.weekNumber,
      });
    } else if (curr.e1rm > prior.e1rm) {
      comparisons.push({
        exerciseName: name,
        newWeightKg: curr.weightKg,
        newReps: curr.reps,
        prevWeightKg: prior.weightKg,
        prevReps: prior.reps,
        deltaKg: curr.weightKg - prior.weightKg,
        weekNumber: targetWeek.weekNumber,
      });
    }
  }

  // Apply threshold filter (first-time PRs always pass)
  const { applyThreshold = false } = options ?? {};
  const thresholded = applyThreshold
    ? comparisons.filter((c) => {
        if (c.prevWeightKg === 0) return true;
        const minDelta = isCompoundForPR(c.exerciseName) ? 2.5 : 1.0;
        return c.deltaKg >= minDelta;
      })
    : comparisons;

  // Dedupe by exercise name, keep highest e1rm delta
  const deduped = new Map<string, PRComparison>();
  for (const c of thresholded) {
    const existing = deduped.get(c.exerciseName);
    if (!existing || c.deltaKg > existing.deltaKg) {
      deduped.set(c.exerciseName, c);
    }
  }

  return [...deduped.values()].sort((a, b) => b.deltaKg - a.deltaKg);
}

export function computeWeeklySummary(
  week: WeekPlan,
  allWeeks: WeekPlan[]
): WeeklySummary {
  let totalSets = 0;
  let completedSets = 0;
  let totalVolumeKg = 0;
  let cardioMinutes = 0;
  let completedWorkouts = 0;

  const exerciseMap = new Map<string, ExerciseSummary>();

  for (const day of week.days) {
    if (day.isComplete) completedWorkouts++;
    if (day.cardio) cardioMinutes += day.cardio.minutes;

    for (const exercise of day.exercises) {
      for (const set of exercise.sets) {
        totalSets++;
        if (!set.completed) continue;
        completedSets++;

        const w = set.actualWeightKg ?? set.plannedWeightKg ?? 0;
        const r = set.actualReps ?? set.plannedRepsMax ?? 0;
        totalVolumeKg += w * r;

        const ex = exerciseMap.get(exercise.name) ?? {
          name: exercise.name,
          totalSets: 0,
          completedSets: 0,
          totalReps: 0,
          totalVolumeKg: 0,
          bestWeightKg: 0,
          bestReps: 0,
          e1rm: 0,
        };

        ex.completedSets++;
        ex.totalReps += r;
        ex.totalVolumeKg += w * r;
        if (w > ex.bestWeightKg) {
          ex.bestWeightKg = w;
          ex.bestReps = r;
          ex.e1rm = computeE1RM(w, r);
        }
        exerciseMap.set(exercise.name, ex);
      }

      // count total sets regardless of completion
      const ex = exerciseMap.get(exercise.name);
      if (ex) {
        ex.totalSets += exercise.sets.length;
        exerciseMap.set(exercise.name, ex);
      } else {
        exerciseMap.set(exercise.name, {
          name: exercise.name,
          totalSets: exercise.sets.length,
          completedSets: 0,
          totalReps: 0,
          totalVolumeKg: 0,
          bestWeightKg: 0,
          bestReps: 0,
          e1rm: 0,
        });
      }
    }
  }

  const newPRs = findRecentPRs(allWeeks, week.weekNumber);

  return {
    weekNumber: week.weekNumber,
    startDateISO: week.startDateISO,
    totalWorkouts: week.days.length,
    completedWorkouts,
    totalSets,
    completedSets,
    totalVolumeKg,
    cardioMinutes,
    exercises: [...exerciseMap.values()],
    newPRs,
  };
}

export function computeStreak(weeks: WeekPlan[]): StreakInfo {
  const sorted = [...weeks].sort((a, b) => b.weekNumber - a.weekNumber);

  let currentStreak = 0;
  let longestStreak = 0;
  let runningStreak = 0;
  let totalCompleted = 0;
  let totalPlanned = 0;

  for (const week of sorted) {
    const planned = week.days.length;
    const completed = week.days.filter((d) => d.isComplete).length;
    totalPlanned += planned;
    totalCompleted += completed;

    const rate = planned > 0 ? completed / planned : 0;

    if (rate >= 0.5) {
      runningStreak++;
      longestStreak = Math.max(longestStreak, runningStreak);
      if (currentStreak === runningStreak - 1) currentStreak = runningStreak;
    } else {
      if (currentStreak === 0) {
        // still haven't broken the streak from the front
        // if we haven't set it yet, current streak is 0
      }
      runningStreak = 0;
    }
  }

  // Re-compute current streak properly (from most-recent backward)
  currentStreak = 0;
  for (const week of sorted) {
    const planned = week.days.length;
    const completed = week.days.filter((d) => d.isComplete).length;
    const rate = planned > 0 ? completed / planned : 0;
    if (rate >= 0.5) {
      currentStreak++;
    } else {
      break;
    }
  }

  return {
    currentStreak,
    longestStreak,
    totalWorkoutsCompleted: totalCompleted,
    totalWorkoutsPlanned: totalPlanned,
    overallCompletionRate:
      totalPlanned > 0 ? (totalCompleted / totalPlanned) * 100 : 0,
  };
}

export function computeMuscleGroupVolumes(
  weeks: WeekPlan[],
  lastNWeeks?: number
): MuscleGroupVolume[] {
  const sorted = [...weeks].sort((a, b) => a.weekNumber - b.weekNumber);
  const sliced = lastNWeeks != null ? sorted.slice(-lastNWeeks) : sorted;

  const groupMap = new Map<string, MuscleGroupVolume>();

  for (const week of sliced) {
    for (const day of week.days) {
      for (const exercise of day.exercises) {
        const group = classifyMuscleGroup(exercise.name);
        const entry = groupMap.get(group) ?? {
          group,
          totalSets: 0,
          totalVolumeKg: 0,
        };

        for (const set of exercise.sets) {
          if (!set.completed) continue;
          const w = set.actualWeightKg ?? set.plannedWeightKg ?? 0;
          const r = set.actualReps ?? set.plannedRepsMax ?? 0;
          entry.totalSets++;
          entry.totalVolumeKg += w * r;
        }

        groupMap.set(group, entry);
      }
    }
  }

  return [...groupMap.values()].sort(
    (a, b) => b.totalVolumeKg - a.totalVolumeKg
  );
}

export function computeProgressSnapshot(weeks: WeekPlan[]): ProgressSnapshot {
  const sorted = [...weeks].sort((a, b) => a.weekNumber - b.weekNumber);
  const last8 = sorted.slice(-8);

  const allTimePRs = computeAllTimePRs(sorted);
  const recentPRs = findRecentPRs(sorted, undefined, { applyThreshold: true });
  const weeklySummaries = last8.map((w) => computeWeeklySummary(w, sorted));
  const streak = computeStreak(sorted);
  const muscleGroupVolumes = computeMuscleGroupVolumes(sorted, 4);

  // Top exercises by volume (all time)
  const exerciseTotals = new Map<string, ExerciseSummary>();
  for (const week of sorted) {
    for (const day of week.days) {
      for (const exercise of day.exercises) {
        const ex = exerciseTotals.get(exercise.name) ?? {
          name: exercise.name,
          totalSets: 0,
          completedSets: 0,
          totalReps: 0,
          totalVolumeKg: 0,
          bestWeightKg: 0,
          bestReps: 0,
          e1rm: 0,
        };
        for (const set of exercise.sets) {
          ex.totalSets++;
          if (!set.completed) continue;
          const w = set.actualWeightKg ?? set.plannedWeightKg ?? 0;
          const r = set.actualReps ?? set.plannedRepsMax ?? 0;
          ex.completedSets++;
          ex.totalReps += r;
          ex.totalVolumeKg += w * r;
          if (w > ex.bestWeightKg) {
            ex.bestWeightKg = w;
            ex.bestReps = r;
            ex.e1rm = computeE1RM(w, r);
          }
        }
        exerciseTotals.set(exercise.name, ex);
      }
    }
  }

  const topExercises = [...exerciseTotals.values()]
    .sort((a, b) => b.totalVolumeKg - a.totalVolumeKg)
    .slice(0, 10);

  return {
    allTimePRs,
    recentPRs,
    weeklySummaries,
    streak,
    muscleGroupVolumes,
    topExercises,
  };
}
