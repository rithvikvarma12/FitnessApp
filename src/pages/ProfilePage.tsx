import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getActiveUserId } from "../db/db";
import type { Unit } from "../services/units";
import { fromDisplay, toDisplay } from "../services/units";
import type { CustomExercise, ExerciseTemplate, NutritionSettings } from "../db/types";
import { generateNutritionSettings, defaultActivityMultiplier } from "../services/nutritionCalculator";

type GoalMode = "cut" | "maintain" | "bulk";
type Equipment = "gym" | "home" | "minimal";

type FormState = {
  goalMode: GoalMode;
  targetWeight: string;
  daysPerWeek: 3 | 4 | 5;
  equipment: Equipment;
};

type BackupPayload = {
  version: string;
  exportedAtISO: string;
  userProfiles: unknown[];
  settings: unknown[];
  weekPlans: unknown[];
  weightEntries: unknown[];
  exerciseTemplates: unknown[];
  planTemplates: unknown[];
  exerciseMeta: unknown[];
};

function resolveGoalMode(profile: { goalMode?: GoalMode; goal?: "cut" | "maintain" | "gain" }): GoalMode {
  if (profile.goalMode) return profile.goalMode;
  if (profile.goal === "gain") return "bulk";
  if (profile.goal === "cut") return "cut";
  return "maintain";
}

export default function ProfilePage() {
  const activeUserId = useLiveQuery(async () => getActiveUserId(), [], "");
  const unit = useLiveQuery(async () => {
    const s = await db.settings.get("unit");
    return (s?.value as Unit) ?? "kg";
  }, [], "kg" as Unit);

  const profile = useLiveQuery(
    async () => (activeUserId ? db.userProfiles.get(activeUserId) : undefined),
    [activeUserId]
  );
  const latestWeight = useLiveQuery(
    async () => {
      if (!activeUserId) return undefined;
      const rows = await db.weightEntries.where("userId").equals(activeUserId).toArray();
      rows.sort((a, b) => b.dateISO.localeCompare(a.dateISO));
      return rows[0];
    },
    [activeUserId]
  );

  const initialForm = useMemo<FormState | null>(() => {
    if (!profile) return null;
    return {
      goalMode: resolveGoalMode(profile),
      targetWeight: typeof profile.targetWeightKg === "number" ? toDisplay(profile.targetWeightKg, unit).toFixed(1) : "",
      daysPerWeek: profile.daysPerWeek,
      equipment: profile.equipment
    };
  }, [profile, unit]);

  const restTimerEnabled = useLiveQuery(async () => {
    const s = await db.settings.get("restTimerEnabled");
    return s?.value !== "false";
  }, [], true);
  const theme = useLiveQuery(async () => {
    const s = await db.settings.get("theme");
    return (s?.value ?? "dark") as "dark" | "light";
  }, [], "dark" as "dark" | "light");
  const customExercises = useLiveQuery(
    async () => activeUserId ? db.customExercises.where("userId").equals(activeUserId).toArray() : [],
    [activeUserId], [] as CustomExercise[]
  );
  const allExerciseTemplates = useLiveQuery(
    () => db.exerciseTemplates.toArray(), [], [] as ExerciseTemplate[]
  );

  const nutritionSettings = useLiveQuery(
    async () => activeUserId ? db.nutritionSettings.get(activeUserId) : undefined,
    [activeUserId]
  );

  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [dataMsg, setDataMsg] = useState<string | null>(null);
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [customForm, setCustomForm] = useState({ name: "", muscleGroup: "chest", type: "isolation", equipment: "dumbbell", notes: "" });
  const [customError, setCustomError] = useState<string | null>(null);

  // Nutrition body stats form
  const [heightInput, setHeightInput] = useState("");
  const [ageInput, setAgeInput] = useState("");
  const [genderInput, setGenderInput] = useState<"male" | "female">("male");
  const [activityInput, setActivityInput] = useState("1.55");
  const [nutritionCustom, setNutritionCustom] = useState<{ calories: string; protein: string; carbs: string; fat: string } | null>(null);
  const [nutritionExpanded, setNutritionExpanded] = useState(false);

  // Sync body stats inputs from profile
  useEffect(() => {
    if (!profile) return;
    if (typeof profile.heightCm === "number") setHeightInput(String(profile.heightCm));
    if (typeof profile.age === "number") setAgeInput(String(profile.age));
    if (profile.gender) setGenderInput(profile.gender);
    setActivityInput(String(profile.activityMultiplier ?? defaultActivityMultiplier(profile.daysPerWeek)));
  }, [profile]);

  useEffect(() => {
    setForm(initialForm);
  }, [initialForm]);

  if (!profile || !form) {
    return <div className="card">No active profile.</div>;
  }

  const onSave = async () => {
    if (!activeUserId) return;
    setBusy(true);
    setMsg(null);
    try {
      const targetRaw = Number(form.targetWeight);
      const targetWeightKg = Number.isFinite(targetRaw) ? fromDisplay(targetRaw, unit) : undefined;
      await db.userProfiles.update(activeUserId, {
        goalMode: form.goalMode,
        goal: form.goalMode === "bulk" ? "gain" : form.goalMode,
        targetWeightKg,
        daysPerWeek: form.daysPerWeek,
        equipment: form.equipment
      });
      setMsg("Profile updated.");
    } catch (e: any) {
      setMsg(e?.message ?? "Could not save profile.");
    } finally {
      setBusy(false);
    }
  };

  const exportData = async () => {
    setDataMsg(null);
    try {
      const [userProfiles, settingsRaw, weekPlans, weightEntries, exerciseTemplates, planTemplates, exerciseMeta] = await Promise.all([
        db.userProfiles.toArray(),
        db.settings.toArray(),
        db.weekPlans.toArray(),
        db.weightEntries.toArray(),
        db.exerciseTemplates.toArray(),
        db.planTemplates.toArray(),
        db.exerciseMeta.toArray()
      ]);

      const settings = settingsRaw.filter((s) => {
        const key = s.key.toLowerCase();
        return !key.includes("token") && !key.includes("secret") && !key.includes("password") && !key.includes("apikey");
      });

      const payload: BackupPayload = {
        version: "v0.5.2",
        exportedAtISO: new Date().toISOString(),
        userProfiles,
        settings,
        weekPlans,
        weightEntries,
        exerciseTemplates,
        planTemplates,
        exerciseMeta
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cut-gym-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setDataMsg("Exported backup JSON.");
    } catch (e: any) {
      setDataMsg(e?.message ?? "Export failed.");
    }
  };

  const isValidPayload = (value: any): value is BackupPayload => {
    return !!value &&
      typeof value === "object" &&
      Array.isArray(value.userProfiles) &&
      Array.isArray(value.settings) &&
      Array.isArray(value.weekPlans) &&
      Array.isArray(value.weightEntries) &&
      Array.isArray(value.exerciseTemplates) &&
      Array.isArray(value.planTemplates) &&
      Array.isArray(value.exerciseMeta);
  };

  const onImportPicked = async (file: File | null) => {
    if (!file) return;
    setDataMsg(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!isValidPayload(parsed)) {
        throw new Error("Invalid backup format.");
      }

      const confirmed = window.confirm("This will overwrite your current local data. Continue?");
      if (!confirmed) return;

      await db.weekPlans.clear();
      await db.weightEntries.clear();
      await db.exerciseMeta.clear();
      await db.exerciseTemplates.clear();
      await db.planTemplates.clear();
      await db.settings.clear();
      await db.userProfiles.clear();

      if (parsed.planTemplates.length) await db.planTemplates.bulkPut(parsed.planTemplates as any[]);
      if (parsed.exerciseTemplates.length) await db.exerciseTemplates.bulkPut(parsed.exerciseTemplates as any[]);
      if (parsed.exerciseMeta.length) await db.exerciseMeta.bulkPut(parsed.exerciseMeta as any[]);
      if (parsed.userProfiles.length) await db.userProfiles.bulkPut(parsed.userProfiles as any[]);
      if (parsed.settings.length) await db.settings.bulkPut(parsed.settings as any[]);
      if (parsed.weekPlans.length) await db.weekPlans.bulkPut(parsed.weekPlans as any[]);
      if (parsed.weightEntries.length) await db.weightEntries.bulkPut(parsed.weightEntries as any[]);

      const active = await db.settings.get("activeUserId");
      if (!active?.value) {
        const firstProfile = await db.userProfiles.orderBy("createdAtISO").first();
        if (firstProfile) {
          await db.settings.put({ key: "activeUserId", value: firstProfile.id });
          await db.settings.put({ key: "unit", value: firstProfile.unit });
        }
      }

      setDataMsg("Import complete. Reloading...");
      setTimeout(() => window.location.reload(), 300);
    } catch (e: any) {
      setDataMsg(e?.message ?? "Import failed.");
    } finally {
      if (importFileRef.current) importFileRef.current.value = "";
    }
  };

  const onAddCustomExercise = async () => {
    if (!activeUserId) return;
    setCustomError(null);
    const trimmed = customForm.name.trim();
    if (!trimmed) { setCustomError("Name is required."); return; }
    const nameLower = trimmed.toLowerCase();
    const dupInTemplates = (allExerciseTemplates ?? []).some((t) => t.name.toLowerCase() === nameLower);
    const dupInCustom = (customExercises ?? []).some((c) => c.name.toLowerCase() === nameLower);
    if (dupInTemplates || dupInCustom) { setCustomError("An exercise with that name already exists."); return; }
    await db.customExercises.add({
      id: crypto.randomUUID(),
      userId: activeUserId,
      name: trimmed,
      muscleGroup: customForm.muscleGroup,
      type: customForm.type,
      equipment: customForm.equipment,
      notes: customForm.notes.trim() || undefined,
      createdAtISO: new Date().toISOString()
    });
    setCustomForm({ name: "", muscleGroup: "chest", type: "isolation", equipment: "dumbbell", notes: "" });
  };

  const onDeleteCustomExercise = async (id: string) => {
    if (!window.confirm("Delete this custom exercise?")) return;
    await db.customExercises.delete(id);
  };

  const GROUP_COLOR: Record<string, string> = {
    chest: "rgba(239,68,68,0.15)", back: "rgba(59,130,246,0.15)", shoulders: "rgba(168,85,247,0.15)",
    legs: "rgba(16,185,129,0.15)", biceps: "rgba(234,179,8,0.15)", triceps: "rgba(249,115,22,0.15)",
    core: "rgba(20,184,166,0.15)", other: "rgba(148,163,184,0.15)"
  };
  const GROUP_TEXT: Record<string, string> = {
    chest: "#ef4444", back: "#3b82f6", shoulders: "#a855f7",
    legs: "#10b981", biceps: "#eab308", triceps: "#f97316",
    core: "#14b8a6", other: "#94a3b8"
  };

  const fieldLabel = (text: string) => (
    <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>
      {text}
    </div>
  );

  return (
    <div className="card">
      <h2>Profile Settings</h2>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 14 }}>Changes apply to future week generation only.</div>

      <div className="row">
        <div className="col">
          {fieldLabel("Goal Mode")}
          <select
            value={form.goalMode}
            onChange={(e) => setForm((prev) => (prev ? { ...prev, goalMode: e.target.value as GoalMode } : prev))}
          >
            <option value="cut">Cut</option>
            <option value="maintain">Maintain</option>
            <option value="bulk">Bulk</option>
          </select>
        </div>

        <div className="col">
          {fieldLabel(`Target Weight (${unit})`)}
          <input
            inputMode="decimal"
            value={form.targetWeight}
            placeholder={form.goalMode === "maintain" ? "Optional" : "Required"}
            onChange={(e) => setForm((prev) => (prev ? { ...prev, targetWeight: e.target.value } : prev))}
          />
        </div>
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <div className="col">
          {fieldLabel("Days / week")}
          <select
            value={String(form.daysPerWeek)}
            onChange={(e) =>
              setForm((prev) => (prev ? { ...prev, daysPerWeek: Number(e.target.value) as 3 | 4 | 5 } : prev))
            }
          >
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
          </select>
        </div>

        <div className="col">
          {fieldLabel("Equipment")}
          <select
            value={form.equipment}
            onChange={(e) => setForm((prev) => (prev ? { ...prev, equipment: e.target.value as Equipment } : prev))}
          >
            <option value="gym">Gym</option>
            <option value="home">Home</option>
            <option value="minimal">Minimal</option>
          </select>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10 }}>
        Current weight: {latestWeight ? `${toDisplay(latestWeight.weightKg, unit).toFixed(1)} ${unit}` : "No entries yet"}
      </div>

      <div className="row" style={{ marginTop: 12, alignItems: "center", gap: 10 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
          <input
            type="checkbox"
            checked={restTimerEnabled ?? true}
            onChange={(e) => void db.settings.put({ key: "restTimerEnabled", value: String(e.target.checked) })}
          />
          Auto rest timer after set completion
        </label>
      </div>

      <div className="row" style={{ marginTop: 14, alignItems: "center", gap: 10 }}>
        <button onClick={onSave} disabled={busy}>Save Profile</button>
        {msg ? <span style={{ fontSize: 12, color: "var(--accent-green)" }}>{msg}</span> : null}
      </div>

      <hr />

      {/* Theme */}
      <div style={{ marginBottom: 16 }}>
        {fieldLabel("Theme")}
        <div className="unit-toggle">
          <button
            className={`unit-toggle-btn ${theme === "dark" ? "active" : ""}`}
            onClick={() => void db.settings.put({ key: "theme", value: "dark" })}
          >
            Dark
          </button>
          <button
            className={`unit-toggle-btn ${theme === "light" ? "active" : ""}`}
            onClick={() => void db.settings.put({ key: "theme", value: "light" })}
          >
            Light
          </button>
        </div>
      </div>

      <hr />

      <div style={{
        background: "var(--bg-subtle)",
        border: "1px solid var(--border-glass)",
        borderRadius: "var(--radius-md)",
        padding: "12px 14px",
        marginBottom: 16
      }}>
        <h3 style={{ marginBottom: 4 }}>Data</h3>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>Local backup only. Export/import JSON.</div>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <button type="button" className="secondary" onClick={() => void exportData()}>
            Export
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => importFileRef.current?.click()}
          >
            Import
          </button>
          <input
            ref={importFileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => void onImportPicked(e.target.files?.[0] ?? null)}
          />
          {dataMsg ? <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{dataMsg}</span> : null}
        </div>
      </div>

      {/* Nutrition */}
      <div style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-glass)", borderRadius: "var(--radius-md)", padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Nutrition</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Track nutrition</span>
            <button
              className={nutritionSettings?.enabled ? "" : "secondary"}
              style={{ padding: "4px 10px", fontSize: 11 }}
              onClick={async () => {
                if (!activeUserId) return;
                const current = await db.nutritionSettings.get(activeUserId);
                if (current) {
                  await db.nutritionSettings.update(activeUserId, { enabled: !current.enabled });
                } else {
                  await db.nutritionSettings.put({
                    id: activeUserId, userId: activeUserId, enabled: true,
                    calorieTarget: 2000, proteinGrams: 150, carbsGrams: 200, fatGrams: 65,
                    trackProtein: true, trackCarbs: true, trackFat: true, isCustom: false
                  });
                }
              }}
            >
              {nutritionSettings?.enabled ? "On" : "Off"}
            </button>
            <button className="secondary" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => setNutritionExpanded((v) => !v)}>
              {nutritionExpanded ? "Hide" : "Setup"}
            </button>
          </div>
        </div>

        {nutritionExpanded && (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Body stats are used to estimate your TDEE and macro targets.</div>

            {/* Body Stats */}
            <div className="row" style={{ gap: 8 }}>
              <div style={{ flex: "1 1 120px" }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Height (cm)</div>
                <input inputMode="decimal" placeholder="175" value={heightInput} onChange={(e) => setHeightInput(e.target.value)} />
              </div>
              <div style={{ flex: "1 1 80px" }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Age</div>
                <input inputMode="numeric" placeholder="25" value={ageInput} onChange={(e) => setAgeInput(e.target.value)} />
              </div>
              <div style={{ flex: "1 1 120px" }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Gender</div>
                <div className="unit-toggle">
                  <button className={`unit-toggle-btn ${genderInput === "male" ? "active" : ""}`} onClick={() => setGenderInput("male")}>Male</button>
                  <button className={`unit-toggle-btn ${genderInput === "female" ? "active" : ""}`} onClick={() => setGenderInput("female")}>Female</button>
                </div>
              </div>
              <div style={{ flex: "2 1 180px" }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Activity Level</div>
                <select value={activityInput} onChange={(e) => setActivityInput(e.target.value)}>
                  <option value="1.2">Sedentary (desk job, no exercise)</option>
                  <option value="1.375">Lightly Active (1–3 days/wk)</option>
                  <option value="1.55">Moderately Active (3–5 days/wk)</option>
                  <option value="1.725">Very Active (6–7 days/wk)</option>
                  <option value="1.9">Extremely Active (athlete)</option>
                </select>
              </div>
            </div>

            {/* Calculated targets preview */}
            {(() => {
              const h = Number(heightInput);
              const a = Number(ageInput);
              const act = Number(activityInput);
              const wKg = latestWeight?.weightKg ?? profile.currentWeightKg;
              if (!h || !a || !wKg || !Number.isFinite(act)) return null;
              const settings = generateNutritionSettings({ ...profile, heightCm: h, age: a, gender: genderInput, activityMultiplier: act }, wKg);
              if (!settings) return null;
              const goalLabel = form.goalMode === "cut" ? "Cut" : form.goalMode === "bulk" ? "Bulk" : "Maintain";
              return (
                <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-glass)", borderRadius: "var(--radius-md)", padding: "10px 12px", display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    Estimated TDEE: <strong style={{ color: "var(--text-primary)" }}>{settings.calculatedTDEE?.toLocaleString()} kcal</strong>
                    &nbsp;·&nbsp;{goalLabel} target: <strong style={{ color: "var(--accent-blue)" }}>{settings.calorieTarget.toLocaleString()} kcal</strong>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <span>Protein <strong style={{ color: "var(--text-primary)" }}>{settings.proteinGrams}g</strong></span>
                    <span>Carbs <strong style={{ color: "var(--text-primary)" }}>{settings.carbsGrams}g</strong></span>
                    <span>Fat <strong style={{ color: "var(--text-primary)" }}>{settings.fatGrams}g</strong></span>
                  </div>
                </div>
              );
            })()}

            {/* Custom override toggle */}
            {nutritionSettings && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  className="secondary"
                  style={{ padding: "4px 10px", fontSize: 11 }}
                  onClick={() => {
                    if (nutritionCustom) {
                      setNutritionCustom(null);
                    } else {
                      setNutritionCustom({
                        calories: String(nutritionSettings.calorieTarget),
                        protein: String(nutritionSettings.proteinGrams),
                        carbs: String(nutritionSettings.carbsGrams),
                        fat: String(nutritionSettings.fatGrams),
                      });
                    }
                  }}
                >
                  {nutritionCustom ? "Cancel override" : "Customize targets"}
                </button>
                {nutritionSettings.isCustom && (
                  <button
                    className="secondary"
                    style={{ padding: "4px 10px", fontSize: 11 }}
                    onClick={async () => {
                      if (!activeUserId) return;
                      const wKg = latestWeight?.weightKg ?? profile.currentWeightKg;
                      if (!wKg) return;
                      const h = Number(heightInput); const a = Number(ageInput); const act = Number(activityInput);
                      const recalc = generateNutritionSettings({ ...profile, heightCm: h || profile.heightCm, age: a || profile.age, gender: genderInput, activityMultiplier: act }, wKg);
                      if (!recalc) return;
                      await db.nutritionSettings.put({ ...recalc, id: activeUserId, userId: activeUserId });
                      setNutritionCustom(null);
                    }}
                  >
                    Reset to calculated
                  </button>
                )}
              </div>
            )}

            {nutritionCustom && (
              <div className="row" style={{ gap: 8 }}>
                {(["calories", "protein", "carbs", "fat"] as const).map((k) => (
                  <div key={k} style={{ flex: "1 1 80px" }}>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{k === "calories" ? "kcal" : k + "g"}</div>
                    <input inputMode="numeric" value={nutritionCustom[k]} onChange={(e) => setNutritionCustom((p) => p ? { ...p, [k]: e.target.value } : p)} />
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={async () => {
                if (!activeUserId) return;
                const h = Number(heightInput);
                const a = Number(ageInput);
                const act = Number(activityInput);
                if (!h || !a) return;
                await db.userProfiles.update(activeUserId, { heightCm: h, age: a, gender: genderInput, activityMultiplier: act } as Partial<typeof profile>);
                const wKg = latestWeight?.weightKg ?? profile.currentWeightKg ?? 70;
                const base = generateNutritionSettings({ ...profile, heightCm: h, age: a, gender: genderInput, activityMultiplier: act }, wKg);
                const existing = await db.nutritionSettings.get(activeUserId);
                if (nutritionCustom && existing?.isCustom) {
                  await db.nutritionSettings.put({
                    ...(existing ?? { id: activeUserId, userId: activeUserId, trackProtein: true, trackCarbs: true, trackFat: true }),
                    calorieTarget: Number(nutritionCustom.calories) || (base?.calorieTarget ?? 2000),
                    proteinGrams: Number(nutritionCustom.protein) || (base?.proteinGrams ?? 150),
                    carbsGrams: Number(nutritionCustom.carbs) || (base?.carbsGrams ?? 200),
                    fatGrams: Number(nutritionCustom.fat) || (base?.fatGrams ?? 65),
                    isCustom: true,
                    calculatedTDEE: base?.calculatedTDEE,
                    enabled: existing?.enabled ?? true,
                  } as NutritionSettings);
                } else if (base) {
                  const merged: NutritionSettings = {
                    ...(existing ?? {}),
                    ...base,
                    id: activeUserId,
                    userId: activeUserId,
                    enabled: existing?.enabled ?? true,
                    trackProtein: existing?.trackProtein ?? true,
                    trackCarbs: existing?.trackCarbs ?? true,
                    trackFat: existing?.trackFat ?? true,
                    isCustom: false,
                  };
                  await db.nutritionSettings.put(merged);
                }
                setNutritionCustom(null);
              }}
              style={{ alignSelf: "flex-start" }}
            >
              Save Nutrition Settings
            </button>
          </div>
        )}
      </div>

      {/* Custom Exercises */}
      <div style={{
        background: "var(--bg-subtle)",
        border: "1px solid var(--border-glass)",
        borderRadius: "var(--radius-md)",
        padding: "12px 14px"
      }}>
        <h3 style={{ marginBottom: 4 }}>Custom Exercises</h3>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
          Add exercises not in the built-in library. They'll appear in swap suggestions and future plans.
        </div>

        {/* Form */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          <input
            placeholder="Exercise name"
            value={customForm.name}
            onChange={(e) => setCustomForm((p) => ({ ...p, name: e.target.value }))}
          />
          <div className="row" style={{ gap: 8 }}>
            <div className="col">
              {fieldLabel("Muscle Group")}
              <select
                value={customForm.muscleGroup}
                onChange={(e) => setCustomForm((p) => ({ ...p, muscleGroup: e.target.value }))}
              >
                <option value="chest">Chest</option>
                <option value="back">Back</option>
                <option value="shoulders">Shoulders</option>
                <option value="legs">Legs</option>
                <option value="biceps">Biceps</option>
                <option value="triceps">Triceps</option>
                <option value="core">Core</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="col">
              {fieldLabel("Equipment")}
              <select
                value={customForm.equipment}
                onChange={(e) => setCustomForm((p) => ({ ...p, equipment: e.target.value }))}
              >
                <option value="barbell">Barbell</option>
                <option value="dumbbell">Dumbbell</option>
                <option value="cable">Cable</option>
                <option value="machine">Machine</option>
                <option value="bodyweight">Bodyweight</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            {fieldLabel("Type")}
            <div className="unit-toggle">
              <button
                className={`unit-toggle-btn ${customForm.type === "isolation" ? "active" : ""}`}
                onClick={() => setCustomForm((p) => ({ ...p, type: "isolation" }))}
              >
                Isolation
              </button>
              <button
                className={`unit-toggle-btn ${customForm.type === "compound" ? "active" : ""}`}
                onClick={() => setCustomForm((p) => ({ ...p, type: "compound" }))}
              >
                Compound
              </button>
            </div>
          </div>
          <input
            placeholder="Notes (optional)"
            value={customForm.notes}
            onChange={(e) => setCustomForm((p) => ({ ...p, notes: e.target.value }))}
          />
          {customError ? <div style={{ fontSize: 12, color: "#ef4444" }}>{customError}</div> : null}
          <button type="button" onClick={() => void onAddCustomExercise()}>
            Add Exercise
          </button>
        </div>

        {/* List */}
        {(customExercises ?? []).length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>
            No custom exercises added yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(customExercises ?? []).map((cx) => (
              <div
                key={cx.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  background: "var(--bg-input)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-subtle)"
                }}
              >
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{cx.name}</span>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
                  background: GROUP_COLOR[cx.muscleGroup] ?? GROUP_COLOR.other,
                  color: GROUP_TEXT[cx.muscleGroup] ?? GROUP_TEXT.other
                }}>
                  {cx.muscleGroup}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
                  background: "rgba(59,130,246,0.1)", color: "#3b82f6"
                }}>
                  {cx.type}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
                  background: "var(--bg-subtle)", color: "var(--text-secondary)"
                }}>
                  {cx.equipment}
                </span>
                <button
                  type="button"
                  className="secondary"
                  style={{ padding: "2px 8px", fontSize: 11 }}
                  onClick={() => void onDeleteCustomExercise(cx.id)}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
