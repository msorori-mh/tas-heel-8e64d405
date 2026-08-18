import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { NATIVE_BRIDGE_URL } from "@/lib/auth/native-oauth";

/**
 * 21B4-C-R1 — Android OAuth HTTPS callback (App Link target).
 *
 * This page is NOT part of the student web UI. It exists only so the Android
 * app can receive the OAuth authorization code on an https URL that the auth
 * provider already allows (`https://studentamkeen.com/**`).
 *
 * Behaviour:
 * - Verified App Link: Android opens Tamkeen directly and this page never renders.
 * - Not yet verified: the page forwards the *code only* to the app-private
 *   bridge scheme, then shows a neutral message.
 *
 * It never renders tokens, codes, session data or debug output.
 */
export const Route = createFileRoute("/auth/mobile-callback")({
  component: MobileAuthCallback,
  head: () => ({
    meta: [
      { title: "إكمال تسجيل الدخول | تمكين الطالب" },
      {
        name: "description",
        content: "صفحة داخلية لإكمال تسجيل الدخول داخل تطبيق تمكين الطالب على أندرويد.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "إكمال تسجيل الدخول | تمكين الطالب" },
      {
        property: "og:description",
        content: "صفحة داخلية لإكمال تسجيل الدخول داخل تطبيق تمكين الطالب.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const CODE_RE = /^[A-Za-z0-9._~-]{8,512}$/;

function MobileAuthCallback() {
  const [handedOff, setHandedOff] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code || !CODE_RE.test(code)) return;
    const state = params.get("state");
    const target =
      `${NATIVE_BRIDGE_URL}?code=${encodeURIComponent(code)}` +
      (state ? `&state=${encodeURIComponent(state)}` : "");
    setHandedOff(true);
    // Replace so the code never stays in this browser's history entry.
    window.location.replace(target);
  }, []);

  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center px-6 text-center">
      <div className="space-y-3">
        <h1 className="text-lg font-semibold">تسجيل الدخول في تطبيق تمكين</h1>
        <p className="text-muted-foreground text-sm">
          {handedOff
            ? "جارٍ العودة إلى تطبيق تمكين... يمكنك إغلاق هذه النافذة."
            : "هذه الصفحة مخصصة لتطبيق أندرويد. افتح تطبيق تمكين وأعد تسجيل الدخول."}
        </p>
      </div>
    </main>
  );
}
