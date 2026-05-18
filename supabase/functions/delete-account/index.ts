// supabase/functions/delete-account/index.ts
//
// Permanently deletes a user's account and all associated data.
// Apple App Store Guideline 5.1.1(v) — in-app account deletion.
//
// Flow:
//   1. Verify the caller's JWT, extract the auth user id.
//   2. Look up their profile id(s) in user_profiles (auth_id -> id).
//   3. Delete child-table rows (keyed by user_id = profile id), children first.
//   4. Delete the user_profiles row(s) (keyed by auth_id).
//   5. Delete the auth user via the admin API.
//
// On a mid-way failure it returns { deleted: [...], failed, error } with HTTP
// 500 so the client knows what was removed and can keep the user signed in.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Child tables keyed by user_id (= user_profiles.id). Deleted before the parent.
const CHILD_TABLES = [
  "weight_entries",
  "week_plans",
  "daily_nutrition_logs",
  "nutrition_settings",
  "custom_exercises",
  "active_injuries",
] as const;

Deno.serve(async (req) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Tracks what was successfully removed — surfaced to the client on failure.
  const deleted: string[] = [];

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ── 1. Verify the caller's identity from their JWT ──
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const jwtClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userErr } = await jwtClient.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return json({ error: "Invalid or expired token" }, 401);
    }
    const authUserId = userData.user.id;

    // ── Service-role client — bypasses RLS for deletes + admin API ──
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── 2. Resolve profile id(s) for this auth user ──
    const { data: profiles, error: profErr } = await admin
      .from("user_profiles")
      .select("id")
      .eq("auth_id", authUserId);
    if (profErr) {
      return json({ deleted, failed: "user_profiles (lookup)", error: profErr.message }, 500);
    }
    const profileIds = (profiles ?? []).map((p) => p.id as string);

    // ── 3. Delete child-table rows (keyed by user_id = profile id) ──
    // Skipped cleanly when the user has no profile row (signed up, never set up).
    if (profileIds.length > 0) {
      for (const table of CHILD_TABLES) {
        const { error } = await admin.from(table).delete().in("user_id", profileIds);
        if (error) {
          return json({ deleted, failed: table, error: error.message }, 500);
        }
        deleted.push(table);
      }
    }

    // ── 4. Delete the parent profile row(s) (keyed by auth_id) ──
    {
      const { error } = await admin.from("user_profiles").delete().eq("auth_id", authUserId);
      if (error) {
        return json({ deleted, failed: "user_profiles", error: error.message }, 500);
      }
      deleted.push("user_profiles");
    }

    // ── 5. Delete the auth user ──
    {
      const { error } = await admin.auth.admin.deleteUser(authUserId);
      if (error) {
        return json({ deleted, failed: "auth.users", error: error.message }, 500);
      }
      deleted.push("auth.users");
    }

    return json({ success: true, deleted });
  } catch (e) {
    return json({ deleted, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
