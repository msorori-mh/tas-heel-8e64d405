import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { StateMessage } from "@/components/student/StudentNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, X, FileText, ArrowRight, Sparkles, Info } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { extractReceiptData, type ReceiptExtraction } from "@/lib/payments-ocr.functions";

export const Route = createFileRoute("/_authenticated/payments/new")({
  component: NewPaymentRequestPage,
});

type Plan = {
  id: string;
  name: string;
  duration_type: string;
  duration_months: number | null;
  price: number;
  currency: string;
};

type PayMethod = {
  id: string;
  type: string;
  name: string;
  account_name: string | null;
  account_number: string | null;
  details: string | null;
};

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_MB = 8;

const schema = z.object({
  plan_id: z.string().uuid({ message: "اختر الخطة" }),
  payment_method_id: z.string().uuid({ message: "اختر طريقة الدفع" }),
  sender_name: z.string().trim().min(2, "اسم المرسل قصير").max(120),
  transaction_reference: z.string().trim().min(2, "رقم العملية مطلوب").max(80),
  payment_date: z.string().min(1, "تاريخ التحويل مطلوب"),
  amount: z.number().positive("المبلغ غير صالح"),
  receipt_path: z.string().min(1, "صورة السند مطلوبة"),
});

function NewPaymentRequestPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [planId, setPlanId] = useState("");
  const [methodId, setMethodId] = useState("");
  const [senderName, setSenderName] = useState("");
  const [txRef, setTxRef] = useState("");
  const [payDate, setPayDate] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [receiptPath, setReceiptPath] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState<ReceiptExtraction | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const runOcr = useServerFn(extractReceiptData);

  const plansQ = useQuery({
    queryKey: ["active-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("id, name, duration_type, duration_months, price, currency")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });

  const methodsQ = useQuery({
    queryKey: ["active-payment-methods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_methods")
        .select("id, type, name, account_name, account_number, details")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as PayMethod[];
    },
  });

  const selectedPlan = plansQ.data?.find((p) => p.id === planId);
  const selectedMethod = methodsQ.data?.find((m) => m.id === methodId);

  useEffect(() => {
    if (selectedPlan && !amount) setAmount(String(selectedPlan.price));
  }, [selectedPlan, amount]);

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
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const path = `${user.id}/${id}.${ext}`;

    const { error } = await supabase.storage
      .from("receipts")
      .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });

    setUploading(false);
    if (error) {
      toast.error("فشل رفع الصورة: " + error.message);
      return;
    }
    setReceiptPath(path);
    toast.success("تم رفع السند.");
  };

  const clearReceipt = () => {
    setReceiptPath("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const parsed = schema.safeParse({
      plan_id: planId,
      payment_method_id: methodId,
      sender_name: senderName,
      transaction_reference: txRef,
      payment_date: payDate,
      amount: Number(amount),
      receipt_path: receiptPath,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "بيانات غير صحيحة");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from("payment_requests").insert({
      user_id: user.id,
      plan_id: parsed.data.plan_id,
      payment_method_id: parsed.data.payment_method_id,
      sender_name: parsed.data.sender_name,
      transaction_reference: parsed.data.transaction_reference,
      payment_date: parsed.data.payment_date,
      amount: parsed.data.amount,
      currency: selectedPlan?.currency ?? "YER",
      receipt_url: parsed.data.receipt_path,
      status: "pending",
    });
    setSubmitting(false);

    if (error) {
      toast.error("تعذّر إنشاء الطلب: " + error.message);
      return;
    }
    toast.success("تم إرسال الطلب، بانتظار المراجعة.");
    navigate({ to: "/payments" });
  };

  if (plansQ.isLoading || methodsQ.isLoading) {
    return <StateMessage variant="loading">جارٍ التحميل…</StateMessage>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      <nav className="text-xs text-muted-foreground">
        <Link to="/app" className="hover:text-primary">موادي</Link>
        <span className="mx-1">/</span>
        <Link to="/payments" className="hover:text-primary">طلباتي</Link>
        <span className="mx-1">/</span>
        <span className="text-foreground">رفع إيصال جديد</span>
      </nav>

      <header className="space-y-1">
        <h1 className="text-lg font-bold text-foreground">رفع إيصال دفع جديد</h1>
        <p className="text-xs text-muted-foreground">
          أرسل تفاصيل الحوالة وصورة السند، وستراجعها الإدارة قبل تفعيل اشتراكك.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Plan */}
        <section className="rounded-2xl border border-border bg-card p-4 shadow-card space-y-3">
          <Label className="text-sm font-semibold">الخطة</Label>
          <div className="space-y-2">
            {(plansQ.data ?? []).map((p) => (
              <label
                key={p.id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                  planId === p.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <input
                  type="radio"
                  name="plan"
                  value={p.id}
                  checked={planId === p.id}
                  onChange={() => setPlanId(p.id)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground">{p.name}</p>
                    <span className="text-sm font-bold text-primary">
                      {Number(p.price).toLocaleString("ar-EG")} {p.currency}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {p.duration_months ? `${p.duration_months} شهر` : p.duration_type}
                  </p>
                </div>
              </label>
            ))}
            {(plansQ.data ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">لا توجد خطط متاحة حاليًا.</p>
            )}
          </div>
        </section>

        {/* Method */}
        <section className="rounded-2xl border border-border bg-card p-4 shadow-card space-y-3">
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
            {(methodsQ.data ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">لا توجد طرق دفع متاحة.</p>
            )}
          </div>
        </section>

        {/* Transfer details */}
        <section className="rounded-2xl border border-border bg-card p-4 shadow-card space-y-3">
          <Label className="text-sm font-semibold">بيانات الحوالة</Label>
          <div className="space-y-3">
            <div>
              <Label htmlFor="sender_name" className="text-xs">اسم المرسل</Label>
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
              <Label htmlFor="tx_ref" className="text-xs">رقم العملية</Label>
              <Input
                id="tx_ref"
                value={txRef}
                onChange={(e) => setTxRef(e.target.value)}
                maxLength={80}
                dir="ltr"
                placeholder="TXN-..."
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="pay_date" className="text-xs">تاريخ التحويل</Label>
                <Input
                  id="pay_date"
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="amount" className="text-xs">المبلغ</Label>
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

        {/* Receipt upload */}
        <section className="rounded-2xl border border-border bg-card p-4 shadow-card space-y-3">
          <Label className="text-sm font-semibold">صورة السند</Label>
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
                {uploading ? "جارٍ الرفع…" : "اضغط لرفع صورة السند (PDF/JPG/PNG، حتى 8MB)"}
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

        <div className="flex items-center gap-2">
          <Button
            type="submit"
            disabled={submitting || uploading || !receiptPath || !planId || !methodId}
            className="flex-1 gap-1"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            إرسال الطلب
          </Button>
          <Button asChild type="button" variant="outline">
            <Link to="/payments">
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
