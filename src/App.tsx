import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ensureSeedData } from "./db/seed";
import { db } from "./db/db";
import type { UserProfile } from "./db/types";
import type { Unit } from "./services/units";
// import { createFirstWeekIfMissing } from "./services/planGenerator";
import PlanPage from "./pages/PlanPage";
import SetupPage from "./pages/SetupPage";
import WelcomePage from "./pages/WelcomePage";
import WeightPage from "./pages/WeightPage";
import ProfilePage from "./pages/ProfilePage";
import ProgressPage from "./pages/ProgressPage";
import NutritionPage from "./pages/NutritionPage";
import AuthPage from "./pages/AuthPage";
import { supabase } from "./lib/supabase";
import { syncFromSupabase } from "./lib/syncFromSupabase";
import { initPushNotifications } from "./lib/notifications";
import type { Session } from "@supabase/supabase-js";

type Tab = "plan" | "weight" | "progress" | "nutrition" | "profile";

function PlanIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

function WeightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6l3 1m0 0l-3 9a5 5 0 006 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5 5 0 006 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
    </svg>
  );
}

function ProgressIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  );
}

function NutritionIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 2v8a2 2 0 002 2h1v8h2v-8h1a2 2 0 002-2V2h-2v5H8V2H6v5H5V2H3zm14 0c-1.7 0-3 1.3-3 3v5h2v10h2V2h-1z" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("plan");
  const [ready, setReady] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [supabaseProfile, setSupabaseProfile] = useState<Record<string, unknown> | null | undefined>(undefined);

  const profiles = useLiveQuery(
    async () => db.userProfiles.orderBy("createdAtISO").toArray(),
    [],
    [] as UserProfile[]
  );
  const activeUserId = useLiveQuery(async () => (await db.settings.get("activeUserId"))?.value, [], "");
  const unit = useLiveQuery(async () => {
    const s = await db.settings.get("unit");
    return (s?.value as Unit) ?? "kg";
  }, [], "kg" as Unit);
  const theme = useLiveQuery(async () => {
    const s = await db.settings.get("theme");
    return (s?.value ?? "dark") as "dark" | "light";
  }, [], "dark" as "dark" | "light");
  const nutritionEnabled = useLiveQuery(async () => {
    if (!activeUserId) return false;
    const ns = await db.nutritionSettings.get(activeUserId);
    return ns?.enabled ?? false;
  }, [activeUserId], false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    (async () => {
      await ensureSeedData();
      // ✅ v0.3.1: disable auto Week 1 creation so Quick Start can run
      // await createFirstWeekIfMissing();
      setReady(true);
      await initPushNotifications();
    })();

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (!session) {
      setSupabaseProfile(null);
      return;
    }
    setSupabaseProfile(undefined);
    supabase
      .from("user_profiles")
      .select("*")
      .eq("auth_id", session.user.id)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (error) console.error('Supabase profile error:', error);
        if (data) {
          await db.settings.put({ key: "activeUserId", value: data.id });
          await syncFromSupabase(data.id);
          setSupabaseProfile(data);
        } else {
          setSupabaseProfile(null);
        }
      });
  }, [session]);

  const setUnitForActiveProfile = async (nextUnit: Unit) => {
    await db.settings.put({ key: "unit", value: nextUnit });
    if (activeUserId) {
      await db.userProfiles.update(activeUserId, { unit: nextUnit });
    }
  };

  if (!ready) {
    return <></>;
  }

  // session === undefined means still loading; null means logged out
  if (session === undefined) {
    return <></>;
  }

  if (session === null) {
    return (
      <>
        <div className="ambient-bg">
          <div className="ambient-blob ambient-blob--blue" />
          <div className="ambient-blob ambient-blob--purple" />
        </div>
        <AuthPage onAuth={() => {}} />
      </>
    );
  }

  // Still fetching the Supabase profile for this session
  if (supabaseProfile === undefined) {
    return <></>;
  }

  const showWelcome = (!activeUserId || (profiles?.length ?? 0) === 0) && !showSetup;

  if (showSetup && !activeUserId) {
    return (
      <>
        <div className="ambient-bg">
          <div className="ambient-blob ambient-blob--blue" />
          <div className="ambient-blob ambient-blob--purple" />
        </div>
        <div className="container">
          <SetupPage onDone={() => setShowSetup(false)} supabaseProfileId={supabaseProfile?.id as string | undefined} />
        </div>
      </>
    );
  }

  if (showWelcome) {
    return (
      <>
        <div className="ambient-bg">
          <div className="ambient-blob ambient-blob--blue" />
          <div className="ambient-blob ambient-blob--purple" />
        </div>
        <WelcomePage
          profiles={profiles ?? []}
          onSelectProfile={async (id) => {
            await db.settings.put({ key: "activeUserId", value: id });
            const profile = await db.userProfiles.get(id);
            if (profile) await db.settings.put({ key: "unit", value: profile.unit });
          }}
          onCreateNew={() => setShowSetup(true)}
        />
      </>
    );
  }

  return (
    <>
      {/* Ambient depth blobs */}
      <div className="ambient-bg">
        <div className="ambient-blob ambient-blob--blue" />
        <div className="ambient-blob ambient-blob--purple" />
      </div>

      <div className="container">
        {/* Header */}
        <div className="app-header">
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>
              Profile
            </div>
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
              className="profile-select"
            >
              {(profiles ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name?.trim() || "Unnamed"}
                </option>
              ))}
            </select>
          <button
              type="button"
              className="secondary"
              title="Switch profile"
              style={{ padding: "3px 7px", marginTop: 2 }}
              onClick={async () => { await db.settings.delete("activeUserId"); }}
            >
              <SignOutIcon />
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="unit-toggle">
              <button
                className={`unit-toggle-btn ${unit === "kg" ? "active" : ""}`}
                onClick={() => void setUnitForActiveProfile("kg")}
              >
                kg
              </button>
              <button
                className={`unit-toggle-btn ${unit === "lb" ? "active" : ""}`}
                onClick={() => void setUnitForActiveProfile("lb")}
              >
                lb
              </button>
            </div>
            <button
              className="theme-toggle-btn"
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              onClick={() => void db.settings.put({ key: "theme", value: theme === "dark" ? "light" : "dark" })}
            >
              {theme === "dark" ? "☀" : "🌙"}
            </button>
          </div>
        </div>

        {/* Page content */}
        <div key={tab} className="tab-content">
          {tab === "plan" ? <PlanPage /> : tab === "weight" ? <WeightPage /> : tab === "progress" ? <ProgressPage /> : tab === "nutrition" ? <NutritionPage onGoToProfile={() => setTab("profile")} /> : <ProfilePage onLogOut={async () => { await db.settings.delete("activeUserId"); setTab("plan"); }} />}
        </div>
      </div>

      {/* Bottom nav */}
      <nav className={`bottom-nav ${nutritionEnabled ? "bottom-nav--five" : ""}`} aria-label="Main navigation">
        <button className={`bottom-nav-item ${tab === "plan" ? "active" : ""}`} onClick={() => setTab("plan")} aria-label="Plan" aria-current={tab === "plan" ? "page" : undefined}>
          <PlanIcon />
          Plan
        </button>
        <button className={`bottom-nav-item ${tab === "weight" ? "active" : ""}`} onClick={() => setTab("weight")} aria-label="Weight" aria-current={tab === "weight" ? "page" : undefined}>
          <WeightIcon />
          Weight
        </button>
        <button className={`bottom-nav-item ${tab === "progress" ? "active" : ""}`} onClick={() => setTab("progress")} aria-label="Progress" aria-current={tab === "progress" ? "page" : undefined}>
          <ProgressIcon />
          Progress
        </button>
        {nutritionEnabled && (
          <button className={`bottom-nav-item ${tab === "nutrition" ? "active" : ""}`} onClick={() => setTab("nutrition")} aria-label="Nutrition" aria-current={tab === "nutrition" ? "page" : undefined}>
            <NutritionIcon />
            Nutrition
          </button>
        )}
        <button className={`bottom-nav-item ${tab === "profile" ? "active" : ""}`} onClick={() => setTab("profile")} aria-label="Profile" aria-current={tab === "profile" ? "page" : undefined}>
          <ProfileIcon />
          Profile
        </button>
      </nav>
    </>
  );
}
