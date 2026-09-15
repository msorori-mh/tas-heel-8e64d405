// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://studentamkeen.com"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const storageKey = "sb-zbdhxyuulyovihjgeqbn-auth-token";
const code = "TEST_ONLY_authorization_code";
const verifier = "TEST_ONLY_" + "v".repeat(50);
const session = {
  access_token: "TEST_ONLY_access",
  refresh_token: "TEST_ONLY_refresh",
  token_type: "bearer",
  expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400,
  user: { id: "TEST_ONLY_user", aud: "authenticated", app_metadata: {}, user_metadata: {} },
};
let client: SupabaseClient | undefined;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  vi.stubEnv("VITE_SUPABASE_URL", "https://zbdhxyuulyovihjgeqbn.supabase.co");
  vi.stubGlobal("BroadcastChannel", undefined);
  fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    expect(url.pathname).toBe("/auth/v1/token");
    expect(url.searchParams.get("grant_type")).toBe("pkce");
    expect(JSON.parse(String(init?.body))).toEqual({ auth_code: code, code_verifier: verifier });
    return new Response(JSON.stringify(session), {
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  await client?.auth.stopAutoRefresh();
  client = undefined;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("shared client runs the real SDK PKCE URL classifier", () => {
  for (const path of ["/auth/callback", "/academy/callback"]) {
    it(`exchanges once and restores a session at ${path}`, async () => {
      history.replaceState(null, "", `${path}?code=${code}`);
      localStorage.setItem(`${storageKey}-code-verifier`, JSON.stringify(verifier));
      client = (await import("../../src/integrations/supabase/client")).supabase;
      const result = await client.auth.getSession();
      expect(result.error).toBeNull();
      expect(result.data.session?.user.id).toBe(session.user.id);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(new URL(location.href).searchParams.has("code")).toBe(false);
      expect((await client.auth.getSession()).data.session?.user.id).toBe(session.user.id);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  }

  it("restores an existing session on a normal page without misclassifying it as OAuth", async () => {
    history.replaceState(null, "", "/app");
    localStorage.setItem(storageKey, JSON.stringify(session));
    client = (await import("../../src/integrations/supabase/client")).supabase;
    expect((await client.auth.getSession()).data.session?.user.id).toBe(session.user.id);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves the HTTPS mobile callback for the native app to exchange", async () => {
    history.replaceState(null, "", `/auth/mobile-callback?code=${code}`);
    localStorage.setItem(`${storageKey}-code-verifier`, JSON.stringify(verifier));
    client = (await import("../../src/integrations/supabase/client")).supabase;
    expect((await client.auth.getSession()).data.session).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(`${storageKey}-code-verifier`)).toBe(JSON.stringify(verifier));
  });
});
