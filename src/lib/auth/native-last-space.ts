import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { createDurableNativeAuthStorage } from "../../integrations/supabase/nativeAuthStorage";

export const LAST_NATIVE_SPACE_KEY = "tamkeen.native-last-space.v1";
export type NativeSpace = "student" | "teacher";

// Navigation preference only: never a substitute for the restored Supabase session.
export async function rememberNativeSpace(owner: string, space: NativeSpace): Promise<void> {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) return;
  await createDurableNativeAuthStorage(Preferences, window.localStorage).setItem(
    LAST_NATIVE_SPACE_KEY,
    JSON.stringify({ owner, space }),
  );
}

export async function readNativeSpace(owner: string): Promise<NativeSpace> {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) return "student";
  try {
    const value = await createDurableNativeAuthStorage(Preferences, window.localStorage).getItem(
      LAST_NATIVE_SPACE_KEY,
    );
    if (value) {
      const saved = JSON.parse(value);
      return saved?.owner === owner && saved.space === "teacher" ? "teacher" : "student";
    }
    // Migration for teachers already using the previous review APK.
    return localStorage.getItem("tamkeen-academy-offline-owner") === owner ? "teacher" : "student";
  } catch {
    return "student";
  }
}
