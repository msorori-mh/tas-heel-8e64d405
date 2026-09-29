// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  lookup: vi.fn(),
  native: false,
  preferences: new Map<string, string>(),
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => api.native } }));
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: api.preferences.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => api.preferences.set(key, value),
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    schema: () => ({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: api.lookup }) }) }),
    }),
  },
}));
import { rememberWorkspace, resolveWorkspaceHome } from "@/lib/auth/workspace";
beforeEach(() => {
  localStorage.clear();
  api.preferences.clear();
  api.native = false;
  vi.clearAllMocks();
  api.lookup.mockResolvedValue({ data: null, error: null });
});
it("restores the chosen teacher workspace even for a complete dual-role student", async () => {
  await rememberWorkspace("a", "teacher");
  expect(await resolveWorkspaceHome("a", true)).toBe("/academy");
  expect(api.lookup).not.toHaveBeenCalled();
});
it("does not apply a previous account preference to the next account", async () => {
  await rememberWorkspace("a", "teacher");
  expect(await resolveWorkspaceHome("b", true)).toBe("/app");
});
it("detects an existing teacher before asking for a missing student profile", async () => {
  api.lookup.mockResolvedValue({ data: { user_id: "a" }, error: null });
  expect(await resolveWorkspaceHome("a", false)).toBe("/academy");
});
it("allows an explicitly selected student workspace to complete its own profile", async () => {
  await rememberWorkspace("a", "student");
  expect(await resolveWorkspaceHome("a", false)).toBe("/complete-profile");
  expect(api.lookup).not.toHaveBeenCalled();
});
it("retains native workspace choice when web storage is cleared", async () => {
  api.native = true;
  await rememberWorkspace("a", "teacher");
  localStorage.clear();
  expect(await resolveWorkspaceHome("a", false)).toBe("/academy");
});
it("does not mistake a failed teacher lookup for a missing teacher profile", async () => {
  api.lookup.mockResolvedValue({ data: null, error: new Error("offline") });
  await expect(resolveWorkspaceHome("a", false)).rejects.toThrow("offline");
});
