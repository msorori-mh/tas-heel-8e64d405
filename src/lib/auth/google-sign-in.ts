import { supabase } from "@/integrations/supabase/client";
import { getAuthRedirectUrl } from "@/lib/auth-helpers";
import {
  NATIVE_OAUTH_REDIRECT_URL,
  isNativeShell,
  openNativeAuthBrowser,
} from "@/lib/auth/native-oauth";

const ACADEMY_OAUTH_RETURN_KEY = "tamkeen:academy-google-return";

/**
 * 21B4-C — single entry point for "المتابعة باستخدام Google".
 *
 * Web behaviour is byte-for-byte the previous behaviour (top-level navigation,
 * new tab when embedded in the editor preview). Android opens a Custom Tab
 * with a deep-link redirect so the student returns straight into Tamkeen.
 */
export async function startGoogleSignIn(): Promise<void> {
  const native = await isNativeShell();

  try {
    window.localStorage.removeItem(ACADEMY_OAUTH_RETURN_KEY);
  } catch {
    // A student sign-in must not reuse a stale academy return marker.
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: native ? NATIVE_OAUTH_REDIRECT_URL : getAuthRedirectUrl("/auth/callback"),
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  const url = data?.url;
  if (!url) throw new Error("تعذّر بدء تسجيل الدخول عبر Google.");

  if (native) {
    // Custom Tab: Google refuses to render its consent screen inside a raw
    // WebView, and the Custom Tab hands control back through the deep link.
    await openNativeAuthBrowser(url);
    return;
  }

  const isEmbedded = typeof window !== "undefined" && window.top !== window.self;
  if (isEmbedded) {
    try {
      if (window.top?.location.origin === window.location.origin) {
        window.top.location.href = url;
        return;
      }
    } catch {
      /* cross-origin parent: fall through to opening a new tab */
    }
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  window.location.href = url;
}
