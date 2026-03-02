import { useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getActiveUserId } from "../db/db";
import type { WeekPlan } from "../db/types";
import type { Unit } from "../services/units";
import { toDisplay } from "../services/units";
import { createFirstWeekIfMissing, generateNextWeek, getLatestWeek } from "../services/planGenerator";
import { format, parseISO } from "date-fns";
import WeekView from "./WeekView";
import { initRithvikPresetWeek6 } from "../services/presets";
import GoalReachedBanner from "../components/GoalReachedBanner";
import { weeklyTrendFromWindow } from "../services/stats";
import { deriveAutoCardio } from "../services/cardio";

export default function PlanPage() {
  const activeUserId = useLiveQuery(async () => getActiveUserId(), [], "");

  const weeks = useLiveQuery(
    async () => {
      if (!activeUserId) return [];
      const rows = await db.weekPlans.where("userId").equals(activeUserId).toArray();
      return rows.sort((a, b) => b.weekNumber - a.weekNumber);
    },
    [activeUserId],
    [] as WeekPlan[]
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

  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const setUnitForActiveProfile = async (nextUnit: Unit) => {
    await db.settings.put({ key: "unit", value: nextUnit });
    if (activeUserId) {
      await db.userProfiles.update(activeUserId, { unit: nextUnit });
    }
  };

  // v0.3.2 UI: end-week-early flow
  const [endEarlyMode, setEndEarlyMode] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);

  const isEmpty = (weeks?.length ?? 0) === 0;

  const selected = useMemo(() => {
    if (!weeks || weeks.length === 0) return undefined;
    return weeks.find(w => w.id === selectedWeekId) ?? weeks[0];
  }, [weeks, selectedWeekId]);

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
          : `${trendKgPerWeek >= 0 ? "+" : "-"}${Math.abs(toDisplay(trendKgPerWeek, unit)).toFixed(2)} ${unit}/week`
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

  return (
    <div className="card">
      <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
        <div className="col">
          <h2>Weekly Plan</h2>
          <div className="small muted">
            Mark days complete to unlock normal generation. If you miss a day, end the week early.
          </div>
        </div>

        <div className="row" style={{ alignItems: "center", gap: 16 }}>
          {/* UNIT TOGGLE */}
          <div className="pill" style={{ display: "flex", gap: 8 }}>
            <button
              className={unit === "kg" ? "" : "secondary"}
              onClick={() => void setUnitForActiveProfile("kg")}
            >
              kg
            </button>
            <button
              className={unit === "lb" ? "" : "secondary"}
              onClick={() => void setUnitForActiveProfile("lb")}
            >
              lb
            </button>
          </div>

          {/* WEEK SELECTOR */}
          <div style={{ minWidth: 220 }}>
            <select
              value={selected?.id ?? ""}
              onChange={(e) => {
                setSelectedWeekId(e.target.value);
                setEndEarlyMode(false);
              }}
              disabled={!weeks || weeks.length === 0}
            >
              {(weeks ?? [])
                .slice()
                .sort((a, b) => b.weekNumber - a.weekNumber)
                .map(w => (
                  <option key={w.id} value={w.id}>
                    Week {w.weekNumber} {w.isLocked ? "(locked)" : ""}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>

      <hr />

      <GoalReachedBanner userId={activeUserId} unit={unit} />

      <div className="row" style={{ gap: 8, marginTop: 10, marginBottom: 10 }}>
        <span className="pill">Latest: {progressSummary.latestLabel}</span>
        <span className="pill">Target: {progressSummary.targetLabel}</span>
        <span className="pill">Remaining: {progressSummary.deltaLabel}</span>
        <span className="pill">Trend (14d): {progressSummary.trendLabel}</span>
      </div>

      {selected && cardioSummary && (
        <>
          <div className="card" style={{ background: "#0b1220" }}>
            <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h3>Cardio</h3>
                <div className="small muted">
                  Summary from this week's assigned cardio blocks.
                </div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <span className="pill">{cardioSummary.modalityLabel}</span>
                <span className="pill">
                  {cardioSummary.sessionsPerWeek}x / week
                </span>
                <span className="pill">
                  {cardioSummary.minuteLabel}
                </span>
                <span className="pill">
                  {cardioSummary.intensityLabel}
                </span>
              </div>
            </div>

            <hr />

            <div className="row" style={{ alignItems: "center", gap: 12 }}>
              <div className="small muted">Suggested schedule</div>
              <div style={{ fontWeight: 700 }}>{cardioSummary.suggestedSchedule}</div>
            </div>
          </div>
          <hr />
        </>
      )}

      {/* QUICK START (ONLY IF NO WEEKS EXIST YET) */}
      {isEmpty && (
        <>
          <div className="card" style={{ background: "#0b1220" }}>
            <h3>Quick Start</h3>
            <div className="small muted">If no plan exists yet, create Week 1 or initialize the Rithvik preset.</div>
            <hr />
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
                Create Week 1
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
              Initialize Rithvik Preset (Start Week 6)
            </button>
            </div>
          </div>
          <hr />
        </>
      )}

      {selected ? <WeekView week={selected} /> : <div>No week plan found.</div>}

      {selected && !selected.isLocked && (
        <>
          <hr />
          <div className="card" style={{ background: "#0b1220" }}>
            <h3>End-of-week notes (used to generate next week)</h3>

            <div className="row">
              <div className="col">
                <div className="small muted">Notes</div>
                <textarea
                  ref={notesRef}
                  style={{
                    width: "100%",
                    minHeight: 90,
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid #334155",
                    background: "#0b1220",
                    color: "#e5e7eb"
                  }}
                  placeholder='Examples: "Only can go 3 days next week", "Travel Tue-Thu", "Back sore—go lighter"'
                  value={selected.notes ?? ""}
                  onChange={async (e) => {
                    await db.weekPlans.update(selected.id, { notes: e.target.value });
                  }}
                />
              </div>

              <div style={{ width: 180 }}>
                <div className="small muted">Next week days</div>
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
                    }
                  }}
                >
                  <option value="">Auto (from notes)</option>
                  <option value="3">3 days</option>
                  <option value="4">4 days</option>
                  <option value="5">5 days</option>
                </select>

                <div className="small muted" style={{ marginTop: 6 }}>
                  If set, this overrides notes.
                </div>
              </div>
            </div>

            <div className="small muted" style={{ marginTop: 10 }}>
              Current week completion: {completion.done}/{completion.total} (missed {completion.missed})
            </div>

            {endEarlyMode && (
              <div className="pill" style={{ marginTop: 12, borderColor: "#f59e0b" }}>
                End week early mode: update your notes (and optionally set Next week days), then click Confirm.
                <div className="row" style={{ marginTop: 10, gap: 10 }}>
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

                        await db.weekPlans.update(selected.id, {
                          notes: mergedNotes,
                          isLocked: true
                        });

                        await generateNextWeek();
                        const latest = await getLatestWeek();
                        if (latest) setSelectedWeekId(latest.id);

                        setEndEarlyMode(false);
                      } catch (e: any) {
                        setErr(e?.message ?? "Could not end week early.");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Confirm End Week + Generate
                  </button>

                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => setEndEarlyMode(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <hr />

      <div className="row" style={{ alignItems: "center", gap: 12 }}>
        <div className="small muted" style={{ width: "100%" }}>
          Generating using: {generationContext.goalMode} • target {generationContext.targetLabel} • {generationContext.daysPerWeek} days/week • cardio {generationContext.cardioSessions}x/week, {generationContext.cardioMinutesLabel} min/session
        </div>

        {/* Normal generate: locked until all days complete */}
        <button
          disabled={busy || !selected || !!selected?.isLocked || !completion.allComplete}
          onClick={async () => {
            setErr(null);
            setBusy(true);
            try {
              await generateNextWeek();
              const latest = await getLatestWeek();
              if (latest) setSelectedWeekId(latest.id);
            } catch (e: any) {
              setErr(e?.message ?? "Could not generate next week.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Generate Next Week
        </button>

        {/* End early: always available if week exists and not locked */}
        <button
          className="secondary"
          disabled={busy || !selected || !!selected?.isLocked}
          onClick={() => {
            setEndEarlyMode(true);
            // focus notes so you can type immediately
            setTimeout(() => notesRef.current?.focus(), 0);
          }}
        >
          End Week Early + Generate
        </button>

        {!completion.allComplete && selected && !selected.isLocked && (
          <div className="pill">
            Finish all days OR use “End Week Early + Generate”
          </div>
        )}

        {err && (
          <div className="pill" style={{ borderColor: "#dc2626" }}>
            {err}
          </div>
        )}
      </div>
    </div>
  );
}
