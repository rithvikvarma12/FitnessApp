import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://kelsupblazafjzwzsqzb.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_SoFSkEJztCpDGkthwYawrA_0MxYzYhW';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
