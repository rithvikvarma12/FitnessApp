import { db } from "../db/db";
import { supabase } from "../lib/supabase";
import type { ActiveInjury, NoteChip } from "../db/types";

function syncInjuryToSupabase(inj: ActiveInjury) {
  try {
    supabase.from("active_injuries").upsert({
      id: inj.id,
      user_id: inj.userId,
      area: inj.area,
      severity: inj.severity,
      start_date_iso: inj.startDateISO,
      last_check_iso: inj.lastCheckISO,
      status: inj.status,
      weeks_since_start: inj.weeksSinceStart,
      notes: inj.notes ?? null,
    }).then(({ error }) => { if (error) console.error("Supabase active_injuries sync error:", error); });
  } catch { /* ignore */ }
}
const uid = () => crypto.randomUUID();

// ─── Exercise exclusion rules ───────────────────────────────────────────────

export function getExerciseExclusions(area: string, severity: string): string[] {
  const a = area.toLowerCase();
  const s = severity.toLowerCase();

  if (a === "shoulder") {
    if (s === "mild") return ["overhead press", "military press", "shoulder press", "arnold press"];
    if (s === "moderate")
      return ["overhead press", "military press", "shoulder press", "arnold press", "incline press", "incline bench"];
    if (s === "severe")
      return [
        "overhead press", "military press", "shoulder press", "arnold press",
        "bench press", "chest press", "incline press", "lateral raise", "front raise", "shoulder",
      ];
  }
  if (a === "knee") {
    if (s === "mild") return ["squat", "bulgarian split squat"];
    if (s === "moderate") return ["squat", "lunge", "split squat", "step-up", "step up"];
    if (s === "severe") return ["squat", "lunge", "split squat", "leg press", "step-up", "step up", "leg extension"];
  }
  if (a === "back") {
    if (s === "mild") return ["deadlift", "rdl", "romanian deadlift"];
    if (s === "moderate") return ["deadlift", "rdl", "romanian deadlift", "barbell row", "t-bar row", "bent over row"];
    if (s === "severe")
      return ["deadlift", "rdl", "romanian deadlift", "row", "pulldown", "pull-up", "pull up", "lat"];
  }
  if (a === "elbow") {
    if (s === "mild") return ["barbell curl", "ez bar curl", "preacher curl"];
    if (s === "moderate") return ["curl", "preacher"];
    if (s === "severe") return ["curl", "preacher", "tricep", "pressdown", "extension"];
  }
  if (a === "wrist") {
    return ["barbell bench", "barbell row", "barbell curl", "barbell overhead", "barbell squat", "barbell deadlift"];
  }
  if (a === "hip") {
    if (s === "mild" || s === "moderate") return ["lunge", "split squat", "bulgarian"];
    if (s === "severe") return ["deadlift", "rdl", "romanian deadlift", "hip thrust", "glute bridge", "lunge", "split squat"];
  }
  return [];
}

export function getExerciseSubstitutions(area: string, severity: string): Map<string, string> {
  const a = area.toLowerCase();
  const s = severity.toLowerCase();
  const subs = new Map<string, string>();

  if (a === "shoulder" && (s === "mild" || s === "moderate")) {
    subs.set("overhead press", "Lateral Raise");
    subs.set("shoulder press", "Lateral Raise");
  }
  if (a === "knee") {
    subs.set("squat", "Leg Press");
    subs.set("lunge", "Leg Curl");
    subs.set("split squat", "Leg Curl");
  }
  if (a === "back" && s === "mild") {
    subs.set("deadlift", "Lat Pulldown");
  }
  if (a === "wrist") {
    subs.set("barbell bench", "Dumbbell Bench Press");
    subs.set("barbell curl", "Dumbbell Curl");
    subs.set("barbell row", "Dumbbell Row");
  }
  return subs;
}

// ─── Severity helpers ───────────────────────────────────────────────────────

export function downgradeSeverity(severity: string): string {
  if (severity === "severe") return "moderate";
  if (severity === "moderate") return "mild";
  return "mild";
}

export function effectiveSeverity(inj: ActiveInjury): string {
  return inj.status === "improving" ? downgradeSeverity(inj.severity) : inj.severity;
}

// ─── DB CRUD ────────────────────────────────────────────────────────────────

export async function getActiveInjuries(userId: string): Promise<ActiveInjury[]> {
  return db.activeInjuries
    .where("userId")
    .equals(userId)
    .and((inj) => inj.status !== "resolved")
    .toArray();
}

export async function upsertInjuryFromChip(chip: NoteChip, userId: string): Promise<void> {
  if (!chip.area || !chip.severity) return;

  const existing = await db.activeInjuries
    .where("userId")
    .equals(userId)
    .and((inj) => inj.area.toLowerCase() === chip.area!.toLowerCase() && inj.status !== "resolved")
    .first();

  const now = new Date().toISOString();
  if (existing) {
    await db.activeInjuries.update(existing.id, { severity: chip.severity, lastCheckISO: now });
    db.activeInjuries.get(existing.id).then(inj => { if (inj) syncInjuryToSupabase(inj); });
  } else {
    const newInjury = {
      id: uid(),
      userId,
      area: chip.area,
      severity: chip.severity,
      startDateISO: now,
      lastCheckISO: now,
      status: "active" as const,
      weeksSinceStart: 0,
    };
    await db.activeInjuries.add(newInjury);
    syncInjuryToSupabase(newInjury);
  }
}

export async function updateInjuryStatus(
  injuryId: string,
  response: "still_painful" | "getting_better" | "resolved"
): Promise<void> {
  const now = new Date().toISOString();
  if (response === "resolved") {
    await db.activeInjuries.update(injuryId, { status: "resolved", lastCheckISO: now });
    db.activeInjuries.get(injuryId).then(inj => { if (inj) syncInjuryToSupabase(inj); });
  } else if (response === "getting_better") {
    const inj = await db.activeInjuries.get(injuryId);
    if (!inj) return;
    const newSeverity = downgradeSeverity(inj.severity);
    await db.activeInjuries.update(injuryId, {
      status: "improving",
      severity: newSeverity,
      lastCheckISO: now,
    });
    db.activeInjuries.get(injuryId).then(inj => { if (inj) syncInjuryToSupabase(inj); });
  } else {
    await db.activeInjuries.update(injuryId, { status: "active", lastCheckISO: now });
    db.activeInjuries.get(injuryId).then(inj => { if (inj) syncInjuryToSupabase(inj); });
  }
}
