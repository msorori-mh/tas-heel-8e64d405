import { Capacitor, registerPlugin } from "@capacitor/core";
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
      try {
        await preferences.set({ key, value });
      } catch (error) {
        // Compatibility bridge for Play builds released before the Preferences
        // plugin was registered. Keep failing closed for every other native
        // storage error; the signed update restores durable Preferences.
        if (!isUnimplementedPluginError(error)) throw error;
      }
      fallback.setItem(key, value);
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

/** Upgrade only after the encrypted copy has been written durably. No plaintext mirror. */
export function createEncryptedNativeAuthStorage(
  secure: NativePreferences,
  legacy: NativePreferences,
  fallback: BrowserStorage,
) {
  const removeLegacy = async (key: string) => {
    await legacy.remove({ key });
    fallback.removeItem(key);
  };
  return {
    async getItem(key: string): Promise<string | null> {
      const { value } = await secure.get({ key });
      if (value !== null) {
        await removeLegacy(key);
        return value;
      }
      const old = (await legacy.get({ key })).value ?? fallback.getItem(key);
      if (old !== null) {
        await secure.set({ key, value: old });
        await removeLegacy(key);
      }
      return old;
    },
    async setItem(key: string, value: string): Promise<void> {
      await secure.set({ key, value });
      await removeLegacy(key);
    },
    async removeItem(key: string): Promise<void> {
      await removeLegacy(key);
      await secure.remove({ key });
    },
  };
}

const secureStorage = registerPlugin<NativePreferences>("TamkeenSecureStorage");
export function persistentAuthStorage():
  | ReturnType<typeof createDurableNativeAuthStorage>
  | Storage
  | undefined {
  if (typeof window === "undefined") return undefined;
  if (!Capacitor.isNativePlatform()) return undefined;
  // The remote web bundle still serves older installed APKs. They retain their
  // existing storage until upgraded; a Keystore failure in a new APK never
  // silently downgrades it to plaintext storage.
  if (Capacitor.isPluginAvailable("TamkeenSecureStorage")) {
    return createEncryptedNativeAuthStorage(secureStorage, Preferences, window.localStorage);
  }
  return createDurableNativeAuthStorage(Preferences, window.localStorage);
}
