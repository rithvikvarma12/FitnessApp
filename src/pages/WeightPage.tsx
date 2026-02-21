import { useEffect, useMemo, useState } from "react";
import type { Unit } from "../services/units";
import { formatWeight, fromDisplay, toDisplay } from "../services/units";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import type { WeightEntry } from "../db/types";
import { format } from "date-fns";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend
} from "chart.js";
import { movingAverage } from "../services/stats";

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend);

type Range = "7" | "30" | "90" | "all";

function normalizeDateISO(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);

  return format(parsed, "yyyy-MM-dd");
}

export default function WeightPage() {
  const entries = useLiveQuery(
    async () => db.weightEntries.toArray(),
    [],
    [] as WeightEntry[]
  );

  const unit = useLiveQuery(async () => {
    const s = await db.settings.get("unit");
    return (s?.value as Unit) ?? "kg";
  }, [], "kg" as Unit);

  const goalWeightKg = useLiveQuery(async () => {
    const s = await db.settings.get("goalWeightKg");
    const n = Number(s?.value);
    return Number.isFinite(n) ? n : null;
  }, [], null as number | null);

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

  const options: any = {
    responsive: true,
    plugins: { legend: { labels: { color: "#e5e7eb" } } },
    scales: {
      x: { ticks: { color: "#e5e7eb" }, grid: { color: "#1f2937" } },
      y: {
        ticks: { color: "#e5e7eb" },
        grid: { color: "#1f2937" },
        title: { display: true, text: `Weight (${unit})`, color: "#e5e7eb" }
      }
    }
  };

  const handleAddWeight = async () => {
    const trimmed = newWeight.trim();
    if (!trimmed) return;

    const raw = Number(trimmed);
    if (!Number.isFinite(raw)) return;

    const wKg = fromDisplay(raw, unit);
    const todayISO = format(new Date(), "yyyy-MM-dd");
    const createdAtISO = new Date().toISOString();

    const existing = await db.weightEntries.where("dateISO").equals(todayISO).first();
    if (existing) {
      await db.weightEntries.update(existing.id, { weightKg: wKg, createdAtISO, dateISO: todayISO });
    } else {
      await db.weightEntries.add({
        id: crypto.randomUUID(),
        dateISO: todayISO,
        weightKg: wKg,
        createdAtISO
      });
    }

    setNewWeight("");
  };

  const handleSaveGoal = async () => {
    const trimmed = goalWeightInput.trim();

    if (!trimmed) {
      await db.settings.delete("goalWeightKg");
      return;
    }

    const raw = Number(trimmed);
    if (!Number.isFinite(raw)) return;

    const goalKg = fromDisplay(raw, unit);
    await db.settings.put({ key: "goalWeightKg", value: String(goalKg) });
  };

  return (
    <div className="card">
      <h2>Weight Tracker</h2>
      <div className="small muted">Add your weight daily. Trend uses a 7-day average.</div>

      <hr />

      <div className="pill" style={{ marginBottom: 10 }}>
        <button
          className={unit === "kg" ? "" : "secondary"}
          onClick={() => db.settings.put({ key: "unit", value: "kg" })}
          style={{ marginRight: 8 }}
        >
          kg
        </button>

        <button
          className={unit === "lb" ? "" : "secondary"}
          onClick={() => db.settings.put({ key: "unit", value: "lb" })}
        >
          lb
        </button>
      </div>

      <div className="row" style={{ alignItems: "end" }}>
        <div style={{ flex: "1 1 220px", minWidth: 200 }}>
          <div className="small muted">Weight ({unit})</div>
          <input
            inputMode="decimal"
            placeholder="e.g., 86.3"
            value={newWeight}
            onChange={(e) => setNewWeight(e.target.value)}
          />
        </div>

        <div style={{ flex: "0 0 120px", minWidth: 120 }}>
          <button onClick={handleAddWeight} style={{ width: "100%" }}>
            Add
          </button>
        </div>

        <div style={{ flex: "1 1 220px", minWidth: 200 }}>
          <div className="small muted">Goal ({unit})</div>
          <input
            inputMode="decimal"
            placeholder="Set goal"
            value={goalWeightInput}
            onChange={(e) => setGoalWeightInput(e.target.value)}
          />
        </div>

        <div style={{ flex: "0 0 120px", minWidth: 120 }}>
          <button className="secondary" onClick={handleSaveGoal} style={{ width: "100%" }}>
            Save goal
          </button>
        </div>
      </div>

      <hr />

      <div className="row" style={{ alignItems: "end", marginBottom: 10 }}>
        <div style={{ width: 180, maxWidth: "100%" }}>
          <div className="small muted">Range</div>
          <select value={range} onChange={(e) => setRange(e.target.value as Range)}>
            <option value="7">Last 7</option>
            <option value="30">Last 30</option>
            <option value="90">Last 90</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>

      <div className="card" style={{ background: "#0b1220" }}>
        {filtered.length >= 2 ? (
          <Line data={data} options={options} />
        ) : (
          <div className="muted">Add at least 2 entries to see the chart.</div>
        )}
      </div>

      <hr />

      <div className="list">
        {sortedEntries.slice().reverse().map((e) => (
          <div key={e.id} className="row" style={{ alignItems: "center" }}>
            <div className="pill">{e.dateISO}</div>
            <div style={{ fontWeight: 700 }}>
              {formatWeight(e.weightKg, unit)} {unit}
            </div>
            <button
              className="secondary"
              onClick={() => db.weightEntries.delete(e.id)}
              style={{ marginLeft: "auto" }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
