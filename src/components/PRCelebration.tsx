import { useEffect, useState } from "react";
import type { PRComparison } from "../services/progressTracker";
import type { Unit } from "../services/units";
import { toDisplay } from "../services/units";

interface PRCelebrationProps {
  prs: PRComparison[];
  unit: Unit;
  onDismiss: () => void;
}

const SPARK_COUNT = 12;

export default function PRCelebration({ prs, unit, onDismiss }: PRCelebrationProps) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleDismiss();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  function handleDismiss() {
    setExiting(true);
    setTimeout(() => onDismiss(), 300);
  }

  const displayed = prs.slice(0, 5);
  const title =
    prs.length === 1 ? "New Personal Record!" : `${prs.length} New PRs!`;

  return (
    <div
      className={`pr-overlay ${exiting ? "pr-overlay--exit" : ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleDismiss();
      }}
    >
      {/* Sparks */}
      {Array.from({ length: SPARK_COUNT }).map((_, i) => (
        <div
          key={i}
          className="pr-spark"
          style={
            {
              "--spark-angle": `${(i / SPARK_COUNT) * 360}deg`,
              "--spark-delay": `${i * 0.05}s`,
            } as React.CSSProperties
          }
        />
      ))}

      <div className={`pr-card ${exiting ? "pr-card--exit" : ""}`}>
        <div className="pr-emoji">🏋️</div>
        <div className="pr-title">{title}</div>

        <div className="pr-list">
          {displayed.map((pr) => {
            const newW = toDisplay(pr.newWeightKg, unit);
            const delta = toDisplay(pr.deltaKg, unit);
            return (
              <div key={pr.exerciseName} className="pr-item">
                <div className="pr-item-name">{pr.exerciseName}</div>
                <div className="pr-item-details">
                  <span className="pr-item-weight">
                    {newW.toFixed(1)} {unit} × {pr.newReps} reps
                  </span>
                  {pr.prevWeightKg > 0 && (
                    <span className="pr-item-delta">
                      +{delta.toFixed(1)} {unit}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <button className="pr-dismiss" onClick={handleDismiss}>
          Nice!
        </button>
      </div>
    </div>
  );
}
