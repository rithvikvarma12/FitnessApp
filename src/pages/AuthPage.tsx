import { useState } from "react";
import { signIn, signUp } from "../lib/auth";
import { signInWithApple, signInWithGoogle } from "../lib/socialAuth";

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

  const handleApple = async () => {
    setErr(null);
    setBusy(true);
    try {
      await signInWithApple();
      onAuth?.();
    } catch (e: any) {
      setErr(e?.message ?? "Apple sign in failed");
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setErr(null);
    setBusy(true);
    try {
      await signInWithGoogle();
      onAuth?.();
    } catch (e: any) {
      setErr(e?.message ?? "Google sign in failed");
    } finally {
      setBusy(false);
    }
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

        {/* Social login */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1, height: 1, background: "var(--border-glass-hover)" }} />
            <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>OR</span>
            <div style={{ flex: 1, height: 1, background: "var(--border-glass-hover)" }} />
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={handleApple}
            style={{
              width: "100%", padding: "12px", fontSize: 14, fontWeight: 600,
              background: "#fff", color: "#000", border: "none",
              borderRadius: "var(--radius-md)", cursor: busy ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              opacity: busy ? 0.7 : 1,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
            </svg>
            Continue with Apple
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={handleGoogle}
            style={{
              width: "100%", padding: "12px", fontSize: 14, fontWeight: 600,
              background: "var(--btn-secondary-bg)", color: "var(--text-primary)",
              border: "1px solid var(--border-glass-hover)",
              borderRadius: "var(--radius-md)", cursor: busy ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              opacity: busy ? 0.7 : 1,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </button>
        </div>

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
