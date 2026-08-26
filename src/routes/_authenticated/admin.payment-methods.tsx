import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useRequireAdminSection } from "@/lib/admin-route-access";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
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
import { Landmark, Loader2, Pencil, Plus, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/payment-methods")({
  component: AdminPaymentMethodsPage,
});

type PaymentMethodType =
  | "bank"
  | "exchange"
  | "ewallet"
  | "network_transfer"
  | "kuraimi_transfer"
  | "hasib_point";

type PaymentMethodRow = {
  id: string;
  name: string;
  type: string;
  account_name: string | null;
  account_number: string | null;
  details: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

const PAYMENT_TYPES: { value: PaymentMethodType; label: string }[] = [
  { value: "bank", label: "بنك" },
  { value: "exchange", label: "صراف" },
  { value: "ewallet", label: "محفظة إلكترونية" },
  { value: "network_transfer", label: "تحويل شبكة" },
  { value: "kuraimi_transfer", label: "تحويل كريمي" },
  { value: "hasib_point", label: "نقطة حاسب" },
];

function typeLabel(type: string): string {
  return PAYMENT_TYPES.find((t) => t.value === type)?.label ?? type;
}

type FormState = {
  name: string;
  type: PaymentMethodType;
  account_name: string;
  account_number: string;
  details: string;
  sort_order: string;
};

const emptyForm = (): FormState => ({
  name: "",
  type: "bank",
  account_name: "",
  account_number: "",
  details: "",
  sort_order: "0",
});

function rowToForm(row: PaymentMethodRow): FormState {
  return {
    name: row.name,
    type: row.type as PaymentMethodType,
    account_name: row.account_name ?? "",
    account_number: row.account_number ?? "",
    details: row.details ?? "",
    sort_order: String(row.sort_order),
  };
}

function AdminPaymentMethodsPage() {
  const { loading, enabled } = useRequireAdminSection("full");
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentMethodRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const q = useQuery({
    enabled,
    queryKey: ["admin-payment-methods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_methods")
        .select(
          "id, name, type, account_name, account_number, details, is_active, sort_order, created_at, updated_at",
        )
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PaymentMethodRow[];
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (row: PaymentMethodRow) => {
    setEditing(row);
    setForm(rowToForm(row));
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (saving) return;
    setDialogOpen(false);
    setEditing(null);
    setForm(emptyForm());
  };

  const saveMethod = async () => {
    const name = form.name.trim();
    if (name.length < 2) {
      toast.error("اسم طريقة الدفع مطلوب.");
      return;
    }
    const sortOrder = Number(form.sort_order);
    if (Number.isNaN(sortOrder)) {
      toast.error("ترتيب العرض غير صالح.");
      return;
    }

    setSaving(true);
    const payload = {
      name,
      type: form.type,
      account_name: form.account_name.trim() || null,
      account_number: form.account_number.trim() || null,
      details: form.details.trim() || null,
      sort_order: sortOrder,
    };

    if (editing) {
      const { error } = await supabase.from("payment_methods").update(payload).eq("id", editing.id);
      setSaving(false);
      if (error) {
        toast.error("تعذّر تحديث طريقة الدفع: " + error.message);
        return;
      }
      toast.success("تم تحديث طريقة الدفع.");
    } else {
      const { error } = await supabase.from("payment_methods").insert({
        ...payload,
        is_active: true,
      });
      setSaving(false);
      if (error) {
        toast.error("تعذّر إنشاء طريقة الدفع: " + error.message);
        return;
      }
      toast.success("تم إنشاء طريقة الدفع.");
    }

    closeDialog();
    queryClient.invalidateQueries({ queryKey: ["admin-payment-methods"] });
  };

  const toggleActive = async (row: PaymentMethodRow) => {
    const next = !row.is_active;
    if (!next) {
      const ok = window.confirm(
        "تعطيل طريقة الدفع يمنع ظهورها للطلاب في طلبات الشحن الجديدة. هل تريد المتابعة؟",
      );
      if (!ok) return;
    }

    setTogglingId(row.id);
    const { error } = await supabase
      .from("payment_methods")
      .update({ is_active: next })
      .eq("id", row.id);
    setTogglingId(null);

    if (error) {
      toast.error("تعذّر تغيير حالة طريقة الدفع: " + error.message);
      return;
    }
    toast.success(next ? "تم تفعيل طريقة الدفع." : "تم تعطيل طريقة الدفع.");
    queryClient.invalidateQueries({ queryKey: ["admin-payment-methods"] });
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
          جارٍ التحقق من الصلاحيات…
        </div>
      </AdminLayout>
    );
  }
  if (!enabled) return null;

  const rows = q.data ?? [];

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Landmark className="h-5 w-5 text-primary" />
              طرق الدفع
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              إدارة طرق الدفع التي يختارها الطلاب عند شحن المحفظة. الطرق المعطّلة لا تظهر في الطلبات
              الجديدة.
            </p>
          </div>
          <Button type="button" size="sm" className="gap-1" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            إضافة طريقة دفع
          </Button>
        </div>

        {q.isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : q.isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            تعذّر تحميل طرق الدفع.
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            لا توجد طرق دفع بعد. أضف طريقة دفع جديدة.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-right font-medium">الاسم</th>
                  <th className="px-3 py-2 text-right font-medium">النوع</th>
                  <th className="px-3 py-2 text-right font-medium">اسم الحساب</th>
                  <th className="px-3 py-2 text-right font-medium">رقم الحساب</th>
                  <th className="px-3 py-2 text-right font-medium">الترتيب</th>
                  <th className="px-3 py-2 text-right font-medium">الحالة</th>
                  <th className="px-3 py-2 text-right font-medium">أُنشئ</th>
                  <th className="px-3 py-2 text-right font-medium">آخر تحديث</th>
                  <th className="px-3 py-2 text-right font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/70 align-top">
                    <td className="px-3 py-3 font-medium text-foreground">{r.name}</td>
                    <td className="px-3 py-3 text-xs">{typeLabel(r.type)}</td>
                    <td className="px-3 py-3 text-xs">{r.account_name ?? "—"}</td>
                    <td className="px-3 py-3 text-xs" dir="ltr">
                      {r.account_number ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-xs">{r.sort_order}</td>
                    <td className="px-3 py-3">
                      {r.is_active ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:text-green-400">
                          <Power className="h-3 w-3" /> نشطة
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          <PowerOff className="h-3 w-3" /> معطّلة
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString("ar-EG", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-3 py-3 text-xs whitespace-nowrap">
                      {new Date(r.updated_at).toLocaleString("ar-EG", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-1 text-xs"
                          onClick={() => openEdit(r)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          تعديل
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-1 text-xs"
                          disabled={togglingId === r.id}
                          onClick={() => toggleActive(r)}
                        >
                          {togglingId === r.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : r.is_active ? (
                            <PowerOff className="h-3.5 w-3.5" />
                          ) : (
                            <Power className="h-3.5 w-3.5" />
                          )}
                          {r.is_active ? "تعطيل" : "تفعيل"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل طريقة الدفع" : "إضافة طريقة دفع"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="pm-name" className="text-xs">
                الاسم
              </Label>
              <Input
                id="pm-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                maxLength={120}
                required
              />
            </div>
            <div>
              <Label className="text-xs">النوع</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v as PaymentMethodType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="pm-account-name" className="text-xs">
                اسم الحساب (اختياري)
              </Label>
              <Input
                id="pm-account-name"
                value={form.account_name}
                onChange={(e) => setForm((f) => ({ ...f, account_name: e.target.value }))}
                maxLength={120}
              />
            </div>
            <div>
              <Label htmlFor="pm-account-number" className="text-xs">
                رقم الحساب/المحفظة (اختياري)
              </Label>
              <Input
                id="pm-account-number"
                value={form.account_number}
                onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))}
                maxLength={120}
                dir="ltr"
              />
            </div>
            <div>
              <Label htmlFor="pm-sort" className="text-xs">
                ترتيب العرض
              </Label>
              <Input
                id="pm-sort"
                type="number"
                inputMode="numeric"
                value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="pm-details" className="text-xs">
                تفاصيل إضافية (اختياري)
              </Label>
              <Textarea
                id="pm-details"
                value={form.details}
                onChange={(e) => setForm((f) => ({ ...f, details: e.target.value }))}
                rows={3}
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeDialog} disabled={saving}>
              إلغاء
            </Button>
            <Button onClick={saveMethod} disabled={saving} className="gap-1">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "حفظ التعديلات" : "إنشاء"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
