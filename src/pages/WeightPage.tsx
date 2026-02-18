import { useMemo, useState } from "react";
import type { Unit } from "../services/units";
import { formatWeight, fromDisplay } from "../services/units";
import { toDisplay } from "../services/units";
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

export default function WeightPage() {
  const entries = useLiveQuery(
    async () => db.weightEntries.orderBy("dateISO").toArray(),
    [],
    [] as WeightEntry[]
  );

  const unit = useLiveQuery(async () => {
    const s = await db.settings.get("unit");
    return (s?.value as Unit) ?? "kg";
  }, [], "kg" as Unit);

  const [newWeight, setNewWeight] = useState("");
  const [range, setRange] = useState<Range>("30");

  const filtered = useMemo(() => {
    if (!entries) return [];
    if (range === "all") return entries;
    const n = Number(range);
    return entries.slice(Math.max(0, entries.length - n));
  }, [entries, range]);

  const labels = filtered.map(e => e.dateISO);
  const weights = filtered.map(e =>
  unit ? toDisplay(e.weightKg, unit) : e.weightKg
  );
  const trend = movingAverage(weights, 7);

  const data = {
    labels,
    datasets: [
      { label: "Weight (kg)", data: weights, tension: 0.25 },
      { label: "Trend (7d avg)", data: trend, tension: 0.25 }
    ]
  };

  const options: any = {
    responsive: true,
    plugins: { legend: { labels: { color: "#e5e7eb" } } },
    scales: {
      x: { ticks: { color: "#e5e7eb" }, grid: { color: "#1f2937" } },
      y: { ticks: { color: "#e5e7eb" }, grid: { color: "#1f2937" } }
    }
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
        <div className="col">
          <div className="small muted">Weight (kg)</div>
          <input
            inputMode="decimal"
            placeholder="e.g., 86.3"
            value={newWeight}
            onChange={(e) => setNewWeight(e.target.value)}
          />
        </div>

        <div style={{ width: 170 }}>
          <div className="small muted">Range</div>
          <select value={range} onChange={(e) => setRange(e.target.value as Range)}>
            <option value="7">Last 7</option>
            <option value="30">Last 30</option>
            <option value="90">Last 90</option>
            <option value="all">All</option>
          </select>
        </div>

        <div style={{ width: 140 }}>
          <button
            onClick={async () => {
              const raw = Number(newWeight);
              if (!Number.isFinite(raw)) return;

              const wKg = unit ? fromDisplay(raw, unit) : raw;

              const todayISO = format(new Date(), "yyyy-MM-dd");
              const createdAtISO = new Date().toISOString();

              // Upsert: one entry per day
              const existing = await db.weightEntries.where("dateISO").equals(todayISO).first();
              if (existing) {
                await db.weightEntries.update(existing.id, { weightKg: wKg, createdAtISO });
              } else {
                await db.weightEntries.add({
                  id: crypto.randomUUID(),
                  dateISO: todayISO,
                  weightKg: wKg,
                  createdAtISO
                });
              }

              setNewWeight("");
            }}
          >
            Add
          </button>
        </div>
      </div>

      <hr />

      <div className="card" style={{ background: "#0b1220" }}>
        {filtered.length >= 2 ? (
          <Line data={data} options={options} />
        ) : (
          <div className="muted">Add at least 2 entries to see the chart.</div>
        )}
      </div>

      <hr />

      <div className="list">
        {(entries ?? []).slice().reverse().map(e => (
          <div key={e.id} className="row" style={{ alignItems: "center" }}>
            <div className="pill">{e.dateISO}</div>
            <div style={{ fontWeight: 700 }}>
              {unit ? formatWeight(e.weightKg, unit) : e.weightKg.toFixed(1)} {unit}
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