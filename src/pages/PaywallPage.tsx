import { useEffect, useState } from "react";
import { getOffering, purchasePackage, restorePurchases, purchasesReady } from "../lib/purchases";
import { useProContext } from "../lib/ProContext";
import { Capacitor } from "@capacitor/core";

interface PaywallPageProps {
  onClose: () => void;
}

type PurchasePackage = {
  identifier: string;
  offeringIdentifier: string;
  product: {
    priceString: string;
    subscriptionPeriod?: string;
    introPrice?: { priceString: string } | null;
  };
};

type FallbackPlan = { id: "monthly" | "annual"; label: string; price: string; period: string; badge?: string };

const FALLBACK_PLANS: FallbackPlan[] = [
  { id: "monthly", label: "Monthly", price: "$4.99", period: "/ month" },
  { id: "annual",  label: "Annual",  price: "$39.99", period: "/ year", badge: "Save 33%" },
];

const FEATURES = [
  { icon: "🔄", text: "Adjust remaining days mid-week" },
  { icon: "📊", text: "Full nutrition logging & analytics" },
  { icon: "🏋️", text: "High volume training mode" },
  { icon: "🧩", text: "Unlimited custom exercises" },
  { icon: "✈️", text: "Traveling, injury & focus chips" },
  { icon: "📈", text: "Full progress analytics" },
];

function periodLabel(period?: string): string {
  if (!period) return "";
  if (period.includes("Y")) return "/ year";
  if (period.includes("M") && !period.includes("D")) return "/ month";
  if (period.includes("W")) return "/ week";
  return "";
}

export default function PaywallPage({ onClose }: PaywallPageProps) {
  const { refresh } = useProContext();
  const [packages, setPackages] = useState<PurchasePackage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingOffering, setLoadingOffering] = useState(true);
  const [offeringsAvailable, setOfferingsAvailable] = useState(false);
  // Fallback selection when offerings unavailable
  const [fallbackSelected, setFallbackSelected] = useState<"monthly" | "annual">("monthly");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      setLoadingOffering(false);
      return;
    }

    (async () => {
      try {
        await purchasesReady;
        const offering = await getOffering();

        if (offering?.availablePackages?.length) {
          const pkgs = offering.availablePackages as PurchasePackage[];
          setPackages(pkgs);
          const monthly = pkgs.find(p =>
            p.identifier.toLowerCase().includes("month") ||
            p.product.subscriptionPeriod?.includes("M")
          );
          setSelectedId((monthly ?? pkgs[0]).identifier);
          setOfferingsAvailable(true);
        }
      } catch (e) {
        console.error("[Paywall] getOffering error:", e);
      } finally {
        setLoadingOffering(false);
      }
    })();
  }, []);

  const selectedPkg = packages.find(p => p.identifier === selectedId) ?? null;

  const handlePurchase = async () => {
    // Offerings not loaded — show friendly message
    if (!offeringsAvailable || !selectedPkg) {
      setErr("Subscription will be available shortly. Please try again in a few minutes.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const isPro = await purchasePackage(selectedPkg);
      if (isPro) {
        await refresh();
        onClose();
      } else {
        setErr("Purchase completed but entitlement not active. Try restoring.");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[Paywall] purchasePackage error:", msg);
      if (!msg.toLowerCase().includes("cancel")) {
        setErr("Purchase failed. Please try again or restore purchases.");
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
    } catch (e) {
      console.error("[Paywall] restorePurchases error:", e);
      setErr("Restore failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const hasTrial = selectedPkg?.product.introPrice != null;
  const ctaLabel = busy ? "Processing…" : hasTrial ? "Start 7-Day Free Trial" : "Upgrade to Pro";

  // Build display plans — real or fallback
  const displayPlans: { id: string; label: string; price: string; period: string; badge?: string; hasTrial?: boolean }[] =
    offeringsAvailable
      ? packages.map(pkg => ({
          id: pkg.identifier,
          label: pkg.identifier.toLowerCase().includes("annual") || pkg.product.subscriptionPeriod?.includes("Y")
            ? "Annual" : "Monthly",
          price: pkg.product.priceString,
          period: periodLabel(pkg.product.subscriptionPeriod),
          hasTrial: pkg.product.introPrice != null,
        }))
      : FALLBACK_PLANS.map(p => ({ ...p }));

  const currentSelectedId = offeringsAvailable ? selectedId : fallbackSelected;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 3000,
      background: "var(--bg-deep)",
      display: "flex", flexDirection: "column",
      overflowY: "auto",
      WebkitOverflowScrolling: "touch",
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

            {/* Loading state */}
            {loadingOffering && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 0" }}>
                <style>{`
                  @keyframes db-bounce {
                    0%, 100% { transform: translateY(0); }
                    50%       { transform: translateY(-12px); }
                  }
                  .paywall-db { animation: db-bounce 1s ease-in-out infinite; }
                `}</style>
                <svg
                  className="paywall-db"
                  viewBox="0 0 64 64" fill="none"
                  stroke="var(--accent-blue)" strokeWidth="3"
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{ width: 48, height: 48, opacity: 0.7 }}
                >
                  <rect x="4" y="26" width="12" height="12" rx="3" />
                  <rect x="14" y="22" width="8" height="20" rx="2" />
                  <rect x="48" y="26" width="12" height="12" rx="3" />
                  <rect x="42" y="22" width="8" height="20" rx="2" />
                  <line x1="22" y1="32" x2="42" y2="32" strokeWidth="5" />
                </svg>
              </div>
            )}

            {/* Plan picker — shown once loading is done */}
            {!loadingOffering && displayPlans.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {displayPlans.map((plan) => {
                  const isSelected = plan.id === currentSelectedId;
                  return (
                    <button
                      key={plan.id}
                      onClick={() => {
                        if (offeringsAvailable) setSelectedId(plan.id);
                        else setFallbackSelected(plan.id as "monthly" | "annual");
                      }}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "14px 16px", borderRadius: 12, cursor: "pointer",
                        background: isSelected ? "rgba(59,130,246,0.15)" : "var(--bg-surface)",
                        border: isSelected ? "2px solid var(--accent-blue)" : "2px solid var(--border-glass)",
                        transition: "all 0.15s",
                      }}
                    >
                      <div style={{ textAlign: "left" }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                          {plan.label}
                        </div>
                        {plan.hasTrial && (
                          <div style={{ fontSize: 11, color: "var(--accent-blue)", fontWeight: 600 }}>
                            7-day free trial
                          </div>
                        )}
                        {plan.badge && !plan.hasTrial && (
                          <div style={{ fontSize: 11, color: "var(--accent-blue)", fontWeight: 600 }}>
                            {plan.badge}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
                          {plan.price}
                        </div>
                        {plan.period && (
                          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{plan.period}</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Purchase button */}
            {!loadingOffering && (
              <button
                disabled={busy}
                onClick={() => void handlePurchase()}
                style={{ fontSize: 16, padding: "14px", fontWeight: 700 }}
              >
                {ctaLabel}
              </button>
            )}

            {/* Trial sub-label (only when offerings loaded) */}
            {!loadingOffering && offeringsAvailable && hasTrial && selectedPkg && (
              <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
                then {selectedPkg.product.priceString} {periodLabel(selectedPkg.product.subscriptionPeriod)} · Cancel anytime
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
