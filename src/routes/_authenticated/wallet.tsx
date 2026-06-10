import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { StateMessage } from "@/components/student/StudentNav";
import { Button } from "@/components/ui/button";
import {
  Wallet as WalletIcon,
  Plus,
  ArrowDownCircle,
  ArrowUpCircle,
  CreditCard,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/wallet")({
  component: WalletPage,
});

type WalletAccount = {
  id: string;
  balance: number;
  currency: string;
  status: string;
};

type WalletTx = {
  id: string;
  type: string;
  direction: "credit" | "debit";
  amount: number;
  currency: string;
  balance_after: number;
  description: string | null;
  created_at: string;
  reference_type: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  topup: "شحن رصيد",
  payment: "دفع اشتراك",
  refund: "استرجاع",
  adjustment: "تسوية إدارية",
  reversal: "إلغاء عملية",
  referral_reward: "مكافأة إحالة",
};

const STATUS_LABEL: Record<string, string> = {
  active: "نشط",
  frozen: "مجمّد",
  closed: "مغلق",
};

function WalletPage() {
  const { user } = useAuth();

  const wallet = useQuery({
    enabled: !!user,
    queryKey: ["my-wallet", user?.id],
    queryFn: async () => {
      // ensure wallet exists, then read it
      await supabase.rpc("ensure_wallet_account", { _user_id: user!.id });
      const { data, error } = await supabase
        .from("wallet_accounts")
        .select("id,balance,currency,status")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as WalletAccount | null;
    },
  });

  const txs = useQuery({
    enabled: !!user,
    queryKey: ["my-wallet-tx", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallet_transactions")
        .select(
          "id,type,direction,amount,currency,balance_after,description,created_at,reference_type",
        )
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as WalletTx[];
    },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      <nav className="text-xs text-muted-foreground">
        <Link to="/app" className="hover:text-primary">
          الرئيسية
        </Link>
        <span className="mx-1">/</span>
        <span className="text-foreground">المحفظة</span>
      </nav>

      <header>
        <h1 className="text-lg font-bold text-foreground">محفظتي</h1>
        <p className="text-xs text-muted-foreground">
          رصيدك الحالي وسجل عمليات المحفظة.
        </p>
      </header>

      {/* Balance card */}
      {wallet.isLoading ? (
        <StateMessage variant="loading">جارٍ تحميل الرصيد…</StateMessage>
      ) : wallet.isError ? (
        <StateMessage variant="error">تعذّر تحميل المحفظة.</StateMessage>
      ) : (
        <div className="rounded-2xl border border-border bg-hero-gradient p-5 text-primary-foreground shadow-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm opacity-90">
              <WalletIcon className="h-5 w-5" />
              <span>الرصيد الحالي</span>
            </div>
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px]">
              {STATUS_LABEL[wallet.data?.status ?? "active"] ?? wallet.data?.status ?? "—"}
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold">
              {Number(wallet.data?.balance ?? 0).toLocaleString("ar-EG")}
            </span>
            <span className="text-sm opacity-90">{wallet.data?.currency ?? "YER"}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="secondary" className="gap-1">
              <Link to="/payments/new">
                <Plus className="h-4 w-4" />
                شحن الرصيد
              </Link>
            </Button>
            <Button asChild size="sm" variant="ghost" className="gap-1 text-primary-foreground hover:bg-white/15 hover:text-primary-foreground">
              <Link to="/subscription">
                <CreditCard className="h-4 w-4" />
                الاشتراك
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* Transactions */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">سجل العمليات</h2>
        {txs.isLoading ? (
          <StateMessage variant="loading">جارٍ تحميل العمليات…</StateMessage>
        ) : txs.isError ? (
          <StateMessage variant="error">تعذّر تحميل سجل العمليات.</StateMessage>
        ) : (txs.data ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
            لا توجد عمليات بعد على محفظتك.
          </div>
        ) : (
          <ul className="space-y-2">
            {(txs.data ?? []).map((t) => {
              const isCredit = t.direction === "credit";
              return (
                <li
                  key={t.id}
                  className="rounded-2xl border border-border bg-card p-3 shadow-card"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      <span
                        className={`mt-0.5 inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                          isCredit
                            ? "bg-green-500/15 text-green-700 dark:text-green-400"
                            : "bg-destructive/15 text-destructive"
                        }`}
                      >
                        {isCredit ? (
                          <ArrowDownCircle className="h-4 w-4" />
                        ) : (
                          <ArrowUpCircle className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {TYPE_LABEL[t.type] ?? t.type}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {new Date(t.created_at).toLocaleString("ar-EG", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </p>
                        {t.description && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                            {t.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-left flex-shrink-0">
                      <p
                        className={`text-sm font-bold ${
                          isCredit ? "text-green-700 dark:text-green-400" : "text-destructive"
                        }`}
                      >
                        {isCredit ? "+" : "−"}
                        {Number(t.amount).toLocaleString("ar-EG")} {t.currency}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        الرصيد: {Number(t.balance_after).toLocaleString("ar-EG")}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
