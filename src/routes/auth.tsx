import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { translateAuthError, getAuthRedirectUrl } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { UserPlus, LogIn, Mail, Sparkles, BookOpen, Zap } from "lucide-react";

const searchSchema = z.object({
  mode: z.enum(["signup", "login"]).catch("login"),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "الدخول إلى تمكين" },
      { name: "description", content: "سجّل دخولك أو أنشئ حسابًا جديدًا في تمكين." },
    ],
  }),
  component: AuthPage,
});

const PHONE_OTP_ENABLED = false;

async function signInWithGoogle() {
  // Google blocks its sign-in page inside iframes (403). Get the URL first and
  // open it in the top-level window / a new tab instead of the embedded frame.
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: getAuthRedirectUrl("/auth/callback"),
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  const url = data?.url;
  if (!url) throw new Error("تعذّر بدء تسجيل الدخول عبر Google.");

  const isEmbedded = typeof window !== "undefined" && window.top !== window.self;
  if (isEmbedded) {
    try {
      // Same-origin parent (rare) — navigate the top frame.
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

        <div className="mt-4 inline-flex w-full rounded-xl border-2 border-border bg-muted p-1.5 text-sm">
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 transition-all ${
              mode === "signup"
                ? "bg-accent text-accent-foreground font-bold shadow-md"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <UserPlus className="h-4 w-4" />
            إنشاء حساب
          </button>
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 transition-all ${
              mode === "login"
                ? "bg-primary text-primary-foreground font-bold shadow-md"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LogIn className="h-4 w-4" />
            تسجيل دخول
          </button>
        </div>

        {mode === "signup" ? <SignupPanel onSwitch={() => setMode("login")} /> : <LoginPanel onSwitch={() => setMode("signup")} />}
      </div>
    </div>
  );
}

function SignupPanel({ onSwitch }: { onSwitch: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const isEmail = (v: string) => /\S+@\S+\.\S+/.test(v.trim());

  const handleGoogle = async () => {
    setErr(null);
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      setErr(translateAuthError(e));
      setBusy(false);
    }
  };

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    const v = email.trim();
    if (!isEmail(v)) {
      setErr("أدخل بريدًا إلكترونيًا صالحًا.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: v,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: getAuthRedirectUrl("/auth/callback"),
        },
      });
      if (error) throw error;
      setMsg("أرسلنا رابط تفعيل حسابك إلى بريدك. افتح الرسالة لإكمال إنشاء الحساب.");
    } catch (e2) {
      setErr(translateAuthError(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs font-bold text-accent">
          <Sparkles className="h-3.5 w-3.5" />
          حساب جديد
        </div>
        <h1 className="mt-3 text-2xl font-extrabold">أنشئ حسابك في تمكين</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          انضم إلى آلاف طلاب الثانوية وابدأ رحلتك للتفوّق.
        </p>
      </div>

      <Button
        type="button"
        className="w-full bg-accent text-accent-foreground hover:bg-accent/90 font-bold"
        onClick={handleGoogle}
        disabled={busy}
      >
        <UserPlus className="ml-2 h-4 w-4" />
        سجّل عبر Google
      </Button>

      <div className="my-2 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" /> أو عبر البريد <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleEmailSignup} className="space-y-3">
        <div>
          <Label htmlFor="signup-email">البريد الإلكتروني</Label>
          <Input
            id="signup-email"
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            required
          />
        </div>

        {err && <p className="text-sm text-destructive">{err}</p>}
        {msg && <p className="text-sm text-primary">{msg}</p>}

        <Button
          type="submit"
          variant="outline"
          className="w-full border-accent text-accent hover:bg-accent hover:text-accent-foreground"
          disabled={busy}
        >
          <Mail className="ml-2 h-4 w-4" />
          {busy ? "..." : "أنشئ حسابي عبر البريد"}
        </Button>
      </form>

      <ul className="space-y-1.5 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
        <li className="flex items-center gap-2"><Zap className="h-3.5 w-3.5 text-accent" /> مجاني للبدء — بدون بطاقة</li>
        <li className="flex items-center gap-2"><BookOpen className="h-3.5 w-3.5 text-primary" /> محتوى مصمم حسب المنهج والمحافظة</li>
        <li className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-secondary" /> تدرّب على نماذج اختبارات حقيقية</li>
      </ul>

      <p className="text-center text-xs text-muted-foreground">
        لديك حساب بالفعل؟{" "}
        <button type="button" onClick={onSwitch} className="font-bold text-primary hover:underline">
          سجّل الدخول
        </button>
      </p>
    </div>
  );
}

function LoginPanel({ onSwitch }: { onSwitch: () => void }) {
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
      await signInWithGoogle();
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
      return;
    }

    setErr("أدخل بريدًا إلكترونيًا صالحًا أو رقم هاتف.");
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
          <LogIn className="h-3.5 w-3.5" />
          عودة إلى حسابك
        </div>
        <h1 className="mt-3 text-2xl font-extrabold">مرحبًا بعودتك</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          سجّل الدخول لمتابعة دروسك من حيث توقفت.
        </p>
      </div>

      <Button
        type="button"
        className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
        onClick={handleGoogle}
        disabled={busy}
      >
        <LogIn className="ml-2 h-4 w-4" />
        ادخل بحساب Google
      </Button>

      <div className="my-2 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" /> أو عبر كود <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSendCode} className="space-y-3">
        <div>
          <Label htmlFor="id">البريد الإلكتروني أو رقم الهاتف</Label>
          <Input
            id="id"
            dir="ltr"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="name@example.com"
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

        <Button
          type="submit"
          variant="outline"
          className="w-full border-primary text-primary hover:bg-primary hover:text-primary-foreground"
          disabled={busy}
        >
          <Mail className="ml-2 h-4 w-4" />
          {busy ? "..." : "أرسل لي كود الدخول"}
        </Button>
      </form>

      <p className="text-center text-xs text-muted-foreground">
        جديد على تمكين؟{" "}
        <button type="button" onClick={onSwitch} className="font-bold text-accent hover:underline">
          أنشئ حسابًا الآن
        </button>
      </p>
    </div>
  );
}
