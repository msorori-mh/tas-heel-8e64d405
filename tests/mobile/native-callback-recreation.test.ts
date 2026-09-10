import { beforeEach, describe, expect, it, vi } from "vitest";
const values = vi.hoisted(() => new Map<string, string>());
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: values.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => {
      values.set(key, value);
    },
  },
}));
beforeEach(() => {
  values.clear();
  vi.resetModules();
});
describe("native callback receipt survives activity recreation", () => {
  it("ignores a successful launch intent after module restart without persisting its code", async () => {
    const first = await import("../../src/lib/auth/native-oauth");
    const code = "TEST_ONLY_native_authorization_code";
    expect(await first.wasNativeCallbackCompleted(code)).toBe(false);
    await first.rememberCompletedNativeCallback(code);
    vi.resetModules();
    const restarted = await import("../../src/lib/auth/native-oauth");
    expect(await restarted.wasNativeCallbackCompleted(code)).toBe(true);
    expect(await restarted.wasNativeCallbackCompleted("TEST_ONLY_new_code")).toBe(false);
    expect(JSON.stringify([...values.values()])).not.toContain(code);
  });
  it("leaves a failed exchange available for explicit retry", async () => {
    const oauth = await import("../../src/lib/auth/native-oauth");
    oauth.markCallbackConsumed("TEST_ONLY_failed_code");
    oauth.unmarkCallbackConsumed("TEST_ONLY_failed_code");
    expect(oauth.isCallbackConsumed("TEST_ONLY_failed_code")).toBe(false);
    expect(await oauth.wasNativeCallbackCompleted("TEST_ONLY_failed_code")).toBe(false);
  });
});
