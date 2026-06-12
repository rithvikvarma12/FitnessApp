// ─────────────────────────────────────────────────────────────────────────────
// Password reset request (v1.1 item 9).
//
// Sends the Supabase recovery email. The link lands on the standalone hosted
// page below (the same web-fallback pattern as delete-account.html) — the app
// has no OAuth deep-link scheme, so the reset is completed in the browser.
//
// ⚠ The redirect URL MUST be whitelisted in:
//     Supabase Dashboard → Authentication → URL Configuration → Redirect URLs
//       https://fitness-app-jet-nine.vercel.app/reset-password.html
//   Without it the recovery link redirect fails and the page gets no session.
//
// Privacy: resetPasswordForEmail is non-revealing by design — an unknown email
// still resolves without error, so the caller can show neutral confirmation
// copy. Only genuine failures (rate limiting, malformed input) reject.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "./supabase";

export const PASSWORD_RESET_REDIRECT_URL =
  "https://fitness-app-jet-nine.vercel.app/reset-password.html";

// Narrow surface of the Supabase client this module needs. Declared explicitly
// so it can be injected in tests without standing up the whole auth client.
export interface PasswordResetClient {
  auth: {
    resetPasswordForEmail(
      email: string,
      options?: { redirectTo?: string }
    ): Promise<{ error: { message: string } | null }>;
  };
}

export async function requestPasswordReset(
  email: string,
  client: PasswordResetClient = supabase as unknown as PasswordResetClient
): Promise<void> {
  const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: PASSWORD_RESET_REDIRECT_URL,
  });
  if (error) throw error;
}
