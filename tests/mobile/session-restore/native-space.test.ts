// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from "vitest";
const values = vi.hoisted(() => new Map<string, string>());
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: values.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => {
      values.set(key, value);
    },
    remove: async ({ key }: { key: string }) => {
      values.delete(key);
    },
  },
}));
import {
  LAST_NATIVE_SPACE_KEY,
  readNativeSpace,
  rememberNativeSpace,
} from "@/lib/auth/native-last-space";
beforeEach(() => {
  values.clear();
  localStorage.clear();
});
test("teacher navigation survives a cleared WebView store and is bound to its owner", async () => {
  await rememberNativeSpace("teacher-a", "teacher");
  localStorage.clear();
  expect(await readNativeSpace("teacher-a")).toBe("teacher");
  expect(await readNativeSpace("student-b")).toBe("student");
});
test("old academy downloads migrate only for the restored session's owner", async () => {
  localStorage.setItem("tamkeen-academy-offline-owner", "teacher-a");
  expect(await readNativeSpace("teacher-a")).toBe("teacher");
  expect(await readNativeSpace("student-b")).toBe("student");
});
test("a corrupt or arbitrary destination cannot redirect outside the app", async () => {
  values.set(LAST_NATIVE_SPACE_KEY, "bad-json");
  expect(await readNativeSpace("a")).toBe("student");
  values.set(LAST_NATIVE_SPACE_KEY, JSON.stringify({ owner: "a", space: "https://evil.test" }));
  expect(await readNativeSpace("a")).toBe("student");
});
