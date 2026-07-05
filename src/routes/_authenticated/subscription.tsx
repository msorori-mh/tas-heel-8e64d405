import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { StateMessage } from "@/components/student/StudentNav";
import { Button } from "@/components/ui/button";
import {
  CreditCard,
  CheckCircle2,
  XCircle,
  Clock,
  Wallet as WalletIcon,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/subscription")({
  component: SubscriptionPage,
});

type Plan = {
  id: string;
  name: string;
  duration_type: string;
  duration_months: number | null;
  price: number;
  currency: string;
};

type Subscription = {
  id: string;
  status: string;
  starts_at: string;
  expires_at: string | null;
  plan: { id: string; name: string } | null;
};

function statusBadge(status: string) {
  if (status === "active")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-3 w-3" /> نشط
      </span>
    );
  if (status === "expired" || status === "cancelled" || status === "refunded")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        <XCircle className="h-3 w-3" /> {status === "expired" ? "منتهٍ" : status === "cancelled" ? "ملغي" : "مسترجع"}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
      <Clock className="h-3 w-3" /> {status}
    </span>
  );
}

function durationLabel(p: Plan) {
  if (p.duration_type === "monthly" || p.duration_months === 1) return "شهري";
  if (p.duration_type === "yearly") return "سنوي";
  if (p.duration_months) return `${p.duration_months} أشهر`;
  return p.duration_type;
}

function SubscriptionPage() {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const [payingId, setPayingId] = useState<string | null>(null);

  const gradeKey = profile?.grade_uuid ?? (profile?.grade_id ? String(profile.grade_id) : null);

  const sub = useQuery({
    enabled: !!user,
    queryKey: ["my-subscription", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("id,status,starts_at,expires_at,plan:subscription_plans!subscriptions_plan_id_fkey(id,name)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Subscription | null;
    },
  });

  const plans = useQuery({
    queryKey: ["active-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("id,name,duration_type,duration_months,price,currency")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });

  const wallet = useQuery({
    enabled: !!user,
    queryKey: ["my-wallet", user?.id],
    queryFn: async () => {
      await supabase.rpc("ensure_wallet_account", { _user_id: user!.id });
      const { data, error } = await supabase
        .from("wallet_accounts")
        .select("balance,currency")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as { balance: number; currency: string } | null;
    },
  });

  const buy = useMutation({
    mutationFn: async (plan: Plan) => {
      setPayingId(plan.id);
      const { data, error } = await supabase.rpc("pay_subscription_from_wallet", {
        _plan_id: plan.id,
        _grade_id: gradeKey ?? undefined,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("تم تفعيل الاشتراك بنجاح");
      qc.invalidateQueries({ queryKey: ["my-subscription"] });
      qc.invalidateQueries({ queryKey: ["my-wallet"] });
      qc.invalidateQueries({ queryKey: ["my-wallet-tx"] });
    },
    onError: (e: any) => {
      toast.error(e?.message || "تعذّر إتمام عملية الشراء");
    },
    onSettled: () => setPayingId(null),
  });

  const balance = Number(wallet.data?.balance ?? 0);

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      <nav className="text-xs text-muted-foreground">
        <Link to="/app" className="hover:text-primary">
          الرئيسية
        </Link>
        <span className="mx-1">/</span>
        <span className="text-foreground">الاشتراك</span>
      </nav>

      <header>
        <h1 className="text-lg font-bold text-foreground">اشتراكي</h1>
        <p className="text-xs text-muted-foreground">
          عرض اشتراكك الحالي والخطط المتاحة.
        </p>
      </header>

      {/* Current subscription */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">الاشتراك الحالي</h2>
        {sub.isLoading ? (
          <StateMessage variant="loading">جارٍ التحميل…</StateMessage>
        ) : sub.isError ? (
          <StateMessage variant="error">تعذّر تحميل الاشتراك.</StateMessage>
        ) : !sub.data ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            لا يوجد اشتراك نشط. اختر خطة بالأسفل للبدء.
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-4 shadow-card space-y-2">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <p className="text-base font-semibold text-foreground">
                  {sub.data.plan?.name ?? "خطة محذوفة"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  بدأ في{" "}
                  {new Date(sub.data.starts_at).toLocaleDateString("ar-EG")}
                  {sub.data.expires_at && (
                    <>
                      {" "}
                      • ينتهي في{" "}
                      {new Date(sub.data.expires_at).toLocaleDateString("ar-EG")}
                    </>
                  )}
                </p>
              </div>
              {statusBadge(sub.data.status)}
            </div>
          </div>
        )}
      </section>

      {/* Wallet balance shortcut */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <WalletIcon className="h-4 w-4" />
          <span>رصيد المحفظة:</span>
          <span className="font-semibold text-foreground">
            {balance.toLocaleString("ar-EG")} {wallet.data?.currency ?? "YER"}
          </span>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/wallet">المحفظة</Link>
        </Button>
      </div>

      {/* Available plans */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">الخطط المتاحة</h2>
        {plans.isLoading ? (
          <StateMessage variant="loading">جارٍ تحميل الخطط…</StateMessage>
        ) : plans.isError ? (
          <StateMessage variant="error">تعذّر تحميل الخطط.</StateMessage>
        ) : (plans.data ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            لا توجد خطط متاحة حاليًا.
          </div>
        ) : (
          <ul className="space-y-2">
            {(plans.data ?? []).map((p) => {
              const enough = balance >= Number(p.price);
              const isPaying = payingId === p.id && buy.isPending;
              return (
                <li
                  key={p.id}
                  className="rounded-2xl border border-border bg-card p-4 shadow-card space-y-3"
                >
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{p.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {durationLabel(p)}
                      </p>
                    </div>
                    <p className="text-base font-bold text-primary whitespace-nowrap">
                      {Number(p.price).toLocaleString("ar-EG")} {p.currency}
                    </p>
                  </div>
                  {enough ? (
                    <Button
                      className="w-full gap-1"
                      disabled={isPaying || buy.isPending}
                      onClick={() => buy.mutate(p)}
                    >
                      {isPaying ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          جارٍ المعالجة…
                        </>
                      ) : (
                        <>
                          <CreditCard className="h-4 w-4" />
                          اشترك الآن من المحفظة
                        </>
                      )}
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-400">
                        الرصيد غير كافٍ. تحتاج إلى{" "}
                        {(Number(p.price) - balance).toLocaleString("ar-EG")}{" "}
                        {p.currency} إضافية.
                      </div>
                      <Button asChild variant="outline" className="w-full gap-1">
                        <Link to="/wallet" hash="topup">
                          <WalletIcon className="h-4 w-4" />
                          اشحن المحفظة
                        </Link>
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
