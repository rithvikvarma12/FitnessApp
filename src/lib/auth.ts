import { Preferences } from "@capacitor/preferences";
import { Capacitor } from "@capacitor/core";
import { supabase, EXPECTED_STORAGE_KEY } from "./supabase";
import { pushDebug } from "./debugLog";

async function logPreferencesState(label: string) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { keys } = await Preferences.keys();
    const expected = await Preferences.get({ key: EXPECTED_STORAGE_KEY });
    pushDebug(label, {
      expectedKey: EXPECTED_STORAGE_KEY,
      keys,
      expectedKeyPresent: keys.includes(EXPECTED_STORAGE_KEY),
      expectedKeyLength: expected.value?.length ?? null,
    });
  } catch (e) {
    pushDebug(`${label} ERROR`, String(e));
  }
}

export async function signUp(email: string, password: string) {
  pushDebug("auth.signUp start", { email });
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    pushDebug("auth.signUp error", error.message);
    throw error;
  }
  pushDebug("auth.signUp ok", { hasSession: !!data.session, hasUser: !!data.user });
  await logPreferencesState("auth.signUp post-Preferences");
  return data;
}

export async function signIn(email: string, password: string) {
  pushDebug("auth.signIn start", { email });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    pushDebug("auth.signIn error", error.message);
    throw error;
  }
  pushDebug("auth.signIn ok", {
    hasSession: !!data.session,
    hasUser: !!data.user,
    userEmail: data.user?.email ?? null,
    userId: data.user?.id ?? null,
  });
  await logPreferencesState("auth.signIn post-Preferences");
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}
