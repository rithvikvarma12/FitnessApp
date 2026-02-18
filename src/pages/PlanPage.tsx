import { useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import type { WeekPlan } from "../db/types";
import type { Unit } from "../services/units";
import { generateNextWeek, getLatestWeek } from "../services/planGenerator";
import WeekView from "./WeekView";
import { initRithvikPresetWeek6 } from "../services/presets";

export default function PlanPage() {
  const weeks = useLiveQuery(
    async () => db.weekPlans.orderBy("weekNumber").reverse().toArray(),
    [],
    [] as WeekPlan[]
  );

  const unit = useLiveQuery(async () => {
    const s = await db.settings.get("unit");
    return (s?.value as Unit) ?? "kg";
  }, [], "kg" as Unit);

  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
              onClick={() => db.settings.put({ key: "unit", value: "kg" })}
            >
              kg
            </button>
            <button
              className={unit === "lb" ? "" : "secondary"}
              onClick={() => db.settings.put({ key: "unit", value: "lb" })}
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

      {/* QUICK START (ONLY IF NO WEEKS EXIST YET) */}
      {isEmpty && (
        <>
          <div className="card" style={{ background: "#0b1220" }}>
            <h3>Quick Start</h3>
            <div className="small muted">Initialize your personal preset and start at Week 6.</div>
            <hr />
            <button
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
                    const v = e.target.value === "" ? undefined : Number(e.target.value);
                    await db.weekPlans.update(selected.id, { nextWeekDays: v });
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