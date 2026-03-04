import type { WorkoutDay } from "../db/types";
import type { PRComparison } from "../services/progressTracker";
import { formatVolumeDisplay } from "../services/progressTracker";
import type { Unit } from "../services/units";
import { toDisplay } from "../services/units";

type Props = {
  day: WorkoutDay;
  unit: Unit;
  prs: PRComparison[];
  onConfirm: () => void;
  onCancel: () => void;
};

function calcSessionStats(day: WorkoutDay) {
  let totalSets = 0;
  let completedSets = 0;
  let totalVolumeKg = 0;
  const exercisesDone = new Set<string>();

  for (const ex of day.exercises) {
    for (const s of ex.sets) {
      totalSets++;
      if (s.completed) {
        completedSets++;
        exercisesDone.add(ex.name);
        const w = s.actualWeightKg ?? s.plannedWeightKg ?? 0;
        const r = s.actualReps ?? s.plannedRepsMin ?? 0;
        totalVolumeKg += w * r;
      }
    }
  }

  return { totalSets, completedSets, totalVolumeKg, exerciseCount: exercisesDone.size };
}

export default function SessionSummary({ day, unit, prs, onConfirm, onCancel }: Props) {
  const { completedSets, totalSets, totalVolumeKg, exerciseCount } = calcSessionStats(day);

  const durationMin = day.workoutStartedAt
    ? Math.round((Date.now() - new Date(day.workoutStartedAt).getTime()) / 60000)
    : null;

  const durationStr = durationMin !== null
    ? durationMin >= 60
      ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`
      : `${durationMin}m`
    : "—";

  const volumeStr = formatVolumeDisplay(totalVolumeKg, unit);

  return (
    <div className="modalBackdrop" onClick={onCancel}>
      <div className="modalCard session-summary-card" onClick={(e) => e.stopPropagation()}>
        <div className="session-summary-header">
          <div className="session-summary-title">{day.title}</div>
          <div className="session-summary-subtitle">Session complete</div>
        </div>

        <div className="session-summary-stats">
          <div className="session-stat-item">
            <div className="session-stat-value">{durationStr}</div>
            <div className="session-stat-label">Duration</div>
          </div>
          <div className="session-stat-item">
            <div className="session-stat-value">{completedSets}<span className="session-stat-denom">/{totalSets}</span></div>
            <div className="session-stat-label">Sets</div>
          </div>
          <div className="session-stat-item">
            <div className="session-stat-value">{volumeStr}</div>
            <div className="session-stat-label">Volume</div>
          </div>
          <div className="session-stat-item">
            <div className="session-stat-value">{exerciseCount}</div>
            <div className="session-stat-label">Exercises</div>
          </div>
        </div>

        {prs.length > 0 && (
          <div className="session-prs">
            <div className="session-prs-heading">Personal Records</div>
            {prs.map((pr) => (
              <div key={pr.exerciseName} className="session-pr-item">
                <span className="session-pr-name">{pr.exerciseName}</span>
                <span className="session-pr-delta">
                  +{toDisplay(pr.deltaKg, unit).toFixed(1)} {unit}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="session-summary-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm}>
            Mark Done
          </button>
        </div>
      </div>
    </div>
  );
}
