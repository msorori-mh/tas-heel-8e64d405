import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

type BrowserStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type NativePreferences = {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
};

function isUnimplementedPluginError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = "code" in error ? String(error.code).toUpperCase() : "";
  const message = "message" in error ? String(error.message) : "";
  return code === "UNIMPLEMENTED" || /plugin is not implemented/i.test(message);
}

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
      let durable = false;
      try {
        await preferences.set({ key, value });
        durable = true;
      } catch (error) {
        // Compatibility bridge for Play builds released before the Preferences
        // plugin was registered. Keep failing closed for every other native
        // storage error; the signed update restores durable Preferences.
        if (!isUnimplementedPluginError(error)) throw error;
      }
      try {
        fallback.setItem(key, value);
      } catch (error) {
        // Preferences already committed the session. A full WebView mirror
        // must not turn successful Google authentication into a false failure.
        if (!durable) throw error;
      }
    },

    async removeItem(key: string): Promise<void> {
      try {
        await preferences.remove({ key });
      } catch (error) {
        if (!isUnimplementedPluginError(error)) throw error;
      }
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
