import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { translateAuthError, getAuthRedirectUrl } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";

const searchSchema = z.object({
  mode: z.enum(["signup", "login"]).catch("login"),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "الدخول إلى تنوير" },
      { name: "description", content: "سجّل دخولك أو أنشئ حسابًا جديدًا في تنوير." },
    ],
  }),
  component: AuthPage,
});

const PHONE_OTP_ENABLED = false; // فعّلها لاحقًا عند جاهزية SMS

function AuthPage() {
  const navigate = useNavigate();
  const { mode } = Route.useSearch();
  const { session, profileComplete, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (session) navigate({ to: profileComplete ? "/app" : "/complete-profile", replace: true });
  }, [session, loading, profileComplete, navigate]);

  const setMode = (m: "signup" | "login") =>
    navigate({ to: "/auth", search: { mode: m }, replace: true });

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10" dir="rtl">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-card">
        <Link to="/" className="text-sm text-muted-foreground">→ العودة للرئيسية</Link>

        <div className="mt-3 inline-flex w-full rounded-lg border bg-secondary/40 p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`flex-1 rounded-md py-1.5 ${mode === "signup" ? "bg-card font-bold shadow-sm" : "text-muted-foreground"}`}
          >
            إنشاء حساب جديد
          </button>
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 rounded-md py-1.5 ${mode === "login" ? "bg-card font-bold shadow-sm" : "text-muted-foreground"}`}
          >
            تسجيل دخول
          </button>
        </div>

        {mode === "signup" ? <SignupPanel /> : <LoginPanel />}
      </div>
    </div>
  );
}

function SignupPanel() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleGoogle = async () => {
    setErr(null);
    setBusy(true);
    try {
      const r = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: getAuthRedirectUrl("/auth/callback"),
      });
      if (r.error) throw r.error;
    } catch (e) {
      setErr(translateAuthError(e));
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 space-y-3">
      <h1 className="text-xl font-bold">ابدأ رحلتك الدراسية في تنوير</h1>
      <p className="text-sm text-muted-foreground">اختر طريقة التسجيل المناسبة لك.</p>

      <Button type="button" className="w-full" onClick={handleGoogle} disabled={busy}>
        التسجيل بحساب Google
      </Button>

      <Button type="button" variant="outline" className="w-full" disabled={!PHONE_OTP_ENABLED}>
        التسجيل برقم الهاتف
      </Button>
      {!PHONE_OTP_ENABLED && (
        <p className="text-xs text-muted-foreground text-center">
          التسجيل برقم الهاتف سيتوفر قريبًا.
        </p>
      )}

      {err && <p className="text-sm text-destructive">{err}</p>}
    </div>
  );
}

function LoginPanel() {
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const isEmail = (v: string) => /\S+@\S+\.\S+/.test(v.trim());
  const isPhoneLike = (v: string) => /^\+?\d[\d\s-]{6,}$/.test(v.trim());

  const handleGoogle = async () => {
    setErr(null);
    setBusy(true);
    try {
      const r = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: getAuthRedirectUrl("/auth/callback"),
      });
      if (r.error) throw r.error;
    } catch (e) {
      setErr(translateAuthError(e));
      setBusy(false);
    }
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);

    const v = identifier.trim();
    if (isEmail(v)) {
      setBusy(true);
      try {
        const { error } = await supabase.auth.signInWithOtp({
          email: v,
          options: { emailRedirectTo: getAuthRedirectUrl("/auth/callback") },
        });
        if (error) throw error;
        setMsg("أرسلنا رابط/كود تسجيل الدخول إلى بريدك. افتح الرسالة لإتمام الدخول.");
      } catch (e2) {
        setErr(translateAuthError(e2));
      } finally {
        setBusy(false);
      }
      return;
    }

    if (isPhoneLike(v)) {
      if (!PHONE_OTP_ENABLED) {
        setErr("تسجيل الدخول برقم الهاتف سيتوفر قريبًا. استخدم البريد الإلكتروني أو حساب Google.");
        return;
      }
      // Phone OTP placeholder for future
      return;
    }

    setErr("أدخل بريدًا إلكترونيًا صالحًا أو رقم هاتف.");
  };

  return (
    <div className="mt-5 space-y-3">
      <h1 className="text-xl font-bold">تسجيل الدخول</h1>
      <p className="text-sm text-muted-foreground">
        أدخل بريدك أو رقم هاتفك لنرسل كود التحقق.
      </p>

      <Button type="button" className="w-full" onClick={handleGoogle} disabled={busy}>
        الدخول بحساب Google
      </Button>

      <div className="my-2 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" /> أو <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSendCode} className="space-y-3">
        <div>
          <Label htmlFor="id">رقم الهاتف أو البريد الإلكتروني</Label>
          <Input
            id="id"
            dir="ltr"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="you@example.com"
            required
          />
          {!PHONE_OTP_ENABLED && (
            <p className="mt-1 text-xs text-muted-foreground">
              تسجيل الدخول برقم الهاتف سيتوفر قريبًا.
            </p>
          )}
        </div>

        {err && <p className="text-sm text-destructive">{err}</p>}
        {msg && <p className="text-sm text-primary">{msg}</p>}

        <Button type="submit" variant="outline" className="w-full" disabled={busy}>
          {busy ? "..." : "إرسال كود التحقق"}
        </Button>
      </form>
    </div>
  );
}
