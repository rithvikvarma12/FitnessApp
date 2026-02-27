import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import type { Unit } from "../services/units";
import { fromDisplay, toDisplay } from "../services/units";

type GoalMode = "cut" | "maintain" | "bulk";

function resolveGoalMode(profile: { goalMode?: GoalMode; goal?: "cut" | "maintain" | "gain" }): GoalMode {
  if (profile.goalMode) return profile.goalMode;
  if (profile.goal === "gain") return "bulk";
  if (profile.goal === "cut") return "cut";
  return "maintain";
}

export default function GoalReachedBanner({
  userId,
  unit
}: {
  userId?: string;
  unit: Unit;
}) {
  const [targetInput, setTargetInput] = useState("");
  const [editorMode, setEditorMode] = useState<null | "continue" | "bulk">(null);

  const profileAndLatest = useLiveQuery(async () => {
    if (!userId) return undefined;
    const profile = await db.userProfiles.get(userId);
    if (!profile) return undefined;
    const entries = await db.weightEntries.where("userId").equals(userId).toArray();
    entries.sort((a, b) => b.dateISO.localeCompare(a.dateISO));
    return {
      profile,
      latestWeightKg: entries[0]?.weightKg
    };
  }, [userId]);

  const goalMode = useMemo(
    () => (profileAndLatest ? resolveGoalMode(profileAndLatest.profile) : "maintain"),
    [profileAndLatest]
  );
  const targetWeightKg = profileAndLatest?.profile.targetWeightKg;
  const latestWeightKg = profileAndLatest?.latestWeightKg;

  const reached = useMemo(() => {
    if (!profileAndLatest) return false;
    if (goalMode === "maintain") return false;
    if (typeof targetWeightKg !== "number" || typeof latestWeightKg !== "number") return false;
    if (goalMode === "cut") return latestWeightKg <= targetWeightKg;
    return latestWeightKg >= targetWeightKg;
  }, [profileAndLatest, goalMode, targetWeightKg, latestWeightKg]);

  const dismissKey = useMemo(() => {
    if (!userId || !profileAndLatest) return "";
    const t = typeof targetWeightKg === "number" ? targetWeightKg.toFixed(2) : "none";
    return `goalBannerDismissed:${userId}:${goalMode}:${t}`;
  }, [userId, profileAndLatest, goalMode, targetWeightKg]);

  const dismissed = useLiveQuery(async () => {
    if (!dismissKey) return false;
    const row = await db.settings.get(dismissKey);
    return row?.value === "1";
  }, [dismissKey], false);

  if (!userId || !profileAndLatest || !reached || dismissed) return null;

  const saveTarget = async (nextGoalMode?: GoalMode) => {
    const raw = Number(targetInput.trim());
    if (!Number.isFinite(raw) || raw <= 0) return;
    const goal = nextGoalMode ?? goalMode;
    const targetKg = fromDisplay(raw, unit);
    await db.userProfiles.update(userId, {
      goalMode: goal,
      goal: goal === "bulk" ? "gain" : goal,
      targetWeightKg: targetKg
    });
    setEditorMode(null);
    setTargetInput("");
  };

  const switchToMaintain = async () => {
    await db.userProfiles.update(userId, { goalMode: "maintain", goal: "maintain" });
    setEditorMode(null);
  };

  const switchToBulk = async () => {
    if (typeof targetWeightKg === "number") {
      await db.userProfiles.update(userId, { goalMode: "bulk", goal: "gain" });
      setEditorMode(null);
      return;
    }
    const suggestedKg =
      typeof latestWeightKg === "number"
        ? latestWeightKg + 2
        : 80;
    setTargetInput(toDisplay(suggestedKg, unit).toFixed(1));
    setEditorMode("bulk");
  };

  const startContinue = () => {
    const suggestedKg = typeof targetWeightKg === "number" ? targetWeightKg : (latestWeightKg ?? 0);
    setTargetInput(toDisplay(suggestedKg, unit).toFixed(1));
    setEditorMode("continue");
  };

  return (
    <div className="card" style={{ background: "#0b1220", borderColor: "#22c55e" }}>
      <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 700 }}>Goal reached 🎉 What next?</div>
        <button
          type="button"
          className="secondary"
          style={{ padding: "4px 10px" }}
          onClick={() => {
            if (!dismissKey) return;
            void db.settings.put({ key: dismissKey, value: "1" });
          }}
          aria-label="Dismiss goal reached banner"
        >
          X
        </button>
      </div>

      <div className="row" style={{ marginTop: 10, gap: 8 }}>
        <button type="button" className="secondary" onClick={() => void switchToMaintain()}>
          Switch to Maintain
        </button>
        <button type="button" className="secondary" onClick={() => void switchToBulk()}>
          Switch to Bulk
        </button>
        <button type="button" className="secondary" onClick={startContinue}>
          Continue (set new goal)
        </button>
      </div>

      {editorMode ? (
        <div className="row" style={{ marginTop: 10, alignItems: "end", gap: 8 }}>
          <div style={{ width: 220, maxWidth: "100%" }}>
            <div className="small muted">Target Weight ({unit})</div>
            <input
              inputMode="decimal"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              placeholder="Enter new target"
            />
          </div>
          <button
            type="button"
            onClick={() => void saveTarget(editorMode === "bulk" ? "bulk" : undefined)}
          >
            Save
          </button>
          <button type="button" className="secondary" onClick={() => setEditorMode(null)}>
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}

