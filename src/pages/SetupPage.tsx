import { useState } from "react";
import { db } from "../db/db";
import type { UserProfile } from "../db/types";
import { ensureSeedData } from "../db/seed";
import { createFirstWeekIfMissing } from "../services/planGenerator";
import { initDemoPresetForUser, initRithvikPresetWeek6ForUser } from "../services/presets";
import { deriveAutoCardio, defaultCardioTypeForGoal } from "../services/cardio";
import { fromDisplay, toDisplay } from "../services/units";

type PresetKey = "generic" | "rithvik" | "demo";

type FormState = {
  name: string;
  unit: "kg" | "lb";
  daysPerWeek: 3 | 4 | 5;
  goalMode: "cut" | "maintain" | "bulk";
  currentWeight: string;
  targetWeight: string;
  experience: "beginner" | "intermediate";
  equipment: "gym" | "home" | "minimal";
  cardioGoalAuto: boolean;
  cardioType: "LISS" | "Intervals" | "Mixed";
  cardioSessionsPerWeek: number;
  cardioMinutesPerSession: number;
  notes: string;
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
  notes: ""
});

const baseRithvik = withAutoCardio({
  name: "Rithvik",
  unit: "kg",
  daysPerWeek: 5,
  goalMode: "cut",
  currentWeight: "80",
  targetWeight: "72",
  experience: "intermediate",
  equipment: "gym",
  notes: "Rithvik preset onboarding"
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
  notes: "Demo sample data preset"
});

function presetDefaults(preset: PresetKey): FormState {
  if (preset === "rithvik") return { ...baseRithvik };
  if (preset === "demo") return { ...baseDemo };
  return { ...baseGeneric };
}

export default function SetupPage() {
  const [preset, setPreset] = useState<PresetKey>("generic");
  const [startRithvikWeek6, setStartRithvikWeek6] = useState(true);
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

      const profile: UserProfile = {
        id: crypto.randomUUID(),
        name:
          form.name.trim() ||
          (preset === "rithvik"
            ? "Rithvik preset"
            : preset === "demo"
              ? "Demo profile"
              : "Default"),
        unit: form.unit,
        daysPerWeek: form.daysPerWeek,
        goalMode: form.goalMode,
        goal: form.goalMode === "bulk" ? "gain" : form.goalMode,
        currentWeightKg,
        targetWeightKg,
        experience: form.experience,
        equipment: form.equipment,
        cardioGoalAuto: form.cardioGoalAuto,
        cardioType: form.cardioType,
        cardioSessionsPerWeek: form.cardioSessionsPerWeek,
        cardioMinutesPerSession: form.cardioMinutesPerSession,
        notes: form.notes.trim() || undefined,
        createdAtISO: new Date().toISOString()
      };

      await db.userProfiles.add(profile);
      await db.settings.put({ key: "activeUserId", value: profile.id });
      await db.settings.put({ key: "unit", value: profile.unit });
      await db.weightEntries.put({
        id: crypto.randomUUID(),
        userId: profile.id,
        dateISO: new Date().toISOString().slice(0, 10),
        weightKg: currentWeightKg,
        createdAtISO: new Date().toISOString()
      });
      await ensureSeedData();

      if (preset === "rithvik") {
        if (startRithvikWeek6) {
          await initRithvikPresetWeek6ForUser(profile.id);
        } else {
          await createFirstWeekIfMissing({ userId: profile.id, weekNumber: 1 });
        }
      } else if (preset === "demo") {
        await initDemoPresetForUser(profile.id);
      } else {
        await createFirstWeekIfMissing({ userId: profile.id, weekNumber: 1 });
      }
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
            <option value="generic">Generic gym</option>
            <option value="rithvik">Rithvik preset</option>
            <option value="demo">Demo (sample data)</option>
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

      {preset === "rithvik" && (
        <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={startRithvikWeek6}
            onChange={(e) => setStartRithvikWeek6(e.target.checked)}
            style={{ width: 16, height: 16, flexShrink: 0 }}
          />
          Start at Week 6 (Rithvik preset, current Monday)
        </label>
      )}

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
            <option value="minimal">Minimal</option>
          </select>
        </div>
      </div>

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

      <div className="row" style={{ alignItems: "center", marginTop: 14, gap: 10 }}>
        <button disabled={busy} onClick={createProfile}>
          Create Profile
        </button>
        {err && (
          <span className="tag tag--red" style={{ padding: "6px 10px" }}>{err}</span>
        )}
      </div>
    </div>
  );
}
