// supabase/functions/delete-account/index.ts
//
// Permanently deletes a user's account and all associated data.
// Apple App Store Guideline 5.1.1(v) — in-app account deletion.
//
// Profile-id resolution (the auth_id link alone is NOT reliable — older rows
// can carry a NULL auth_id):
//   - Primary:  user_profiles WHERE auth_id = <jwt user id>
//   - Fallback: client-supplied profile ids, accepted ONLY when the row's
//               auth_id matches the caller OR is NULL (an unlinked orphan the
//               caller may safely claim). A row owned by a DIFFERENT auth user
//               is rejected with 403 — a user must never be able to delete
//               someone else's data by passing arbitrary ids.
//
// Deletion order: all 6 child tables, then user_profiles, then the auth user
// LAST — and only if every preceding delete succeeded.

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

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Per-table deleted row counts — surfaced to the client and the logs.
  const deleted: Record<string, number> = {};

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ── 1. Verify the caller's identity from their JWT ──
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return json({ error: "Missing Authorization header" }, 401);

    const jwtClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userErr } = await jwtClient.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "Invalid or expired token" }, 401);
    const authUserId = userData.user.id;
    console.log("[delete-account] authUserId:", authUserId);

    // ── Parse client-claimed profile ids from the request body ──
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const claimedIds: string[] = Array.isArray((body as { profileIds?: unknown }).profileIds)
      ? ((body as { profileIds: unknown[] }).profileIds.filter(
          (x): x is string => typeof x === "string" && x.length > 0,
        ))
      : [];
    console.log("[delete-account] client-claimed profileIds:", claimedIds);

    // ── Service-role client — bypasses RLS for deletes + admin API ──
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── 2a. Resolve profiles via the auth_id link ──
    const { data: authProfiles, error: authProfErr } = await admin
      .from("user_profiles")
      .select("id, auth_id")
      .eq("auth_id", authUserId);
    if (authProfErr) {
      return json(
        { deleted, failed: "user_profiles (auth_id lookup)", error: authProfErr.message, authUserId },
        500,
      );
    }
    const resolvedIds = new Set<string>((authProfiles ?? []).map((p) => p.id as string));

    // ── 2b. Validate client-claimed ids and merge in the safe ones ──
    if (claimedIds.length > 0) {
      const { data: claimedRows, error: claimErr } = await admin
        .from("user_profiles")
        .select("id, auth_id")
        .in("id", claimedIds);
      if (claimErr) {
        return json(
          { deleted, failed: "user_profiles (claimed lookup)", error: claimErr.message, authUserId },
          500,
        );
      }
      for (const row of claimedRows ?? []) {
        const rowAuth = (row.auth_id as string | null) ?? null;
        if (rowAuth === authUserId || rowAuth === null) {
          // Owned by the caller, or an unlinked orphan the caller may claim.
          resolvedIds.add(row.id as string);
        } else {
          // SECURITY: the claimed profile belongs to a different auth user.
          console.error("[delete-account] REJECTED — profile", row.id, "is owned by", rowAuth);
          return json(
            { error: "Forbidden: a supplied profile id belongs to another account", profileId: row.id },
            403,
          );
        }
      }
      // Claimed ids with no matching row — nothing to delete, silently ignored.
    }

    const profileIds = [...resolvedIds];
    console.log("[delete-account] resolved profileIds:", profileIds, "count:", profileIds.length);

    // ── Guard: profile rows exist for this auth user but resolved to nothing ──
    if ((authProfiles?.length ?? 0) > 0 && profileIds.length === 0) {
      return json(
        { deleted, error: "Profile rows exist for this user but none resolved for deletion — aborting", authUserId },
        500,
      );
    }

    // ── 3. Delete child tables (data first) ──
    for (const table of CHILD_TABLES) {
      if (profileIds.length === 0) {
        deleted[table] = 0;
        continue;
      }
      const { data: rows, error } = await admin
        .from(table)
        .delete()
        .in("user_id", profileIds)
        .select("id");
      if (error) {
        // Fail loudly — do NOT proceed to delete the auth user.
        return json({ deleted, failed: table, error: error.message, authUserId, profileIds }, 500);
      }
      deleted[table] = rows?.length ?? 0;
      console.log(`[delete-account] deleted ${table}:`, deleted[table]);
    }

    // ── 4. Delete the profile rows — by id, so claimed NULL-auth_id orphans are covered ──
    if (profileIds.length > 0) {
      const { data: rows, error } = await admin
        .from("user_profiles")
        .delete()
        .in("id", profileIds)
        .select("id");
      if (error) {
        return json({ deleted, failed: "user_profiles", error: error.message, authUserId, profileIds }, 500);
      }
      deleted["user_profiles"] = rows?.length ?? 0;
    } else {
      deleted["user_profiles"] = 0;
    }
    console.log("[delete-account] deleted user_profiles:", deleted["user_profiles"]);

    // ── 5. Delete the auth user LAST — only reached if every table delete succeeded ──
    const { error: delUserErr } = await admin.auth.admin.deleteUser(authUserId);
    if (delUserErr) {
      return json({ deleted, failed: "auth.users", error: delUserErr.message, authUserId, profileIds }, 500);
    }
    console.log("[delete-account] deleted auth user:", authUserId);

    return json({ success: true, deleted, authUserId, profileIds });
  } catch (e) {
    console.error("[delete-account] unhandled error:", e);
    return json({ deleted, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
