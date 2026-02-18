import { useEffect, useState } from "react";
import { ensureSeedData } from "./db/seed";
// import { createFirstWeekIfMissing } from "./services/planGenerator";
import PlanPage from "./pages/PlanPage";
import WeightPage from "./pages/WeightPage";

type Tab = "plan" | "weight";

export default function App() {
  const [tab, setTab] = useState<Tab>("plan");
  const [ready, setReady] = useState(false);

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

  return (
    <div className="container">
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