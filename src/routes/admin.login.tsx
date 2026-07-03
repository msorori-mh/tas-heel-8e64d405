import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { translateAuthError, getAuthRedirectUrl } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [
      { title: "دخول لوحة الإدارة — تنوير" },
      {
        name: "description",
        content: "تسجيل دخول حسابات الإدارة إلى لوحة تنوير.",
      },
    ],
  }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const { session, isAdmin, isContentStaff, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotMsg, setForgotMsg] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (session && isAdmin) {
      navigate({ to: "/admin", replace: true });
      return;
    }
    if (session && isContentStaff) {
      navigate({ to: "/admin/academic", replace: true });
    }
  }, [loading, session, isAdmin, isContentStaff, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setForgotMsg(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;

      const userId = data.user?.id;
      if (!userId) {
        setErr("تعذّر إتمام الدخول. حاول مرة أخرى.");
        return;
      }

      const [{ data: adminCheck, error: adminErr }, { data: cmCheck, error: cmErr }] =
        await Promise.all([
          supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
          supabase.rpc("has_role", {
            _user_id: userId,
            _role: "content_manager",
          }),
        ]);
      if (adminErr) throw adminErr;
      if (cmErr) throw cmErr;

      if (!adminCheck && !cmCheck) {
        await supabase.auth.signOut();
        setErr("هذا الحساب لا يملك صلاحية دخول لوحة الإدارة.");
        return;
      }

      navigate({
        to: adminCheck ? "/admin" : "/admin/academic",
        replace: true,
      });
    } catch (e) {
      setErr(translateAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setForgotMsg(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: getAuthRedirectUrl("/reset-password"),
      });
      if (error) throw error;
      setForgotMsg("تم إرسال رابط استعادة كلمة المرور إلى بريدك إن كان مسجلاً.");
    } catch (e) {
      setErr(translateAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-background px-4 py-10"
      dir="rtl"
    >
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-card">
        <Link to="/" className="text-sm text-muted-foreground">
          → العودة للرئيسية
        </Link>

        <h1 className="mt-3 text-xl font-bold">دخول لوحة الإدارة</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          هذه الصفحة مخصصة لحسابات الإدارة وإدارة المحتوى.
        </p>

        {forgotMode ? (
          <form onSubmit={handleForgot} className="mt-5 space-y-3">
            <div>
              <Label htmlFor="admin-forgot-email">البريد الإلكتروني</Label>
              <Input
                id="admin-forgot-email"
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
            {forgotMsg && <p className="text-sm text-primary">{forgotMsg}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "..." : "إرسال رابط الاستعادة"}
            </Button>
            <button
              type="button"
              className="w-full text-sm text-muted-foreground hover:text-foreground"
              onClick={() => {
                setForgotMode(false);
                setErr(null);
                setForgotMsg(null);
              }}
            >
              العودة إلى تسجيل الدخول
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="mt-5 space-y-3">
            <div>
              <Label htmlFor="admin-email">البريد الإلكتروني</Label>
              <Input
                id="admin-email"
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="admin-password">كلمة المرور</Label>
              <Input
                id="admin-password"
                type="password"
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "..." : "دخول الإدارة"}
            </Button>
            <button
              type="button"
              className="w-full text-sm text-primary hover:underline"
              onClick={() => {
                setForgotMode(true);
                setErr(null);
                setForgotMsg(null);
              }}
            >
              نسيت كلمة المرور؟
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
