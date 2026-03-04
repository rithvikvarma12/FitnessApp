import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import type { WorkoutDay, PlannedExercise, SetEntry } from "../db/types";
import type { Unit } from "../services/units";
import ExerciseCard from "./ExerciseCard";

function getDayAccentColor(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes("push")) return "#3b82f6";
  if (lower.includes("pull")) return "#f97316";
  if (lower.includes("leg")) return "#10b981";
  return "#8b5cf6";
}

interface DayCardProps {
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
  onExerciseInfoOpen: (exerciseName: string) => void;
  onExerciseAlternativesOpen: (dayId: string, ex: PlannedExercise, dayExercises: PlannedExercise[]) => void;
  timerExerciseName: string | null;
  timerRemaining: number;
  timerTotal: number;
  onRestTimerDismiss: () => void;
}

export default function DayCard({
  defaultExpanded,
  day,
  unit,
  isLocked,
  onDayComplete,
  onSetUpdate,
  onExerciseBasePlanUpdate,
  onApplyBaseToAllSets,
  onRampPlanFromBase,
  onSetPlanToLastActual,
  onExerciseInfoOpen,
  onExerciseAlternativesOpen,
  timerExerciseName,
  timerRemaining,
  timerTotal,
  onRestTimerDismiss
}: DayCardProps) {
  const dateLabel = format(parseISO(day.dateISO), "EEE, MMM d");
  const [expanded, setExpanded] = useState(defaultExpanded);
  const accentColor = getDayAccentColor(day.title);
  const [elapsedMin, setElapsedMin] = useState<number | null>(null);

  useEffect(() => {
    if (!day.workoutStartedAt || day.isComplete) {
      setElapsedMin(null);
      return;
    }
    const update = () => {
      const mins = Math.round((Date.now() - new Date(day.workoutStartedAt!).getTime()) / 60000);
      setElapsedMin(mins);
    };
    update();
    const id = setInterval(update, 30000);
    return () => clearInterval(id);
  }, [day.workoutStartedAt, day.isComplete]);

  return (
    <div
      className="dayCard"
      style={{ borderLeftColor: accentColor }}
    >
      <div className="dayCardHeader">
        <div className="dayHeaderMain">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="dayTitle">{day.title}</div>
            {elapsedMin !== null && (
              <span className="day-duration-badge">{elapsedMin}m</span>
            )}
          </div>
          <div className="dayDate">{dateLabel}</div>
        </div>

        <div className="dayCardActions">
          <button
            type="button"
            className={`dayCompleteBtn ${day.isComplete ? "done" : ""}`}
            onClick={() => onDayComplete(day.id, !day.isComplete)}
            disabled={isLocked}
          >
            {day.isComplete ? "✓ Done" : "Mark Done"}
          </button>
          <button
            type="button"
            className="dayToggle"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse day" : "Expand day"}
          >
            <span className={`dayToggleChevron ${expanded ? "expanded" : ""}`} aria-hidden="true">▾</span>
          </button>
        </div>
      </div>

      <div className={`dayCardBody ${expanded ? "dayCardBody--open" : ""}`}>
        <div className="dayCardBodyInner">
          <hr />
          {day.cardio ? (
            <div className="cardioBlockCard">
              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--accent-green)" }}>Cardio</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>
                {day.cardio.modality} • {day.cardio.minutes} min
                {day.cardio.intensity ? ` • ${day.cardio.intensity}` : ""}
              </div>
            </div>
          ) : null}
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
                onExerciseInfoOpen={onExerciseInfoOpen}
                onExerciseAlternativesOpen={onExerciseAlternativesOpen}
                dayExercises={day.exercises}
                timerExerciseName={timerExerciseName}
                timerRemaining={timerRemaining}
                timerTotal={timerTotal}
                onRestTimerDismiss={onRestTimerDismiss}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
