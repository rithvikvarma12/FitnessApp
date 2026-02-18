import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { db } from "../db/db";
import type { Unit } from "../services/units";
import { toDisplay, fromDisplay } from "../services/units";
import { useLiveQuery } from "dexie-react-hooks";
import type { WeekPlan, WorkoutDay, PlannedExercise, SetEntry } from "../db/types";

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
      days: week.days.map(d => (d.id === dayId ? { ...d, isComplete: val } : d))
    };
    updateWeek(updated);
  }

  function updateSet(dayId: string, exId: string, setNumber: number, patch: Partial<SetEntry>) {
    const updated: WeekPlan = {
      ...week,
      days: week.days.map(d => {
        if (d.id !== dayId) return d;
        return {
          ...d,
          exercises: d.exercises.map(ex => {
            if (ex.id !== exId) return ex;
            return {
              ...ex,
              sets: ex.sets.map(s => (s.setNumber === setNumber ? { ...s, ...patch } : s))
            };
          })
        };
      })
    };
    updateWeek(updated);
  }

  function updatePlannedWeight(dayId: string, exId: string, weightKg?: number) {
    const updated: WeekPlan = {
      ...week,
      days: week.days.map(d => {
        if (d.id !== dayId) return d;
        return {
          ...d,
          exercises: d.exercises.map(ex => {
            if (ex.id !== exId) return ex;
            // Update planned weight AND default actual weight fields only if empty
            return {
              ...ex,
              plannedWeightKg: weightKg,
              sets: ex.sets.map(s => ({
                ...s,
                plannedWeightKg: weightKg,
                actualWeightKg: s.actualWeightKg ?? weightKg
              }))
            };
          })
        };
      })
    };
    updateWeek(updated);
  }

  const completion = useMemo(() => {
    const done = week.days.filter(d => d.isComplete).length;
    return `${done}/${week.days.length}`;
  }, [week.days]);

  return (
    <div className="list">
      <div className="pill">
        Week {week.weekNumber} • Start {week.startDateISO} • Days complete: {completion}
      </div>

      {daysSorted.map(day => (
        <DayCard
          key={day.id}
          day={day}
          unit={unit}
          isLocked={week.isLocked}
          onDayComplete={setDayComplete}
          onSetUpdate={updateSet}
          onPlannedWeightUpdate={updatePlannedWeight}
        />
      ))}
    </div>
  );
}

function DayCard({
  day,
  unit,
  isLocked,
  onDayComplete,
  onSetUpdate,
  onPlannedWeightUpdate
}: {
  day: WorkoutDay;
  unit: Unit;
  isLocked: boolean;
  onDayComplete: (dayId: string, val: boolean) => void;
  onSetUpdate: (dayId: string, exId: string, setNumber: number, patch: Partial<SetEntry>) => void;
  onPlannedWeightUpdate: (dayId: string, exId: string, weightKg?: number) => void;
}) {
  const dateLabel = format(parseISO(day.dateISO), "EEE, MMM d");

  return (
    <div className="card">
      <div className="row" style={{ alignItems: "center" }}>
        <div className="col">
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

      <hr />

      <div className="list">
        {day.exercises.map(ex => (
          <ExerciseCard
            key={ex.id}
            dayId={day.id}
            ex={ex}
            unit={unit}
            isLocked={isLocked}
            onSetUpdate={onSetUpdate}
            onPlannedWeightUpdate={onPlannedWeightUpdate}
          />
        ))}
      </div>
    </div>
  );
}

function ExerciseCard({
  dayId,
  ex,
  unit,
  isLocked,
  onSetUpdate,
  onPlannedWeightUpdate
}: {
  dayId: string;
  ex: PlannedExercise;
  unit: Unit;
  isLocked: boolean;
  onSetUpdate: (dayId: string, exId: string, setNumber: number, patch: Partial<SetEntry>) => void;
  onPlannedWeightUpdate: (dayId: string, exId: string, weightKg?: number) => void;
}) {
  return (
    <div className="card" style={{ background: "#0b1220" }}>
      <div className="row" style={{ alignItems: "center" }}>
        <div className="col">
          <div style={{ fontWeight: 700 }}>{ex.name}</div>
          <div className="small muted">
            {ex.plannedSets} sets • reps {ex.repRange.min}-{ex.repRange.max}
          </div>
        </div>

        <div style={{ width: 160 }}>
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

              onPlannedWeightUpdate(dayId, ex.id, kg);
            }}
          />
          <div className="small muted">planned weight</div>
        </div>
      </div>

      <hr />

      <div className="setRow small muted" style={{ marginBottom: 6 }}>
        <div>Set</div>
        <div>Reps</div>
        <div>{unit.toUpperCase()}</div>
        <div>Done</div>
      </div>

      <div className="list" style={{ gap: 8 }}>
        {ex.sets.map(s => (
          <div key={s.setNumber} className="setRow">
            <div className="pill" style={{ justifyContent: "center" }}>{s.setNumber}</div>

            <input
              disabled={isLocked}
              inputMode="numeric"
              placeholder={`${s.plannedRepsMin}-${s.plannedRepsMax}`}
              value={s.actualReps ?? ""}
              onChange={(e) => {
                const v = e.target.value.trim();
                const num = v === "" ? undefined : Number(v);
                onSetUpdate(dayId, ex.id, s.setNumber, { actualReps: Number.isFinite(num as number) ? (num as number) : undefined });
              }}
            />

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

            <input
              disabled={isLocked}
              type="checkbox"
              checked={s.completed}
              onChange={(e) => onSetUpdate(dayId, ex.id, s.setNumber, { completed: e.target.checked })}
              style={{ width: 20, height: 20 }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}