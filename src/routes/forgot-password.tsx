import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { translateAuthError, getAuthRedirectUrl } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPassword,
});

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getAuthRedirectUrl("/reset-password"),
      });
      if (error) throw error;
      setDone(true);
    } catch (e) {
      setErr(translateAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-card">
        <Link to="/auth" className="text-sm text-muted-foreground">
          → العودة لتسجيل الدخول
        </Link>
        <h1 className="mt-3 text-2xl font-bold">استعادة كلمة المرور</h1>
        {done ? (
          <p className="mt-4 text-sm text-primary">
            تم إرسال رابط إعادة التعيين إلى بريدك. تحقّق من البريد.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <div>
              <Label htmlFor="em">البريد الإلكتروني</Label>
              <Input
                id="em"
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "..." : "إرسال الرابط"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
