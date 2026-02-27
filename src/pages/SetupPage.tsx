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

  return (
    <div className="card">
      <h2>Setup Profile</h2>
      <div className="small muted">Create your first profile to start using the app.</div>

      <hr />

      <div className="row">
        <div className="col">
          <div className="small muted">Preset</div>
          <select value={preset} onChange={(e) => handlePresetChange(e.target.value as PresetKey)}>
            <option value="generic">Generic gym preset</option>
            <option value="rithvik">Rithvik preset</option>
            <option value="demo">Demo (sample data)</option>
          </select>
        </div>

        <div className="col">
          <div className="small muted">Profile name (optional)</div>
          <input
            placeholder="e.g., Rithvik / Home Cut"
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
          />
        </div>
      </div>

      {preset === "rithvik" && (
        <div className="pill" style={{ marginTop: 10, width: "100%", display: "flex", gap: 10, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={startRithvikWeek6}
            onChange={(e) => setStartRithvikWeek6(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          <span>Start at Week 6 using the Rithvik preset (current Monday start date)</span>
        </div>
      )}

      <hr />

      <div className="row">
        <div style={{ flex: "1 1 140px", minWidth: 140 }}>
          <div className="small muted">Unit</div>
          <select value={form.unit} onChange={(e) => setField("unit", e.target.value as "kg" | "lb")}>
            <option value="kg">kg</option>
            <option value="lb">lb</option>
          </select>
        </div>

        <div style={{ flex: "1 1 160px", minWidth: 160 }}>
          <div className="small muted">Days / week</div>
          <select
            value={String(form.daysPerWeek)}
            onChange={(e) => setField("daysPerWeek", Number(e.target.value) as 3 | 4 | 5)}
          >
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
          </select>
        </div>

        <div style={{ flex: "1 1 180px", minWidth: 180 }}>
          <div className="small muted">Goal</div>
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

      <div className="row">
        <div className="col">
          <div className="small muted">Current Weight ({form.unit})</div>
          <input
            inputMode="decimal"
            value={form.currentWeight}
            onChange={(e) => setField("currentWeight", e.target.value)}
            placeholder="e.g., 82.5"
          />
        </div>
        <div className="col">
          <div className="small muted">Target Weight ({form.unit})</div>
          <input
            inputMode="decimal"
            value={form.targetWeight}
            onChange={(e) => setField("targetWeight", e.target.value)}
            placeholder={form.goalMode === "maintain" ? "Optional" : "Required"}
          />
        </div>
      </div>

      <div className="row">
        <div className="col">
          <div className="small muted">Experience</div>
          <select
            value={form.experience}
            onChange={(e) => setField("experience", e.target.value as FormState["experience"])}
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
          </select>
        </div>

        <div className="col">
          <div className="small muted">Equipment</div>
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

      <div className="card" style={{ background: "#0b1220" }}>
        <h3>Cardio Preferences</h3>
        <div className="small muted">
          Auto mode presets cardio from your goal and lifting days. You can switch to manual anytime.
        </div>

        <div
          className="pill"
          style={{ marginTop: 10, width: "100%", display: "flex", gap: 10, alignItems: "center" }}
        >
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
            style={{ width: 18, height: 18 }}
          />
          <span>Auto-prescribe cardio from goal + days/week</span>
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <div style={{ flex: "1 1 180px", minWidth: 180 }}>
            <div className="small muted">Cardio type</div>
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

          <div style={{ flex: "1 1 180px", minWidth: 180 }}>
            <div className="small muted">Sessions / week</div>
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

          <div style={{ flex: "1 1 180px", minWidth: 180 }}>
            <div className="small muted">Minutes / session</div>
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

        {form.cardioGoalAuto && (
          <div className="small muted" style={{ marginTop: 8 }}>
            Auto recommendation updates when goal or lifting days change.
          </div>
        )}
      </div>

      <div className="small muted">Notes</div>
      <textarea
        value={form.notes}
        onChange={(e) => setField("notes", e.target.value)}
        placeholder="Optional context for this profile"
        style={{
          width: "100%",
          minHeight: 90,
          padding: 10,
          borderRadius: 10,
          border: "1px solid #334155",
          background: "#0b1220",
          color: "#e5e7eb"
        }}
      />

      <div className="row" style={{ alignItems: "center", marginTop: 12 }}>
        <button disabled={busy} onClick={createProfile}>
          Create Profile
        </button>
        {err && (
          <div className="pill" style={{ borderColor: "#dc2626" }}>
            {err}
          </div>
        )}
      </div>
    </div>
  );
}
