import { useEffect } from "react";
import { classifyCompound } from "../db/db";
import type { AlternativeOption } from "./weekViewTypes";

interface ExerciseAlternativesModalProps {
  openItem: { exerciseName: string } | null;
  options: AlternativeOption[];
  onClose: () => void;
  onSelect: (option: AlternativeOption) => void;
}

export default function ExerciseAlternativesModal({
  openItem,
  options,
  onClose,
  onSelect
}: ExerciseAlternativesModalProps) {
  useEffect(() => {
    if (!openItem) return undefined;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openItem, onClose]);

  if (!openItem) return null;

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
        aria-labelledby="exercise-alt-title"
      >
        <div className="exerciseInfoHeader">
          <div style={{ minWidth: 0 }}>
            <div className="small muted">Swap exercise</div>
            <h3 id="exercise-alt-title" style={{ marginBottom: 4 }}>{openItem.exerciseName}</h3>
            <div className="small muted">Choose an alternative for this day</div>
          </div>
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </div>

        {options.length === 0 ? (
          <div className="card exerciseInfoSection">
            <div className="small muted">
              No good alternatives found
            </div>
            <div style={{ marginTop: 10 }}>
              <button type="button" disabled>
                Swap
              </button>
            </div>
          </div>
        ) : (
          <div className="list exerciseAltList">
            {options.map((option) => (
              <div key={option.templateId} className="card exerciseAltItem">
                <div className="exerciseAltMain">
                  <div className="exerciseAltName">{option.name}</div>
                  <div className="small muted">
                    {option.meta?.type ?? classifyCompound(option.name)}
                    {option.meta?.movementPattern ? ` • ${option.meta.movementPattern}` : ""}
                    {option.meta?.equipment ? ` • ${option.meta.equipment}` : ""}
                  </div>
                  {option.meta?.primaryMuscles?.length ? (
                    <div className="small muted">
                      {option.meta.primaryMuscles.join(", ")}
                    </div>
                  ) : null}
                </div>
                <button type="button" onClick={() => onSelect(option)}>
                  Swap
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
