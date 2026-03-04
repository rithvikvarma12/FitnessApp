import { useEffect, useRef } from "react";

type Props = {
  exerciseName: string;
  remaining: number; // seconds remaining
  total: number;     // total seconds
  onDismiss: () => void;
};

export default function RestTimer({ exerciseName, remaining, total, onDismiss }: Props) {
  const progress = total > 0 ? remaining / total : 0;
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const timeStr = mins > 0
    ? `${mins}:${String(secs).padStart(2, "0")}`
    : `${secs}s`;

  // Announce when timer hits 0
  const didAnnounce = useRef(false);
  useEffect(() => {
    if (remaining <= 0 && !didAnnounce.current) {
      didAnnounce.current = true;
    }
    if (remaining > 0) {
      didAnnounce.current = false;
    }
  }, [remaining]);

  const isExpired = remaining <= 0;

  return (
    <div className="rest-timer-bar">
      <div
        className="rest-timer-progress"
        style={{ width: `${Math.max(0, progress * 100)}%`, transition: "width 1s linear" }}
      />
      <div className="rest-timer-content">
        <span className="rest-timer-label">
          {isExpired ? "Rest complete" : `Rest — ${exerciseName}`}
        </span>
        <span className="rest-timer-countdown" style={{ color: isExpired ? "var(--accent-green)" : undefined }}>
          {isExpired ? "Go!" : timeStr}
        </span>
        <button className="rest-timer-skip" onClick={onDismiss} title="Skip rest timer">
          ✕
        </button>
      </div>
    </div>
  );
}
