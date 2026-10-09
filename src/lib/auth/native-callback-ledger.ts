import { Preferences } from "@capacitor/preferences";
import { NATIVE_APP_SCHEME } from "./native-oauth";

// Android can redeliver getLaunchUrl after the WebView/process is recreated.
// Keep at most 20 fingerprints of successful exchanges, never raw codes.
// A launch intent can survive for days, so these markers have no time expiry.
const KEY = `tamkeen.oauth-completed.v1:${NATIVE_APP_SCHEME}`;
type Entry = { hash: string; at: number };

async function fingerprint(code: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function readEntries(): Promise<Entry[]> {
  let value: string | null;
  try {
    value = (await Preferences.get({ key: KEY })).value;
  } catch {
    value = localStorage.getItem(KEY);
  }
  const entries: unknown = JSON.parse(value || "[]");
  if (!Array.isArray(entries)) return [];
  return entries
    .filter(
      (e): e is Entry =>
        e &&
        typeof e.hash === "string" &&
        /^[a-f0-9]{64}$/.test(e.hash) &&
        typeof e.at === "number" &&
        Number.isFinite(e.at) &&
        e.at <= Date.now(),
    )
    .slice(-20);
}

export async function isCompletedNativeCallback(code: string): Promise<boolean> {
  try {
    const hash = await fingerprint(code);
    return (await readEntries()).some((e) => e.hash === hash);
  } catch {
    return false;
  }
}

export async function rememberCompletedNativeCallback(code: string): Promise<void> {
  try {
    const hash = await fingerprint(code);
    const entries = (await readEntries()).filter((e) => e.hash !== hash);
    const value = JSON.stringify([...entries, { hash, at: Date.now() }].slice(-20));
    try {
      await Preferences.set({ key: KEY, value });
    } catch {
      localStorage.setItem(KEY, value);
    }
  } catch {
    // A best-effort duplicate marker must not undo a successful auth exchange.
  }
}
