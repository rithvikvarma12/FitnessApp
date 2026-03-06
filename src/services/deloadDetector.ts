import type { WeekPlan } from "../db/types";

function weekVolumeKg(week: WeekPlan): number {
  let total = 0;
  for (const day of week.days) {
    for (const ex of day.exercises) {
      for (const s of ex.sets) {
        if (s.completed) {
          total += (s.actualWeightKg ?? s.plannedWeightKg ?? 0) * (s.actualReps ?? s.plannedRepsMin ?? 0);
        }
      }
    }
  }
  return total;
}

function weekCompletionRate(week: WeekPlan): number {
  const total = week.days.length;
  if (total === 0) return 1;
  return week.days.filter((d) => d.isComplete).length / total;
}

function weekAvgFatigue(week: WeekPlan): number | null {
  const ratings = week.days
    .filter((d) => d.isComplete && d.fatigueRating !== undefined)
    .map((d) => d.fatigueRating!);
  if (ratings.length === 0) return null;
  return ratings.reduce((a, b) => a + b, 0) / ratings.length;
}

export function shouldSuggestDeload(weeks: WeekPlan[]): { suggest: boolean; reason: string } {
  const sorted = [...weeks].sort((a, b) => a.weekNumber - b.weekNumber);
  if (sorted.length === 0) return { suggest: false, reason: "" };

  const last = sorted[sorted.length - 1];

  // No suggestion if last week was already a deload
  if (last.isDeload) return { suggest: false, reason: "" };

  // No suggestion if deload chip already active for next week
  if (last.noteChips?.some((c) => c.type === "deload")) return { suggest: false, reason: "" };

  // 1. Fatigue trend: avg rating <= 2.0 over last 2 weeks
  const last2 = sorted.slice(-2);
  const fatigues = last2.map(weekAvgFatigue).filter((f): f is number => f !== null);
  if (fatigues.length >= 1) {
    const avgFatigue = fatigues.reduce((a, b) => a + b, 0) / fatigues.length;
    if (avgFatigue <= 2.0) {
      return {
        suggest: true,
        reason: `Average session rating has been ${avgFatigue.toFixed(1)}/5 — a deload week might help recovery`,
      };
    }
  }

  // 2. Completion drop: below 60% for 2 consecutive weeks
  const completions = last2.map(weekCompletionRate);
  if (completions.length >= 2 && completions.every((r) => r < 0.6)) {
    return {
      suggest: true,
      reason: "Completion rate has dropped below 60% for 2 weeks — consider a lighter week to recover",
    };
  }

  // 3. Volume ramp: 15%+ increase over 3+ consecutive weeks
  if (sorted.length >= 4) {
    const recent4 = sorted.slice(-4);
    const vols = recent4.map(weekVolumeKg);
    const hasRamp = vols[1] > vols[0] && vols[2] > vols[1] && vols[3] > vols[2];
    const totalGain = vols[0] > 0 ? (vols[3] - vols[0]) / vols[0] : 0;
    if (hasRamp && totalGain >= 0.15) {
      const pct = Math.round(totalGain * 100);
      return {
        suggest: true,
        reason: `Volume has climbed ${pct}% over 3 weeks — a deload week might help recovery`,
      };
    }
  }

  // 4. Time since last deload: 6+ weeks
  const deloadWeeks = sorted.filter((w) => w.isDeload);
  if (deloadWeeks.length === 0 && sorted.length >= 6) {
    return {
      suggest: true,
      reason: `It's been ${sorted.length}+ weeks without a deload — time to recover`,
    };
  }
  if (deloadWeeks.length > 0) {
    const lastDeload = deloadWeeks[deloadWeeks.length - 1];
    const weeksSince = last.weekNumber - lastDeload.weekNumber;
    if (weeksSince >= 6) {
      return {
        suggest: true,
        reason: `It's been ${weeksSince} weeks since your last deload — time to recover`,
      };
    }
  }

  return { suggest: false, reason: "" };
}
