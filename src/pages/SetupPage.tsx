import { useState } from "react";
import { db } from "../db/db";
import type { UserProfile } from "../db/types";
import { ensureSeedData } from "../db/seed";
import { createFirstWeekIfMissing } from "../services/planGenerator";
import { initRithvikPresetWeek6ForUser } from "../services/presets";

type PresetKey = "generic" | "rithvik";

type FormState = {
  name: string;
  unit: "kg" | "lb";
  daysPerWeek: 3 | 4 | 5;
  goal: "cut" | "maintain" | "gain";
  experience: "beginner" | "intermediate";
  equipment: "gym" | "home" | "minimal";
  notes: string;
};

const baseGeneric: FormState = {
  name: "",
  unit: "kg",
  daysPerWeek: 4,
  goal: "maintain",
  experience: "beginner",
  equipment: "gym",
  notes: ""
};

const baseRithvik: FormState = {
  name: "Rithvik",
  unit: "kg",
  daysPerWeek: 5,
  goal: "cut",
  experience: "intermediate",
  equipment: "gym",
  notes: "Rithvik preset onboarding"
};

function presetDefaults(preset: PresetKey): FormState {
  return preset === "rithvik" ? { ...baseRithvik } : { ...baseGeneric };
}

export default function SetupPage() {
  const [preset, setPreset] = useState<PresetKey>("generic");
  const [startRithvikWeek6, setStartRithvikWeek6] = useState(true);
  const [form, setForm] = useState<FormState>(presetDefaults("generic"));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handlePresetChange = (value: PresetKey) => {
    setPreset(value);
    setForm(presetDefaults(value));
  };

  const createProfile = async () => {
    setBusy(true);
    setErr(null);

    try {
      const profile: UserProfile = {
        id: crypto.randomUUID(),
        name: form.name.trim() || (preset === "rithvik" ? "Rithvik preset" : "Default"),
        unit: form.unit,
        daysPerWeek: form.daysPerWeek,
        goal: form.goal,
        experience: form.experience,
        equipment: form.equipment,
        notes: form.notes.trim() || undefined,
        createdAtISO: new Date().toISOString()
      };

      await db.userProfiles.add(profile);
      await db.settings.put({ key: "activeUserId", value: profile.id });
      await db.settings.put({ key: "unit", value: profile.unit });
      await ensureSeedData();

      if (preset === "rithvik") {
        if (startRithvikWeek6) {
          await initRithvikPresetWeek6ForUser(profile.id);
        } else {
          await createFirstWeekIfMissing({ userId: profile.id, weekNumber: 1 });
        }
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
            value={form.goal}
            onChange={(e) => setField("goal", e.target.value as FormState["goal"])}
          >
            <option value="cut">Cut</option>
            <option value="maintain">Maintain</option>
            <option value="gain">Gain</option>
          </select>
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
