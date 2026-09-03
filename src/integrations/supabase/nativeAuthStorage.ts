import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

type BrowserStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type NativePreferences = {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
};

/**
 * Supabase auth storage for the native shell.
 *
 * Android may destroy and recreate its WebView between launches. Preferences
 * belongs to the native application, so the refresh token survives that
 * lifecycle. localStorage is retained as a migration/fallback mirror for
 * existing installs and for a temporarily unavailable native bridge.
 */
export function createDurableNativeAuthStorage(
  preferences: NativePreferences,
  fallback: BrowserStorage,
) {
  return {
    async getItem(key: string): Promise<string | null> {
      try {
        const { value } = await preferences.get({ key });
        if (value !== null) return value;

        const legacyValue = fallback.getItem(key);
        if (legacyValue !== null) {
          await preferences.set({ key, value: legacyValue });
        }
        return legacyValue;
      } catch {
        return fallback.getItem(key);
      }
    },

    async setItem(key: string, value: string): Promise<void> {
      // Native persistence is the source of truth. Do not report a successful
      // sign-in if the durable write failed and the next launch would lose it.
      await preferences.set({ key, value });
      fallback.setItem(key, value);
    },

    async removeItem(key: string): Promise<void> {
      // Clear the durable copy first so a failed sign-out can never resurrect
      // an older refresh token on the next app launch.
      await preferences.remove({ key });
      fallback.removeItem(key);
    },
  };
}

export function persistentAuthStorage():
  | ReturnType<typeof createDurableNativeAuthStorage>
  | Storage
  | undefined {
  if (typeof window === "undefined") return undefined;
  if (!Capacitor.isNativePlatform()) return undefined;
  return createDurableNativeAuthStorage(Preferences, window.localStorage);
}
