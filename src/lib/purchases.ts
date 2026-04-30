import { Purchases, LOG_LEVEL } from "@revenuecat/purchases-capacitor";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { supabase, EXPECTED_STORAGE_KEY } from "./supabase";
import { getDebugLog } from "./debugLog";

export const ENTITLEMENT_ID = "Pro";
export const OFFERING_ID = "trainlab_pro";
const REVENUECAT_APPLE_KEY = "appl_XEYpcIKAbOASwyRQgYMRjnrRBwm";

const REVIEWER_EMAILS = [
  "appstoretest57@gmail.com",
];

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

export interface ProDebugInfo {
  platform: "web" | "native";
  reviewerEmails: string[];
  userId: string | null;
  rawEmail: string | null;
  normalizedEmail: string | null;
  userMetadata: Record<string, unknown> | null;
  appMetadata: Record<string, unknown> | null;
  identities: unknown[] | null;
  reviewerMatch: boolean;
  revenueCatIsPro: boolean | null;
  sessionError?: string;
  revenueCatError?: string;
  // Storage diagnostics
  expectedStorageKey: string;
  preferencesKeys: string[] | null;
  expectedKeyPresent: boolean;
  expectedKeyLength: number | null;
  preferencesError?: string;
  // Auth log captured by signIn/signUp/storage adapter
  authLog: { ts: string; msg: string; data?: unknown }[];
}

export async function getProStatus(): Promise<{ isPro: boolean; debug: ProDebugInfo }> {
  const debug: ProDebugInfo = {
    platform: Capacitor.isNativePlatform() ? "native" : "web",
    reviewerEmails: REVIEWER_EMAILS,
    userId: null,
    rawEmail: null,
    normalizedEmail: null,
    userMetadata: null,
    appMetadata: null,
    identities: null,
    reviewerMatch: false,
    revenueCatIsPro: null,
    expectedStorageKey: EXPECTED_STORAGE_KEY,
    preferencesKeys: null,
    expectedKeyPresent: false,
    expectedKeyLength: null,
    authLog: getDebugLog(),
  };

  // On web/PWA, purchases are not available — treat as Pro so gates don't fire
  if (!Capacitor.isNativePlatform()) {
    return { isPro: true, debug };
  }

  // Snapshot Preferences state at debug-panel render time
  try {
    const { keys } = await Preferences.keys();
    debug.preferencesKeys = keys;
    debug.expectedKeyPresent = keys.includes(EXPECTED_STORAGE_KEY);
    if (debug.expectedKeyPresent) {
      const stored = await Preferences.get({ key: EXPECTED_STORAGE_KEY });
      debug.expectedKeyLength = stored.value?.length ?? null;
    }
  } catch (e) {
    debug.preferencesError = e instanceof Error ? e.message : String(e);
  }

  // Reviewer bypass — grants Pro to App Store / Google Play reviewers
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    const rawEmail = user?.email ?? null;
    const normalized = rawEmail?.toLowerCase().trim() ?? null;
    debug.userId = user?.id ?? null;
    debug.rawEmail = rawEmail;
    debug.normalizedEmail = normalized;
    debug.userMetadata = (user?.user_metadata as Record<string, unknown> | undefined) ?? null;
    debug.appMetadata = (user?.app_metadata as Record<string, unknown> | undefined) ?? null;
    debug.identities = (user?.identities as unknown[] | undefined) ?? null;

    const candidateEmails = [
      user?.email,
      (user?.user_metadata as any)?.email,
      ...((user?.identities ?? []) as any[]).map(i => i?.identity_data?.email),
    ]
      .filter(Boolean)
      .map((e: string) => e.toLowerCase().trim());

    const matched = candidateEmails.some(e => REVIEWER_EMAILS.includes(e));
    debug.reviewerMatch = matched;
    console.log("[getIsPro] candidate emails:", candidateEmails, "reviewer match:", matched);
    if (matched) return { isPro: true, debug };
  } catch (e) {
    debug.sessionError = e instanceof Error ? e.message : String(e);
    console.error("[getIsPro] reviewer-bypass getSession failed:", e);
  }

  try {
    const { customerInfo } = await Purchases.getCustomerInfo();
    const rcPro = ENTITLEMENT_ID in customerInfo.entitlements.active;
    debug.revenueCatIsPro = rcPro;
    console.log("[getIsPro] revenueCat isPro:", rcPro);
    return { isPro: rcPro, debug };
  } catch (e) {
    debug.revenueCatError = e instanceof Error ? e.message : String(e);
    console.error("[getIsPro] getCustomerInfo failed:", e);
    return { isPro: false, debug };
  }
}

export async function getIsPro(): Promise<boolean> {
  return (await getProStatus()).isPro;
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
