interface WelcomePageProps {
  onCreateNew: () => void;
  onSignOut?: () => void;
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

export default function WelcomePage({ onCreateNew, onSignOut }: WelcomePageProps) {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px 16px 48px",
      animation: "fadeInUp 0.4s ease forwards",
    }}>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{ marginBottom: 8 }}>
        <DumbbellIcon />
      </div>

      <div style={{
        fontSize: 40, fontWeight: 900, letterSpacing: "-0.03em",
        background: "linear-gradient(135deg, var(--accent-blue) 0%, #a78bfa 100%)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        backgroundClip: "text", marginBottom: 6,
      }}>
        TrainLab
      </div>

      <div style={{
        fontSize: 15, color: "var(--text-secondary)", fontWeight: 500,
        letterSpacing: "0.01em", marginBottom: 40, textAlign: "center",
      }}>
        Your adaptive training partner
      </div>

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
        {onSignOut && (
          <button
            onClick={onSignOut}
            style={{
              background: "none", border: "none", padding: "4px 0",
              fontSize: 13, color: "var(--text-muted)", cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Sign in with a different account
          </button>
        )}
      </div>
    </div>
  );
}
