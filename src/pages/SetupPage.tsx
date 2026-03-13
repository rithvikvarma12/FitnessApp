import { useState } from "react";
import { db } from "../db/db";
import type { UserProfile } from "../db/types";
import { ensureSeedData } from "../db/seed";
import { createFirstWeekIfMissing } from "../services/planGenerator";
import { initDemoPresetForUser } from "../services/presets";
import { deriveAutoCardio, defaultCardioTypeForGoal } from "../services/cardio";
import { fromDisplay, toDisplay } from "../services/units";
import { generateNutritionSettings, defaultActivityMultiplier } from "../services/nutritionCalculator";
import { supabase } from "../lib/supabase";

type PresetKey = "generic" | "demo";

const HOME_EQUIPMENT_OPTIONS: { key: string; label: string }[] = [
  { key: "dumbbells",        label: "Dumbbells" },
  { key: "barbell",          label: "Barbell" },
  { key: "kettlebell",       label: "Kettlebell" },
  { key: "resistance_bands", label: "Resistance Bands" },
  { key: "bench",            label: "Bench" },
  { key: "pull_up_bar",      label: "Pull-Up Bar" },
];

type FormState = {
  name: string;
  unit: "kg" | "lb";
  daysPerWeek: 3 | 4 | 5;
  goalMode: "cut" | "maintain" | "bulk";
  currentWeight: string;
  targetWeight: string;
  experience: "beginner" | "intermediate";
  equipment: "gym" | "home" | "minimal";
  homeEquipment: string[];
  volumePreference: "light" | "moderate" | "high";
  cardioGoalAuto: boolean;
  cardioType: "LISS" | "Intervals" | "Mixed";
  cardioSessionsPerWeek: number;
  cardioMinutesPerSession: number;
  notes: string;
  // body stats for nutrition
  heightCm: string;
  age: string;
  gender: "male" | "female";
};

function withAutoCardio(base: Omit<FormState, "cardioGoalAuto" | "cardioType" | "cardioSessionsPerWeek" | "cardioMinutesPerSession">): FormState {
  const cardio = deriveAutoCardio(base.goalMode, base.daysPerWeek);
  return {
    ...base,
    cardioGoalAuto: true,
    cardioType: cardio.cardioType,
    cardioSessionsPerWeek: cardio.cardioSessionsPerWeek,
    cardioMinutesPerSession: cardio.cardioMinutesPerSession
  };
}

const baseGeneric = withAutoCardio({
  name: "",
  unit: "kg",
  daysPerWeek: 4,
  goalMode: "maintain",
  currentWeight: "",
  targetWeight: "",
  experience: "beginner",
  equipment: "gym",
  homeEquipment: [],
  volumePreference: "moderate" as const,
  notes: "",
  heightCm: "",
  age: "",
  gender: "male",
});


const baseDemo = withAutoCardio({
  name: "Demo Profile",
  unit: "kg",
  daysPerWeek: 5,
  goalMode: "cut",
  currentWeight: "86",
  targetWeight: "78",
  experience: "intermediate",
  equipment: "gym",
  homeEquipment: [],
  volumePreference: "moderate" as const,
  notes: "Demo sample data preset",
  heightCm: "178",
  age: "28",
  gender: "male",
});

function presetDefaults(preset: PresetKey): FormState {
  if (preset === "demo") return { ...baseDemo };
  return { ...baseGeneric };
}

interface SetupPageProps { onDone?: () => void; supabaseProfileId?: string; }
export default function SetupPage({ onDone, supabaseProfileId }: SetupPageProps = {}) {
  const [preset, setPreset] = useState<PresetKey>("generic");
  const [form, setForm] = useState<FormState>(presetDefaults("generic"));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value } as FormState;
      if (key === "unit") {
        const prevUnit = prev.unit;
        const nextUnit = value as FormState["unit"];
        if (prevUnit !== nextUnit) {
          const currentNum = Number(prev.currentWeight);
          const targetNum = Number(prev.targetWeight);
          if (Number.isFinite(currentNum)) {
            next.currentWeight = toDisplay(fromDisplay(currentNum, prevUnit), nextUnit).toFixed(1);
          }
          if (Number.isFinite(targetNum)) {
            next.targetWeight = toDisplay(fromDisplay(targetNum, prevUnit), nextUnit).toFixed(1);
          }
        }
      }
      if (next.cardioGoalAuto && (key === "goalMode" || key === "daysPerWeek")) {
        const cardio = deriveAutoCardio(next.goalMode, next.daysPerWeek);
        next.cardioType = cardio.cardioType;
        next.cardioSessionsPerWeek = cardio.cardioSessionsPerWeek;
        next.cardioMinutesPerSession = cardio.cardioMinutesPerSession;
      }
      return next;
    });
  };

  const handlePresetChange = (value: PresetKey) => {
    setPreset(value);
    setForm(presetDefaults(value));
  };

  const createProfile = async () => {
    setBusy(true);
    setErr(null);

    try {
      const currentWeightRaw = Number(form.currentWeight);
      const targetWeightRaw = Number(form.targetWeight);
      const currentWeightKg = Number.isFinite(currentWeightRaw) ? fromDisplay(currentWeightRaw, form.unit) : undefined;
      const targetWeightKg = Number.isFinite(targetWeightRaw) ? fromDisplay(targetWeightRaw, form.unit) : undefined;

      if (typeof currentWeightKg !== "number" || currentWeightKg <= 0) {
        throw new Error("Please enter a valid current weight.");
      }
      if ((form.goalMode === "cut" || form.goalMode === "bulk") && (typeof targetWeightKg !== "number" || targetWeightKg <= 0)) {
        throw new Error("Target weight is required for cut and bulk.");
      }

      const heightCm = Number(form.heightCm);
      const age = Number(form.age);
      if (!heightCm || heightCm < 100 || heightCm > 250) {
        throw new Error("Please enter a valid height (100–250 cm).");
      }
      if (!age || age < 10 || age > 100) {
        throw new Error("Please enter a valid age.");
      }

      const activityMultiplier = defaultActivityMultiplier(form.daysPerWeek);

      const profile: UserProfile = {
        id: supabaseProfileId ?? crypto.randomUUID(),
        name:
          form.name.trim() ||
          (preset === "demo" ? "Demo profile" : "Default"),
        unit: form.unit,
        daysPerWeek: form.daysPerWeek,
        goalMode: form.goalMode,
        goal: form.goalMode === "bulk" ? "gain" : form.goalMode,
        currentWeightKg,
        targetWeightKg,
        experience: form.experience,
        equipment: form.equipment,
        homeEquipment: form.equipment === "home" ? form.homeEquipment : undefined,
        volumePreference: form.volumePreference,
        cardioGoalAuto: form.cardioGoalAuto,
        cardioType: form.cardioType,
        cardioSessionsPerWeek: form.cardioSessionsPerWeek,
        cardioMinutesPerSession: form.cardioMinutesPerSession,
        notes: form.notes.trim() || undefined,
        heightCm,
        age,
        gender: form.gender,
        activityMultiplier,
        createdAtISO: new Date().toISOString()
      };

      await db.userProfiles.add(profile);

      // Upsert full profile to Supabase now that setup is complete
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const { error: profileUpsertErr } = await supabase.from("user_profiles").upsert({
          id: profile.id,
          auth_id: session?.user?.id,
          name: profile.name ?? null,
          unit: profile.unit,
          days_per_week: profile.daysPerWeek,
          goal_mode: profile.goalMode,
          current_weight_kg: profile.currentWeightKg ?? null,
          target_weight_kg: profile.targetWeightKg ?? null,
          experience: profile.experience,
          equipment: profile.equipment,
          cardio_goal_auto: profile.cardioGoalAuto,
          cardio_type: profile.cardioType,
          cardio_sessions_per_week: profile.cardioSessionsPerWeek,
          cardio_minutes_per_session: profile.cardioMinutesPerSession,
          notes: profile.notes ?? null,
          height_cm: profile.heightCm ?? null,
          age: profile.age ?? null,
          gender: profile.gender ?? null,
          activity_multiplier: profile.activityMultiplier ?? null,
          created_at: profile.createdAtISO,
        });
        if (profileUpsertErr) console.error("Supabase profile upsert error:", profileUpsertErr);
      } catch { /* ignore */ }

      // Auto-create nutrition settings from body stats
      const ns = generateNutritionSettings(profile, currentWeightKg);
      if (ns) {
        await db.nutritionSettings.put(ns);
        // Sync nutrition settings to Supabase
        try {
          supabase.from("nutrition_settings").upsert({
            id: ns.id,
            user_id: ns.userId,
            enabled: ns.enabled,
            calorie_target: ns.calorieTarget,
            protein_grams: ns.proteinGrams,
            carbs_grams: ns.carbsGrams,
            fat_grams: ns.fatGrams,
            track_protein: ns.trackProtein,
            track_carbs: ns.trackCarbs,
            track_fat: ns.trackFat,
            is_custom: ns.isCustom,
            calculated_tdee: ns.calculatedTDEE ?? null,
          }).then(({ error }) => { if (error) console.error("Supabase nutrition_settings upsert error:", error); });
        } catch { /* ignore */ }
      }

      await db.settings.put({ key: "activeUserId", value: profile.id });
      onDone?.();
      await db.settings.put({ key: "unit", value: profile.unit });
      const weightEntry = {
        id: crypto.randomUUID(),
        userId: profile.id,
        dateISO: new Date().toISOString().slice(0, 10),
        weightKg: currentWeightKg,
        createdAtISO: new Date().toISOString(),
      };
      await db.weightEntries.put(weightEntry);
      // Sync weight entry to Supabase
      try {
        supabase.from("weight_entries").upsert({
          id: weightEntry.id,
          user_id: weightEntry.userId,
          date_iso: weightEntry.dateISO,
          weight_kg: weightEntry.weightKg,
          created_at: weightEntry.createdAtISO,
        }).then(({ error }) => { if (error) console.error("Supabase weight_entries upsert error:", error); });
      } catch { /* ignore */ }
      await ensureSeedData();

      if (preset === "demo") {
        await initDemoPresetForUser(profile.id);
      } else {
        await createFirstWeekIfMissing({ userId: profile.id, weekNumber: 1 });
      }
      // Sync first week plan to Supabase
      try {
        db.weekPlans.where("userId").equals(profile.id).first().then(w => {
          if (w) {
            supabase.from("week_plans").upsert({
              id: w.id,
              user_id: w.userId,
              week_number: w.weekNumber,
              start_date_iso: w.startDateISO,
              created_at: w.createdAtISO,
              days: w.days,
              is_locked: w.isLocked,
              notes: w.notes ?? null,
              note_chips: w.noteChips ?? null,
              next_week_days: w.nextWeekDays ?? null,
              is_deload: w.isDeload ?? null,
              adaptations: w.adaptations ?? null,
              active_injuries_snapshot: w.activeInjuriesSnapshot ?? null,
            }).then(({ error }) => { if (error) console.error("Supabase week_plans upsert error:", error); });
          }
        });
      } catch { /* ignore */ }
    } catch (e: any) {
      setErr(e?.message ?? "Could not create profile.");
    } finally {
      setBusy(false);
    }
  };

  const fl = (text: string) => (
    <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>
      {text}
    </div>
  );

  return (
    <div className="card">
      <h2>Setup Profile</h2>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 14 }}>
        Create your first profile to get started.
      </div>

      <div className="row">
        <div className="col">
          {fl("Preset")}
          <select value={preset} onChange={(e) => handlePresetChange(e.target.value as PresetKey)}>
            <option value="generic">Start Fresh</option>
            <option value="demo">Demo</option>
          </select>
        </div>

        <div className="col">
          {fl("Profile name (optional)")}
          <input
            placeholder="e.g., Rithvik / Home Cut"
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
          />
        </div>
      </div>


      <hr />

      <div className="row">
        <div style={{ flex: "1 1 120px" }}>
          {fl("Unit")}
          <select value={form.unit} onChange={(e) => setField("unit", e.target.value as "kg" | "lb")}>
            <option value="kg">kg</option>
            <option value="lb">lb</option>
          </select>
        </div>

        <div style={{ flex: "1 1 120px" }}>
          {fl("Days / week")}
          <select
            value={String(form.daysPerWeek)}
            onChange={(e) => setField("daysPerWeek", Number(e.target.value) as 3 | 4 | 5)}
          >
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
          </select>
        </div>

        <div style={{ flex: "1 1 140px" }}>
          {fl("Goal")}
          <select
            value={form.goalMode}
            onChange={(e) => setField("goalMode", e.target.value as FormState["goalMode"])}
          >
            <option value="cut">Cut</option>
            <option value="maintain">Maintain</option>
            <option value="bulk">Bulk</option>
          </select>
        </div>
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <div className="col">
          {fl(`Current Weight (${form.unit})`)}
          <input
            inputMode="decimal"
            value={form.currentWeight}
            onChange={(e) => setField("currentWeight", e.target.value)}
            placeholder="e.g., 82.5"
          />
        </div>
        <div className="col">
          {fl(`Target Weight (${form.unit})`)}
          <input
            inputMode="decimal"
            value={form.targetWeight}
            onChange={(e) => setField("targetWeight", e.target.value)}
            placeholder={form.goalMode === "maintain" ? "Optional" : "Required"}
          />
        </div>
      </div>

      {/* Body stats */}
      <div className="row" style={{ marginTop: 10 }}>
        <div style={{ flex: "1 1 100px" }}>
          {fl("Height (cm)")}
          <input
            inputMode="decimal"
            placeholder="e.g. 175"
            value={form.heightCm}
            onChange={(e) => setField("heightCm", e.target.value)}
          />
        </div>
        <div style={{ flex: "1 1 80px" }}>
          {fl("Age")}
          <input
            inputMode="numeric"
            placeholder="e.g. 25"
            value={form.age}
            onChange={(e) => setField("age", e.target.value)}
          />
        </div>
        <div style={{ flex: "1 1 120px" }}>
          {fl("Gender")}
          <div className="unit-toggle">
            <button
              className={`unit-toggle-btn ${form.gender === "male" ? "active" : ""}`}
              onClick={() => setField("gender", "male")}
            >
              Male
            </button>
            <button
              className={`unit-toggle-btn ${form.gender === "female" ? "active" : ""}`}
              onClick={() => setField("gender", "female")}
            >
              Female
            </button>
          </div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <div className="col">
          {fl("Experience")}
          <select
            value={form.experience}
            onChange={(e) => setField("experience", e.target.value as FormState["experience"])}
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
          </select>
        </div>

        <div className="col">
          {fl("Equipment")}
          <select
            value={form.equipment}
            onChange={(e) => setField("equipment", e.target.value as FormState["equipment"])}
          >
            <option value="gym">Gym</option>
            <option value="home">Home</option>
            <option value="minimal">Minimal (bodyweight only)</option>
          </select>
        </div>
      </div>

      {/* Volume preference */}
      <div style={{ marginTop: 10 }}>
        {fl("Volume preference")}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["light", "moderate", "high"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setField("volumePreference", v)}
              style={{
                flex: "1 1 auto",
                padding: "9px 12px",
                fontSize: 12,
                fontWeight: form.volumePreference === v ? 700 : 500,
                borderRadius: "var(--radius-md)",
                border: `1px solid ${form.volumePreference === v ? "var(--accent-blue)" : "var(--border)"}`,
                background: form.volumePreference === v ? "rgba(59,130,246,0.12)" : "var(--surface)",
                color: form.volumePreference === v ? "var(--accent-blue)" : "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              {v === "light" ? "Light (4 ex/day)" : v === "moderate" ? "Moderate (6 ex/day)" : "High (7 ex/day)"}
            </button>
          ))}
        </div>
      </div>

      {/* Home equipment checklist */}
      {form.equipment === "home" && (
        <div style={{ marginTop: 10 }}>
          {fl("Home equipment available")}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
            {HOME_EQUIPMENT_OPTIONS.map(({ key, label }) => {
              const checked = form.homeEquipment.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    const next = checked
                      ? form.homeEquipment.filter(k => k !== key)
                      : [...form.homeEquipment, key];
                    setField("homeEquipment", next);
                  }}
                  style={{
                    padding: "7px 12px",
                    fontSize: 12,
                    fontWeight: checked ? 700 : 500,
                    borderRadius: "var(--radius-md)",
                    border: `1px solid ${checked ? "var(--accent-green)" : "var(--border)"}`,
                    background: checked ? "rgba(16,185,129,0.10)" : "var(--surface)",
                    color: checked ? "var(--accent-green)" : "var(--text-secondary)",
                    cursor: "pointer",
                  }}
                >
                  {checked ? "✓ " : ""}{label}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
            Only exercises matching your equipment will be programmed.
          </div>
        </div>
      )}

      <hr />

      <div style={{
        background: "rgba(16, 185, 129, 0.04)",
        border: "1px solid rgba(16, 185, 129, 0.12)",
        borderLeft: "2px solid var(--accent-green)",
        borderRadius: "var(--radius-md)",
        padding: "12px 14px"
      }}>
        <h3 style={{ marginBottom: 4, color: "var(--accent-green)" }}>Cardio</h3>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>
          Auto mode presets cardio from goal + lifting days.
        </div>

        <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={form.cardioGoalAuto}
            onChange={(e) => {
              const enabled = e.target.checked;
              setForm((prev) => {
                const next = { ...prev, cardioGoalAuto: enabled };
                if (enabled) {
                  const cardio = deriveAutoCardio(next.goalMode, next.daysPerWeek);
                  next.cardioType = cardio.cardioType;
                  next.cardioSessionsPerWeek = cardio.cardioSessionsPerWeek;
                  next.cardioMinutesPerSession = cardio.cardioMinutesPerSession;
                } else {
                  next.cardioType = prev.cardioType || defaultCardioTypeForGoal(prev.goalMode);
                }
                return next;
              });
            }}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          Auto-prescribe cardio
        </label>

        <div className="row" style={{ marginTop: 10 }}>
          <div style={{ flex: "1 1 140px" }}>
            {fl("Cardio type")}
            <select
              value={form.cardioType}
              disabled={form.cardioGoalAuto}
              onChange={(e) => setField("cardioType", e.target.value as FormState["cardioType"])}
            >
              <option value="LISS">LISS</option>
              <option value="Intervals">Intervals</option>
              <option value="Mixed">Mixed</option>
            </select>
          </div>

          <div style={{ flex: "1 1 120px" }}>
            {fl("Sessions / wk")}
            <input
              type="number"
              min={0}
              max={7}
              value={form.cardioSessionsPerWeek}
              disabled={form.cardioGoalAuto}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) setField("cardioSessionsPerWeek", Math.max(0, Math.min(7, Math.round(v))));
              }}
            />
          </div>

          <div style={{ flex: "1 1 120px" }}>
            {fl("Min / session")}
            <input
              type="number"
              min={0}
              max={120}
              value={form.cardioMinutesPerSession}
              disabled={form.cardioGoalAuto}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) setField("cardioMinutesPerSession", Math.max(0, Math.min(120, Math.round(v))));
              }}
            />
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        {fl("Notes (optional)")}
        <textarea
          value={form.notes}
          onChange={(e) => setField("notes", e.target.value)}
          placeholder="Optional context for this profile"
          style={{ minHeight: 80 }}
        />
      </div>

      {/* Plan summary — shown when all required fields are filled */}
      {(() => {
        const h = Number(form.heightCm);
        const a = Number(form.age);
        const wRaw = Number(form.currentWeight);
        if (!h || !a || !Number.isFinite(wRaw) || wRaw <= 0) return null;
        const wKg = fromDisplay(wRaw, form.unit);
        const act = defaultActivityMultiplier(form.daysPerWeek);
        const fakeProfile = {
          id: "preview", name: "", unit: form.unit, daysPerWeek: form.daysPerWeek,
          goalMode: form.goalMode, experience: form.experience, equipment: form.equipment,
          cardioGoalAuto: false, cardioType: "LISS" as const,
          cardioSessionsPerWeek: 0, cardioMinutesPerSession: 0,
          heightCm: h, age: a, gender: form.gender, activityMultiplier: act,
          createdAtISO: ""
        };
        const ns = generateNutritionSettings(fakeProfile, wKg);
        if (!ns) return null;
        return (
          <div style={{
            background: "rgba(59,130,246,0.06)",
            border: "1px solid rgba(59,130,246,0.18)",
            borderLeft: "2px solid var(--accent-blue)",
            borderRadius: "var(--radius-md)",
            padding: "12px 14px",
            marginTop: 8
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--accent-blue)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
              Your Plan
            </div>
            <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.6 }}>
              <strong>{form.daysPerWeek} days/week</strong> training &nbsp;·&nbsp;
              <strong>{ns.calorieTarget.toLocaleString()} kcal/day</strong>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>
              Protein <strong style={{ color: "var(--text-primary)" }}>{ns.proteinGrams}g</strong>
              &nbsp;·&nbsp;
              Carbs <strong style={{ color: "var(--text-primary)" }}>{ns.carbsGrams}g</strong>
              &nbsp;·&nbsp;
              Fat <strong style={{ color: "var(--text-primary)" }}>{ns.fatGrams}g</strong>
              &nbsp;·&nbsp;
              <span style={{ color: "var(--text-muted)" }}>TDEE {ns.calculatedTDEE?.toLocaleString()} kcal</span>
            </div>
          </div>
        );
      })()}

      <div className="row" style={{ alignItems: "center", marginTop: 14, gap: 10 }}>
        <button disabled={busy} onClick={createProfile}>
          {busy ? "Creating…" : "Create Profile"}
        </button>
        {err && (
          <span className="tag tag--red" style={{ padding: "6px 10px" }}>{err}</span>
        )}
      </div>
    </div>
  );
}
