import { useEffect, useState, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { useRouterState } from "@tanstack/react-router";
import { INTRO_KEY, mountStudentIntro } from "@/lib/onboarding/student-intro";

export function StudentIntroGate({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const eligible = path === "/" || path === "/auth";
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !eligible) {
      setReady(true);
      return;
    }
    let cancelled = false;
    let dispose: (() => void) | undefined;
    async function open() {
      let done = false;
      try {
        done = (await Preferences.get({ key: INTRO_KEY })).value === "done";
      } catch {
        /* Still offer the offline-capable tour. */
      }
      if (cancelled) return;
      if (done) {
        setReady(true);
        return;
      }
      setReady(false);
      dispose = mountStudentIntro(async () => {
        // Storage failure must not lock the student out of the application.
        try {
          await Preferences.set({ key: INTRO_KEY, value: "done" });
        } catch {
          /* Retry next launch. */
        }
        if (!cancelled) setReady(true);
      });
    }
    void open();
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [eligible]);
  if (!eligible || ready) return children;
  return (
    <main dir="rtl" className="min-h-screen bg-background p-6" aria-busy="true">
      جارٍ فتح تمكين…
    </main>
  );
}
