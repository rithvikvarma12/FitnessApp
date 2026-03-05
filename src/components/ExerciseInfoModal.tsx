import { useEffect } from "react";
import { classifyCompound } from "../db/db";
import type { ExerciseMeta } from "../db/types";
import MuscleMap from "./MuscleMap";
import { getMuscleTargets } from "../services/muscleMapping";

interface ExerciseInfoModalProps {
  exerciseName: string | null;
  meta?: ExerciseMeta;
  onOpenHistory: (exerciseName: string) => void;
  onClose: () => void;
}

export default function ExerciseInfoModal({
  exerciseName,
  meta,
  onOpenHistory,
  onClose
}: ExerciseInfoModalProps) {
  useEffect(() => {
    if (!exerciseName) return undefined;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exerciseName, onClose]);

  if (!exerciseName) return null;

  const resolvedType = meta?.type ?? classifyCompound(exerciseName);
  const primaryMuscles = meta?.primaryMuscles ?? [];
  const secondaryMuscles = meta?.secondaryMuscles ?? [];

  // Muscle map targets via keyword matching; fallback to custom muscleGroup if set
  const muscleTargets = getMuscleTargets(exerciseName, meta?.primaryMuscles[0]);

  return (
    <div
      className="modalBackdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modalCard exerciseInfoModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exercise-info-title"
      >
        <div className="exerciseInfoHeader">
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Exercise info</div>
            <h3 id="exercise-info-title" style={{ marginBottom: 6 }}>{exerciseName}</h3>
            <div className="row" style={{ gap: 6 }}>
              <span className="tag tag--blue">{resolvedType}</span>
              {meta?.equipment ? <span className="tag tag--purple">{meta.equipment}</span> : null}
              {meta?.movementPattern ? <span className="tag" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border-glass-hover)", color: "var(--text-secondary)" }}>{meta.movementPattern}</span> : null}
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className="secondary"
              onClick={() => onOpenHistory(exerciseName)}
              aria-label={`Open history for ${exerciseName}`}
            >
              History
            </button>
            <button type="button" className="secondary" onClick={onClose} aria-label="Close exercise info">
              Close
            </button>
          </div>
        </div>

        <div className="card exerciseInfoImagePlaceholder" style={{ paddingTop: 14, paddingBottom: 14 }}>
          <MuscleMap
            primaryMuscles={muscleTargets.primary}
            secondaryMuscles={muscleTargets.secondary}
            size={180}
          />
          {(muscleTargets.primary.length > 0 || muscleTargets.secondary.length > 0) && (
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 8, flexWrap: "wrap" }}>
              {muscleTargets.primary.length > 0 && (
                <span style={{ fontSize: 10, color: "#ef4444" }}>
                  ● Primary: {muscleTargets.primary.join(", ").replace(/_/g, " ")}
                </span>
              )}
              {muscleTargets.secondary.length > 0 && (
                <span style={{ fontSize: 10, color: "#f97316" }}>
                  ● Secondary: {muscleTargets.secondary.join(", ").replace(/_/g, " ")}
                </span>
              )}
            </div>
          )}
        </div>
        {meta?.imageUrl ? (
          <img className="exerciseInfoImage" src={meta.imageUrl} alt={`${exerciseName} reference`} />
        ) : null}

        <div className="exerciseInfoGrid">
          <div className="card exerciseInfoSection">
            <div className="small muted">Type</div>
            <div>{resolvedType}</div>
          </div>
          <div className="card exerciseInfoSection">
            <div className="small muted">Equipment</div>
            <div>{meta?.equipment ?? "Not set"}</div>
          </div>
          <div className="card exerciseInfoSection">
            <div className="small muted">Primary muscles</div>
            <div className="muscleChipRow">
              {primaryMuscles.length ? (
                primaryMuscles.map((muscle) => (
                  <span key={muscle} className="muscleChip">{muscle}</span>
                ))
              ) : (
                <span>Not set</span>
              )}
            </div>
          </div>
          <div className="card exerciseInfoSection">
            <div className="small muted">Secondary muscles</div>
            <div className="muscleChipRow">
              {secondaryMuscles.length ? (
                secondaryMuscles.map((muscle) => (
                  <span key={muscle} className="muscleChip secondaryMuscleChip">{muscle}</span>
                ))
              ) : (
                <span>None listed</span>
              )}
            </div>
          </div>
          <div className="card exerciseInfoSection">
            <div className="small muted">Movement pattern</div>
            <div>{meta?.movementPattern ?? "Not set"}</div>
          </div>
        </div>

        <div className="card exerciseInfoSection">
          <div className="small muted">Cues</div>
          {meta?.cues?.length ? (
            <ul className="exerciseInfoList">
              {meta.cues.map((cue) => (
                <li key={cue}>{cue}</li>
              ))}
            </ul>
          ) : (
            <div className="small muted">No cues added yet.</div>
          )}
        </div>

        {meta?.videoUrl ? (
          <div className="exerciseInfoActions">
            <a
              className="exerciseInfoLinkButton"
              href={meta.videoUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open video
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
