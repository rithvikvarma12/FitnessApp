import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { format, subDays, parseISO } from "date-fns";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  type ChartOptions,
  type ChartData,
} from "chart.js";
import { db, getActiveUserId } from "../db/db";
import type { DailyNutritionLog } from "../db/types";

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

// Strip non-numeric chars (except decimal) so partial input like "3-" parses as 3, not NaN
function safeNum(s: string): number {
  const cleaned = s.replace(/[^\d.]/g, "");
  const v = parseFloat(cleaned);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

// ─── Progress Ring ────────────────────────────────────────────────────────────

function progressColor(pct: number): string {
  if (pct > 1.0) return "#ef4444";   // red — exceeded target
  if (pct >= 0.9) return "#10b981";  // green — on target
  return "#3b82f6";                   // blue — under target
}

interface RingProps { value: number; target: number; label: string; unit?: string; hitTarget?: boolean; }

function ProgressRing({ value, target, label, unit = "", hitTarget = false }: RingProps) {
  // When hitTarget is set and no actual value logged, treat as 100% qualitative
  const effectiveValue = (hitTarget && value === 0) ? target : value;
  const pct = target > 0 ? effectiveValue / target : 0;
  const color = progressColor(pct);
  const r = 28;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(pct, 1));

  return (
    <div className="nutri-ring-card">
      <svg width={72} height={72} viewBox="0 0 72 72">
        <circle cx={36} cy={36} r={r} fill="none" stroke="var(--border-subtle)" strokeWidth={6} />
        <circle
          cx={36} cy={36} r={r}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeLinecap="butt"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 36 36)"
          style={{ transition: "stroke-dashoffset 0.4s ease, stroke 0.3s ease" }}
        />
        {hitTarget && value === 0
          ? <text x={36} y={39} textAnchor="middle" fill={color} fontSize={16} fontWeight={700}>✓</text>
          : <>
              <text x={36} y={33} textAnchor="middle" fill="var(--text-primary)" fontSize={13} fontWeight={700} fontFamily="var(--font-mono)">{Math.round(value)}</text>
              <text x={36} y={46} textAnchor="middle" fill="var(--text-muted)" fontSize={9} fontFamily="var(--font-body)">/ {Math.round(target)}</text>
            </>
        }
      </svg>
      <div className="nutri-ring-label">{label}{unit ? ` (${unit})` : ""}</div>
    </div>
  );
}

// ─── Macro Bar ────────────────────────────────────────────────────────────────

interface MacroBarProps { label: string; value: number; target: number; color: string; }

function MacroBar({ label, value, target, color }: MacroBarProps) {
  const pct = target > 0 ? Math.min(value / target, 1.15) * 100 : 0;
  return (
    <div className="nutri-macro-row">
      <div className="nutri-macro-header">
        <span style={{ color }}>{label}</span>
        <span className="nutri-macro-nums">{Math.round(value)}g <span style={{ color: "var(--text-muted)" }}>/ {Math.round(target)}g</span></span>
      </div>
      <div className="nutri-macro-track">
        <div className="nutri-macro-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

interface NutritionPageProps {
  onGoToProfile?: () => void;
}

export default function NutritionPage({ onGoToProfile }: NutritionPageProps) {
  const activeUserId = useLiveQuery(async () => getActiveUserId(), [], "");
  const theme = useLiveQuery(async () => {
    const s = await db.settings.get("theme");
    return (s?.value ?? "dark") as "dark" | "light";
  }, [], "dark" as "dark" | "light");

  const settings = useLiveQuery(
    async () => activeUserId ? db.nutritionSettings.get(activeUserId) : undefined,
    [activeUserId]
  );

  const profile = useLiveQuery(
    async () => activeUserId ? db.userProfiles.get(activeUserId) : undefined,
    [activeUserId]
  );

  const [viewDate, setViewDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const log = useLiveQuery(
    async () => {
      if (!activeUserId) return undefined;
      return db.dailyNutritionLogs.get(`${activeUserId}-${viewDate}`);
    },
    [activeUserId, viewDate]
  );

  // Last 7 days of logs for weekly summary
  const recentLogs = useLiveQuery(
    async () => {
      if (!activeUserId) return [] as DailyNutritionLog[];
      return db.dailyNutritionLogs.where("userId").equals(activeUserId).toArray();
    },
    [activeUserId],
    [] as DailyNutritionLog[]
  );

  // Quick log form state
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [hitTarget, setHitTarget] = useState(false);
  const [autoFilledFromTarget, setAutoFilledFromTarget] = useState(false);
  const [notes, setNotes] = useState("");
  const [logBusy, setLogBusy] = useState(false);

  // Populate form when log loads
  useLiveQuery(async () => {
    if (!activeUserId) return;
    const existing = await db.dailyNutritionLogs.get(`${activeUserId}-${viewDate}`);
    if (existing) {
      setCalories(String(existing.calories || ""));
      setProtein(String(existing.proteinGrams || ""));
      setCarbs(String(existing.carbsGrams || ""));
      setFat(String(existing.fatGrams || ""));
      setHitTarget(existing.hitTarget);
      setAutoFilledFromTarget(false);
      setNotes(existing.notes ?? "");
    } else {
      setCalories(""); setProtein(""); setCarbs(""); setFat(""); setHitTarget(false); setAutoFilledFromTarget(false); setNotes("");
    }
  }, [activeUserId, viewDate]);

  const handleLog = async () => {
    if (!activeUserId) return;
    setLogBusy(true);
    try {
      const entry: DailyNutritionLog = {
        id: `${activeUserId}-${viewDate}`,
        userId: activeUserId,
        dateISO: viewDate,
        calories: safeNum(calories),
        proteinGrams: safeNum(protein),
        carbsGrams: safeNum(carbs),
        fatGrams: safeNum(fat),
        hitTarget,
        notes: notes.trim() || undefined,
      };
      await db.dailyNutritionLogs.put(entry);
    } finally {
      setLogBusy(false);
    }
  };

  // Weekly summary
  const weeklySummary = useMemo(() => {
    if (!settings) return null;
    const days: Array<{ dateISO: string; calories: number; onTarget: boolean }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = format(subDays(new Date(), i), "yyyy-MM-dd");
      const entry = recentLogs.find((l) => l.dateISO === d);
      const cal = entry?.calories ?? 0;
      const pct = settings.calorieTarget > 0 ? cal / settings.calorieTarget : 0;
      days.push({ dateISO: d, calories: cal, onTarget: pct >= 0.9 && pct <= 1.1 });
    }
    const logged = days.filter((d) => d.calories > 0);
    const avgCalories = logged.length > 0 ? Math.round(logged.reduce((s, d) => s + d.calories, 0) / logged.length) : 0;
    const daysOnTarget = days.filter((d) => d.onTarget).length;
    return { days, avgCalories, daysOnTarget };
  }, [recentLogs, settings]);

  const chartTextColor = theme === "light" ? "#4a5568" : "#d8dee9";
  const chartGridColor = theme === "light" ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.06)";

  const chartData = useMemo((): ChartData<"bar"> | null => {
    if (!weeklySummary || !settings) return null;
    return {
      labels: weeklySummary.days.map((d) => d.dateISO.slice(5)),
      datasets: [
        {
          label: "Calories",
          data: weeklySummary.days.map((d) => d.calories),
          backgroundColor: weeklySummary.days.map((d) => d.onTarget ? "#10b981" : "#3b82f6"),
          borderRadius: 4,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({
          label: "Target",
          data: weeklySummary.days.map(() => settings.calorieTarget),
          backgroundColor: "transparent",
          borderColor: "#f97316",
          borderWidth: 1,
          type: "line",
          pointRadius: 0,
        } as any),
      ],
    };
  }, [weeklySummary, settings]);

  const chartOptions: ChartOptions<"bar"> = {
    responsive: true,
    plugins: { legend: { labels: { color: chartTextColor } } },
    scales: {
      x: { ticks: { color: chartTextColor }, grid: { color: chartGridColor } },
      y: { ticks: { color: chartTextColor }, grid: { color: chartGridColor }, beginAtZero: true },
    },
  };

  if (!settings?.enabled) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-icon">🥗</div>
          <div className="empty-state-title">Nutrition tracking off</div>
          <div className="empty-state-body">Enable nutrition tracking in Profile → Nutrition to get started.</div>
        </div>
      </div>
    );
  }

  // Existing profile without body stats — guide them to set up
  const missingBodyStats = profile && (!profile.heightCm || !profile.age || !profile.gender);
  if (missingBodyStats) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="empty-state-icon">📏</div>
          <div className="empty-state-title">Body stats needed</div>
          <div className="empty-state-body">
            Enter your height, age, and gender to calculate your calorie and macro targets.
          </div>
          {onGoToProfile && (
            <button onClick={onGoToProfile} style={{ marginTop: 8 }}>
              Go to Profile settings
            </button>
          )}
        </div>
      </div>
    );
  }

  const todayISO = format(new Date(), "yyyy-MM-dd");
  const isToday = viewDate === todayISO;

  return (
    <div className="nutri-page">
      {/* Date navigation */}
      <div className="nutri-date-nav">
        <button className="secondary" style={{ padding: "6px 10px" }} onClick={() => setViewDate(format(subDays(parseISO(viewDate), 1), "yyyy-MM-dd"))}>‹</button>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{isToday ? "Today" : viewDate}</div>
          {!isToday && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{viewDate}</div>}
        </div>
        <button className="secondary" style={{ padding: "6px 10px" }} disabled={isToday} onClick={() => setViewDate(format(subDays(parseISO(viewDate), -1), "yyyy-MM-dd"))}>›</button>
      </div>

      {/* Target cards */}
      <div className="nutri-rings-row">
        <ProgressRing value={safeNum(calories)} target={settings.calorieTarget} label="Calories" unit="kcal" hitTarget={hitTarget} />
        {settings.trackProtein && <ProgressRing value={safeNum(protein)} target={settings.proteinGrams} label="Protein" unit="g" hitTarget={hitTarget} />}
        {settings.trackCarbs && <ProgressRing value={safeNum(carbs)} target={settings.carbsGrams} label="Carbs" unit="g" hitTarget={hitTarget} />}
        {settings.trackFat && <ProgressRing value={safeNum(fat)} target={settings.fatGrams} label="Fat" unit="g" hitTarget={hitTarget} />}
      </div>

      {!settings.isCustom && (
        <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", marginTop: -4 }}>
          Targets auto-adjust as your weight changes
        </div>
      )}

      {/* Macro bars */}
      {(settings.trackProtein || settings.trackCarbs || settings.trackFat) && (
        <div className="nutri-macro-section">
          {settings.trackProtein && <MacroBar label="Protein" value={log?.proteinGrams ?? 0} target={settings.proteinGrams} color="#8b5cf6" />}
          {settings.trackCarbs && <MacroBar label="Carbs" value={log?.carbsGrams ?? 0} target={settings.carbsGrams} color="#3b82f6" />}
          {settings.trackFat && <MacroBar label="Fat" value={log?.fatGrams ?? 0} target={settings.fatGrams} color="#f97316" />}
        </div>
      )}

      {/* Quick log form */}
      <div className="card nutri-log-card">
        <div className="nutri-section-title">Log {isToday ? "Today" : viewDate}</div>

        <div className="row" style={{ gap: 8 }}>
          <div style={{ flex: "2 1 120px" }}>
            <div className="nutri-field-label">Calories (kcal)</div>
            <input inputMode="numeric" placeholder="e.g. 1800" value={calories} onChange={(e) => setCalories(e.target.value)} />
          </div>
          {settings.trackProtein && (
            <div style={{ flex: "1 1 80px" }}>
              <div className="nutri-field-label">Protein (g)</div>
              <input inputMode="numeric" placeholder="0" value={protein} onChange={(e) => setProtein(e.target.value)} />
            </div>
          )}
          {settings.trackCarbs && (
            <div style={{ flex: "1 1 80px" }}>
              <div className="nutri-field-label">Carbs (g)</div>
              <input inputMode="numeric" placeholder="0" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
            </div>
          )}
          {settings.trackFat && (
            <div style={{ flex: "1 1 80px" }}>
              <div className="nutri-field-label">Fat (g)</div>
              <input inputMode="numeric" placeholder="0" value={fat} onChange={(e) => setFat(e.target.value)} />
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={hitTarget}
              onChange={async (e) => {
                const checked = e.target.checked;
                if (checked) {
                  const hasValues = safeNum(calories) > 0 || safeNum(protein) > 0 || safeNum(carbs) > 0 || safeNum(fat) > 0;
                  if (!hasValues) {
                    setCalories(String(Math.round(settings.calorieTarget)));
                    if (settings.trackProtein) setProtein(String(Math.round(settings.proteinGrams)));
                    if (settings.trackCarbs) setCarbs(String(Math.round(settings.carbsGrams)));
                    if (settings.trackFat) setFat(String(Math.round(settings.fatGrams)));
                    setAutoFilledFromTarget(true);
                  }
                } else if (autoFilledFromTarget) {
                  setCalories(""); setProtein(""); setCarbs(""); setFat("");
                  setAutoFilledFromTarget(false);
                }
                setHitTarget(checked);
                if (!activeUserId) return;
                const calVal = (checked && safeNum(calories) === 0) ? Math.round(settings.calorieTarget) : safeNum(calories);
                const proVal = (checked && safeNum(protein) === 0 && settings.trackProtein) ? Math.round(settings.proteinGrams) : safeNum(protein);
                const crbVal = (checked && safeNum(carbs) === 0 && settings.trackCarbs) ? Math.round(settings.carbsGrams) : safeNum(carbs);
                const fatVal = (checked && safeNum(fat) === 0 && settings.trackFat) ? Math.round(settings.fatGrams) : safeNum(fat);
                const entry: DailyNutritionLog = {
                  id: `${activeUserId}-${viewDate}`,
                  userId: activeUserId,
                  dateISO: viewDate,
                  calories: calVal,
                  proteinGrams: proVal,
                  carbsGrams: crbVal,
                  fatGrams: fatVal,
                  hitTarget: checked,
                  notes: notes.trim() || undefined,
                };
                await db.dailyNutritionLogs.put(entry);
              }}
              style={{ width: 16, height: 16 }}
            />
            Hit target today
          </label>
        </div>

        <input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ fontSize: 12 }} />

        <button disabled={logBusy} onClick={() => void handleLog()} style={{ alignSelf: "flex-start" }}>
          {logBusy ? "Saving…" : log ? "Update" : "Log"}
        </button>
      </div>

      {/* Weekly summary */}
      {weeklySummary && (
        <div className="card nutri-weekly-card">
          <div className="nutri-section-title">This Week</div>

          <div className="row" style={{ gap: 10, marginBottom: 12 }}>
            <div className="stat-box" style={{ flex: "1 1 80px" }}>
              <div className="stat-box-label">Avg Calories</div>
              <div className="stat-box-value">{weeklySummary.avgCalories || "—"}</div>
            </div>
            <div className="stat-box" style={{ flex: "1 1 80px" }}>
              <div className="stat-box-label">Days on Target</div>
              <div className="stat-box-value">{weeklySummary.daysOnTarget}/7</div>
            </div>
            <div className="stat-box" style={{ flex: "1 1 80px" }}>
              <div className="stat-box-label">Adherence</div>
              <div className="stat-box-value">{Math.round((weeklySummary.daysOnTarget / 7) * 100)}%</div>
            </div>
          </div>

          {chartData && (
            <div style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-glass)", borderRadius: "var(--radius-md)", padding: 10 }}>
              <Bar data={chartData} options={chartOptions} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
