import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useRequireAdminSection } from "@/lib/admin-route-access";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  AlertTriangle,
  FileText,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/payment-requests")({
  component: AdminPaymentRequestsPage,
});

type Row = {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  sender_name: string | null;
  transaction_reference: string | null;
  payment_date: string | null;
  receipt_url: string | null;
  admin_notes: string | null;
  fraud_flags: unknown;
  plan: { name: string } | null;
  method: { name: string } | null;
  user: { full_name: string | null; phone: string | null } | null;
};

type StatusFilter = "pending" | "approved" | "rejected" | "all";

function StatusBadge({ status }: { status: Row["status"] }) {
  if (status === "approved")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-3 w-3" /> معتمد
      </span>
    );
  if (status === "rejected")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
        <XCircle className="h-3 w-3" /> مرفوض
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
      <Clock className="h-3 w-3" /> قيد المراجعة
    </span>
  );
}

async function getSignedReceiptUrl(path: string): Promise<string | null> {
  if (!path) return null;
  // path stored as "<uid>/<file>" in receipts bucket; also tolerate legacy URLs
  if (/^https?:\/\//i.test(path)) return path;
  const clean = path.replace(/^supabase-storage:\/\/receipts\//, "");
  const { data } = await supabase.storage.from("receipts").createSignedUrl(clean, 60 * 10);
  return data?.signedUrl ?? null;
}

function ReceiptViewer({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!path) {
      setUrl(null);
      return;
    }
    getSignedReceiptUrl(path).then((u) => {
      if (active) setUrl(u);
    });
    return () => {
      active = false;
    };
  }, [path]);

  if (!path) return <p className="text-xs text-muted-foreground">لا يوجد سند مرفق.</p>;
  if (!url)
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> جارٍ تحميل السند…
      </div>
    );
  const isPdf = /\.pdf($|\?)/i.test(url);
  return (
    <div className="space-y-2">
      {isPdf ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-2 text-xs">
          <FileText className="h-4 w-4 text-primary" />
          <span className="flex-1">ملف PDF</span>
        </div>
      ) : (
        <a href={url} target="_blank" rel="noreferrer" className="block">
          <img
            src={url}
            alt="سند الدفع"
            className="max-h-72 w-full rounded-lg border border-border object-contain bg-muted"
          />
        </a>
      )}
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <ExternalLink className="h-3.5 w-3.5" /> فتح في نافذة جديدة
      </a>
    </div>
  );
}

function AdminPaymentRequestsPage() {
  const { loading, enabled } = useRequireAdminSection("full");
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [actionFor, setActionFor] = useState<{ row: Row; kind: "approve" | "reject" } | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const q = useQuery({
    enabled,
    queryKey: ["admin-payment-requests", filter],
    queryFn: async () => {
      let req = supabase
        .from("payment_requests")
        .select(
          `
          id, user_id, amount, currency, status, created_at,
          sender_name, transaction_reference, payment_date,
          receipt_url, admin_notes, fraud_flags,
          plan:subscription_plans!payment_requests_plan_id_fkey(name),
          method:payment_methods!payment_requests_payment_method_id_fkey(name),
          user:profiles!payment_requests_user_id_fkey(full_name, phone)
        `,
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (filter !== "all") req = req.eq("status", filter);
      const { data, error } = await req;
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const openAction = (row: Row, kind: "approve" | "reject") => {
    setActionFor({ row, kind });
    setNotes("");
  };

  const submitAction = async () => {
    if (!actionFor) return;
    const trimmed = notes.trim();
    if (actionFor.kind === "reject" && trimmed.length < 3) {
      toast.error("يرجى كتابة سبب الرفض.");
      return;
    }
    setSubmitting(true);
    const rpc = actionFor.kind === "approve" ? "approve_payment_request" : "reject_payment_request";
    const { error } = await supabase.rpc(rpc, {
      _request_id: actionFor.row.id,
      _admin_notes: trimmed.length > 0 ? trimmed : undefined,
    });
    setSubmitting(false);
    if (error) {
      toast.error("فشلت العملية: " + error.message);
      return;
    }
    toast.success(actionFor.kind === "approve" ? "تم اعتماد الطلب." : "تم رفض الطلب.");
    setActionFor(null);
    queryClient.invalidateQueries({ queryKey: ["admin-payment-requests"] });
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
  const filters: { key: StatusFilter; label: string }[] = [
    { key: "pending", label: "قيد المراجعة" },
    { key: "approved", label: "المعتمدة" },
    { key: "rejected", label: "المرفوضة" },
    { key: "all", label: "الكل" },
  ];

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">طلبات الدفع</h1>
          <p className="text-xs text-muted-foreground mt-1">
            راجع إيصالات الطلاب، ثم اعتمد أو ارفض. يتم تحديث المحفظة والاشتراك تلقائيًا.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filter === f.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {q.isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : q.isError ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            تعذّر تحميل الطلبات.
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            لا توجد طلبات في هذا الفلتر.
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => {
              const flags = Array.isArray(r.fraud_flags) ? (r.fraud_flags as string[]) : [];
              return (
                <li
                  key={r.id}
                  className="rounded-2xl border border-border bg-card p-4 shadow-card space-y-3"
                >
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {r.user?.full_name ?? "مستخدم"}
                        {r.user?.phone && (
                          <span
                            className="ms-2 text-xs text-muted-foreground font-normal"
                            dir="ltr"
                          >
                            {r.user.phone}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.plan?.name ?? "—"} • {r.method?.name ?? "—"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        أُرسل: {new Date(r.created_at).toLocaleString("ar-EG")}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge status={r.status} />
                      <span className="text-sm font-bold text-primary">
                        {Number(r.amount).toLocaleString("ar-EG")} {r.currency}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1 text-xs text-muted-foreground">
                      {r.sender_name && (
                        <p>
                          المرسل: <span className="text-foreground">{r.sender_name}</span>
                        </p>
                      )}
                      {r.transaction_reference && (
                        <p dir="ltr">
                          رقم العملية:{" "}
                          <span className="text-foreground">{r.transaction_reference}</span>
                        </p>
                      )}
                      {r.payment_date && (
                        <p>
                          تاريخ التحويل:{" "}
                          <span className="text-foreground">
                            {new Date(r.payment_date).toLocaleDateString("ar-EG")}
                          </span>
                        </p>
                      )}
                      {flags.length > 0 && (
                        <div className="mt-2 inline-flex items-start gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          <span className="text-[11px]">تنبيهات: {flags.join("، ")}</span>
                        </div>
                      )}
                      {r.admin_notes && (
                        <div className="mt-2 rounded-md border border-border bg-muted/40 p-2 text-[11px]">
                          <span className="font-semibold text-foreground">ملاحظات الإدارة: </span>
                          {r.admin_notes}
                        </div>
                      )}
                    </div>

                    <ReceiptViewer path={r.receipt_url} />
                  </div>

                  {r.status === "pending" && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" className="gap-1" onClick={() => openAction(r, "approve")}>
                        <CheckCircle2 className="h-4 w-4" /> اعتماد
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-destructive hover:text-destructive"
                        onClick={() => openAction(r, "reject")}
                      >
                        <XCircle className="h-4 w-4" /> رفض
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog
        open={actionFor !== null}
        onOpenChange={(o) => {
          if (!o) setActionFor(null);
        }}
      >
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {actionFor?.kind === "approve" ? "اعتماد الطلب" : "رفض الطلب"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-xs">
              {actionFor?.kind === "approve"
                ? "ملاحظة للطالب (اختياري)"
                : "سبب الرفض (يظهر للطالب)"}
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder={
                actionFor?.kind === "approve"
                  ? "مثال: تم تفعيل اشتراكك."
                  : "مثال: المبلغ المرسل أقل من قيمة الخطة."
              }
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setActionFor(null)} disabled={submitting}>
              إلغاء
            </Button>
            <Button
              onClick={submitAction}
              disabled={submitting}
              variant={actionFor?.kind === "reject" ? "destructive" : "default"}
              className="gap-1"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {actionFor?.kind === "approve" ? "اعتماد" : "رفض"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
