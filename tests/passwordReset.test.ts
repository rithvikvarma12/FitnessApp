// Password reset request path (v1.1 item 9).
// Verifies the request hits Supabase with the whitelisted redirect, stays
// non-revealing for unknown emails, and surfaces genuine failures.
//
// The client is dependency-injected, so the test is hermetic — no module
// mocking, no dependence on the supabase alias.

import { describe, it, expect, vi } from "vitest";
import {
  requestPasswordReset,
  PASSWORD_RESET_REDIRECT_URL,
  type PasswordResetClient,
} from "../src/lib/passwordReset";

function fakeClient(result: { error: { message: string } | null }) {
  const resetPasswordForEmail = vi.fn().mockResolvedValue(result);
  const client: PasswordResetClient = { auth: { resetPasswordForEmail } };
  return { client, resetPasswordForEmail };
}

describe("requestPasswordReset", () => {
  it("sends the recovery email with the whitelisted redirect URL (trimmed)", async () => {
    const { client, resetPasswordForEmail } = fakeClient({ error: null });
    await requestPasswordReset("  User@Example.com  ", client);
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(1);
    expect(resetPasswordForEmail).toHaveBeenCalledWith("User@Example.com", {
      redirectTo: PASSWORD_RESET_REDIRECT_URL,
    });
    // the redirect must point at the hosted fallback page, not the app
    expect(PASSWORD_RESET_REDIRECT_URL).toMatch(/^https:\/\/.+\/reset-password\.html$/);
  });

  it("does not reveal account existence — unknown email resolves the same", async () => {
    const { client } = fakeClient({ error: null });
    await expect(requestPasswordReset("nobody@example.com", client)).resolves.toBeUndefined();
  });

  it("surfaces genuine failures (e.g. rate limiting) for the UI to display", async () => {
    const { client } = fakeClient({ error: { message: "Email rate limit exceeded" } });
    await expect(requestPasswordReset("a@b.com", client)).rejects.toThrow(/rate limit/i);
  });
});
