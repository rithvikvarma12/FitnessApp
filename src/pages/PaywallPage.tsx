import { useEffect, useState } from "react";
import { getOffering, purchasePackage, restorePurchases } from "../lib/purchases";
import { useProContext } from "../lib/ProContext";
import { Capacitor } from "@capacitor/core";

interface PaywallPageProps {
  onClose: () => void;
}

const FEATURES = [
  { icon: "🔄", text: "Adjust remaining days mid-week" },
  { icon: "📊", text: "Full nutrition logging & analytics" },
  { icon: "🏋️", text: "High volume training mode" },
  { icon: "🧩", text: "Unlimited custom exercises" },
  { icon: "✈️", text: "Traveling, injury & focus chips" },
  { icon: "📈", text: "Full progress analytics" },
];

export default function PaywallPage({ onClose }: PaywallPageProps) {
  const { refresh } = useProContext();
  const [pkg, setPkg] = useState<{ identifier: string; offeringIdentifier: string; product: { priceString: string; introPrice?: { priceString: string } | null } } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    getOffering().then((offering) => {
      if (offering?.availablePackages?.length) {
        setPkg(offering.availablePackages[0] as typeof pkg);
      }
    });
  }, []);

  const handlePurchase = async () => {
    if (!pkg) return;
    setBusy(true);
    setErr(null);
    try {
      const isPro = await purchasePackage(pkg);
      if (isPro) {
        await refresh();
        onClose();
      } else {
        setErr("Purchase completed but entitlement not active. Try restoring.");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("cancelled") && !msg.includes("cancel")) {
        setErr("Unable to connect to App Store. Please try again later.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    setBusy(true);
    setErr(null);
    try {
      const isPro = await restorePurchases();
      if (isPro) {
        await refresh();
        onClose();
      } else {
        setErr("No active subscription found.");
      }
    } catch {
      setErr("Restore failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const trialLabel = pkg?.product.introPrice?.priceString
    ? `Start 7-Day Free Trial`
    : "Upgrade to Pro";

  const priceLabel = pkg?.product.priceString
    ? `then ${pkg.product.priceString}/month`
    : "";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "var(--bg-base)",
      display: "flex", flexDirection: "column",
      overflowY: "auto",
    }}>
      {/* Close */}
      <button
        className="secondary"
        onClick={onClose}
        style={{
          position: "absolute", top: 16, right: 16,
          padding: "4px 10px", fontSize: 13, zIndex: 1,
        }}
      >
        ✕
      </button>

      <div style={{ padding: "48px 24px 32px", display: "flex", flexDirection: "column", gap: 24, maxWidth: 420, margin: "0 auto", width: "100%" }}>
        {/* Header */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🏆</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
            TrainLab Pro
          </div>
          <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Unlock the full TrainLab experience with intelligent weekly planning, nutrition analytics, and more.
          </div>
        </div>

        {/* Feature list */}
        <div className="card" style={{ gap: 12 }}>
          {FEATURES.map((f) => (
            <div key={f.text} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14, color: "var(--text-primary)" }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{f.icon}</span>
              <span>{f.text}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        {Capacitor.isNativePlatform() ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              disabled={busy}
              onClick={() => void handlePurchase()}
              style={{ fontSize: 16, padding: "14px", fontWeight: 700 }}
            >
              {busy ? "Processing…" : trialLabel}
            </button>
            {priceLabel && (
              <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
                {priceLabel} · Cancel anytime
              </div>
            )}
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void handleRestore()}
              style={{ fontSize: 13 }}
            >
              Restore Purchases
            </button>
            {err && (
              <div className="tag tag--red" style={{ padding: "6px 10px", fontSize: 12, textAlign: "center" }}>
                {err}
              </div>
            )}
            <button
              onClick={onClose}
              style={{
                background: "none", border: "none", padding: "4px 0",
                fontSize: 13, color: "var(--text-muted)", cursor: "pointer",
                textDecoration: "underline", textAlign: "center",
              }}
            >
              Not now
            </button>
          </div>
        ) : (
          <div className="card" style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            In-app purchases are available on iOS. Download the app to subscribe.
          </div>
        )}

        {/* Legal */}
        <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", lineHeight: 1.6 }}>
          Payment will be charged to your Apple ID. Subscription renews automatically unless cancelled at least 24 hours before the end of the current period. You can manage or cancel subscriptions in App Store settings.
        </div>
      </div>
    </div>
  );
}
