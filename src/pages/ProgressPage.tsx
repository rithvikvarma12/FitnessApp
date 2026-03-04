import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getActiveUserId } from "../db/db";
import type { WeekPlan } from "../db/types";
import type { Unit } from "../services/units";
import { toDisplay } from "../services/units";
import { computeProgressSnapshot } from "../services/progressTracker";
import type {
  PRComparison,
  WeeklySummary,
  MuscleGroupVolume,
} from "../services/progressTracker";
import PRCelebration from "../components/PRCelebration";
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  type ChartOptions
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StatCardProps {
  emoji: string;
  value: string;
  label: string;
  accentColor: string;
}

function StatCard({ emoji: _emoji, value, label, accentColor }: StatCardProps) {
  return (
    <div className="progress-stat-card" style={{ borderLeftColor: accentColor }}>
      <div className="progress-stat-value">{value}</div>
      <div className="progress-stat-label">{label}</div>
    </div>
  );
}

interface RecentPRsBannerProps {
  prs: PRComparison[];
  unit: Unit;
}

function RecentPRsBanner({ prs, unit }: RecentPRsBannerProps) {
  if (prs.length === 0) return null;
  return (
    <div className="progress-prs-banner">
      <div className="progress-section-title" style={{ color: "var(--accent-gold)" }}>
        This Week's PRs
      </div>
      <div className="progress-prs-list">
        {prs.slice(0, 5).map((pr) => {
          const newW = toDisplay(pr.newWeightKg, unit);
          const delta = toDisplay(pr.deltaKg, unit);
          return (
            <div key={pr.exerciseName} className="progress-pr-row">
              <span className="progress-pr-name">{pr.exerciseName}</span>
              <span className="progress-pr-weight">
                {newW.toFixed(1)} {unit} × {pr.newReps}
              </span>
              {pr.prevWeightKg > 0 && (
                <span className="progress-pr-delta">
                  +{delta.toFixed(1)} {unit}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface WeeklyVolumeChartProps {
  summaries: WeeklySummary[];
  unit: Unit;
  chartTextColor: string;
  chartGridColor: string;
}

function WeeklyVolumeChart({ summaries, unit, chartTextColor, chartGridColor }: WeeklyVolumeChartProps) {
  const chronological = [...summaries].reverse();
  const labels = chronological.map((s) => `Wk ${s.weekNumber}`);
  const volumes = chronological.map((s) =>
    Math.round(toDisplay(s.totalVolumeKg, unit))
  );

  const data = {
    labels,
    datasets: [
      {
        label: `Volume (${unit})`,
        data: volumes,
        backgroundColor: "#3b82f6",
        borderColor: "#2563eb",
        borderWidth: 1,
        borderRadius: 6,
      },
    ],
  };

  const options: ChartOptions<"bar"> = {
    responsive: true,
    plugins: {
      legend: { labels: { color: chartTextColor } },
    },
    scales: {
      x: { ticks: { color: chartTextColor }, grid: { color: chartGridColor } },
      y: {
        ticks: { color: chartTextColor },
        grid: { color: chartGridColor },
        title: {
          display: true,
          text: `Volume (${unit})`,
          color: chartTextColor,
        },
      },
    },
  };

  return (
    <div className="progress-chart-card">
      <div className="progress-section-title">Weekly Volume Trend</div>
      <Bar data={data} options={options} />
    </div>
  );
}

interface MuscleGroupBreakdownProps {
  groups: MuscleGroupVolume[];
  unit: Unit;
}

const GROUP_COLORS: Record<string, string> = {
  Chest: "#ef4444",
  Legs: "#10b981",
  Back: "#3b82f6",
  Shoulders: "#f97316",
  Biceps: "#8b5cf6",
  Triceps: "#ec4899",
  Core: "#eab308",
  Other: "#6b7280",
};

function MuscleGroupBreakdown({ groups, unit }: MuscleGroupBreakdownProps) {
  if (groups.length === 0) return null;
  const maxVol = Math.max(...groups.map((g) => g.totalVolumeKg), 1);

  return (
    <div className="progress-muscle-card">
      <div className="progress-section-title">Muscle Group Breakdown</div>
      <div className="progress-muscle-list">
        {groups.map((g) => {
          const pct = (g.totalVolumeKg / maxVol) * 100;
          const color = GROUP_COLORS[g.group] ?? "#6b7280";
          const vol = Math.round(toDisplay(g.totalVolumeKg, unit));
          return (
            <div key={g.group} className="progress-muscle-row">
              <div className="progress-muscle-label">
                <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0, display: "inline-block" }} />
                  <span style={{ color }}>{g.group}</span>
                </span>
                <span className="progress-muscle-stats">
                  {g.totalSets} sets · {vol} {unit}
                </span>
              </div>
              <div className="progress-muscle-bar-track">
                <div
                  className="progress-muscle-bar-fill"
                  style={{ width: `${pct}%`, background: color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Filters for PR Board ─────────────────────────────────────────────────────

type PRFilter = "All" | "Compound" | "Isolation";

const COMPOUND_KEYWORDS = [
  "bench", "press", "row", "pulldown", "pull-up", "pull up",
  "chin-up", "chin up", "squat", "deadlift", "rdl", "lunge",
  "leg press", "carry", "push-up", "push up",
];

function isCompound(name: string) {
  const lower = name.toLowerCase();
  return COMPOUND_KEYWORDS.some((k) => lower.includes(k));
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProgressPage() {
  const activeUserId = useLiveQuery(async () => getActiveUserId(), [], "");

  const weeks = useLiveQuery(
    async () => {
      if (!activeUserId) return [] as WeekPlan[];
      return db.weekPlans.where("userId").equals(activeUserId).toArray();
    },
    [activeUserId],
    [] as WeekPlan[]
  );

  const unit = useLiveQuery(async () => {
    const s = await db.settings.get("unit");
    return (s?.value as Unit) ?? "kg";
  }, [], "kg" as Unit);

  const theme = useLiveQuery(async () => {
    const s = await db.settings.get("theme");
    return (s?.value ?? "dark") as "dark" | "light";
  }, [], "dark" as "dark" | "light");

  const snapshot = useMemo(
    () => (weeks && weeks.length > 0 ? computeProgressSnapshot(weeks) : null),
    [weeks]
  );

  const [prDismissed, setPrDismissed] = useState(false);
  const [prFilter, setPrFilter] = useState<PRFilter>("All");
  const [prSort, setPrSort] = useState<"weight" | "name">("weight");

  // Empty state
  if (!snapshot) {
    return (
      <div className="card">
        <div className="progress-empty">
          <h2>No Data Yet</h2>
          <div className="muted">
            Complete some workouts to see your progress dashboard.
          </div>
        </div>
      </div>
    );
  }

  const { allTimePRs, recentPRs, weeklySummaries, streak, muscleGroupVolumes, topExercises } =
    snapshot;

  // PR Board: convert map to array, filter, sort
  const allPRList = [...allTimePRs.values()];
  const filteredPRs = allPRList.filter((pr) => {
    if (prFilter === "Compound") return isCompound(pr.exerciseName);
    if (prFilter === "Isolation") return !isCompound(pr.exerciseName);
    return true;
  });
  const sortedPRs = [...filteredPRs].sort((a, b) =>
    prSort === "weight"
      ? b.weightKg - a.weightKg
      : a.exerciseName.localeCompare(b.exerciseName)
  );

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="progress-page">
      {/* PR Celebration modal */}
      {recentPRs.length > 0 && !prDismissed && (
        <PRCelebration
          prs={recentPRs}
          unit={unit}
          onDismiss={() => setPrDismissed(true)}
        />
      )}

      {/* Stats grid */}
      <div className="progress-stats-grid">
        <StatCard
          emoji="🔥"
          value={String(streak.currentStreak)}
          label="Current Streak (weeks)"
          accentColor="#f97316"
        />
        <StatCard
          emoji="🏆"
          value={String(streak.longestStreak)}
          label="Longest Streak (weeks)"
          accentColor="#eab308"
        />
        <StatCard
          emoji="✅"
          value={`${streak.overallCompletionRate.toFixed(0)}%`}
          label="Completion Rate"
          accentColor="#22c55e"
        />
        <StatCard
          emoji="💪"
          value={`${streak.totalWorkoutsCompleted}/${streak.totalWorkoutsPlanned}`}
          label="Total Workouts"
          accentColor="#3b82f6"
        />
      </div>

      {/* Recent PRs banner */}
      <RecentPRsBanner prs={recentPRs} unit={unit} />

      {/* Volume chart */}
      {weeklySummaries.length >= 2 && (
        <WeeklyVolumeChart
          summaries={weeklySummaries}
          unit={unit}
          chartTextColor={theme === "light" ? "#4a5568" : "#d8dee9"}
          chartGridColor={theme === "light" ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.06)"}
        />
      )}

      {/* Muscle group breakdown */}
      <MuscleGroupBreakdown groups={muscleGroupVolumes} unit={unit} />

      {/* All-time PR board */}
      {sortedPRs.length > 0 && (
        <div className="progress-pr-board card">
          <div className="progress-section-title">All-Time PR Board</div>

          <div className="progress-filter-row">
            <div className="progress-filter-pills">
              {(["All", "Compound", "Isolation"] as PRFilter[]).map((f) => (
                <button
                  key={f}
                  className={`progress-filter-pill ${prFilter === f ? "progress-filter-pill--active" : ""}`}
                  onClick={() => setPrFilter(f)}
                >
                  {f}
                </button>
              ))}
            </div>
            <select
              className="progress-sort-select"
              value={prSort}
              onChange={(e) => setPrSort(e.target.value as "weight" | "name")}
            >
              <option value="weight">Sort: Weight</option>
              <option value="name">Sort: Name</option>
            </select>
          </div>

          <div className="progress-pr-board-list">
            {sortedPRs.map((pr, i) => {
              const w = toDisplay(pr.weightKg, unit);
              return (
                <div key={pr.exerciseName} className="progress-pr-board-row">
                  <span className="progress-pr-board-medal">
                    {medals[i] ?? ""}
                  </span>
                  <span className="progress-pr-board-name">{pr.exerciseName}</span>
                  <span className="progress-pr-board-weight">
                    {w.toFixed(1)} {unit} × {pr.reps}
                  </span>
                  <span className="progress-pr-board-meta muted">
                    Wk {pr.weekNumber} · {pr.dateISO}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top exercises by volume */}
      {topExercises.length > 0 && (
        <div className="progress-top-exercises card">
          <div className="progress-section-title">Top Exercises by Volume</div>
          <div className="progress-exercise-grid">
            {topExercises.slice(0, 8).map((ex) => {
              const vol = Math.round(toDisplay(ex.totalVolumeKg, unit));
              const best = toDisplay(ex.bestWeightKg, unit);
              return (
                <div key={ex.name} className="progress-exercise-card">
                  <div className="progress-exercise-name">{ex.name}</div>
                  <div className="progress-exercise-pills">
                    <span className="pill">{ex.completedSets} sets</span>
                    <span className="pill">{ex.totalReps} reps</span>
                    <span className="pill">
                      {vol} {unit}
                    </span>
                    <span className="pill">
                      Best: {best.toFixed(1)} {unit}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
