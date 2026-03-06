import type { UserProfile } from "../db/types";

interface WelcomePageProps {
  profiles: UserProfile[];
  onSelectProfile: (id: string) => void;
  onCreateNew: () => void;
}

function DumbbellIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
      style={{ width: 72, height: 72, opacity: 0.18, color: "var(--accent-blue)" }}>
      <rect x="4" y="26" width="12" height="12" rx="3" />
      <rect x="14" y="22" width="8" height="20" rx="2" />
      <rect x="48" y="26" width="12" height="12" rx="3" />
      <rect x="42" y="22" width="8" height="20" rx="2" />
      <line x1="22" y1="32" x2="42" y2="32" strokeWidth="5" />
    </svg>
  );
}

const GOAL_LABEL: Record<string, string> = {
  cut: "Cut", maintain: "Maintain", bulk: "Bulk"
};

export default function WelcomePage({ profiles, onSelectProfile, onCreateNew }: WelcomePageProps) {
  const isFirstTime = profiles.length === 0;

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px 48px",
      animation: "fadeInUp 0.4s ease forwards",
      gap: 0,
    }}>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Logo / Icon */}
      <div style={{ marginBottom: 8 }}>
        <DumbbellIcon />
      </div>

      {/* App name */}
      <div style={{
        fontSize: 40, fontWeight: 900, letterSpacing: "-0.03em",
        background: "linear-gradient(135deg, var(--accent-blue) 0%, #a78bfa 100%)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        backgroundClip: "text", marginBottom: 6,
      }}>
        TrainLab
      </div>

      {/* Tagline */}
      <div style={{
        fontSize: 15, color: "var(--text-secondary)", fontWeight: 500,
        letterSpacing: "0.01em", marginBottom: 40, textAlign: "center",
      }}>
        Your adaptive training partner
      </div>

      {isFirstTime ? (
        /* ── First-time welcome ── */
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, width: "100%", maxWidth: 320 }}>
          <button
            onClick={onCreateNew}
            style={{
              width: "100%", padding: "14px 24px", fontSize: 16, fontWeight: 700,
              background: "var(--accent-blue)", color: "#fff", border: "none",
              borderRadius: "var(--radius-md)", cursor: "pointer",
              boxShadow: "0 0 24px rgba(59,130,246,0.35)",
            }}
          >
            Get Started
          </button>
        </div>
      ) : (
        /* ── Profile selection ── */
        <div style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4, textAlign: "center" }}>
            Welcome back — choose a profile
          </div>

          {profiles.map((p) => {
            const initial = (p.name?.trim() || "?")[0].toUpperCase();
            return (
              <button
                key={p.id}
                onClick={() => onSelectProfile(p.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "14px 16px", textAlign: "left",
                  background: "var(--bg-surface)", border: "1px solid var(--border-glass)",
                  borderRadius: "var(--radius-md)", cursor: "pointer",
                  transition: "border-color 0.15s, background 0.15s",
                  width: "100%",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-blue)"; e.currentTarget.style.background = "rgba(59,130,246,0.06)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-glass)"; e.currentTarget.style.background = "var(--bg-surface)"; }}
              >
                {/* Avatar */}
                <div style={{
                  width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                  background: "linear-gradient(135deg, var(--accent-blue), #7c3aed)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18, fontWeight: 800, color: "#fff",
                }}>
                  {initial}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", marginBottom: 2 }}>
                    {p.name?.trim() || "Unnamed"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {GOAL_LABEL[p.goalMode ?? "maintain"]} · {p.daysPerWeek} days/week · {p.equipment}
                  </div>
                </div>
                <svg viewBox="0 0 20 20" fill="none" stroke="var(--text-muted)" strokeWidth="2" style={{ width: 16, height: 16, flexShrink: 0 }}>
                  <path d="M7 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            );
          })}

          <button
            onClick={onCreateNew}
            style={{
              marginTop: 6, padding: "12px 16px", fontSize: 13, fontWeight: 600,
              background: "transparent", color: "var(--accent-blue)",
              border: "1.5px solid var(--accent-blue)", borderRadius: "var(--radius-md)",
              cursor: "pointer", width: "100%",
            }}
          >
            + Create New Profile
          </button>
        </div>
      )}
    </div>
  );
}
