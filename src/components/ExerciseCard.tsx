import { useEffect, useRef, useState } from "react";
import type { PlannedExercise, SetEntry } from "../db/types";
import type { Unit, EquipmentType } from "../services/units";
import { toDisplayClean, toDisplayRounded, fromDisplay, inferEquipmentFromName } from "../services/units";
import RestTimer from "./RestTimer";
import { Haptics, ImpactStyle } from '@capacitor/haptics';

function lastNonEmptyActualWeightKg(ex: PlannedExercise): number | undefined {
  for (let i = ex.sets.length - 1; i >= 0; i -= 1) {
    const w = ex.sets[i].actualWeightKg;
    if (typeof w === "number") return w;
  }
  return undefined;
}

function weightDisplayString(weightKg: number | undefined, unit: Unit): string {
  return typeof weightKg === "number" ? String(toDisplayClean(weightKg, unit)) : "";
}

interface SetRowProps {
  s: SetEntry;
  unit: Unit;
  isLocked: boolean;
  plannedWtPlaceholder: string;
  onCommitWeightKg: (weightKg: number | undefined) => void;
  onCommitReps: (reps: number | undefined) => void;
  onToggleCompleted: () => Promise<void> | void;
  onInputFocus: (e: React.FocusEvent<HTMLInputElement>) => void;
}

function SetRow({
  s,
  unit,
  isLocked,
  plannedWtPlaceholder,
  onCommitWeightKg,
  onCommitReps,
  onToggleCompleted,
  onInputFocus,
}: SetRowProps) {
  const [weightInput, setWeightInput] = useState<string>(weightDisplayString(s.actualWeightKg, unit));
  const [repsInput, setRepsInput] = useState<string>(s.actualReps !== undefined ? String(s.actualReps) : "");

  // Sync local input strings when the underlying set changes from outside
  // (e.g. plan regen, "= Last actual" button, unit toggle).
  useEffect(() => {
    setWeightInput(weightDisplayString(s.actualWeightKg, unit));
  }, [s.actualWeightKg, unit]);

  useEffect(() => {
    setRepsInput(s.actualReps !== undefined ? String(s.actualReps) : "");
  }, [s.actualReps]);

  const commitWeight = () => {
    const v = weightInput.trim();
    if (v === "") {
      onCommitWeightKg(undefined);
      return;
    }
    const parsed = parseFloat(v);
    if (!Number.isFinite(parsed)) return;
    onCommitWeightKg(fromDisplay(parsed, unit));
  };

  const commitReps = () => {
    const v = repsInput.trim();
    if (v === "") {
      onCommitReps(undefined);
      return;
    }
    const parsed = parseInt(v, 10);
    if (!Number.isFinite(parsed)) return;
    onCommitReps(parsed);
  };

  return (
    <div className={`set-grid ${s.completed ? "set-row-done" : ""}`}>
      <div className="set-num">{s.setNumber}</div>

      <input
        type="text"
        disabled={isLocked}
        inputMode="decimal"
        placeholder={plannedWtPlaceholder}
        value={weightInput}
        className={s.completed ? "input-done" : ""}
        onFocus={onInputFocus}
        onChange={(e) => setWeightInput(e.target.value)}
        onBlur={commitWeight}
      />

      <input
        type="text"
        disabled={isLocked}
        inputMode="numeric"
        placeholder={`${s.plannedRepsMin}–${s.plannedRepsMax}`}
        value={repsInput}
        className={s.completed ? "input-done" : ""}
        onFocus={onInputFocus}
        onChange={(e) => setRepsInput(e.target.value)}
        onBlur={commitReps}
      />

      <button
        type="button"
        className={`set-check-btn ${s.completed ? "done" : ""}`}
        disabled={isLocked}
        onClick={() => void onToggleCompleted()}
        aria-label={s.completed ? "Mark incomplete" : "Mark complete"}
      >
        {s.completed ? "✓" : ""}
      </button>
    </div>
  );
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
  const equipment: EquipmentType = inferEquipmentFromName(ex.name);

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

  // Local string state for the base weight input — preserves typing of
  // decimals (e.g. "82.5") that a controlled-numeric input would clobber.
  const [baseInput, setBaseInput] = useState<string>(weightDisplayString(ex.plannedWeightKg, unit));
  useEffect(() => {
    setBaseInput(weightDisplayString(ex.plannedWeightKg, unit));
  }, [ex.plannedWeightKg, unit]);

  const commitBase = () => {
    const v = baseInput.trim();
    if (v === "") {
      onExerciseBasePlanUpdate(dayId, ex.id, undefined);
      return;
    }
    const parsed = parseFloat(v);
    if (!Number.isFinite(parsed)) return;
    onExerciseBasePlanUpdate(dayId, ex.id, fromDisplay(parsed, unit));
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
            type="text"
            disabled={isLocked}
            inputMode="decimal"
            placeholder={`Base ${unit}`}
            value={baseInput}
            onFocus={handleInputFocus}
            onChange={(e) => setBaseInput(e.target.value)}
            onBlur={commitBase}
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
            <SetRow
              key={s.setNumber}
              s={s}
              unit={unit}
              isLocked={isLocked}
              plannedWtPlaceholder={plannedWtPlaceholder}
              onInputFocus={handleInputFocus}
              onCommitWeightKg={(kg) => onSetUpdate(dayId, ex.id, s.setNumber, { actualWeightKg: kg })}
              onCommitReps={(reps) => onSetUpdate(dayId, ex.id, s.setNumber, { actualReps: reps })}
              onToggleCompleted={async () => {
                if (!s.completed) {
                  try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
                }
                onSetUpdate(dayId, ex.id, s.setNumber, { completed: !s.completed });
              }}
            />
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
