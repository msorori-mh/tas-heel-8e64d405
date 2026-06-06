import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { translateAuthError, getAuthRedirectUrl } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — تنوير" },
      { name: "description", content: "سجّل دخولك إلى منصة تنوير التعليمية" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { session, profileComplete, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (session) {
      navigate({ to: profileComplete ? "/" : "/complete-profile" });
    }
  }, [session, loading, profileComplete, navigate]);

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: getAuthRedirectUrl("/auth/callback"),
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        setMsg("تم إنشاء الحساب. تحقّق من بريدك لتأكيد الحساب.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e) {
      setErr(translateAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setErr(null);
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: getAuthRedirectUrl("/auth/callback"),
      });
      if (result.error) throw result.error;
    } catch (e) {
      setErr(translateAuthError(e));
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-card">
        <Link to="/" className="text-sm text-muted-foreground">→ العودة للرئيسية</Link>
        <h1 className="mt-3 text-2xl font-bold text-foreground">
          {mode === "signin" ? "تسجيل الدخول" : "إنشاء حساب جديد"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signin" ? "ادخل إلى حسابك في تنوير" : "ابدأ رحلتك مع تنوير"}
        </p>

        <Button
          type="button"
          variant="outline"
          className="mt-5 w-full"
          onClick={handleGoogle}
          disabled={busy}
        >
          متابعة بحساب Google
        </Button>

        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          أو
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleEmail} className="space-y-3">
          {mode === "signup" && (
            <div>
              <Label htmlFor="fn">الاسم الكامل</Label>
              <Input id="fn" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
          )}
          <div>
            <Label htmlFor="em">البريد الإلكتروني</Label>
            <Input id="em" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="pw">كلمة المرور</Label>
            <Input id="pw" type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>

          {err && <p className="text-sm text-destructive">{err}</p>}
          {msg && <p className="text-sm text-primary">{msg}</p>}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "..." : mode === "signin" ? "دخول" : "إنشاء الحساب"}
          </Button>
        </form>

        <div className="mt-4 flex justify-between text-sm">
          <button
            type="button"
            className="text-primary"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "ليس لديك حساب؟ سجّل" : "لديك حساب؟ ادخل"}
          </button>
          {mode === "signin" && (
            <Link to="/forgot-password" className="text-muted-foreground">نسيت كلمة المرور؟</Link>
          )}
        </div>
      </div>
    </div>
  );
}
