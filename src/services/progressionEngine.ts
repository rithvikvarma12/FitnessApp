import type { PlannedExercise } from "../db/types";

export type WeightUnit = "kg" | "lb";

export type ProgressionSuggestion = {
  baseWeightKg?: number;
  rampOffsetsKg?: number[];
};

export function roundToNearest(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function incrementKgForUnit(unit: WeightUnit): number {
  const lbIncrementKg = 5 * 0.45359237;
  return roundToNearest(unit === "lb" ? lbIncrementKg : 2.5, 0.5);
}

export function lastDefinedNumber(values: Array<number | undefined>): number | undefined {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (typeof values[i] === "number") return values[i];
  }
  return undefined;
}

function inferPrevBaseWeightKg(prev: PlannedExercise): number | undefined {
  if (typeof prev.plannedWeightKg === "number") return prev.plannedWeightKg;
  const firstPlannedSet = prev.sets.find((s) => typeof s.plannedWeightKg === "number")?.plannedWeightKg;
  if (typeof firstPlannedSet === "number") return firstPlannedSet;
  return lastDefinedNumber(prev.sets.map((s) => s.actualWeightKg));
}

function getPrevRampedOffsetsKg(prev: PlannedExercise, baseKg: number): number[] | undefined {
  if (prev.sets.length === 0) return undefined;
  const plannedSetWeights = prev.sets.map((s) => s.plannedWeightKg);
  if (plannedSetWeights.some((w) => typeof w !== "number")) return undefined;
  const offsets = plannedSetWeights.map((w) => roundToNearest((w as number) - baseKg, 0.5));
  const hasRamp = offsets.some((o) => Math.abs(o) >= 0.01);
  return hasRamp ? offsets : undefined;
}

export function buildPlannedSetWeightsFromBase(
  plannedSets: number,
  baseKg: number | undefined,
  rampOffsetsKg?: number[]
): Array<number | undefined> {
  if (typeof baseKg !== "number") {
    return Array.from({ length: plannedSets }, () => undefined);
  }
  if (!rampOffsetsKg || rampOffsetsKg.length === 0) {
    return Array.from({ length: plannedSets }, () => baseKg);
  }
  return Array.from({ length: plannedSets }, (_, idx) => {
    const offset = rampOffsetsKg[idx] ?? 0;
    return roundToNearest(baseKg + offset, 0.5);
  });
}

const COMPOUND_KEYWORDS_PROGRESSION = [
  "bench", "row", "pulldown", "lat", "press", "squat",
  "deadlift", "lunge", "pull-up", "pullup", "chin-up", "chinup"
];

const ISOLATION_KEYWORDS_PROGRESSION = [
  "crossover", "lateral", "pressdown", "curl",
  "rear delt", "fly", "calf raise", "calf raises", "preacher", "hammer"
];

function isCompound(name: string): boolean {
  const n = name.toLowerCase();
  return COMPOUND_KEYWORDS_PROGRESSION.some((k) => n.includes(k));
}

function isIsolation(name: string): boolean {
  const n = name.toLowerCase();
  return ISOLATION_KEYWORDS_PROGRESSION.some((k) => n.includes(k));
}

export function computeNextProgressionSuggestion(
  prev: PlannedExercise | undefined,
  exName: string,
  unit: WeightUnit
): ProgressionSuggestion {
  if (!prev) return {};
  const incrementKg = incrementKgForUnit(unit);
  const baseKg = inferPrevBaseWeightKg(prev);
  const rampOffsetsKg = typeof baseKg === "number" ? getPrevRampedOffsetsKg(prev, baseKg) : undefined;
  if (prev.sets.length === 0) return { baseWeightKg: baseKg, rampOffsetsKg };

  const evaluated = prev.sets.map((s) => ({
    hitMin: !!s.completed && typeof s.actualReps === "number" && s.actualReps >= prev.repRange.min,
    completed: s.completed,
    actualReps: s.actualReps,
    usedWeightKg: s.actualWeightKg ?? s.plannedWeightKg ?? baseKg
  }));

  const totalSets = evaluated.length;
  const hitMinCount = evaluated.filter((s) => s.hitMin).length;
  const completedCount = evaluated.filter((s) => s.completed).length;
  const majorityMissed = (totalSets - hitMinCount) > totalSets / 2;
  const mostHitMin = hitMinCount >= Math.ceil(totalSets / 2);
  const allHitMin = hitMinCount === totalSets;
  const lastSetMissed = totalSets > 0 ? !evaluated[totalSets - 1].hitMin : false;
  const avgReps = (() => {
    const repSets = evaluated.filter((s): s is typeof s & { actualReps: number } => typeof s.actualReps === "number");
    if (repSets.length === 0) return undefined;
    return repSets.reduce((sum, s) => sum + s.actualReps, 0) / repSets.length;
  })();

  let nextBaseKg = baseKg;
  const compound = isCompound(exName);
  const isolation = isIsolation(exName);

  if (compound) {
    if (typeof nextBaseKg !== "number") {
      nextBaseKg = lastDefinedNumber(evaluated.map((s) => s.usedWeightKg));
    }
    if (typeof nextBaseKg === "number") {
      if (allHitMin) {
        nextBaseKg = roundToNearest(nextBaseKg + incrementKg, 0.5);
      } else if (majorityMissed) {
        nextBaseKg = roundToNearest(Math.max(0, nextBaseKg - incrementKg), 0.5);
      } else if (mostHitMin && lastSetMissed) {
        nextBaseKg = roundToNearest(nextBaseKg, 0.5);
      }
    }
  } else if (isolation) {
    if (typeof nextBaseKg !== "number") {
      nextBaseKg = lastDefinedNumber(evaluated.map((s) => s.usedWeightKg));
    }
    const mostCompleted = completedCount >= Math.ceil(totalSets / 2);
    if (
      typeof nextBaseKg === "number" &&
      mostCompleted &&
      typeof avgReps === "number" &&
      avgReps >= prev.repRange.max
    ) {
      nextBaseKg = roundToNearest(nextBaseKg + incrementKg, 0.5);
    }
  } else if (typeof nextBaseKg !== "number") {
    nextBaseKg = lastDefinedNumber(evaluated.map((s) => s.usedWeightKg));
  }

  return { baseWeightKg: nextBaseKg, rampOffsetsKg };
}
