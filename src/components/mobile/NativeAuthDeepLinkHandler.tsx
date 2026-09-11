import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  closeNativeAuthBrowser,
  consumeNativeAuthDestination,
  isCallbackConsumed,
  markCallbackConsumed,
  parseNativeAuthCallback,
  unmarkCallbackConsumed,
  wasNativeCallbackCompleted,
  rememberCompletedNativeCallback,
} from "@/lib/auth/native-oauth";

/**
 * 21B4-C — receives the Android OAuth deep link and finishes the session in
 * the same WebView that started it (so the PKCE verifier is available).
 *
 * Web builds render nothing and load no Capacitor plugin.
 */
export function NativeAuthDeepLinkHandler() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"idle" | "completing" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;
      const { App } = await import("@capacitor/app");

      const handleUrl = async (rawUrl: string) => {
        const parsed = parseNativeAuthCallback(rawUrl);
        if (parsed.kind === "ignored") return; // fail closed, silently
        await closeNativeAuthBrowser();

        if (parsed.kind === "error") {
          setStatus("error");
          setMessage(parsed.message);
          return;
        }
        if (isCallbackConsumed(parsed.code)) return; // duplicate delivery
        if (await wasNativeCallbackCompleted(parsed.code).catch(() => false)) return;
        if (isCallbackConsumed(parsed.code)) return; // concurrent delivery during durable read
        markCallbackConsumed(parsed.code);

        setStatus("completing");
        setMessage(null);
        try {
          const { supabase } = await import("@/integrations/supabase/client");
          const { data, error } = await supabase.auth.exchangeCodeForSession(parsed.code);
          if (error) throw error;
          if (!data.session?.user) throw new Error("لم يتم العثور على جلسة");
          await rememberCompletedNativeCallback(parsed.code).catch(() => undefined);
          if (cancelled) return;
          const destination = consumeNativeAuthDestination();
          if (destination === "teacher") {
            // Both portals share the auth client. Stay in the app and keep the
            // one-use callback claim alive; a reload can replay getLaunchUrl().
            await navigate({ to: "/academy", replace: true });
          } else {
            // /auth/callback resolves student profile completeness.
            navigate({ to: "/auth/callback", replace: true });
          }
          setStatus("idle");
        } catch {
          // The early claim prevents duplicate appUrlOpen deliveries from
          // exchanging the same one-time code concurrently. A failed exchange
          // is released so an explicit retry can succeed.
          unmarkCallbackConsumed(parsed.code);
          if (cancelled) return;
          setStatus("error");
          setMessage("تعذّر إكمال تسجيل الدخول. حاول مرة أخرى.");
        }
      };

      const handle = await App.addListener("appUrlOpen", ({ url }) => {
        void handleUrl(url);
      });
      const launch = await App.getLaunchUrl();
      if (launch?.url) void handleUrl(launch.url);

      if (cancelled) void handle.remove();
      else dispose = () => void handle.remove();
    })();

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [navigate]);

  if (status === "idle") return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 px-6 text-center"
    >
      {status === "completing" ? (
        <p className="text-muted-foreground">جارٍ إكمال تسجيل الدخول...</p>
      ) : (
        <div className="space-y-3">
          <p className="text-destructive">{message}</p>
          <button
            type="button"
            className="text-primary underline"
            onClick={() => {
              setStatus("idle");
              setMessage(null);
            }}
          >
            العودة لتسجيل الدخول
          </button>
        </div>
      )}
    </div>
  );
}
