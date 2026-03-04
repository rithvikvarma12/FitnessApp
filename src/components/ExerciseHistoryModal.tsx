import { useEffect, useMemo, useState } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  type ChartOptions
} from "chart.js";
import { classifyCompound } from "../db/db";
import type { WeekPlan, ExerciseMeta } from "../db/types";
import type { Unit } from "../services/units";
import { toDisplay } from "../services/units";
import type { ExerciseHistoryPoint } from "./weekViewTypes";

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend);

function normalizeText(value: string): string {
  return value.toLowerCase().trim();
}

function computeExerciseHistory(
  weeks: WeekPlan[],
  exerciseName: string,
  options?: {
    onlyCompletedSets?: boolean;
    useE1RMRepRangeFilter?: boolean;
  }
): ExerciseHistoryPoint[] {
  const byDate = new Map<string, { bestWeightKg?: number; bestE1RMKg?: number }>();
  const targetName = normalizeText(exerciseName);
  const onlyCompletedSets = options?.onlyCompletedSets ?? true;
  const useE1RMRepRangeFilter = options?.useE1RMRepRangeFilter ?? true;

  for (const week of weeks) {
    for (const day of week.days) {
      for (const ex of day.exercises) {
        if (normalizeText(ex.name) !== targetName) continue;

        for (const set of ex.sets) {
          if (onlyCompletedSets && !set.completed) continue;
          if (typeof set.actualWeightKg !== "number") continue;

          const current = byDate.get(day.dateISO) ?? {};
          current.bestWeightKg =
            typeof current.bestWeightKg === "number"
              ? Math.max(current.bestWeightKg, set.actualWeightKg)
              : set.actualWeightKg;

          const reps = set.actualReps;
          const validRepsForE1RM =
            typeof reps === "number" &&
            (!useE1RMRepRangeFilter || (reps >= 3 && reps <= 10));
          if (validRepsForE1RM) {
            const e1RM = set.actualWeightKg * (1 + reps / 30);
            current.bestE1RMKg =
              typeof current.bestE1RMKg === "number"
                ? Math.max(current.bestE1RMKg, e1RM)
                : e1RM;
          }
          byDate.set(day.dateISO, current);
        }
      }
    }
  }

  return Array.from(byDate.entries())
    .filter(([, stats]) => typeof stats.bestWeightKg === "number")
    .map(([dateISO, stats]) => ({
      dateISO,
      bestWeightKg: stats.bestWeightKg as number,
      bestE1RMKg: stats.bestE1RMKg
    }))
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
}

interface ExerciseHistoryModalProps {
  exerciseName: string | null;
  meta?: ExerciseMeta;
  weeks: WeekPlan[];
  unit: Unit;
  onClose: () => void;
}

export default function ExerciseHistoryModal({
  exerciseName,
  meta,
  weeks,
  unit,
  onClose
}: ExerciseHistoryModalProps) {
  const open = !!exerciseName;
  const resolvedExerciseName = exerciseName ?? "";
  const [onlyCompletedSets, setOnlyCompletedSets] = useState(true);
  const [useE1RMRepRangeFilter, setUseE1RMRepRangeFilter] = useState(true);
  const [compoundChartMode, setCompoundChartMode] = useState<"weight" | "e1rm">("weight");

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const history = useMemo(
    () => (open
      ? computeExerciseHistory(weeks, exerciseName, {
        onlyCompletedSets,
        useE1RMRepRangeFilter
      })
      : []),
    [weeks, open, exerciseName, onlyCompletedSets, useE1RMRepRangeFilter]
  );

  const exerciseType = meta?.type ?? classifyCompound(resolvedExerciseName);
  const isCompound = exerciseType === "compound";
  const labels = history.map((p) => p.dateISO);
  const bestWeightSeries = history.map((p) => Number(toDisplay(p.bestWeightKg, unit).toFixed(2)));
  const bestE1RMSeries = history.map((p) =>
    typeof p.bestE1RMKg === "number" ? Number(toDisplay(p.bestE1RMKg, unit).toFixed(2)) : null
  );

  const commonChartOptions: ChartOptions<"line"> = {
    responsive: true,
    plugins: { legend: { labels: { color: "#e5e7eb" } } },
    scales: {
      x: { ticks: { color: "#e5e7eb" }, grid: { color: "#1f2937" } },
      y: {
        ticks: { color: "#e5e7eb" },
        grid: { color: "#1f2937" }
      }
    }
  };

  const weightChartData = {
    labels,
    datasets: [
      {
        label: `Best weight (${unit})`,
        data: bestWeightSeries,
        tension: 0.25,
        borderColor: "#38bdf8",
        backgroundColor: "#38bdf8"
      }
    ]
  };

  const e1rmChartData = {
    labels,
    datasets: [
      {
        label: `Best e1RM (${unit})`,
        data: bestE1RMSeries,
        tension: 0.25,
        borderColor: "#22c55e",
        backgroundColor: "#22c55e"
      }
    ]
  };

  useEffect(() => {
    setCompoundChartMode("weight");
    setOnlyCompletedSets(true);
    setUseE1RMRepRangeFilter(true);
  }, [exerciseName]);

  if (!open) return null;

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
        aria-labelledby="exercise-history-title"
      >
        <div className="exerciseInfoHeader">
          <div style={{ minWidth: 0 }}>
            <div className="small muted">Exercise history</div>
            <h3 id="exercise-history-title" style={{ marginBottom: 4 }}>{resolvedExerciseName}</h3>
            <div className="row" style={{ gap: 8 }}>
              <span className="pill">{exerciseType}</span>
              <span className="pill">{unit}</span>
            </div>
          </div>
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </div>

        {history.length === 0 ? (
          <div className="card exerciseInfoSection">
            <div className="muted">No completed logged sets with actual weights yet for this exercise.</div>
          </div>
        ) : (
          <>
            <div className="card exerciseInfoSection">
              <label className="small" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={onlyCompletedSets}
                  onChange={(e) => setOnlyCompletedSets(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                Only completed sets
              </label>
              {isCompound ? (
                <label className="small" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                  <input
                    type="checkbox"
                    checked={useE1RMRepRangeFilter}
                    onChange={(e) => setUseE1RMRepRangeFilter(e.target.checked)}
                    style={{ width: 16, height: 16 }}
                  />
                  Use reps 3-10 for e1RM
                </label>
              ) : null}
            </div>

            {isCompound ? (
              <div className="pill" style={{ gap: 6, marginBottom: 4 }}>
                <button
                  type="button"
                  className={compoundChartMode === "weight" ? "" : "secondary"}
                  onClick={() => setCompoundChartMode("weight")}
                >
                  Best Weight
                </button>
                <button
                  type="button"
                  className={compoundChartMode === "e1rm" ? "" : "secondary"}
                  onClick={() => setCompoundChartMode("e1rm")}
                >
                  Estimated 1RM
                </button>
              </div>
            ) : null}

            <div className="card exerciseInfoSection" style={{ background: "#0b1220" }}>
              <div className="small muted" style={{ marginBottom: 8 }}>
                {isCompound
                  ? compoundChartMode === "weight"
                    ? "Best set weight"
                    : "Estimated 1RM (Epley)"
                  : "Best set weight"}
              </div>
              <Line
                data={isCompound && compoundChartMode === "e1rm" ? e1rmChartData : weightChartData}
                options={commonChartOptions}
              />
            </div>

            <div className="card exerciseInfoSection">
              <div className="small muted" style={{ marginBottom: 8 }}>History log</div>
              <div className="list" style={{ gap: 8 }}>
                {history.slice().reverse().map((point) => (
                  <div key={point.dateISO} className="row exerciseHistoryRow">
                    <div className="pill">{point.dateISO}</div>
                    <div style={{ fontWeight: 700 }}>
                      Best: {toDisplay(point.bestWeightKg, unit).toFixed(1)} {unit}
                    </div>
                    {isCompound ? (
                      <div className="small muted">
                        e1RM: {typeof point.bestE1RMKg === "number"
                          ? `${toDisplay(point.bestE1RMKg, unit).toFixed(1)} ${unit}`
                          : "n/a"}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
