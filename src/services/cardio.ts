import type { UserProfile } from "../db/types";

export type CardioType = "LISS" | "Intervals" | "Mixed";

export type CardioPrescription = {
  cardioGoalAuto: boolean;
  cardioType: CardioType;
  cardioSessionsPerWeek: number;
  cardioMinutesPerSession: number;
  suggestedSchedule: string;
};

type Goal = UserProfile["goalMode"];
type DaysPerWeek = UserProfile["daysPerWeek"];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function defaultCardioTypeForGoal(goal: Goal): CardioType {
  if (goal === "cut") return "Mixed";
  if (goal === "maintain") return "LISS";
  return "LISS";
}

export function deriveAutoCardio(goal: Goal, daysPerWeek: DaysPerWeek): CardioPrescription {
  let sessions = 3;
  let minutes = 20;

  if (goal === "cut") {
    sessions = 4;
    minutes = 25;
    if (daysPerWeek === 3) {
      sessions = 5;
      minutes = 30;
    } else if (daysPerWeek === 5) {
      sessions = 3;
      minutes = 20;
    }
  } else if (goal === "maintain") {
    sessions = 2;
    minutes = 20;
    if (daysPerWeek === 3) {
      sessions = 3;
      minutes = 25;
    } else if (daysPerWeek === 4) {
      sessions = 3;
      minutes = 20;
    } else if (daysPerWeek === 5) {
      sessions = 2;
      minutes = 15;
    }
  } else {
    sessions = 2;
    minutes = 15;
    if (daysPerWeek === 3) {
      sessions = 2;
      minutes = 20;
    } else if (daysPerWeek === 5) {
      sessions = 1;
      minutes = 10;
    }
  }

  sessions = clamp(sessions, goal === "cut" ? 3 : goal === "maintain" ? 2 : 1, goal === "cut" ? 5 : goal === "maintain" ? 3 : 2);
  minutes = clamp(minutes, goal === "cut" ? 20 : goal === "maintain" ? 15 : 10, goal === "cut" ? 30 : goal === "maintain" ? 25 : 20);

  return {
    cardioGoalAuto: true,
    cardioType: defaultCardioTypeForGoal(goal),
    cardioSessionsPerWeek: sessions,
    cardioMinutesPerSession: minutes,
    suggestedSchedule: buildSuggestedSchedule(daysPerWeek, sessions)
  };
}

export function buildSuggestedSchedule(daysPerWeek: DaysPerWeek, sessionsPerWeek: number): string {
  if (daysPerWeek === 3) {
    const labels = ["Tue", "Thu", "Sat", "Sun", "Mon"];
    return `${labels.slice(0, sessionsPerWeek).join("/")} (non-lift days)`;
  }

  if (daysPerWeek === 4) {
    if (sessionsPerWeek <= 2) return "Tue/Thu post-workout";
    if (sessionsPerWeek === 3) return "Tue/Thu/Sat (mix post-workout + off day)";
    return "Mon/Wed/Fri/Sat (2 post-workout + 2 off-day)";
  }

  if (sessionsPerWeek <= 1) return "Post-workout Wed";
  if (sessionsPerWeek === 2) return "Post-workout Tue/Thu";
  return "Post-workout Mon/Wed/Fri";
}

export function resolveCardioPrescription(profile: UserProfile): CardioPrescription {
  const resolvedGoal: Goal = profile.goalMode ?? (profile.goal === "gain" ? "bulk" : profile.goal) ?? "maintain";
  if (profile.cardioGoalAuto) {
    return deriveAutoCardio(resolvedGoal, profile.daysPerWeek);
  }

  return {
    cardioGoalAuto: false,
    cardioType: profile.cardioType,
    cardioSessionsPerWeek: profile.cardioSessionsPerWeek,
    cardioMinutesPerSession: profile.cardioMinutesPerSession,
    suggestedSchedule: buildSuggestedSchedule(profile.daysPerWeek, profile.cardioSessionsPerWeek)
  };
}
