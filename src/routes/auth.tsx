import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { BookOpen, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StudentTamkeenMark } from "@/components/brand/StudentTamkeenBrand";
import { useAuth } from "@/hooks/use-auth";
import { translateAuthError } from "@/lib/auth-helpers";
import { startGoogleSignIn } from "@/lib/auth/google-sign-in";

// Keep old bookmarked links compatible while exposing one Google-only entry.
const searchSchema = z.object({
  mode: z.enum(["signup", "login"]).catch("login").optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "دخول الطالب | تمكين" },
      { name: "description", content: "سجّل بحساب Google وابدأ التعلّم في تمكين." },
    ],
  }),
  component: AuthRoute,
});

function AuthRoute() {
  const pathname = useLocation({ select: (location) => location.pathname });
  return pathname === "/auth" || pathname === "/auth/" ? <StudentAuthPage /> : <Outlet />;
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0">
      <path
        fill="#4285f4"
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z"
      />
      <path
        fill="#34a853"
        d="M12 22c2.7 0 4.98-.9 6.63-2.36l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.05v2.62A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#fbbc05"
        d="M6.39 13.93A6 6 0 0 1 6.08 12c0-.67.11-1.32.31-1.93V7.45H3.05A10 10 0 0 0 2 12c0 1.64.39 3.2 1.05 4.55l3.34-2.62Z"
      />
      <path
        fill="#ea4335"
        d="M12 5.94c1.47 0 2.79.5 3.82 1.5l2.88-2.88A9.67 9.67 0 0 0 12 2a10 10 0 0 0-8.95 5.45l3.34 2.62C7.18 7.7 9.39 5.94 12 5.94Z"
      />
    </svg>
  );
}

function StudentAuthPage() {
  const navigate = useNavigate();
  const { session, profileComplete, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (session) navigate({ to: profileComplete ? "/app" : "/complete-profile", replace: true });
  }, [session, loading, profileComplete, navigate]);

  async function continueWithGoogle() {
    setBusy(true);
    setError(null);
    try {
      await startGoogleSignIn();
    } catch (signInError) {
      setError(translateAuthError(signInError));
      setBusy(false);
    }
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-background px-4 py-10"
      dir="rtl"
    >
      <section className="w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-card sm:p-8">
        <StudentTamkeenMark className="mx-auto h-14 w-14 rounded-2xl bg-[#FBFAF7] p-2 ring-1 ring-border/60" />

        <div className="mt-5">
          <p className="text-sm font-bold text-primary">مساحة الطلاب</p>
          <h1 className="mt-2 text-2xl font-extrabold text-foreground">مرحبًا بك في تمكين</h1>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            سجّل بحساب Google وابدأ التعلّم.
          </p>
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-5 rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <Button
          type="button"
          size="lg"
          className="mt-6 w-full rounded-xl py-6 text-base font-bold"
          disabled={busy}
          onClick={continueWithGoogle}
        >
          {busy ? <LoaderCircle className="ml-2 h-5 w-5 animate-spin" /> : <GoogleMark />}
          <span className="mr-2">{busy ? "جارٍ فتح Google..." : "المتابعة باستخدام Google"}</span>
        </Button>

        <Link
          to="/"
          className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline"
        >
          <BookOpen className="h-4 w-4" />
          العودة لاختيار نوع الحساب
        </Link>

        <p className="mt-6 text-xs leading-6 text-muted-foreground">
          بالمتابعة، أنت توافق على{" "}
          <Link to="/terms" className="underline hover:text-foreground">
            شروط الاستخدام
          </Link>{" "}
          و
          <Link to="/privacy" className="underline hover:text-foreground">
            سياسة الخصوصية
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
