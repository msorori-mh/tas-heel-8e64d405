import { App } from "@capacitor/app";
import { parseNativeAuthCallback } from "@/lib/auth/native-oauth";
import { Capacitor } from "@capacitor/core";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { readNativeSpace, rememberNativeSpace } from "@/lib/auth/native-last-space";

/** Resume only a native launch at '/', never an explicit visit to the account chooser. */
export function NativeSessionResume() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const ownerId = user?.id;
  const [native, setNative] = useState(false);
  const [resuming, setResuming] = useState(false);
  const startup = useRef(pathname === "/");
  useEffect(() => setNative(Capacitor.isNativePlatform()), []);

  useEffect(() => {
    if (!native) return;
    if (pathname !== "/") {
      startup.current = false;
      if (ownerId && (pathname === "/app" || pathname === "/complete-profile"))
        void rememberNativeSpace(ownerId, "student").catch(() => undefined);
      return;
    }
    if (!ownerId) {
      setResuming(false);
      return;
    }
    if (!startup.current) return;
    let active = true;
    setResuming(true);
    void (async () => {
      const launch = await App.getLaunchUrl().catch(() => undefined);
      if (!active) return;
      // A cold OAuth return is owned by NativeAuthDeepLinkHandler, not the old session.
      if (launch?.url && parseNativeAuthCallback(launch.url).kind !== "ignored") {
        startup.current = false;
        setResuming(false);
        return;
      }
      const space = await readNativeSpace(ownerId);
      if (!active) return;
      startup.current = false;
      void navigate({ to: space === "teacher" ? "/academy" : "/app", replace: true });
      setResuming(false);
    })();
    return () => {
      active = false;
    };
  }, [native, pathname, ownerId, navigate]);

  if (!native || pathname !== "/" || !startup.current || (!loading && !resuming && !user))
    return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background"
      dir="rtl"
      role="status"
    >
      جارٍ استعادة جلستك…
    </div>
  );
}
