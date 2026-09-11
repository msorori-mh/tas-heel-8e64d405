import { describe, expect, it } from "vitest";
import { createDurableNativeAuthStorage } from "./nativeAuthStorage";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

function memoryPreferences(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get: async ({ key }: { key: string }) => ({ value: values.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => void values.set(key, value),
    remove: async ({ key }: { key: string }) => void values.delete(key),
  };
}

describe("durable native auth storage", () => {
  it("keeps a committed native session when the WebView mirror is full", async () => {
    const preferences = memoryPreferences();
    const storage = createDurableNativeAuthStorage(preferences, {
      ...memoryStorage(),
      setItem() {
        throw new Error("QuotaExceededError");
      },
    });
    await expect(storage.setItem("sb-auth-token", "TEST_ONLY_session")).resolves.toBeUndefined();
    await expect(storage.getItem("sb-auth-token")).resolves.toBe("TEST_ONLY_session");
  });
  it("restores a session from native preferences after WebView storage is empty", async () => {
    const storage = createDurableNativeAuthStorage(
      memoryPreferences({ "sb-auth-token": "persisted-session" }),
      memoryStorage(),
    );
    await expect(storage.getItem("sb-auth-token")).resolves.toBe("persisted-session");
  });

  it("migrates an existing localStorage session into native preferences", async () => {
    const preferences = memoryPreferences();
    const storage = createDurableNativeAuthStorage(
      preferences,
      memoryStorage({ "sb-auth-token": "legacy-session" }),
    );
    await expect(storage.getItem("sb-auth-token")).resolves.toBe("legacy-session");
    await expect(preferences.get({ key: "sb-auth-token" })).resolves.toEqual({
      value: "legacy-session",
    });
  });

  it("writes and removes both native and fallback copies", async () => {
    const preferences = memoryPreferences();
    const fallback = memoryStorage();
    const storage = createDurableNativeAuthStorage(preferences, fallback);

    await storage.setItem("sb-auth-token", "new-session");
    expect(fallback.getItem("sb-auth-token")).toBe("new-session");
    await expect(preferences.get({ key: "sb-auth-token" })).resolves.toEqual({
      value: "new-session",
    });

    await storage.removeItem("sb-auth-token");
    expect(fallback.getItem("sb-auth-token")).toBeNull();
    await expect(preferences.get({ key: "sb-auth-token" })).resolves.toEqual({ value: null });
  });

  it("fails closed when the durable native write is unavailable", async () => {
    const fallback = memoryStorage();
    const storage = createDurableNativeAuthStorage(
      {
        ...memoryPreferences(),
        set: async () => {
          throw new Error("native storage unavailable");
        },
      },
      fallback,
    );

    await expect(storage.setItem("sb-auth-token", "unsafe-session")).rejects.toThrow(
      "native storage unavailable",
    );
    expect(fallback.getItem("sb-auth-token")).toBeNull();
  });

  it("falls back only when an older Android build does not implement Preferences", async () => {
    const fallback = memoryStorage();
    const unavailable = new Error('"Preferences" plugin is not implemented on android');
    const storage = createDurableNativeAuthStorage(
      {
        get: async () => {
          throw unavailable;
        },
        set: async () => {
          throw unavailable;
        },
        remove: async () => {
          throw unavailable;
        },
      },
      fallback,
    );

    await storage.setItem("sb-auth-token", "compatible-session");
    await expect(storage.getItem("sb-auth-token")).resolves.toBe("compatible-session");
    await storage.removeItem("sb-auth-token");
    expect(fallback.getItem("sb-auth-token")).toBeNull();
  });
});
