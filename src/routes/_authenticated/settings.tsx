import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Trash2, ShieldAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { deleteMyAccount } from "@/lib/account.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const callDelete = useServerFn(deleteMyAccount);

  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    !submitting && password.length > 0 && confirmText === "DELETE";

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await callDelete({ data: { password, confirmation: "DELETE" } });
      toast.success("تم حذف حسابك بنجاح.");
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
      navigate({ to: "/auth", search: { mode: "login" }, replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "تعذر إكمال العملية.";
      toast.error(msg);
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <header>
        <h1 className="text-2xl font-bold text-foreground">الإعدادات</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          إدارة حسابك في منصة تنوير.
        </p>
      </header>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">معلومات الحساب</h2>
        <dl className="mt-3 grid gap-2 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">البريد الإلكتروني</dt>
            <dd className="font-medium text-foreground">{user?.email ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-destructive">
              منطقة الخطر — حذف الحساب
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              حذف حسابك إجراء نهائي. سيتم حذف جميع بياناتك (الملف الشخصي،
              التقدم الدراسي، الاشتراكات، المحفظة، طلبات الدفع، وصور السندات)
              بشكل لا يمكن استرجاعه. قد نحتفظ ببعض السجلات (مثل سجلات
              التدقيق المجهولة) لفترة محدودة لأسباب قانونية أو محاسبية.
            </p>

            {!open ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                حذف حسابي
              </Button>
            ) : (
              <form onSubmit={handleDelete} className="mt-4 space-y-3">
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <p className="text-xs leading-relaxed text-destructive">
                    هذا الإجراء لا يمكن التراجع عنه. أكّد كلمة المرور واكتب{" "}
                    <span className="font-mono font-bold">DELETE</span> للمتابعة.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pw" className="text-xs">
                    كلمة المرور الحالية
                  </Label>
                  <Input
                    id="pw"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={submitting}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm" className="text-xs">
                    اكتب <span className="font-mono">DELETE</span> للتأكيد
                  </Label>
                  <Input
                    id="confirm"
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    disabled={submitting}
                    dir="ltr"
                    required
                  />
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="submit"
                    variant="destructive"
                    size="sm"
                    disabled={!canSubmit}
                    className="gap-2"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        جارٍ الحذف…
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4" />
                        تأكيد حذف الحساب
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setOpen(false);
                      setPassword("");
                      setConfirmText("");
                    }}
                    disabled={submitting}
                  >
                    إلغاء
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        <p>
          لمعرفة ما يتم حذفه أو الاحتفاظ به، راجع{" "}
          <Link to="/data-deletion" className="text-primary">
            صفحة حذف البيانات
          </Link>{" "}
          و
          <Link to="/privacy" className="text-primary">
            {" "}
            سياسة الخصوصية
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
