import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRequireAdminSection } from "@/lib/admin-route-access";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getWalletTopupReceiptSignedUrl } from "@/lib/admin-wallet-topups.functions";
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
  FileText,
  Eye,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/wallet-topups")({
  component: AdminWalletTopupsPage,
});

type TopupStatus = "submitted" | "under_review" | "credited" | "rejected";
type StatusFilter = TopupStatus | "all";

type Row = {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  status: TopupStatus;
  created_at: string;
  reviewed_at: string | null;
  sender_name: string | null;
  sender_account: string | null;
  transaction_reference: string | null;
  payment_date: string | null;
  receipt_path: string;
  admin_notes: string | null;
  rejection_reason: string | null;
  method: { name: string } | null;
  user: { full_name: string | null; phone: string | null } | null;
};

function StatusBadge({ status }: { status: TopupStatus }) {
  if (status === "credited")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-3 w-3" /> تم شحن الرصيد
      </span>
    );
  if (status === "rejected")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
        <XCircle className="h-3 w-3" /> مرفوض
      </span>
    );
  if (status === "under_review")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-400">
        <Clock className="h-3 w-3" /> تحت المراجعة
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
      <Clock className="h-3 w-3" /> بانتظار المراجعة
    </span>
  );
}

function ReceiptViewer({ requestId, fileHint }: { requestId: string; fileHint: string | null }) {
  const getSignedUrl = useServerFn(getWalletTopupReceiptSignedUrl);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setUrl(null);
    setFailed(false);
    getSignedUrl({ data: { requestId } })
      .then((result) => {
        if (!active) return;
        setUrl(result.signedUrl);
      })
      .catch(() => {
        if (!active) return;
        setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [requestId, getSignedUrl]);

  if (failed) {
    return <p className="text-xs text-destructive">تعذّر إنشاء رابط آمن لعرض الإيصال.</p>;
  }
  if (!url)
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> جارٍ تحميل الإيصال…
      </div>
    );
  const isPdf = /\.pdf($|\?)/i.test(url) || (fileHint?.toLowerCase().endsWith(".pdf") ?? false);
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
            alt="إيصال الشحن"
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

function isReviewable(status: TopupStatus) {
  return status === "submitted" || status === "under_review";
}

function AdminWalletTopupsPage() {
  const { loading, enabled } = useRequireAdminSection("full");
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<StatusFilter>("submitted");
  const [actionFor, setActionFor] = useState<{ row: Row; kind: "approve" | "reject" } | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [receiptFor, setReceiptFor] = useState<Row | null>(null);

  const q = useQuery({
    enabled,
    queryKey: ["admin-wallet-topups", filter],
    queryFn: async () => {
      let req = supabase
        .from("wallet_topup_requests")
        .select(
          `
          id, user_id, amount, currency, status, created_at, reviewed_at,
          sender_name, sender_account, transaction_reference, payment_date,
          receipt_path, admin_notes, rejection_reason,
          method:payment_methods!wallet_topup_requests_payment_method_id_fkey(name)
        `,
        )
        .order("created_at", { ascending: false })
        .limit(200);
      if (filter !== "all") req = req.eq("status", filter);
      const { data, error } = await req;
      if (error) throw error;
      const rows = (data ?? []) as Omit<Row, "user">[];
      const userIds = [...new Set(rows.map((r) => r.user_id))];
      let profileMap = new Map<string, { full_name: string | null; phone: string | null }>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, phone")
          .in("user_id", userIds);
        profileMap = new Map(
          (profiles ?? []).map((p) => [p.user_id, { full_name: p.full_name, phone: p.phone }]),
        );
      }
      return rows.map((r) => ({
        ...r,
        user: profileMap.get(r.user_id) ?? null,
      })) as Row[];
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
    if (actionFor.kind === "approve") {
      const { error } = await supabase.rpc("approve_wallet_topup_request", {
        p_request_id: actionFor.row.id,
        p_admin_notes: trimmed.length > 0 ? trimmed : undefined,
      });
      setSubmitting(false);
      if (error) {
        toast.error("فشل اعتماد الشحن: " + error.message);
        return;
      }
      toast.success("تم اعتماد الشحن وإضافة المبلغ إلى محفظة الطالب.");
    } else {
      const { error } = await supabase.rpc("reject_wallet_topup_request", {
        p_request_id: actionFor.row.id,
        p_rejection_reason: trimmed,
      });
      setSubmitting(false);
      if (error) {
        toast.error("فشل رفض الطلب: " + error.message);
        return;
      }
      toast.success("تم رفض طلب الشحن.");
    }
    setActionFor(null);
    queryClient.invalidateQueries({ queryKey: ["admin-wallet-topups"] });
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
    { key: "submitted", label: "بانتظار المراجعة" },
    { key: "under_review", label: "تحت المراجعة" },
    { key: "credited", label: "تم الشحن" },
    { key: "rejected", label: "المرفوضة" },
    { key: "all", label: "الكل" },
  ];

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            طلبات شحن المحفظة
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            راجع إيصالات شحن المحفظة، ثم اعتمد أو ارفض. يتم تحديث الرصيد عبر RPC فقط.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
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
            تعذّر تحميل طلبات الشحن.
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            لا توجد طلبات في هذا الفلتر.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-right font-medium">الطالب</th>
                  <th className="px-3 py-2 text-right font-medium">المبلغ</th>
                  <th className="px-3 py-2 text-right font-medium">طريقة الدفع</th>
                  <th className="px-3 py-2 text-right font-medium">الحالة</th>
                  <th className="px-3 py-2 text-right font-medium">المرسل</th>
                  <th className="px-3 py-2 text-right font-medium">رقم العملية</th>
                  <th className="px-3 py-2 text-right font-medium">تاريخ التحويل</th>
                  <th className="px-3 py-2 text-right font-medium">تاريخ الطلب</th>
                  <th className="px-3 py-2 text-right font-medium">المراجعة</th>
                  <th className="px-3 py-2 text-right font-medium">إيصال</th>
                  <th className="px-3 py-2 text-right font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/70 align-top">
                    <td className="px-3 py-3">
                      <p className="font-medium text-foreground">{r.user?.full_name ?? "—"}</p>
                      {r.user?.phone && (
                        <p className="text-[11px] text-muted-foreground" dir="ltr">
                          {r.user.phone}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap font-semibold text-primary">
                      {Number(r.amount).toLocaleString("ar-EG")} {r.currency}
                    </td>
                    <td className="px-3 py-3 text-xs">{r.method?.name ?? "—"}</td>
                    <td className="px-3 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <p>{r.sender_name ?? "—"}</p>
                      {r.sender_account && (
                        <p className="text-[11px] text-muted-foreground" dir="ltr">
                          {r.sender_account}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs" dir="ltr">
                      {r.transaction_reference ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-xs whitespace-nowrap">
                      {r.payment_date ? new Date(r.payment_date).toLocaleDateString("ar-EG") : "—"}
                    </td>
                    <td className="px-3 py-3 text-xs whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString("ar-EG", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {r.reviewed_at ? (
                        <span>
                          {new Date(r.reviewed_at).toLocaleString("ar-EG", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </span>
                      ) : (
                        "—"
                      )}
                      {r.rejection_reason && (
                        <p className="mt-1 text-destructive">{r.rejection_reason}</p>
                      )}
                      {r.admin_notes && (
                        <p className="mt-1 text-muted-foreground">{r.admin_notes}</p>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1 text-xs"
                        onClick={() => setReceiptFor(r)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        عرض
                      </Button>
                    </td>
                    <td className="px-3 py-3">
                      {isReviewable(r.status) ? (
                        <div className="flex flex-col gap-1">
                          <Button
                            type="button"
                            size="sm"
                            className="gap-1 text-xs"
                            onClick={() => openAction(r, "approve")}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            اعتماد الشحن
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="gap-1 text-xs text-destructive hover:text-destructive"
                            onClick={() => openAction(r, "reject")}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            رفض
                          </Button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={receiptFor !== null} onOpenChange={(o) => !o && setReceiptFor(null)}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>إيصال الشحن</DialogTitle>
          </DialogHeader>
          {receiptFor && (
            <ReceiptViewer
              requestId={receiptFor.id}
              fileHint={receiptFor.receipt_path.split("/").pop() ?? null}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={actionFor !== null}
        onOpenChange={(o) => {
          if (!o) setActionFor(null);
        }}
      >
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              {actionFor?.kind === "approve" ? "اعتماد الشحن" : "رفض طلب الشحن"}
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
                  ? "مثال: تم التحقق من الإيصال."
                  : "مثال: الإيصال غير واضح أو المبلغ غير مطابق."
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
              {actionFor?.kind === "approve" ? "اعتماد الشحن" : "رفض"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
