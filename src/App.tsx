import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ensureSeedData } from "./db/seed";
import { db } from "./db/db";
import type { UserProfile } from "./db/types";
// import { createFirstWeekIfMissing } from "./services/planGenerator";
import PlanPage from "./pages/PlanPage";
import SetupPage from "./pages/SetupPage";
import WeightPage from "./pages/WeightPage";

type Tab = "plan" | "weight";

export default function App() {
  const [tab, setTab] = useState<Tab>("plan");
  const [ready, setReady] = useState(false);

  const profiles = useLiveQuery(
    async () => db.userProfiles.orderBy("createdAtISO").toArray(),
    [],
    [] as UserProfile[]
  );
  const activeUserId = useLiveQuery(async () => (await db.settings.get("activeUserId"))?.value, [], "");

  useEffect(() => {
    (async () => {
      await ensureSeedData();

      // ✅ v0.3.1: disable auto Week 1 creation so Quick Start can run
      // await createFirstWeekIfMissing();
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return (
      <div className="container">
        <div className="card">Loading…</div>
      </div>
    );
  }

  const needsSetup = (profiles?.length ?? 0) === 0 || !activeUserId;
  if (needsSetup) {
    return (
      <div className="container">
        <SetupPage />
      </div>
    );
  }

  return (
    <div className="container">
      <div className="row" style={{ alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div className="small muted">Active profile</div>
        <div style={{ minWidth: 260 }}>
          <select
            value={activeUserId}
            onChange={async (e) => {
              const nextId = e.target.value;
              await db.settings.put({ key: "activeUserId", value: nextId });
              const profile = await db.userProfiles.get(nextId);
              if (profile) {
                await db.settings.put({ key: "unit", value: profile.unit });
              }
            }}
          >
            {(profiles ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name?.trim() || "Unnamed profile"} ({p.goal}, {p.daysPerWeek}d)
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="tabs">
        <div className={`tab ${tab === "plan" ? "active" : ""}`} onClick={() => setTab("plan")}>
          Plan
        </div>
        <div className={`tab ${tab === "weight" ? "active" : ""}`} onClick={() => setTab("weight")}>
          Weight
        </div>
      </div>

      {tab === "plan" ? <PlanPage /> : <WeightPage />}
      <div className="small muted" style={{ marginTop: 12 }}>
        Tip: On iPhone Safari → Share → Add to Home Screen.
      </div>
    </div>
  );
}
