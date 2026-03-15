import { Purchases, LOG_LEVEL } from "@revenuecat/purchases-capacitor";
import { Capacitor } from "@capacitor/core";

export const ENTITLEMENT_ID = "Pro";
export const OFFERING_ID = "trainlab_pro";
const REVENUECAT_APPLE_KEY = "appl_XEYpcIKAbOASwyRQgYMRjnrRBwm";

// Resolves once initPurchases() completes (or immediately on web)
let _resolvePurchasesReady!: () => void;
export const purchasesReady = new Promise<void>(resolve => {
  _resolvePurchasesReady = resolve;
});
if (!Capacitor.isNativePlatform()) _resolvePurchasesReady();

export async function initPurchases(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Purchases.setLogLevel({ level: LOG_LEVEL.ERROR });
    await Purchases.configure({ apiKey: REVENUECAT_APPLE_KEY });
  } catch (e) {
    console.error("[RC] initPurchases failed:", e);
  } finally {
    _resolvePurchasesReady();
  }
}

export async function loginPurchases(userId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Purchases.logIn({ appUserID: userId });
  } catch (e) {
    console.error("RevenueCat login failed:", e);
  }
}

export async function logoutPurchases(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Purchases.logOut();
  } catch (e) {
    console.error("RevenueCat logout failed:", e);
  }
}

export async function getIsPro(): Promise<boolean> {
  // On web/PWA, purchases are not available — treat as Pro so gates don't fire
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const { customerInfo } = await Purchases.getCustomerInfo();
    return ENTITLEMENT_ID in customerInfo.entitlements.active;
  } catch {
    return false;
  }
}

export async function getOffering() {
  if (!Capacitor.isNativePlatform()) return null;
  const offerings = await Purchases.getOfferings();
  return offerings.current ?? offerings.all?.[OFFERING_ID] ?? null;
}

export async function purchasePackage(pkg: { identifier: string; offeringIdentifier: string }) {
  const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg as never });
  return ENTITLEMENT_ID in customerInfo.entitlements.active;
}

export async function restorePurchases(): Promise<boolean> {
  const { customerInfo } = await Purchases.restorePurchases();
  return ENTITLEMENT_ID in customerInfo.entitlements.active;
}
