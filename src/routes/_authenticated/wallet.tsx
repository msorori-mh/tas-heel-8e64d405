import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { StateMessage } from "@/components/student/StudentNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Wallet as WalletIcon,
  Plus,
  ArrowDownCircle,
  ArrowUpCircle,
  CreditCard,
  Upload,
  X,
  FileText,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

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

type PayMethod = {
  id: string;
  name: string;
  account_name: string | null;
  account_number: string | null;
  details: string | null;
};

type TopupRequest = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  rejection_reason: string | null;
  admin_notes: string | null;
  method: { name: string } | null;
};

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_MB = 8;

const topupSchema = z.object({
  payment_method_id: z.string().uuid({ message: "اختر طريقة الدفع" }),
  sender_name: z.string().trim().min(2, "اسم المرسل قصير").max(120),
  sender_account: z.string().trim().max(120).optional(),
  transaction_reference: z.string().trim().max(80).optional(),
  payment_date: z.string().min(1, "تاريخ التحويل مطلوب"),
  amount: z.number().positive("المبلغ غير صالح"),
  receipt_path: z.string().min(1, "صورة السند مطلوبة"),
});

const TYPE_LABEL: Record<string, string> = {
  deposit: "شحن رصيد",
  subscription_payment: "دفع اشتراك",
  refund: "استرجاع",
  adjustment: "تسوية إدارية",
  manual_correction: "تصحيح يدوي",
  subscription_reversal: "إلغاء اشتراك",
  external_refund: "استرجاع خارجي",
};

const STATUS_LABEL: Record<string, string> = {
  active: "نشط",
  frozen: "مجمّد",
  closed: "مغلق",
};

const TOPUP_STATUS_LABEL: Record<string, string> = {
  submitted: "بانتظار المراجعة",
  under_review: "تحت المراجعة",
  credited: "تم شحن الرصيد",
  rejected: "مرفوض",
};

function topupStatusBadge(status: string) {
  if (status === "credited")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-3 w-3" />
        {TOPUP_STATUS_LABEL[status]}
      </span>
    );
  if (status === "rejected")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
        <XCircle className="h-3 w-3" />
        {TOPUP_STATUS_LABEL[status]}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
      <Clock className="h-3 w-3" />
      {TOPUP_STATUS_LABEL[status] ?? status}
    </span>
  );
}

function safeFilename(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  return base.slice(0, 80) || "receipt";
}

function WalletPage() {
  const { user, isAdmin, isContentManager } = useAuth();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isStaff = isAdmin || isContentManager;

  useEffect(() => {
    if (window.location.hash === "#topup") {
      document.getElementById("topup")?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  const [methodId, setMethodId] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderAccount, setSenderAccount] = useState("");
  const [txRef, setTxRef] = useState("");
  const [payDate, setPayDate] = useState("");
  const [amount, setAmount] = useState("");
  const [receiptPath, setReceiptPath] = useState("");
  const [uploading, setUploading] = useState(false);

  const wallet = useQuery({
    enabled: !!user && !isStaff,
    queryKey: ["my-wallet", user?.id],
    queryFn: async () => {
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
    enabled: !!user && !isStaff,
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

  const topups = useQuery({
    enabled: !!user && !isStaff,
    queryKey: ["my-wallet-topups", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wallet_topup_requests")
        .select(
          "id,amount,currency,status,created_at,reviewed_at,rejection_reason,admin_notes,method:payment_methods!wallet_topup_requests_payment_method_id_fkey(name)",
        )
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as TopupRequest[];
    },
  });

  const methodsQ = useQuery({
    enabled: !!user && !isStaff,
    queryKey: ["active-payment-methods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_methods")
        .select("id,name,account_name,account_number,details")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as PayMethod[];
    },
  });

  const scrollToTopup = () => {
    document.getElementById("topup")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!ALLOWED_MIME.includes(file.type)) {
      toast.error("نوع الملف غير مسموح. JPG / PNG / WEBP / PDF فقط.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`الحد الأقصى ${MAX_MB} ميغابايت.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploading(true);
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const clientId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const path = `${user.id}/wallet-topups/${clientId}/${safeFilename(file.name) || `receipt.${ext}`}`;

    const { error } = await supabase.storage
      .from("receipts")
      .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });

    setUploading(false);
    if (error) {
      toast.error("فشل رفع الإيصال: " + error.message);
      return;
    }
    setReceiptPath(path);
    toast.success("تم رفع الإيصال.");
  };

  const clearReceipt = () => {
    setReceiptPath("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submitTopup = useMutation({
    mutationFn: async () => {
      const parsed = topupSchema.safeParse({
        payment_method_id: methodId,
        sender_name: senderName,
        sender_account: senderAccount || undefined,
        transaction_reference: txRef || undefined,
        payment_date: payDate,
        amount: Number(amount),
        receipt_path: receiptPath,
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "بيانات غير صحيحة");
      }

      const { data, error } = await supabase.rpc("create_wallet_topup_request", {
        p_payment_method_id: parsed.data.payment_method_id,
        p_amount: parsed.data.amount,
        p_receipt_path: parsed.data.receipt_path,
        p_currency: wallet.data?.currency ?? "YER",
        p_sender_name: parsed.data.sender_name,
        p_sender_account: parsed.data.sender_account,
        p_transaction_reference: parsed.data.transaction_reference,
        p_payment_date: parsed.data.payment_date,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(
        "تم إرسال طلب الشحن للمراجعة. سيتم تحديث رصيدك بعد موافقة الإدارة.",
      );
      setMethodId("");
      setSenderName("");
      setSenderAccount("");
      setTxRef("");
      setPayDate("");
      setAmount("");
      clearReceipt();
      qc.invalidateQueries({ queryKey: ["my-wallet-topups"] });
    },
    onError: (e: Error) => {
      toast.error(e.message || "تعذّر إرسال طلب الشحن");
    },
  });

  if (isStaff) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
        <nav className="text-xs text-muted-foreground">
          <Link to="/app" className="hover:text-primary">
            الرئيسية
          </Link>
          <span className="mx-1">/</span>
          <span className="text-foreground">المحفظة</span>
        </nav>
        <StateMessage variant="error">
          هذه الصفحة مخصصة للطلاب فقط.
        </StateMessage>
      </div>
    );
  }

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
          رصيدك الحالي، طلبات الشحن، وسجل عمليات المحفظة.
        </p>
      </header>

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
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="gap-1"
              onClick={scrollToTopup}
            >
              <Plus className="h-4 w-4" />
              شحن الرصيد
            </Button>
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="gap-1 text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
            >
              <Link to="/subscription">
                <CreditCard className="h-4 w-4" />
                الاشتراك
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* Top-up form */}
      <section id="topup" className="scroll-mt-4 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">طلب شحن المحفظة</h2>
        <form
          className="rounded-2xl border border-border bg-card p-4 shadow-card space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submitTopup.mutate();
          }}
        >
          <section className="space-y-3">
            <Label className="text-sm font-semibold">طريقة الدفع</Label>
            <div className="space-y-2">
              {(methodsQ.data ?? []).map((m) => (
                <label
                  key={m.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                    methodId === m.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="method"
                    value={m.id}
                    checked={methodId === m.id}
                    onChange={() => setMethodId(m.id)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{m.name}</p>
                    {m.account_name && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        اسم الحساب: <span className="text-foreground">{m.account_name}</span>
                      </p>
                    )}
                    {m.account_number && (
                      <p className="text-xs text-muted-foreground mt-0.5" dir="ltr">
                        رقم الحساب: <span className="text-foreground">{m.account_number}</span>
                      </p>
                    )}
                    {m.details && (
                      <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-line">
                        {m.details}
                      </p>
                    )}
                  </div>
                </label>
              ))}
              {methodsQ.isLoading && (
                <StateMessage variant="loading">جارٍ تحميل طرق الدفع…</StateMessage>
              )}
              {!methodsQ.isLoading && (methodsQ.data ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">لا توجد طرق دفع متاحة.</p>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <Label className="text-sm font-semibold">بيانات الحوالة</Label>
            <div className="space-y-3">
              <div>
                <Label htmlFor="sender_name" className="text-xs">
                  اسم المرسل
                </Label>
                <Input
                  id="sender_name"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  maxLength={120}
                  placeholder="الاسم كما ظهر في الحوالة"
                  required
                />
              </div>
              <div>
                <Label htmlFor="sender_account" className="text-xs">
                  رقم/حساب المرسل (اختياري)
                </Label>
                <Input
                  id="sender_account"
                  value={senderAccount}
                  onChange={(e) => setSenderAccount(e.target.value)}
                  maxLength={120}
                  dir="ltr"
                  placeholder="رقم الحساب أو المحفظة"
                />
              </div>
              <div>
                <Label htmlFor="tx_ref" className="text-xs">
                  رقم العملية (اختياري)
                </Label>
                <Input
                  id="tx_ref"
                  value={txRef}
                  onChange={(e) => setTxRef(e.target.value)}
                  maxLength={80}
                  dir="ltr"
                  placeholder="TXN-..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="pay_date" className="text-xs">
                    تاريخ التحويل
                  </Label>
                  <Input
                    id="pay_date"
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="amount" className="text-xs">
                    المبلغ
                  </Label>
                  <Input
                    id="amount"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <Label className="text-sm font-semibold">إيصال التحويل</Label>
            {receiptPath ? (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
                <FileText className="h-4 w-4 shrink-0 text-primary" />
                <span className="flex-1 truncate text-xs text-muted-foreground" dir="ltr">
                  {receiptPath.split("/").pop()}
                </span>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={clearReceipt}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div
                onClick={() => !uploading && fileInputRef.current?.click()}
                className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border p-6 transition-colors hover:border-primary/50 hover:bg-muted/30"
              >
                {uploading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                ) : (
                  <Upload className="h-6 w-6 text-muted-foreground" />
                )}
                <span className="text-xs text-muted-foreground">
                  {uploading ? "جارٍ الرفع…" : "اضغط لرفع الإيصال (PDF/JPG/PNG، حتى 8MB)"}
                </span>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_MIME.join(",")}
              className="hidden"
              onChange={handleUpload}
            />
          </section>

          <Button
            type="submit"
            className="w-full gap-1"
            disabled={submitTopup.isPending || uploading || !receiptPath || !methodId}
          >
            {submitTopup.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            إرسال طلب الشحن
          </Button>
        </form>
      </section>

      {/* Top-up requests */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">طلبات الشحن</h2>
        {topups.isLoading ? (
          <StateMessage variant="loading">جارٍ تحميل الطلبات…</StateMessage>
        ) : topups.isError ? (
          <StateMessage variant="error">تعذّر تحميل طلبات الشحن.</StateMessage>
        ) : (topups.data ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            لا توجد طلبات شحن بعد.
          </div>
        ) : (
          <ul className="space-y-2">
            {(topups.data ?? []).map((r) => (
              <li
                key={r.id}
                className="rounded-2xl border border-border bg-card p-3 shadow-card space-y-2"
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {Number(r.amount).toLocaleString("ar-EG")} {r.currency}
                    </p>
                    {r.method?.name && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">{r.method.name}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {new Date(r.created_at).toLocaleString("ar-EG", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                  {topupStatusBadge(r.status)}
                </div>
                {r.reviewed_at && r.status !== "submitted" && (
                  <p className="text-[11px] text-muted-foreground">
                    آخر مراجعة:{" "}
                    {new Date(r.reviewed_at).toLocaleString("ar-EG", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </p>
                )}
                {r.status === "rejected" && r.rejection_reason && (
                  <p className="text-[11px] text-destructive">{r.rejection_reason}</p>
                )}
                {r.admin_notes && (
                  <p className="text-[11px] text-muted-foreground">ملاحظة: {r.admin_notes}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

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
