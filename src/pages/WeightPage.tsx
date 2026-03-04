import { useEffect, useMemo, useState } from "react";
import type { Unit } from "../services/units";
import { formatWeight, fromDisplay, toDisplay } from "../services/units";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getActiveUserId } from "../db/db";
import type { WeightEntry, UserProfile } from "../db/types";
import { format } from "date-fns";
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
import { movingAverage } from "../services/stats";
import GoalReachedBanner from "../components/GoalReachedBanner";

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend);

type Range = "7" | "30" | "90" | "all";

function normalizeDateISO(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);

  return format(parsed, "yyyy-MM-dd");
}

export default function WeightPage() {
  const activeUserId = useLiveQuery(async () => getActiveUserId(), [], "");


  const entries = useLiveQuery(
    async () => {
      if (!activeUserId) return [];
      return db.weightEntries.where("userId").equals(activeUserId).toArray();
    },
    [activeUserId],
    [] as WeightEntry[]
  );

  const unit = useLiveQuery(async () => {
    const s = await db.settings.get("unit");
    return (s?.value as Unit) ?? "kg";
  }, [], "kg" as Unit);
  const theme = useLiveQuery(async () => {
    const s = await db.settings.get("theme");
    return (s?.value ?? "dark") as "dark" | "light";
  }, [], "dark" as "dark" | "light");
  const activeProfile = useLiveQuery(
    async () => (activeUserId ? db.userProfiles.get(activeUserId) : undefined),
    [activeUserId]
  );

  const goalWeightKg = useLiveQuery(async () => {
    if (activeProfile && typeof activeProfile.targetWeightKg === "number") {
      return activeProfile.targetWeightKg;
    }
    // deprecated fallback: legacy settings key
    const s = await db.settings.get("goalWeightKg");
    const n = Number(s?.value);
    return Number.isFinite(n) ? n : null;
  }, [activeProfile], null as number | null);

  const [newWeight, setNewWeight] = useState("");
  const [goalWeightInput, setGoalWeightInput] = useState("");
  const [range, setRange] = useState<Range>("30");

  useEffect(() => {
    if (goalWeightKg === null) {
      setGoalWeightInput("");
      return;
    }

    setGoalWeightInput(toDisplay(goalWeightKg, unit).toFixed(1));
  }, [goalWeightKg, unit]);

  const sortedEntries = useMemo(() => {
    return [...(entries ?? [])]
      .map((entry) => ({ ...entry, dateISO: normalizeDateISO(entry.dateISO) }))
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  }, [entries]);

  const filtered = useMemo(() => {
    if (range === "all") return sortedEntries;
    const n = Number(range);
    return sortedEntries.slice(Math.max(0, sortedEntries.length - n));
  }, [sortedEntries, range]);

  const labels = filtered.map((e) => e.dateISO);
  const weights = filtered.map((e) => toDisplay(e.weightKg, unit));
  const trend = movingAverage(weights, 7);
  const goalLine = goalWeightKg === null
    ? []
    : filtered.map(() => toDisplay(goalWeightKg, unit));

  const data = {
    labels,
    datasets: [
      {
        label: `Weight (${unit})`,
        data: weights,
        tension: 0.25,
        borderColor: "#38bdf8",
        backgroundColor: "#38bdf8"
      },
      {
        label: "Trend (7d avg)",
        data: trend,
        tension: 0.25,
        borderColor: "#22c55e",
        backgroundColor: "#22c55e"
      },
      ...(goalWeightKg === null
        ? []
        : [
            {
              label: "Goal",
              data: goalLine,
              tension: 0,
              borderColor: "#f59e0b",
              backgroundColor: "#f59e0b",
              borderDash: [6, 6],
              pointRadius: 0,
              pointHoverRadius: 0
            }
          ])
    ]
  };

  const chartTextColor = theme === "light" ? "#4a5568" : "#d8dee9";
  const chartGridColor = theme === "light" ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.06)";

  const options: ChartOptions<"line"> = {
    responsive: true,
    plugins: { legend: { labels: { color: chartTextColor } } },
    scales: {
      x: { ticks: { color: chartTextColor }, grid: { color: chartGridColor } },
      y: {
        ticks: { color: chartTextColor },
        grid: { color: chartGridColor },
        title: { display: true, text: `Weight (${unit})`, color: chartTextColor }
      }
    }
  };

  const handleAddWeight = async () => {
    const trimmed = newWeight.trim();
    if (!trimmed) return;

    const raw = Number(trimmed);
    if (!Number.isFinite(raw)) return;

    const currentUserId = await getActiveUserId();
    if (!currentUserId) return;
    const wKg = fromDisplay(raw, unit);
    const todayISO = format(new Date(), "yyyy-MM-dd");
    const createdAtISO = new Date().toISOString();

    const existing = await db.weightEntries
      .where("[userId+dateISO]")
      .equals([currentUserId, todayISO])
      .first();
    if (existing) {
      await db.weightEntries.update(existing.id, { weightKg: wKg, createdAtISO, dateISO: todayISO });
    } else {
      await db.weightEntries.add({
        id: crypto.randomUUID(),
        userId: currentUserId,
        dateISO: todayISO,
        weightKg: wKg,
        createdAtISO
      });
    }

    setNewWeight("");
  };

  const handleSaveGoal = async () => {
    const trimmed = goalWeightInput.trim();
    const currentUserId = await getActiveUserId();
    if (!currentUserId) return;

    if (!trimmed) {
      await db.userProfiles.update(currentUserId, { targetWeightKg: undefined } as Partial<UserProfile>);
      return;
    }

    const raw = Number(trimmed);
    if (!Number.isFinite(raw)) return;

    const goalKg = fromDisplay(raw, unit);
    await db.userProfiles.update(currentUserId, { targetWeightKg: goalKg } as Partial<UserProfile>);
  };

  return (
    <div className="card">
      <h2>Weight Tracker</h2>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 14 }}>
        Log daily. Trend uses 7-day average.
      </div>

      <GoalReachedBanner userId={activeUserId} unit={unit} />

      {/* Log + goal row */}
      <div className="row" style={{ alignItems: "flex-end", gap: 8 }}>
        <div style={{ flex: "1 1 160px" }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>Weight ({unit})</div>
          <input
            inputMode="decimal"
            placeholder="e.g., 86.3"
            value={newWeight}
            onChange={(e) => setNewWeight(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleAddWeight(); }}
          />
        </div>
        <div style={{ flex: "0 0 80px" }}>
          <button onClick={handleAddWeight} style={{ width: "100%" }}>Log</button>
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>Goal ({unit})</div>
          <input
            inputMode="decimal"
            placeholder="Target weight"
            value={goalWeightInput}
            onChange={(e) => setGoalWeightInput(e.target.value)}
          />
        </div>
        <div style={{ flex: "0 0 80px" }}>
          <button className="secondary" onClick={handleSaveGoal} style={{ width: "100%" }}>Save</button>
        </div>
      </div>

      <hr />

      {/* Range selector */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Range</span>
        {(["7", "30", "90", "all"] as Range[]).map((r) => (
          <button
            key={r}
            className={`unit-toggle-btn ${range === r ? "active" : ""}`}
            onClick={() => setRange(r)}
            style={{ fontSize: 11 }}
          >
            {r === "all" ? "All" : `${r}d`}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div style={{
        background: "var(--bg-subtle)",
        border: "1px solid var(--border-glass)",
        borderRadius: "var(--radius-md)",
        padding: 12,
        marginBottom: 12
      }}>
        {filtered.length >= 2 ? (
          <Line data={data} options={options} />
        ) : (
          <div style={{ color: "var(--text-muted)", fontSize: 12, padding: "12px 0" }}>Add at least 2 entries to see the chart.</div>
        )}
      </div>

      {/* Entry list */}
      <div style={{ display: "grid", gap: 6 }}>
        {sortedEntries.slice().reverse().map((e) => (
          <div key={e.id} style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 10px",
            background: "var(--bg-subtle)",
            border: "1px solid var(--border-glass)",
            borderRadius: "var(--radius-md)"
          }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>{e.dateISO}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, flex: 1 }}>
              {formatWeight(e.weightKg, unit)} {unit}
            </span>
            <button
              className="secondary"
              onClick={async () => {
                const confirmed = window.confirm("Delete this weight entry?");
                if (!confirmed) return;
                await db.weightEntries.delete(e.id);
              }}
              style={{ padding: "4px 8px", fontSize: 11 }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
