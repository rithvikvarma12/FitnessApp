import { useState } from "react";
import type { WorkoutDay } from "../db/types";
import type { PRComparison } from "../services/progressTracker";
import { formatVolumeDisplay } from "../services/progressTracker";
import type { Unit } from "../services/units";
import { toDisplay } from "../services/units";
import Portal from "./Portal";

type Props = {
  day: WorkoutDay;
  unit: Unit;
  prs: PRComparison[];
  onConfirm: (fatigueRating?: number) => void;
  onCancel: () => void;
};

const FATIGUE_OPTIONS = [
  { value: 1, emoji: "\ud83d\ude2b", label: "Brutal",     color: "#ef4444" },
  { value: 2, emoji: "\ud83d\ude13", label: "Hard",       color: "#f97316" },
  { value: 3, emoji: "\ud83d\ude0a", label: "Good",       color: "#eab308" },
  { value: 4, emoji: "\ud83d\udcaa", label: "Strong",     color: "#10b981" },
  { value: 5, emoji: "\ud83d\udd25", label: "Crushed it", color: "#06b6d4" },
];

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
  const [fatigueRating, setFatigueRating] = useState<number | undefined>(undefined);
  const { completedSets, totalSets, totalVolumeKg, exerciseCount } = calcSessionStats(day);

  const durationMin = day.workoutStartedAt
    ? Math.round((Date.now() - new Date(day.workoutStartedAt).getTime()) / 60000)
    : null;

  const durationStr = durationMin !== null
    ? durationMin >= 60
      ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`
      : `${durationMin}m`
    : "\u2014";

  const volumeStr = formatVolumeDisplay(totalVolumeKg, unit);

  return (
    <Portal>
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

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginBottom: 10, fontWeight: 600 }}>
            How did this session feel?
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
            {FATIGUE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFatigueRating(fatigueRating === opt.value ? undefined : opt.value)}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  padding: "8px 4px",
                  borderRadius: "var(--radius-md)",
                  border: fatigueRating === opt.value ? "2px solid " + opt.color : "1.5px solid var(--border-glass-hover)",
                  background: fatigueRating === opt.value ? opt.color + "22" : "transparent",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  transform: fatigueRating === opt.value ? "scale(1.05)" : "scale(1)",
                }}
              >
                <span style={{ fontSize: 20 }}>{opt.emoji}</span>
                <span style={{ fontSize: 9, fontWeight: 600, color: fatigueRating === opt.value ? opt.color : "var(--text-muted)" }}>
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="session-summary-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={() => onConfirm(fatigueRating)}>
            Done
          </button>
        </div>
      </div>
    </div>
    </Portal>
  );
}
