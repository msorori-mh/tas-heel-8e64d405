import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRequireAdminSection } from "@/lib/admin-route-access";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { adminCreateUser, adminListUsers } from "@/lib/admin-users.functions";
import {
  ASSIGNABLE_ROLE_LABELS,
  formatAdminUserRoles,
  type AdminUserListItem,
  type AssignableAdminRole,
} from "@/lib/admin-users.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Shield, UserPlus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: AdminUsersPage,
});

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ar-EG", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function statusLabel(status: AdminUserListItem["status"]): string {
  return status === "disabled" ? "معطّل" : "نشط";
}

function AdminUsersPage() {
  const { loading, enabled } = useRequireAdminSection("full");
  const fetchUsers = useServerFn(adminListUsers);
  const createUser = useServerFn(adminCreateUser);

  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [role, setRole] = useState<AssignableAdminRole>("user");
  const [confirmGrantAdmin, setConfirmGrantAdmin] = useState(false);

  const loadUsers = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const response = await fetchUsers();
      setUsers(response.users);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "تعذر تحميل المستخدمين.";
      setListError(message);
    } finally {
      setListLoading(false);
    }
  }, [fetchUsers]);

  useEffect(() => {
    if (!enabled) return;
    void loadUsers();
  }, [enabled, loadUsers]);

  const resetForm = () => {
    setEmail("");
    setFullName("");
    setTemporaryPassword("");
    setRole("user");
    setConfirmGrantAdmin(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role === "admin" && !confirmGrantAdmin) {
      toast.error("يجب تأكيد منح صلاحيات المدير الكامل.");
      return;
    }

    setSubmitting(true);
    try {
      await createUser({
        data: {
          email,
          full_name: fullName,
          temporary_password: temporaryPassword,
          role,
          confirmGrantAdmin: role === "admin" ? true : undefined,
        },
      });
      toast.success("تم إنشاء المستخدم بنجاح.");
      setDialogOpen(false);
      resetForm();
      await loadUsers();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "تعذر إنشاء المستخدم.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
          جارٍ التحقق من الصلاحيات…
        </div>
      </AdminLayout>
    );
  }

  if (!enabled) {
    return (
      <AdminLayout>
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
          ليست لديك صلاحية الوصول لهذه الصفحة.
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6" dir="rtl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              المستخدمون والصلاحيات
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              إنشاء حسابات وتحديد أدوار staff — للمدير الكامل فقط.
            </p>
          </div>
          <Button
            className="gap-2 min-h-[44px]"
            onClick={() => {
              resetForm();
              setDialogOpen(true);
            }}
          >
            <UserPlus className="h-4 w-4" />
            إنشاء مستخدم
          </Button>
        </div>

        {listLoading ? (
          <div className="flex min-h-[30vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : listError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-6 text-center text-sm text-destructive">
            {listError}
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
            لا يوجد مستخدمون بعد.
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-right font-medium">البريد</th>
                    <th className="px-4 py-3 text-right font-medium">الاسم</th>
                    <th className="px-4 py-3 text-right font-medium">الأدوار</th>
                    <th className="px-4 py-3 text-right font-medium">تاريخ الإنشاء</th>
                    <th className="px-4 py-3 text-right font-medium">آخر دخول</th>
                    <th className="px-4 py-3 text-right font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.user_id} className="border-t border-border">
                      <td className="px-4 py-3 text-foreground">{u.email || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {u.full_name || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatAdminUserRoles(u.roles)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(u.created_at)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(u.last_sign_in_at)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={u.status === "active" ? "secondary" : "destructive"}
                        >
                          {statusLabel(u.status)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-3">
              {users.map((u) => (
                <div
                  key={u.user_id}
                  className="rounded-xl border border-border bg-card p-4 space-y-2"
                >
                  <div className="font-medium text-foreground break-all">{u.email}</div>
                  <div className="text-sm text-muted-foreground">{u.full_name || "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    الأدوار: {formatAdminUserRoles(u.roles)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    الإنشاء: {formatDate(u.created_at)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    آخر دخول: {formatDate(u.last_sign_in_at)}
                  </div>
                  <Badge
                    variant={u.status === "active" ? "secondary" : "destructive"}
                    className="text-[11px]"
                  >
                    {statusLabel(u.status)}
                  </Badge>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>إنشاء مستخدم</DialogTitle>
            <DialogDescription>
              أنشئ حساباً جديداً وحدّد دوره. شارك كلمة المرور المؤقتة بشكل آمن.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-user-email">البريد الإلكتروني</Label>
              <Input
                id="admin-user-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="admin-user-name">الاسم الكامل</Label>
              <Input
                id="admin-user-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="admin-user-password">كلمة مرور مؤقتة</Label>
              <Input
                id="admin-user-password"
                type="password"
                autoComplete="new-password"
                value={temporaryPassword}
                onChange={(e) => setTemporaryPassword(e.target.value)}
                minLength={12}
                required
              />
              <p className="text-xs text-muted-foreground">12 حرفاً على الأقل.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="admin-user-role">الدور</Label>
              <Select
                value={role}
                onValueChange={(value) => {
                  const next = value as AssignableAdminRole;
                  setRole(next);
                  if (next !== "admin") setConfirmGrantAdmin(false);
                }}
              >
                <SelectTrigger id="admin-user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ASSIGNABLE_ROLE_LABELS) as AssignableAdminRole[]).map(
                    (key) => (
                      <SelectItem key={key} value={key}>
                        {ASSIGNABLE_ROLE_LABELS[key]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            {role === "admin" && (
              <Alert variant="destructive">
                <AlertDescription className="space-y-3">
                  <p>هذا الدور يمنح صلاحيات كاملة للنظام.</p>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <Checkbox
                      checked={confirmGrantAdmin}
                      onCheckedChange={(checked) =>
                        setConfirmGrantAdmin(checked === true)
                      }
                    />
                    <span className="text-sm leading-relaxed">
                      أؤكد منح صلاحيات المدير الكامل لهذا الحساب.
                    </span>
                  </label>
                </AlertDescription>
              </Alert>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={submitting}
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={
                  submitting || (role === "admin" && !confirmGrantAdmin)
                }
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    جارٍ الإنشاء…
                  </>
                ) : (
                  "إنشاء"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
