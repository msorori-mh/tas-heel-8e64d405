import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { rememberWorkspace } from "@/lib/auth/workspace";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  isCompletedNativeCallback,
  rememberCompletedNativeCallback,
} from "@/lib/auth/native-callback-ledger";
import {
  closeNativeAuthBrowser,
  consumeNativeAuthDestination,
  isCallbackConsumed,
  markCallbackConsumed,
  parseNativeAuthCallback,
  unmarkCallbackConsumed,
} from "@/lib/auth/native-oauth";

/**
 * 21B4-C — receives the Android OAuth deep link and finishes the session in
 * the same WebView that started it (so the PKCE verifier is available).
 *
 * Web builds render nothing and invoke no native plugin methods.
 */
export function NativeAuthDeepLinkHandler() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"idle" | "completing" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      if (!Capacitor.isNativePlatform()) return;
      if (cancelled) return;

      const handleUrl = async (rawUrl: string) => {
        if (cancelled) return;
        const parsed = parseNativeAuthCallback(rawUrl);
        if (parsed.kind === "ignored") return; // fail closed, silently
        await closeNativeAuthBrowser();
        if (cancelled) return;

        if (parsed.kind === "error") {
          setStatus("error");
          setMessage(parsed.message);
          return;
        }
        if (isCallbackConsumed(parsed.code)) return; // duplicate delivery
        markCallbackConsumed(parsed.code);

        setStatus("completing");
        setMessage(null);
        let exchanged = false;
        try {
          if (await isCompletedNativeCallback(parsed.code)) {
            if (!cancelled) setStatus("idle");
            return;
          }
          const { supabase } = await import("@/integrations/supabase/client");
          const { data, error } = await supabase.auth.exchangeCodeForSession(parsed.code);
          if (error) throw error;
          exchanged = true;
          await rememberCompletedNativeCallback(parsed.code);
          if (!data.user) throw new Error("لم يتم العثور على جلسة");
          if (cancelled) return;
          const destination = consumeNativeAuthDestination();
          await rememberWorkspace(data.user.id, destination);
          if (destination === "teacher") {
            // Both portals now share one auth client. A reload would redeliver
            // Android's launch intent and try to exchange its spent code again.
            await navigate({ to: "/academy", replace: true });
          } else {
            // /auth/callback resolves student profile completeness.
            await navigate({ to: "/auth/callback", replace: true });
          }
          setStatus("idle");
        } catch {
          // The early claim prevents duplicate appUrlOpen deliveries from
          // exchanging the same one-time code concurrently. A failed exchange
          // is released so an explicit retry can succeed.
          if (!exchanged) unmarkCallbackConsumed(parsed.code);
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
              void navigate({ to: "/auth", replace: true });
            }}
          >
            العودة لتسجيل الدخول
          </button>
        </div>
      )}
    </div>
  );
}
