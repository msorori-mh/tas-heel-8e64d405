/**
 * 21B4-C — Android "return to app" Google OAuth.
 *
 * Web is untouched: every helper here is a no-op unless the app is running
 * inside the Capacitor Android shell. On Android the flow is:
 *
 *   Tamkeen (WebView)
 *     -> supabase.auth.signInWithOAuth({ skipBrowserRedirect: true })  [PKCE verifier stored in WebView]
 *     -> Custom Tab (@capacitor/browser) opens the Google consent screen
 *     -> Google -> Supabase /auth/v1/callback -> 302 to the app deep link
 *     -> Android intent-filter delivers `appUrlOpen` back to the SAME WebView
 *     -> exchangeCodeForSession() in the WebView (verifier is available there)
 *
 * Security: fail closed. Any deep link whose scheme/host/path does not match
 * the single allowed callback is ignored. No token, code or verifier value is
 * ever logged.
 */

export const HTTPS_CALLBACK_ORIGIN = "https://studentamkeen.com";
export const HTTPS_CALLBACK_PATH = "/auth/mobile-callback";
export const NATIVE_APP_SCHEME = "app.studentamkeen.tamkeen";
export const NATIVE_BRIDGE_HOST = "auth";
export const NATIVE_BRIDGE_PATH = "/callback";
export const NATIVE_BRIDGE_URL = `${NATIVE_APP_SCHEME}://${NATIVE_BRIDGE_HOST}${NATIVE_BRIDGE_PATH}`;
/**
 * Android OAuth returns directly to the app-owned scheme. This avoids creating
 * a session inside the Custom Tab and does not depend on an unverified HTTPS
 * App Link. Supabase Auth must allow this exact URL (no wildcard required).
 */
export const NATIVE_OAUTH_REDIRECT_URL = NATIVE_BRIDGE_URL;

export type NativeAuthCallback =
  | { kind: "ignored"; reason: string }
  | { kind: "error"; message: string }
  | { kind: "code"; code: string; state: string | null };

/**
 * Strictly validate an incoming deep link. Anything unexpected is ignored
 * (never thrown to the user, never logged with its query values).
 */
export function parseNativeAuthCallback(rawUrl: unknown): NativeAuthCallback {
  if (typeof rawUrl !== "string" || rawUrl.length === 0 || rawUrl.length > 4096) {
    return { kind: "ignored", reason: "malformed" };
  }
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { kind: "ignored", reason: "malformed" };
  }
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (url.protocol === "https:") {
    // Verified HTTPS App Link (production domain only — http is refused).
    if (`${url.protocol}//${url.host}` !== HTTPS_CALLBACK_ORIGIN) {
      return { kind: "ignored", reason: "host" };
    }
    if (path !== HTTPS_CALLBACK_PATH) {
      return { kind: "ignored", reason: "path" };
    }
  } else if (url.protocol === `${NATIVE_APP_SCHEME}:`) {
    // App-private bridge hop from the HTTPS callback page.
    if (url.host !== NATIVE_BRIDGE_HOST) {
      return { kind: "ignored", reason: "host" };
    }
    if (path !== NATIVE_BRIDGE_PATH) {
      return { kind: "ignored", reason: "path" };
    }
  } else {
    return { kind: "ignored", reason: "scheme" };
  }

  // Provider/Supabase error is reported without echoing any other parameter.
  const errCode = url.searchParams.get("error");
  const errDesc = url.searchParams.get("error_description");
  if (errCode || errDesc) {
    return { kind: "error", message: errDesc || errCode || "OAuth error" };
  }

  // Implicit-flow tokens must never arrive on a deep link; refuse instead of
  // trying to consume them (and never surface their value).
  if (/[#?&](access_token|refresh_token)=/.test(rawUrl)) {
    return { kind: "error", message: "استجابة تسجيل دخول غير مدعومة." };
  }

  const code = url.searchParams.get("code");
  if (!code || !/^[A-Za-z0-9._~-]{8,512}$/.test(code)) {
    return { kind: "ignored", reason: "no-code" };
  }
  return { kind: "code", code, state: url.searchParams.get("state") };
}

/** Codes already exchanged in this WebView session — duplicate links are no-ops. */
const consumedCodes = new Set<string>();

export function isCallbackConsumed(code: string): boolean {
  return consumedCodes.has(code);
}

export function markCallbackConsumed(code: string): void {
  consumedCodes.add(code);
  if (consumedCodes.size > 20) {
    consumedCodes.delete(consumedCodes.values().next().value as string);
  }
}

/** Release a failed exchange so the student can retry without restarting. */
export function unmarkCallbackConsumed(code: string): void {
  consumedCodes.delete(code);
}

/** Test seam. */
export function resetConsumedCallbacks(): void {
  consumedCodes.clear();
}

export async function isNativeShell(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Close the Custom Tab if it is still in front of the app. */
export async function closeNativeAuthBrowser(): Promise<void> {
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.close();
  } catch {
    /* already closed / not native — nothing to clean up */
  }
}

/** Open the provider consent URL in an in-app Custom Tab. */
export async function openNativeAuthBrowser(url: string): Promise<void> {
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url, presentationStyle: "fullscreen" });
}
