import { useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format, parseISO } from "date-fns";
import { db, getActiveUserId } from "../db/db";
import type { WeekPlan, NoteChip } from "../db/types";
import type { Unit } from "../services/units";
import { toDisplay } from "../services/units";
import { createFirstWeekIfMissing, generateNextWeek, getLatestWeek } from "../services/planGenerator";
import { shouldSuggestDeload } from "../services/deloadDetector";
import { getActiveInjuries, upsertInjuryFromChip, updateInjuryStatus } from "../services/injuryMemory";
import type { ActiveInjury } from "../db/types";
import WeekView from "./WeekView";
import { initRithvikPresetWeek6 } from "../services/presets";
import NoteChips from "../components/NoteChips";
import GoalReachedBanner from "../components/GoalReachedBanner";
import { weeklyTrendFromWindow } from "../services/stats";
import { deriveAutoCardio } from "../services/cardio";
import { supabase } from "../lib/supabase";


function buildChipPreview(chips: NoteChip[]): string {
  if (!chips || chips.length === 0) return "";
  const parts: string[] = [];
  for (const c of chips) {
    if (c.type === "deload") parts.push("deload week");
    else if (c.type === "fatigued") parts.push("feeling fatigued");
    else if (c.type === "traveling") {
      let s = "traveling";
      if (c.days) s += ", " + c.days + " days";
      if (c.equipment) s += ", " + c.equipment;
      parts.push(s);
    } else if (c.type === "injury") {
      let s = c.area ? c.area + " pain" : "injury";
      if (c.severity) s += " (" + c.severity + ")";
      parts.push(s);
    } else if (c.type === "focus") {
      if (c.muscleGroup) parts.push("focus " + c.muscleGroup);
    } else if (c.type === "days_override") {
      if (c.days) parts.push(c.days + " days");
    } else if (c.type === "equipment_change") {
      let s = c.equipment ?? "equipment change";
      if (c.duration === "until_changed") s += " (permanent)";
      parts.push(s);
    }
  }
  return parts.join(" · ");
}

function syncWeekPlanToSupabase(week: WeekPlan) {
  try {
    supabase.from("week_plans").upsert({
      id: week.id,
      user_id: week.userId,
      week_number: week.weekNumber,
      start_date_iso: week.startDateISO,
      days: week.days,
      is_locked: week.isLocked,
      notes: week.notes ?? null,
      note_chips: week.noteChips ?? null,
      is_deload: week.isDeload ?? null,
      adaptations: week.adaptations ?? null,
      active_injuries_snapshot: week.activeInjuriesSnapshot ?? null,
      created_at: week.createdAtISO,
    }).then(({ error }) => {
      if (error) console.error("Supabase week_plans sync error:", error);
    });
  } catch { /* ignore */ }
}
export default function PlanPage() {
  const activeUserId = useLiveQuery(async () => getActiveUserId(), [], "");

  const weeks = useLiveQuery(
    async () => {
      if (!activeUserId) return [] as WeekPlan[];
      const rows = await db.weekPlans.where("userId").equals(activeUserId).toArray();
      return rows.sort((a, b) => b.weekNumber - a.weekNumber);
    },
    [activeUserId]
  );

  const unit = useLiveQuery(async () => {
    const s = await db.settings.get("unit");
    return (s?.value as Unit) ?? "kg";
  }, [], "kg" as Unit);
  const activeProfile = useLiveQuery(
    async () => (activeUserId ? db.userProfiles.get(activeUserId) : undefined),
    [activeUserId]
  );
  const recentWeightEntries = useLiveQuery(
    async () => {
      if (!activeUserId) return [];
      const rows = await db.weightEntries.where("userId").equals(activeUserId).toArray();
      return rows.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    },
    [activeUserId],
    []
  );

  const nutritionSettings = useLiveQuery(
    async () => activeUserId ? db.nutritionSettings.get(activeUserId) : undefined,
    [activeUserId]
  );
  const todayNutritionLog = useLiveQuery(
    async () => {
      if (!activeUserId) return undefined;
      const todayISO = format(new Date(), "yyyy-MM-dd");
      return db.dailyNutritionLogs.get(`${activeUserId}-${todayISO}`);
    },
    [activeUserId]
  );

  const activeInjuries = useLiveQuery(
    async () => (activeUserId ? getActiveInjuries(activeUserId) : []),
    [activeUserId],
    [] as ActiveInjury[]
  );

  const deloadSuggestion = useMemo(() => {
    if (!weeks || weeks.length < 2) return null;
    const result = shouldSuggestDeload(weeks);
    return result.suggest ? result : null;
  }, [weeks]);

  const injuriesToCheckIn = useMemo(() => {
    if (!activeInjuries) return [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    return activeInjuries.filter((inj) => new Date(inj.lastCheckISO) < cutoff);
  }, [activeInjuries]);

  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissedDeloadForWeek, setDismissedDeloadForWeek] = useState<string | null>(null);

  // v0.3.2 UI: end-week-early flow
  const [endEarlyMode, setEndEarlyMode] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);

  const isEmpty = (weeks?.length ?? 0) === 0;

  const selected = useMemo(() => {
    if (!weeks || weeks.length === 0) return undefined;
    return weeks.find(w => w.id === selectedWeekId) ?? weeks[0];
  }, [weeks, selectedWeekId]);

  // Merge week snapshot + live active injuries for badge display
  const displayedInjuryBadges = useMemo(() => {
    const fromWeek = selected?.activeInjuriesSnapshot ?? [];
    const fromLive = (activeInjuries ?? []).map((inj) => ({ area: inj.area, severity: inj.severity }));
    const merged = [...fromWeek];
    for (const live of fromLive) {
      if (!merged.some((i) => i.area.toLowerCase() === live.area.toLowerCase())) {
        merged.push(live);
      }
    }
    return merged;
  }, [selected, activeInjuries]);

  const completion = useMemo(() => {
    if (!selected) return { done: 0, total: 0, missed: 0, allComplete: false };
    const total = selected.days.length;
    const done = selected.days.filter(d => d.isComplete).length;
    const missed = total - done;
    return { done, total, missed, allComplete: missed === 0 };
  }, [selected]);
  const cardioSummary = useMemo(() => {
    if (!selected) return undefined;
    const cardioDays = selected.days
      .slice()
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO))
      .filter((d) => !!d.cardio);

    const sessionsPerWeek = cardioDays.length;
    const modalities = Array.from(
      new Set(cardioDays.map((d) => d.cardio?.modality).filter((m): m is NonNullable<typeof m> => !!m))
    );
    const minutesList = cardioDays
      .map((d) => d.cardio?.minutes)
      .filter((m): m is number => Number.isFinite(m));
    const intensityList = cardioDays
      .map((d) => d.cardio?.intensity)
      .filter((i): i is "easy" | "moderate" | "hard" => !!i);
    const weekdayLabels = cardioDays.map((d) => format(parseISO(d.dateISO), "EEE"));

    const modalityLabel =
      modalities.length === 0 ? "-" : modalities.length === 1 ? modalities[0] : "Mixed";
    const intensityLabel =
      intensityList.length === 0
        ? "-"
        : Array.from(new Set(intensityList)).length === 1
          ? intensityList[0]
          : "mixed";
    const minuteLabel = (() => {
      if (minutesList.length === 0) return "-";
      const min = Math.min(...minutesList);
      const max = Math.max(...minutesList);
      return min === max ? `${min} min / session` : `${min}-${max} min / session`;
    })();
    const suggestedSchedule =
      weekdayLabels.length > 0
        ? `Post-workout ${weekdayLabels.join("/")}`
        : "No cardio prescribed this week";

    return {
      sessionsPerWeek,
      modalityLabel,
      minuteLabel,
      intensityLabel,
      suggestedSchedule
    };
  }, [selected]);
  const progressSummary = useMemo(() => {
    const latest = recentWeightEntries.length ? recentWeightEntries[recentWeightEntries.length - 1] : undefined;
    const latestKg = latest?.weightKg;
    const targetKg = activeProfile?.targetWeightKg;
    const goalMode = activeProfile?.goalMode ?? (activeProfile?.goal === "gain" ? "bulk" : activeProfile?.goal) ?? "maintain";

    const deltaKg =
      typeof latestKg === "number" && typeof targetKg === "number"
        ? (goalMode === "bulk" ? targetKg - latestKg : latestKg - targetKg)
        : null;

    const fourteenDay = recentWeightEntries.slice(-14).map((e) => ({ dateISO: e.dateISO, value: e.weightKg }));
    const trendKgPerWeek = weeklyTrendFromWindow(fourteenDay);

    const remainingColor =
      deltaKg === null
        ? "var(--text-secondary)"
        : deltaKg > 0
          ? "var(--accent-orange)"
          : "var(--accent-green)";

    return {
      latestLabel: typeof latestKg === "number" ? `${toDisplay(latestKg, unit).toFixed(1)} ${unit}` : "—",
      targetLabel: typeof targetKg === "number" ? `${toDisplay(targetKg, unit).toFixed(1)} ${unit}` : "—",
      deltaLabel:
        deltaKg === null
          ? "—"
          : `${deltaKg >= 0 ? "+" : "-"}${Math.abs(toDisplay(deltaKg, unit)).toFixed(1)} ${unit}`,
      trendLabel:
        trendKgPerWeek === null
          ? "—"
          : `${trendKgPerWeek >= 0 ? "+" : "-"}${Math.abs(toDisplay(trendKgPerWeek, unit)).toFixed(2)} ${unit}/week`,
      remainingColor
    };
  }, [recentWeightEntries, activeProfile, unit]);
  const generationContext = useMemo(() => {
    const goalMode = activeProfile?.goalMode ?? (activeProfile?.goal === "gain" ? "bulk" : activeProfile?.goal) ?? "maintain";
    const targetLabel =
      typeof activeProfile?.targetWeightKg === "number"
        ? `${toDisplay(activeProfile.targetWeightKg, unit).toFixed(1)} ${unit}`
        : "—";

    const weekCardioDays = selected?.days.filter((d) => !!d.cardio) ?? [];
    const hasWeekCardio = weekCardioDays.length > 0;

    const cardioSessions = hasWeekCardio
      ? weekCardioDays.length
      : deriveAutoCardio(goalMode, activeProfile?.daysPerWeek ?? 4).cardioSessionsPerWeek;
    const cardioMinutesLabel = (() => {
      if (hasWeekCardio) {
        const mins = weekCardioDays.map((d) => d.cardio?.minutes).filter((m): m is number => Number.isFinite(m));
        if (mins.length === 0) return "-";
        const min = Math.min(...mins);
        const max = Math.max(...mins);
        return min === max ? `${min}` : `${min}-${max}`;
      }
      return String(deriveAutoCardio(goalMode, activeProfile?.daysPerWeek ?? 4).cardioMinutesPerSession);
    })();

    return {
      goalMode,
      targetLabel,
      daysPerWeek: activeProfile?.daysPerWeek ?? 4,
      cardioSessions,
      cardioMinutesLabel
    };
  }, [activeProfile, selected, unit]);

  if (weeks === undefined) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-body">Loading…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      {/* Header row: title + week selector */}
      <div className="row" style={{ alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>Weekly Plan</h2>
        <select
          value={selected?.id ?? ""}
          onChange={(e) => {
            setSelectedWeekId(e.target.value);
            setEndEarlyMode(false);
          }}
          disabled={!weeks || weeks.length === 0}
          style={{ width: "auto", minWidth: 120 }}
        >
          {(weeks ?? [])
            .slice()
            .sort((a, b) => b.weekNumber - a.weekNumber)
            .map(w => (
              <option key={w.id} value={w.id}>
                Week {w.weekNumber} {w.isLocked ? "🔒" : ""}
              </option>
            ))}
        </select>
      </div>

      {/* Deload + injury badges */}
      {(selected?.isDeload || displayedInjuryBadges.length > 0) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {selected?.isDeload && (
            <span className="tag" style={{ background: "rgba(139,92,246,0.15)", color: "#8b5cf6", border: "1px solid rgba(139,92,246,0.3)", fontSize: 11, fontWeight: 700 }}>
              DELOAD
            </span>
          )}
          {displayedInjuryBadges.map((inj) => (
            <span key={inj.area} className="tag tag--red" style={{ fontSize: 11 }}>
              {"⚠"} {inj.area.charAt(0).toUpperCase() + inj.area.slice(1)} ({inj.severity})
            </span>
          ))}
        </div>
      )}
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
        Mark days complete to unlock generation. Miss a day? End week early.
      </div>

      <GoalReachedBanner userId={activeUserId} unit={unit} />

      {/* Weight stats row */}
      <div className="stats-row">
        <div className="stat-box">
          <div className="stat-box-label">Latest</div>
          <div className="stat-box-value">{progressSummary.latestLabel}</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-label">Target</div>
          <div className="stat-box-value" style={{ color: "var(--text-secondary)" }}>{progressSummary.targetLabel}</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-label">Remaining</div>
          <div className="stat-box-value" style={{ color: progressSummary.remainingColor }}>{progressSummary.deltaLabel}</div>
        </div>
        <div className="stat-box">
          <div className="stat-box-label">Trend 14d</div>
          <div className="stat-box-value" style={{ color: "var(--accent-green)" }}>{progressSummary.trendLabel}</div>
        </div>
      </div>

      {/* Nutrition summary card */}
      {nutritionSettings?.enabled && (
        <div className="nutri-plan-card">
          <div className="nutri-plan-label">Calories today</div>
          <div className="nutri-plan-numbers">
            <span className="nutri-plan-current">{todayNutritionLog?.calories ?? 0}</span>
            <span className="nutri-plan-sep"> / </span>
            <span className="nutri-plan-target">{nutritionSettings.calorieTarget} kcal</span>
          </div>
          <div className="nutri-plan-bar-track">
            <div
              className="nutri-plan-bar-fill"
              style={{
                width: `${Math.min(((todayNutritionLog?.calories ?? 0) / nutritionSettings.calorieTarget) * 100, 100)}%`,
                background: (() => {
                  const pct = (todayNutritionLog?.calories ?? 0) / nutritionSettings.calorieTarget;
                  return pct >= 0.9 && pct <= 1.1 ? "#10b981" : pct > 1.1 ? "#f97316" : "#3b82f6";
                })(),
              }}
            />
          </div>
        </div>
      )}

      {selected && cardioSummary && (
        <>
          <div style={{
            background: "rgba(16, 185, 129, 0.05)",
            border: "1px solid rgba(16, 185, 129, 0.15)",
            borderLeft: "2px solid var(--accent-green)",
            borderRadius: "var(--radius-md)",
            padding: "10px 12px",
            marginBottom: 12
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "var(--accent-green)" }}>Cardio</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{cardioSummary.suggestedSchedule}</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span className="tag tag--green">{cardioSummary.modalityLabel}</span>
                <span className="tag tag--green">{cardioSummary.sessionsPerWeek}×/wk</span>
                <span className="tag tag--green">{cardioSummary.minuteLabel}</span>
                {cardioSummary.intensityLabel !== "-" && (
                  <span className="tag tag--green">{cardioSummary.intensityLabel}</span>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* QUICK START (ONLY IF NO WEEKS EXIST YET) */}
      {isEmpty && (
        <>
          <div style={{
            background: "rgba(59, 130, 246, 0.06)",
            border: "1px solid rgba(59, 130, 246, 0.15)",
            borderLeft: "2px solid var(--accent-blue)",
            borderRadius: "var(--radius-md)",
            padding: "12px 14px",
            marginBottom: 12
          }}>
            <h3 style={{ color: "var(--accent-blue)", marginBottom: 4 }}>Quick Start</h3>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
              No plan yet. Set up your profile and generate your first week.
            </div>
            <div className="row" style={{ gap: 10 }}>
              <button
                disabled={busy}
                onClick={async () => {
                  setErr(null);
                  setBusy(true);
                  try {
                    await createFirstWeekIfMissing();
                    const latest = await getLatestWeek();
                    if (latest) setSelectedWeekId(latest.id);
                  } catch (e: any) {
                    setErr(e?.message ?? "Could not create Week 1.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Creating…" : "Create Week 1"}
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={async () => {
                  setErr(null);
                  setBusy(true);
                  try {
                    await initRithvikPresetWeek6();
                  } catch (e: any) {
                    setErr(e?.message ?? "Could not initialize preset.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Rithvik Preset (Week 6)
              </button>
            </div>
          </div>
        </>
      )}

      {selected ? <WeekView week={selected} /> : <div>No week plan found.</div>}

      {/* Adaptive summary */}
      {selected?.adaptations && selected.adaptations.length > 0 && (
        <div style={{ margin: "12px 0", padding: "10px 12px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-glass)", borderRadius: "var(--radius-md)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>This week adjusted for</div>
          {selected.adaptations.map((note, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>
              <span style={{ color: "var(--accent-blue)", flexShrink: 0 }}>{"•"}</span>
              {note}
            </div>
          ))}
        </div>
      )}

      {selected && !selected.isLocked && (
        <>
          <hr />
          <div style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid var(--border-glass)",
            borderRadius: "var(--radius-md)",
            padding: "12px 14px"
          }}>
            <h3 style={{ marginBottom: 10 }}>End-of-week notes</h3>

            <div className="row">
              <div className="col">
                {/* Deload suggestion banner */}
                {deloadSuggestion && dismissedDeloadForWeek !== selected?.id && (
                  <div style={{ padding: "10px 12px", marginBottom: 10, borderRadius: "var(--radius-md)", border: "1px solid rgba(249,115,22,0.35)", background: "rgba(249,115,22,0.07)" }}>
                    <div style={{ fontSize: 12, color: "#f97316", fontWeight: 600, marginBottom: 6 }}>Deload suggested</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 8 }}>{deloadSuggestion.reason}</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="button" style={{ padding: "4px 10px", fontSize: 11, fontWeight: 700, background: "rgba(249,115,22,0.15)", border: "1.5px solid #f97316", color: "#f97316", borderRadius: 20, cursor: "pointer" }}
                        onClick={async () => {
                          if (!selected) return;
                          const existing = (selected.noteChips ?? []).filter(c => c.type !== "deload");
                          await db.weekPlans.update(selected.id, { noteChips: [...existing, { type: "deload" }] });
      db.weekPlans.get(selected.id).then(w => { if (w) syncWeekPlanToSupabase(w); });
                        }}>
                        Add Deload
                      </button>
                      <button type="button" style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, background: "transparent", border: "1.5px solid var(--border-glass-hover)", color: "var(--text-muted)", borderRadius: 20, cursor: "pointer" }}
                        onClick={() => setDismissedDeloadForWeek(selected?.id ?? null)}>
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Quick context (next week)</div>
                <NoteChips
                  chips={selected.noteChips ?? []}
                  onChange={async (chips) => {
                    const prevChips = selected.noteChips ?? [];
                    const oldInjChip = prevChips.find((c) => c.type === "injury");
                    const newInjChip = chips.find((c) => c.type === "injury");
                    await db.weekPlans.update(selected.id, { noteChips: chips });
      db.weekPlans.get(selected.id).then(w => { if (w) syncWeekPlanToSupabase(w); });
                    if (newInjChip && activeUserId) {
                      await upsertInjuryFromChip(newInjChip, activeUserId);
                    } else if (!newInjChip && oldInjChip?.area && activeUserId) {
                      await db.activeInjuries
                        .where("userId").equals(activeUserId)
                        .filter((inj) => inj.area.toLowerCase() === (oldInjChip.area ?? "").toLowerCase())
                        .delete();
                    }
                  }}
                  disabled={!!selected.isLocked}
                />
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, marginTop: 8 }}>Notes (used to generate next week)</div>
                <textarea
                  ref={notesRef}
                  style={{ minHeight: 80 }}
                  placeholder='"3 days next week", "Travel Tue–Thu", "Back sore—go lighter"'
                  value={selected.notes ?? ""}
                  onChange={async (e) => {
                    await db.weekPlans.update(selected.id, { notes: e.target.value });
      db.weekPlans.get(selected.id).then(w => { if (w) syncWeekPlanToSupabase(w); });
                  }}
                />
                {(selected.noteChips ?? []).length > 0 && (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6, fontStyle: "italic" }}>
                    Next week: {buildChipPreview(selected.noteChips ?? [])}
                  </div>
                )}

                {/* Injury check-in prompts */}
                {injuriesToCheckIn.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    {injuriesToCheckIn.map((inj) => (
                      <div key={inj.id} style={{ marginBottom: 8, padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.06)" }}>
                        <div style={{ fontSize: 12, color: "#ef4444", fontWeight: 600, marginBottom: 6 }}>
                          How is your {inj.area}?
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {[
                            { label: "Still painful", value: "still_painful" as const },
                            { label: "Getting better", value: "getting_better" as const },
                            { label: "Fully recovered", value: "resolved" as const },
                          ].map((opt) => (
                            <button key={opt.value} type="button"
                              style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, borderRadius: 20, border: "1.5px solid var(--border-glass-hover)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }}
                              onClick={() => updateInjuryStatus(inj.id, opt.value)}>
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ width: 160, flexShrink: 0 }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Next week days</div>
                <select
                  value={selected.nextWeekDays ?? ""}
                  onChange={async (e) => {
                    const raw = e.target.value;
                    if (raw === "") {
                      const current = await db.weekPlans.get(selected.id);
                      if (!current) return;
                      const updated = { ...current };
                      delete updated.nextWeekDays;
                      await db.weekPlans.put(updated);
                      return;
                    }
                    const v = Number(raw);
                    if (v === 3 || v === 4 || v === 5) {
                      await db.weekPlans.update(selected.id, { nextWeekDays: v });
      db.weekPlans.get(selected.id).then(w => { if (w) syncWeekPlanToSupabase(w); });
                    }
                  }}
                >
                  <option value="">Auto (from notes)</option>
                  <option value="3">3 days</option>
                  <option value="4">4 days</option>
                  <option value="5">5 days</option>
                </select>
              </div>
            </div>

            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
              Completion: {completion.done}/{completion.total} days {completion.missed > 0 ? `· missed ${completion.missed}` : ""}
            </div>

            {endEarlyMode && (
              <div style={{
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: "var(--radius-md)",
                border: "1px solid rgba(234, 179, 8, 0.25)",
                background: "rgba(234, 179, 8, 0.06)",
                fontSize: 12,
                color: "var(--text-secondary)"
              }}>
                Update notes then confirm to lock this week and generate next.
                <div className="row" style={{ marginTop: 10, gap: 8 }}>
                  <button
                    disabled={busy}
                    onClick={async () => {
                      if (!selected) return;
                      setErr(null);
                      setBusy(true);
                      try {
                        const missed = selected.days.filter(d => !d.isComplete).length;
                        const stamp = `Ended early: missed ${missed} workout(s).`;
                        const mergedNotes =
                          (selected.notes?.trim() ? `${selected.notes.trim()}\n` : "") + stamp;
                        await db.weekPlans.update(selected.id, { notes: mergedNotes, isLocked: true });
      db.weekPlans.get(selected.id).then(w => { if (w) syncWeekPlanToSupabase(w); });
                        await generateNextWeek();
                        const latest = await getLatestWeek();
                        if (latest) { setSelectedWeekId(latest.id); syncWeekPlanToSupabase(latest); }
                        setEndEarlyMode(false);
                      } catch (e: any) {
                        setErr(e?.message ?? "Could not end week early.");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Confirm + Generate
                  </button>
                  <button className="secondary" disabled={busy} onClick={() => setEndEarlyMode(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <hr />

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {generationContext.goalMode} · target {generationContext.targetLabel} · {generationContext.daysPerWeek} days/wk · cardio {generationContext.cardioSessions}×, {generationContext.cardioMinutesLabel} min{selected?.isDeload ? " · deload week" : ""}
        </div>

        <div className="row" style={{ gap: 8 }}>
          <button
            disabled={busy || !selected || !!selected?.isLocked || !completion.allComplete}
            onClick={async () => {
              setErr(null);
              setBusy(true);
              try {
                await generateNextWeek();
                const latest = await getLatestWeek();
                if (latest) { setSelectedWeekId(latest.id); syncWeekPlanToSupabase(latest); }
              } catch (e: any) {
                setErr(e?.message ?? "Could not generate next week.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Generating…" : "Generate Next Week"}
          </button>

          <button
            className="secondary"
            disabled={busy || !selected || !!selected?.isLocked}
            onClick={() => {
              setEndEarlyMode(true);
              setTimeout(() => notesRef.current?.focus(), 0);
            }}
          >
            End Week Early
          </button>
        </div>

        {!completion.allComplete && selected && !selected.isLocked && (
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Finish all days or use "End Week Early" to generate next week.
          </div>
        )}

        {err && (
          <div className="tag tag--red" style={{ padding: "6px 10px", fontSize: 12 }}>{err}</div>
        )}
      </div>
    </div>
  );
}
