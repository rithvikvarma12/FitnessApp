import { useRef } from "react";
import type { PlannedExercise, SetEntry } from "../db/types";
import type { Unit } from "../services/units";
import { toDisplayRounded, fromDisplay, inferEquipmentFromName } from "../services/units";
import RestTimer from "./RestTimer";
import { Haptics, ImpactStyle } from '@capacitor/haptics';

function lastNonEmptyActualWeightKg(ex: PlannedExercise): number | undefined {
  for (let i = ex.sets.length - 1; i >= 0; i -= 1) {
    const w = ex.sets[i].actualWeightKg;
    if (typeof w === "number") return w;
  }
  return undefined;
}

interface ExerciseCardProps {
  dayId: string;
  ex: PlannedExercise;
  dayExercises: PlannedExercise[];
  unit: Unit;
  isLocked: boolean;
  onSetUpdate: (dayId: string, exId: string, setNumber: number, patch: Partial<SetEntry>) => void;
  onExerciseBasePlanUpdate: (dayId: string, exId: string, weightKg?: number) => void;
  onApplyBaseToAllSets: (dayId: string, exId: string) => void;
  onRampPlanFromBase: (dayId: string, exId: string) => void;
  onSetPlanToLastActual: (dayId: string, exId: string) => void;
  onExerciseInfoOpen: (exerciseName: string) => void;
  onExerciseAlternativesOpen: (dayId: string, ex: PlannedExercise, dayExercises: PlannedExercise[]) => void;
  timerExerciseName: string | null;
  timerRemaining: number;
  timerTotal: number;
  onRestTimerDismiss: () => void;
}

export default function ExerciseCard({
  dayId,
  ex,
  unit,
  isLocked,
  onSetUpdate,
  onExerciseBasePlanUpdate,
  onApplyBaseToAllSets,
  onRampPlanFromBase,
  onSetPlanToLastActual,
  onExerciseInfoOpen,
  onExerciseAlternativesOpen,
  dayExercises,
  timerExerciseName,
  timerRemaining,
  timerTotal,
  onRestTimerDismiss
}: ExerciseCardProps) {
  const lastActualWeightKg = lastNonEmptyActualWeightKg(ex);
  const equipment = inferEquipmentFromName(ex.name);

  // Override iOS WKWebView's default "scroll focused input above keyboard"
  // behavior with centered scroll. Debounced so rapid focus changes between
  // sets don't cause stacked scroll animations.
  const focusScrollTimer = useRef<number | null>(null);
  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    const target = e.currentTarget;
    if (focusScrollTimer.current !== null) {
      window.clearTimeout(focusScrollTimer.current);
    }
    focusScrollTimer.current = window.setTimeout(() => {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 300);
  };

  return (
    <div className="workoutExerciseCard">
      {/* Exercise header */}
      <div className="row exerciseHeaderRow" style={{ alignItems: "flex-start", gap: 10 }}>
        <div className="col">
          <button
            type="button"
            className="exerciseNameButton"
            onClick={() => onExerciseInfoOpen(ex.name)}
            aria-label={`Open info for ${ex.name}`}
          >
            {ex.name}
          </button>
          <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, marginTop: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {ex.plannedSets} sets · {ex.repRange.min}–{ex.repRange.max} reps
          </div>
          <div className="row exerciseActionRow" style={{ gap: 6, marginTop: 8 }}>
            <button
              className="secondary"
              disabled={isLocked}
              onClick={() => onExerciseAlternativesOpen(dayId, ex, dayExercises)}
              style={{ padding: "5px 9px", fontSize: 11 }}
            >
              Swap
            </button>
            <button
              className="secondary"
              disabled={isLocked || typeof ex.plannedWeightKg !== "number"}
              onClick={() => onApplyBaseToAllSets(dayId, ex.id)}
              style={{ padding: "5px 9px", fontSize: 11 }}
            >
              Apply all
            </button>
            <button
              className="secondary"
              disabled={isLocked || typeof ex.plannedWeightKg !== "number"}
              onClick={() => onRampPlanFromBase(dayId, ex.id)}
              style={{ padding: "5px 9px", fontSize: 11 }}
            >
              Ramp
            </button>
            <button
              className="secondary"
              disabled={isLocked || typeof lastActualWeightKg !== "number"}
              onClick={() => onSetPlanToLastActual(dayId, ex.id)}
              style={{ padding: "5px 9px", fontSize: 11 }}
            >
              = Last actual
            </button>
          </div>
        </div>

        <div className="exerciseBaseField">
          <input
            disabled={isLocked}
            inputMode="decimal"
            placeholder={`Base ${unit}`}
            value={typeof ex.plannedWeightKg === "number" ? toDisplayRounded(ex.plannedWeightKg, unit, equipment) : ""}
            onFocus={handleInputFocus}
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
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.04em" }}>Base wt</div>
        </div>
      </div>

      <hr />

      {/* Set grid header */}
      <div className="set-grid set-grid-header">
        <div>#</div>
        <div>{unit}</div>
        <div>reps</div>
        <div />
      </div>

      {/* Set rows */}
      <div style={{ display: "grid", gap: 4 }}>
        {ex.sets.map((s) => {
          const plannedWtPlaceholder =
            typeof s.plannedWeightKg === "number"
              ? String(toDisplayRounded(s.plannedWeightKg, unit, equipment))
              : typeof ex.plannedWeightKg === "number"
              ? String(toDisplayRounded(ex.plannedWeightKg, unit, equipment))
              : unit;
          return (
            <div key={s.setNumber} className={`set-grid ${s.completed ? "set-row-done" : ""}`}>
              <div className="set-num">{s.setNumber}</div>

              <input
                disabled={isLocked}
                inputMode="decimal"
                placeholder={plannedWtPlaceholder}
                value={typeof s.actualWeightKg === "number" ? toDisplayRounded(s.actualWeightKg, unit, equipment) : ""}
                className={s.completed ? "input-done" : ""}
                onFocus={handleInputFocus}
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
                inputMode="numeric"
                placeholder={`${s.plannedRepsMin}–${s.plannedRepsMax}`}
                value={s.actualReps ?? ""}
                className={s.completed ? "input-done" : ""}
                onFocus={handleInputFocus}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  const num = v === "" ? undefined : Number(v);
                  onSetUpdate(dayId, ex.id, s.setNumber, {
                    actualReps: Number.isFinite(num as number) ? (num as number) : undefined
                  });
                }}
              />

              <button
                type="button"
                className={`set-check-btn ${s.completed ? "done" : ""}`}
                disabled={isLocked}
                onClick={async () => {
                  if (!s.completed) {
                    try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
                  }
                  onSetUpdate(dayId, ex.id, s.setNumber, { completed: !s.completed });
                }}
                aria-label={s.completed ? "Mark incomplete" : "Mark complete"}
              >
                {s.completed ? "✓" : ""}
              </button>
            </div>
          );
        })}
      </div>

      {timerExerciseName === ex.name && (
        <RestTimer
          exerciseName={ex.name}
          remaining={timerRemaining}
          total={timerTotal}
          onDismiss={onRestTimerDismiss}
        />
      )}
    </div>
  );
}
