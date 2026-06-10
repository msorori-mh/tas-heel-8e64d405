import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { StateMessage } from "@/components/student/StudentNav";
import { Button } from "@/components/ui/button";
import { Plus, Clock, CheckCircle2, XCircle, FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/payments")({
  component: MyPaymentRequestsPage,
});

type Row = {
  id: string;
  amount: number;
  currency: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  admin_notes: string | null;
  receipt_url: string | null;
  plan: { name: string } | null;
  method: { name: string } | null;
};

function statusBadge(status: Row["status"]) {
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

function MyPaymentRequestsPage() {
  const { user } = useAuth();

  const query = useQuery({
    enabled: !!user,
    queryKey: ["my-payment-requests", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_requests")
        .select(`
          id, amount, currency, status, created_at, admin_notes, receipt_url,
          plan:subscription_plans!payment_requests_plan_id_fkey(name),
          method:payment_methods!payment_requests_payment_method_id_fkey(name)
        `)
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      <nav className="text-xs text-muted-foreground">
        <Link to="/app" className="hover:text-primary">موادي</Link>
        <span className="mx-1">/</span>
        <span className="text-foreground">طلبات الدفع</span>
      </nav>

      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-foreground">طلباتي للدفع</h1>
          <p className="text-xs text-muted-foreground">
            سجل إيصالات الدفع التي أرسلتها وحالتها.
          </p>
        </div>
        <Button asChild className="gap-1">
          <Link to="/payments/new">
            <Plus className="h-4 w-4" />
            إيصال جديد
          </Link>
        </Button>
      </header>

      {query.isLoading ? (
        <StateMessage variant="loading">جارٍ تحميل طلباتك…</StateMessage>
      ) : query.isError ? (
        <StateMessage variant="error">تعذّر تحميل الطلبات.</StateMessage>
      ) : (query.data ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          لم ترسل أي إيصال بعد. ابدأ بإضافة إيصال جديد لتفعيل اشتراكك.
        </div>
      ) : (
        <ul className="space-y-2">
          {(query.data ?? []).map((r) => (
            <li
              key={r.id}
              className="rounded-2xl border border-border bg-card p-4 shadow-card space-y-2"
            >
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {r.plan?.name ?? "خطة محذوفة"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {r.method?.name ?? "—"} •{" "}
                    {new Date(r.created_at).toLocaleDateString("ar-EG")}
                  </p>
                </div>
                {statusBadge(r.status)}
              </div>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-bold text-primary">
                  {Number(r.amount).toLocaleString("ar-EG")} {r.currency}
                </span>
                {r.receipt_url && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" /> سند مُرفق
                  </span>
                )}
              </div>
              {r.status === "rejected" && r.admin_notes && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                  <span className="font-semibold">سبب الرفض: </span>
                  {r.admin_notes}
                </div>
              )}
              {r.status === "approved" && r.admin_notes && (
                <div className="rounded-md border border-green-500/30 bg-green-500/5 p-2 text-xs text-green-700 dark:text-green-400">
                  {r.admin_notes}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
