import { afterEach, describe, expect, it, vi } from "vitest";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
async function staging() {
  vi.stubEnv("VITE_INDEPENDENT_STAGING", "true");
  vi.stubEnv("VITE_STAGING_ORIGIN", "https://tamkeen-test.example");
  vi.resetModules();
  return import("../../src/lib/auth/native-oauth");
}
describe("independent staging OAuth isolation", () => {
  it("uses the separate app scheme and accepts only that app's callback", async () => {
    const auth = await staging();
    expect(auth.NATIVE_OAUTH_REDIRECT_URL).toBe(
      "app.studentamkeen.tamkeen.staging://auth/callback",
    );
    expect(
      auth.parseNativeAuthCallback(auth.NATIVE_OAUTH_REDIRECT_URL + "?code=TEST_ONLY_123").kind,
    ).toBe("code");
    expect(
      auth.parseNativeAuthCallback("app.studentamkeen.tamkeen://auth/callback?code=TEST_ONLY_123")
        .kind,
    ).toBe("ignored");
  });
  it("restricts HTTPS returns to the independently configured host", async () => {
    const auth = await staging();
    expect(
      auth.parseNativeAuthCallback(
        "https://tamkeen-test.example/auth/mobile-callback?code=TEST_ONLY_123",
      ).kind,
    ).toBe("code");
    expect(
      auth.parseNativeAuthCallback(
        "https://studentamkeen.com/auth/mobile-callback?code=TEST_ONLY_123",
      ).kind,
    ).toBe("ignored");
  });
  it("keeps implicit access tokens forbidden", async () => {
    const auth = await staging();
    expect(
      auth.parseNativeAuthCallback(auth.NATIVE_OAUTH_REDIRECT_URL + "#access_token=TEST_ONLY").kind,
    ).toBe("error");
  });
  it("uses only the independent public database configuration", async () => {
    await staging();
    const config = await import("../../src/integrations/supabase/public-config");
    expect(config.PUBLIC_SUPABASE_URL).toBe("https://yjpirilbpqxtmnayruht.supabase.co");
    expect(config.PUBLIC_SUPABASE_PUBLISHABLE_KEY).toMatch(/^sb_publishable_/);
  });
});
