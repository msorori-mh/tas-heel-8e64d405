import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  closeNativeAuthBrowser,
  isCallbackConsumed,
  markCallbackConsumed,
  parseNativeAuthCallback,
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
        markCallbackConsumed(parsed.code);

        setStatus("completing");
        setMessage(null);
        try {
          const { supabase } = await import("@/integrations/supabase/client");
          const { error } = await supabase.auth.exchangeCodeForSession(parsed.code);
          if (error) throw error;
          const { data } = await supabase.auth.getUser();
          if (!data.user) throw new Error("لم يتم العثور على جلسة");
          if (cancelled) return;
          // /auth/callback resolves profile completeness and routes onwards.
          navigate({ to: "/auth/callback", replace: true });
          setStatus("idle");
        } catch {
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
