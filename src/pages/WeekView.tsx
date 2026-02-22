import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { db } from "../db/db";
import type { Unit } from "../services/units";
import { toDisplay, fromDisplay, lbToKg } from "../services/units";
import { useLiveQuery } from "dexie-react-hooks";
import type { WeekPlan, WorkoutDay, PlannedExercise, SetEntry } from "../db/types";

function lastNonEmptyActualWeightKg(ex: PlannedExercise): number | undefined {
  for (let i = ex.sets.length - 1; i >= 0; i -= 1) {
    const w = ex.sets[i].actualWeightKg;
    if (typeof w === "number") return w;
  }
  return undefined;
}

function roundToNearest(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function rampIncrementKg(unit: Unit): number {
  const raw = unit === "kg" ? 2.5 : lbToKg(5);
  return roundToNearest(raw, 0.5);
}

export default function WeekView({ week }: { week: WeekPlan }) {
  const unit = useLiveQuery(async () => {
    const s = await db.settings.get("unit");
    return (s?.value as Unit) ?? "kg";
  }, [], "kg" as Unit);

  const daysSorted = useMemo(
    () => week.days.slice().sort((a, b) => a.dateISO.localeCompare(b.dateISO)),
    [week.days]
  );

  async function updateWeek(updated: WeekPlan) {
    await db.weekPlans.update(week.id, updated);
  }

  function setDayComplete(dayId: string, val: boolean) {
    const updated: WeekPlan = {
      ...week,
      days: week.days.map((d) => (d.id === dayId ? { ...d, isComplete: val } : d))
    };
    void updateWeek(updated);
  }

  function updateSet(dayId: string, exId: string, setNumber: number, patch: Partial<SetEntry>) {
    const updated: WeekPlan = {
      ...week,
      days: week.days.map((d) => {
        if (d.id !== dayId) return d;
        return {
          ...d,
          exercises: d.exercises.map((ex) => {
            if (ex.id !== exId) return ex;
            return {
              ...ex,
              sets: ex.sets.map((s) => (s.setNumber === setNumber ? { ...s, ...patch } : s))
            };
          })
        };
      })
    };
    void updateWeek(updated);
  }

  // Base planned weight is separate from per-set planned weights. Quick actions copy it into sets.
  function updateExerciseBasePlannedWeight(dayId: string, exId: string, weightKg?: number) {
    const updated: WeekPlan = {
      ...week,
      days: week.days.map((d) => {
        if (d.id !== dayId) return d;
        return {
          ...d,
          exercises: d.exercises.map((ex) => (
            ex.id !== exId
              ? ex
              : {
                  ...ex,
                  plannedWeightKg: weightKg
                }
          ))
        };
      })
    };
    void updateWeek(updated);
  }

  function applyBasePlannedWeightToAllSets(dayId: string, exId: string) {
    const updated: WeekPlan = {
      ...week,
      days: week.days.map((d) => {
        if (d.id !== dayId) return d;
        return {
          ...d,
          exercises: d.exercises.map((ex) => {
            if (ex.id !== exId) return ex;
            return {
              ...ex,
              sets: ex.sets.map((s) => ({ ...s, plannedWeightKg: ex.plannedWeightKg }))
            };
          })
        };
      })
    };
    void updateWeek(updated);
  }

  function applyRampPlannedWeights(dayId: string, exId: string) {
    const incrementKg = rampIncrementKg(unit);
    const updated: WeekPlan = {
      ...week,
      days: week.days.map((d) => {
        if (d.id !== dayId) return d;
        return {
          ...d,
          exercises: d.exercises.map((ex) => {
            if (ex.id !== exId || typeof ex.plannedWeightKg !== "number") return ex;
            const baseKg = ex.plannedWeightKg;
            const splitIndex = Math.ceil(ex.sets.length / 2);
            return {
              ...ex,
              sets: ex.sets.map((s, idx) => ({
                ...s,
                plannedWeightKg:
                  idx < splitIndex
                    ? baseKg
                    : roundToNearest(baseKg + incrementKg, 0.5)
              }))
            };
          })
        };
      })
    };
    void updateWeek(updated);
  }

  function setPlanToLastActual(dayId: string, exId: string) {
    const updated: WeekPlan = {
      ...week,
      days: week.days.map((d) => {
        if (d.id !== dayId) return d;
        return {
          ...d,
          exercises: d.exercises.map((ex) => {
            if (ex.id !== exId) return ex;
            const lastActual = lastNonEmptyActualWeightKg(ex);
            if (typeof lastActual !== "number") return ex;
            return {
              ...ex,
              plannedWeightKg: lastActual,
              sets: ex.sets.map((s) => ({ ...s, plannedWeightKg: lastActual }))
            };
          })
        };
      })
    };
    void updateWeek(updated);
  }

  const completion = useMemo(() => {
    const done = week.days.filter((d) => d.isComplete).length;
    return `${done}/${week.days.length}`;
  }, [week.days]);

  return (
    <div className="list">
      <div className="pill">
        Week {week.weekNumber} • Start {week.startDateISO} • Days complete: {completion}
      </div>

      {daysSorted.map((day) => (
        <DayCard
          key={day.id}
          defaultExpanded={day.id === daysSorted[0]?.id}
          day={day}
          unit={unit}
          isLocked={week.isLocked}
          onDayComplete={setDayComplete}
          onSetUpdate={updateSet}
          onExerciseBasePlanUpdate={updateExerciseBasePlannedWeight}
          onApplyBaseToAllSets={applyBasePlannedWeightToAllSets}
          onRampPlanFromBase={applyRampPlannedWeights}
          onSetPlanToLastActual={setPlanToLastActual}
        />
      ))}
    </div>
  );
}

function DayCard({
  defaultExpanded,
  day,
  unit,
  isLocked,
  onDayComplete,
  onSetUpdate,
  onExerciseBasePlanUpdate,
  onApplyBaseToAllSets,
  onRampPlanFromBase,
  onSetPlanToLastActual
}: {
  defaultExpanded: boolean;
  day: WorkoutDay;
  unit: Unit;
  isLocked: boolean;
  onDayComplete: (dayId: string, val: boolean) => void;
  onSetUpdate: (dayId: string, exId: string, setNumber: number, patch: Partial<SetEntry>) => void;
  onExerciseBasePlanUpdate: (dayId: string, exId: string, weightKg?: number) => void;
  onApplyBaseToAllSets: (dayId: string, exId: string) => void;
  onRampPlanFromBase: (dayId: string, exId: string) => void;
  onSetPlanToLastActual: (dayId: string, exId: string) => void;
}) {
  const dateLabel = format(parseISO(day.dateISO), "EEE, MMM d");
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="card">
      <div className="dayCardHeader">
        <button
          type="button"
          className="dayToggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse day" : "Expand day"}
        >
          <span className="dayToggleChevron" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
        </button>

        <div className="dayHeaderMain">
          <h3>{day.title}</h3>
          <div className="small muted">{dateLabel}</div>
        </div>

        <label className="pill" style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={day.isComplete}
            onChange={(e) => onDayComplete(day.id, e.target.checked)}
            disabled={isLocked}
            style={{ marginRight: 8 }}
          />
          Complete
        </label>
      </div>

      {expanded && (
        <>
          <hr />
          <div className="list">
            {day.exercises.map((ex) => (
              <ExerciseCard
                key={ex.id}
                dayId={day.id}
                ex={ex}
                unit={unit}
                isLocked={isLocked}
                onSetUpdate={onSetUpdate}
                onExerciseBasePlanUpdate={onExerciseBasePlanUpdate}
                onApplyBaseToAllSets={onApplyBaseToAllSets}
                onRampPlanFromBase={onRampPlanFromBase}
                onSetPlanToLastActual={onSetPlanToLastActual}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ExerciseCard({
  dayId,
  ex,
  unit,
  isLocked,
  onSetUpdate,
  onExerciseBasePlanUpdate,
  onApplyBaseToAllSets,
  onRampPlanFromBase,
  onSetPlanToLastActual
}: {
  dayId: string;
  ex: PlannedExercise;
  unit: Unit;
  isLocked: boolean;
  onSetUpdate: (dayId: string, exId: string, setNumber: number, patch: Partial<SetEntry>) => void;
  onExerciseBasePlanUpdate: (dayId: string, exId: string, weightKg?: number) => void;
  onApplyBaseToAllSets: (dayId: string, exId: string) => void;
  onRampPlanFromBase: (dayId: string, exId: string) => void;
  onSetPlanToLastActual: (dayId: string, exId: string) => void;
}) {
  const lastActualWeightKg = lastNonEmptyActualWeightKg(ex);

  return (
    <div className="card workoutExerciseCard" style={{ background: "#0b1220" }}>
      <div className="row exerciseHeaderRow" style={{ alignItems: "center" }}>
        <div className="col">
          <div style={{ fontWeight: 700 }}>{ex.name}</div>
          <div className="small muted">
            {ex.plannedSets} sets • reps {ex.repRange.min}-{ex.repRange.max}
          </div>
          <div className="row exerciseActionRow" style={{ gap: 8, marginTop: 8 }}>
            <button
              className="secondary"
              disabled={isLocked || typeof ex.plannedWeightKg !== "number"}
              onClick={() => onApplyBaseToAllSets(dayId, ex.id)}
              style={{ padding: "6px 10px", fontSize: 12 }}
            >
              Apply base to all
            </button>
            <button
              className="secondary"
              disabled={isLocked || typeof ex.plannedWeightKg !== "number"}
              onClick={() => onRampPlanFromBase(dayId, ex.id)}
              style={{ padding: "6px 10px", fontSize: 12 }}
            >
              Ramp
            </button>
            <button
              className="secondary"
              disabled={isLocked || typeof lastActualWeightKg !== "number"}
              onClick={() => onSetPlanToLastActual(dayId, ex.id)}
              style={{ padding: "6px 10px", fontSize: 12 }}
            >
              Set plan = last actual
            </button>
          </div>
        </div>

        <div className="exerciseBaseField">
          <input
            disabled={isLocked}
            inputMode="decimal"
            placeholder={`Planned ${unit}`}
            value={typeof ex.plannedWeightKg === "number" ? toDisplay(ex.plannedWeightKg, unit) : ""}
            onChange={(e) => {
              const v = e.target.value.trim();
              const num = v === "" ? undefined : Number(v);
              const kg =
                num === undefined || !Number.isFinite(num)
                  ? undefined
                  : fromDisplay(num, unit);

              onExerciseBasePlanUpdate(dayId, ex.id, kg);
            }}
          />
          <div className="small muted">Base (optional)</div>
        </div>
      </div>

      <hr />

      <div className="setRow setRowPlan setHeaderRow small muted" style={{ marginBottom: 6 }}>
        <div>Set</div>
        <div>Planned reps</div>
        <div>Planned weight</div>
        <div>Actual reps</div>
        <div>Actual weight</div>
        <div>Done</div>
      </div>

      <div className="list" style={{ gap: 8 }}>
        {ex.sets.map((s) => (
          <div key={s.setNumber} className="setRow setRowPlan setDataRow">
            <div className="setField setFieldSet">
              <div className="setFieldLabel">Set</div>
              <div className="pill" style={{ justifyContent: "center" }}>{s.setNumber}</div>
            </div>

            <div className="setField">
              <div className="setFieldLabel">Planned reps</div>
              <div className="pill" style={{ justifyContent: "center" }}>
                {s.plannedRepsMin}-{s.plannedRepsMax}
              </div>
            </div>

            <div className="setField">
              <div className="setFieldLabel">Planned weight</div>
              <input
                disabled={isLocked}
                inputMode="decimal"
                placeholder={typeof ex.plannedWeightKg === "number" ? String(toDisplay(ex.plannedWeightKg, unit)) : ""}
                value={typeof s.plannedWeightKg === "number" ? toDisplay(s.plannedWeightKg, unit) : ""}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  const num = v === "" ? undefined : Number(v);
                  const kg =
                    num === undefined || !Number.isFinite(num)
                      ? undefined
                      : fromDisplay(num, unit);

                  onSetUpdate(dayId, ex.id, s.setNumber, { plannedWeightKg: kg });
                }}
              />
            </div>

            <div className="setField">
              <div className="setFieldLabel">Actual reps</div>
              <input
                disabled={isLocked}
                inputMode="numeric"
                placeholder={`${s.plannedRepsMin}-${s.plannedRepsMax}`}
                value={s.actualReps ?? ""}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  const num = v === "" ? undefined : Number(v);
                  onSetUpdate(dayId, ex.id, s.setNumber, {
                    actualReps: Number.isFinite(num as number) ? (num as number) : undefined
                  });
                }}
              />
            </div>

            <div className="setField">
              <div className="setFieldLabel">Actual weight</div>
              <input
                disabled={isLocked}
                inputMode="decimal"
                placeholder={s.plannedWeightKg !== undefined ? String(toDisplay(s.plannedWeightKg, unit)) : ""}
                value={typeof s.actualWeightKg === "number" ? toDisplay(s.actualWeightKg, unit) : ""}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  const num = v === "" ? undefined : Number(v);
                  const kg =
                    num === undefined || !Number.isFinite(num)
                      ? undefined
                      : fromDisplay(num, unit);

                  onSetUpdate(dayId, ex.id, s.setNumber, { actualWeightKg: kg });
                }}
              />
            </div>

            <div className="setField setFieldDone">
              <div className="setFieldLabel">Done</div>
              <input
                disabled={isLocked}
                type="checkbox"
                checked={s.completed}
                onChange={(e) => onSetUpdate(dayId, ex.id, s.setNumber, { completed: e.target.checked })}
                style={{ width: 20, height: 20 }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
