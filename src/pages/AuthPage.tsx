import { useState } from "react";
import { signIn, signUp } from "../lib/auth";

type Mode = "signin" | "signup";

interface AuthPageProps {
  onAuth?: () => void;
}

function LockIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
      style={{ width: 64, height: 64, opacity: 0.18, color: "var(--accent-blue)" }}>
      <rect x="14" y="28" width="36" height="26" rx="4" />
      <path d="M20 28v-8a12 12 0 0 1 24 0v8" />
      <circle cx="32" cy="41" r="3" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function AuthPage({ onAuth }: AuthPageProps) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        await signUp(email, password);
        setInfo("Check your email to confirm your account, then sign in.");
      } else {
        await signIn(email, password);
        onAuth?.();
      }
    } catch (error: any) {
      setErr(error?.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => {
    setMode((m) => (m === "signin" ? "signup" : "signin"));
    setErr(null);
    setInfo(null);
  };

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

      {/* Logo */}
      <div style={{ marginBottom: 6 }}>
        <LockIcon />
      </div>

      {/* App name */}
      <div style={{
        fontSize: 36, fontWeight: 900, letterSpacing: "-0.03em",
        background: "linear-gradient(135deg, var(--accent-blue) 0%, #a78bfa 100%)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        backgroundClip: "text", marginBottom: 4,
      }}>
        TrainLab
      </div>

      <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 32 }}>
        {mode === "signin" ? "Welcome back" : "Create your account"}
      </div>

      {/* Card */}
      <div className="card" style={{ width: "100%", maxWidth: 360, padding: "24px 20px" }}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Email
            </label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{ width: "100%" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Password
            </label>
            <input
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ width: "100%" }}
            />
          </div>

          {err && (
            <div style={{
              fontSize: 12, color: "#ef4444",
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: "var(--radius-md)",
              padding: "8px 12px",
            }}>
              {err}
            </div>
          )}

          {info && (
            <div style={{
              fontSize: 12, color: "#10b981",
              background: "rgba(16,185,129,0.08)",
              border: "1px solid rgba(16,185,129,0.2)",
              borderRadius: "var(--radius-md)",
              padding: "8px 12px",
            }}>
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            style={{
              width: "100%", padding: "13px", fontSize: 14, fontWeight: 700,
              background: "var(--accent-blue)", color: "#fff", border: "none",
              borderRadius: "var(--radius-md)", cursor: busy ? "not-allowed" : "pointer",
              boxShadow: "0 0 20px rgba(59,130,246,0.3)",
              opacity: busy ? 0.7 : 1,
              marginTop: 2,
            }}
          >
            {busy ? (mode === "signin" ? "Signing in…" : "Creating account…") : (mode === "signin" ? "Sign In" : "Create Account")}
          </button>
        </form>

        <div style={{ marginTop: 18, textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
          {mode === "signin" ? "Don't have an account?" : "Already have an account?"}
          {" "}
          <button
            type="button"
            onClick={switchMode}
            style={{
              background: "none", border: "none", padding: 0,
              color: "var(--accent-blue)", fontWeight: 700, fontSize: 12,
              cursor: "pointer", textDecoration: "underline",
            }}
          >
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
