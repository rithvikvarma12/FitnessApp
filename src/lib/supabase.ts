import { createClient } from "@supabase/supabase-js";
import { Preferences } from "@capacitor/preferences";
import { Capacitor } from "@capacitor/core";
import { pushDebug } from "./debugLog";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://kelsupblazafjzwzsqzb.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_SoFSkEJztCpDGkthwYawrA_0MxYzYhW';

// Mirrors @supabase/supabase-js default-key derivation:
// https://github.com/supabase/supabase-js/blob/master/src/SupabaseClient.ts (defaultStorageKey)
export const EXPECTED_STORAGE_KEY = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;

const capacitorStorage = {
  getItem: async (key: string) => {
    try {
      const { value } = await Preferences.get({ key });
      pushDebug(`Preferences.getItem(${key})`, { hasValue: value != null, length: value?.length ?? 0 });
      return value;
    } catch (e) {
      pushDebug(`Preferences.getItem ERROR(${key})`, String(e));
      console.error('Preferences.get failed:', key, e);
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      await Preferences.set({ key, value });
      pushDebug(`Preferences.setItem(${key})`, { length: value.length });
    } catch (e) {
      pushDebug(`Preferences.setItem ERROR(${key})`, String(e));
      console.error('Preferences.set failed:', key, e);
    }
  },
  removeItem: async (key: string) => {
    try {
      await Preferences.remove({ key });
      pushDebug(`Preferences.removeItem(${key})`);
    } catch (e) {
      pushDebug(`Preferences.removeItem ERROR(${key})`, String(e));
      console.error('Preferences.remove failed:', key, e);
    }
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: Capacitor.isNativePlatform() ? capacitorStorage : undefined,
  },
});
