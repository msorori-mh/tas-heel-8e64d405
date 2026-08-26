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
import { FREE_ACCESS_SHORT, STUDENT_FREE_ACCESS } from "@/lib/student-free-access";

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

async function ensurePendingSubscription(
  userId: string,
  planId: string,
  gradeId: string | null,
): Promise<string | null> {
  const { data: existing, error: findErr } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("plan_id", planId)
    .eq("status", "pending")
    .maybeSingle();

  if (findErr) return null;
  if (existing?.id) return existing.id;

  const { data: created, error: insertErr } = await supabase
    .from("subscriptions")
    .insert({
      user_id: userId,
      plan_id: planId,
      grade_id: gradeId,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertErr || !created?.id) return null;
  return created.id;
}

function NewPaymentRequestPage() {
  const { user, profile } = useAuth();
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

    // Auto-extract receipt fields (images only; PDFs skipped).
    const ocrMime = file.type as "image/jpeg" | "image/png" | "image/webp";
    if (ocrMime === "image/jpeg" || ocrMime === "image/png" || ocrMime === "image/webp") {
      setOcrResult(null);
      setOcrError(null);
      setOcrLoading(true);
      try {
        const base64 = await fileToBase64(file);
        const result = await runOcr({ data: { imageBase64: base64, mimeType: ocrMime } });
        setOcrResult(result);
        applyExtractionToForm(result);
      } catch {
        setOcrError("تعذر قراءة بيانات السند تلقائيًا، يمكنك إدخالها يدويًا.");
      } finally {
        setOcrLoading(false);
      }
    }
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const out = String(reader.result ?? "");
        const idx = out.indexOf(",");
        resolve(idx >= 0 ? out.slice(idx + 1) : out);
      };
      reader.onerror = () => reject(new Error("read_failed"));
      reader.readAsDataURL(file);
    });

  const MIN_CONF = 0.5;

  const applyExtractionToForm = (r: ReceiptExtraction) => {
    if (r.sender_name && r.confidence.sender_name >= MIN_CONF && senderName.trim().length === 0) {
      setSenderName(r.sender_name);
    }
    if (
      r.transaction_number &&
      r.confidence.transaction_number >= MIN_CONF &&
      txRef.trim().length === 0
    ) {
      setTxRef(r.transaction_number);
    }
    if (
      r.amount != null &&
      r.confidence.amount >= MIN_CONF &&
      (amount === "" || amount === String(selectedPlan?.price ?? ""))
    ) {
      setAmount(String(r.amount));
    }
    if (r.transfer_date && r.confidence.transfer_date >= MIN_CONF && payDate.trim().length === 0) {
      setPayDate(r.transfer_date);
    }
  };

  const clearReceipt = () => {
    setReceiptPath("");
    setOcrResult(null);
    setOcrError(null);
    setOcrLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!planId) {
      toast.error("تعذر إنشاء طلب الدفع لأن الخطة أو الاشتراك غير محدد.");
      return;
    }

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

    // Soft check: amount must cover the selected plan's price (server is source of truth)
    if (selectedPlan && Number(parsed.data.amount) < Number(selectedPlan.price)) {
      toast.error(
        `المبلغ المُدخل أقل من سعر الخطة (${Number(selectedPlan.price).toLocaleString("ar-EG")} ${selectedPlan.currency}).`,
      );
      return;
    }

    const gradeKey = profile?.grade_uuid ?? (profile?.grade_id ? String(profile.grade_id) : null);

    setSubmitting(true);
    const subscriptionId = await ensurePendingSubscription(user.id, parsed.data.plan_id, gradeKey);
    if (!subscriptionId) {
      setSubmitting(false);
      toast.error("تعذر إنشاء طلب الدفع لأن الخطة أو الاشتراك غير محدد.");
      return;
    }

    const { error } = await supabase.from("payment_requests").insert({
      user_id: user.id,
      plan_id: parsed.data.plan_id,
      subscription_id: subscriptionId,
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
      // Friendly mapping for the DB-level uniqueness guards (Mufadhala-style fraud protection)
      const code = (error as { code?: string }).code;
      const msg = error.message || "";
      if (code === "23505") {
        if (msg.includes("transaction_reference")) {
          toast.error("رقم العملية مستخدم سابقًا لنفس طريقة الدفع. تأكد من الرقم.");
        } else if (msg.includes("receipt_hash")) {
          toast.error("هذه الصورة مرفوعة مسبقًا في طلب آخر. ارفع صورة مختلفة.");
        } else {
          toast.error("الطلب مكرّر، يرجى مراجعة البيانات.");
        }
      } else {
        toast.error("تعذّر إنشاء الطلب: " + msg);
      }
      return;
    }
    toast.success("تم إرسال الطلب، بانتظار المراجعة.");
    navigate({ to: "/payments" });
  };

  if (STUDENT_FREE_ACCESS) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-4" dir="rtl">
        <nav className="text-xs text-muted-foreground">
          <Link to="/app" className="hover:text-primary">
            موادي
          </Link>
          <span className="mx-1">/</span>
          <span className="text-foreground">الدفع</span>
        </nav>
        <header>
          <h1 className="text-lg font-bold text-foreground">رفع إيصال</h1>
        </header>
        <div className="rounded-2xl border border-border bg-muted/30 p-5 text-sm leading-relaxed text-foreground">
          {FREE_ACCESS_SHORT}
        </div>
        <Button asChild>
          <Link to="/app">العودة إلى موادي</Link>
        </Button>
      </div>
    );
  }

  if (plansQ.isLoading || methodsQ.isLoading) {
    return <StateMessage variant="loading">جارٍ التحميل…</StateMessage>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      <nav className="text-xs text-muted-foreground">
        <Link to="/app" className="hover:text-primary">
          موادي
        </Link>
        <span className="mx-1">/</span>
        <Link to="/payments" className="hover:text-primary">
          طلباتي
        </Link>
        <span className="mx-1">/</span>
        <span className="text-foreground">رفع إيصال جديد</span>
      </nav>

      <header className="space-y-1">
        <h1 className="text-lg font-bold text-foreground">رفع إيصال دفع جديد</h1>
        <p className="text-xs text-muted-foreground">
          مسار قديم — لشحن المحفظة استخدم{" "}
          <Link to="/wallet" hash="topup" className="text-primary hover:underline">
            صفحة المحفظة
          </Link>
          . هذا النموذج يرسل طلب دفع مرتبطاً باشتراك (legacy).
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
              <Label htmlFor="tx_ref" className="text-xs">
                رقم العملية
              </Label>
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

        {/* Receipt upload */}
        <section className="rounded-2xl border border-border bg-card p-4 shadow-card space-y-3">
          <Label className="text-sm font-semibold">صورة السند</Label>
          {receiptPath ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              <span className="flex-1 truncate text-xs text-muted-foreground" dir="ltr">
                {receiptPath.split("/").pop()}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={clearReceipt}
              >
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

          {/* OCR disclosure notice */}
          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              قد يتم تحليل صورة السند آليًا لاستخراج بيانات الحوالة وتعبئتها تلقائيًا. يرجى مراجعة
              البيانات والتأكد من صحتها قبل إرسال الطلب.
            </p>
          </div>

          {ocrLoading && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              جارٍ قراءة بيانات السند…
            </div>
          )}

          {ocrError && !ocrLoading && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{ocrError}</span>
            </div>
          )}

          {ocrResult && !ocrLoading && (
            <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                <Sparkles className="h-4 w-4" />
                البيانات المقروءة من السند:
              </div>
              <ul className="space-y-1 text-xs text-foreground">
                <li>
                  اسم المرسل: <span className="font-medium">{ocrResult.sender_name ?? "—"}</span>
                </li>
                <li>
                  رقم العملية:{" "}
                  <span className="font-medium" dir="ltr">
                    {ocrResult.transaction_number ?? "—"}
                  </span>
                </li>
                <li>
                  المبلغ:{" "}
                  <span className="font-medium">
                    {ocrResult.amount != null
                      ? Number(ocrResult.amount).toLocaleString("ar-EG")
                      : "—"}
                  </span>
                </li>
                <li>
                  التاريخ: <span className="font-medium">{ocrResult.transfer_date ?? "—"}</span>
                </li>
              </ul>
              <p className="rounded-md bg-background/60 p-2 text-[11px] leading-relaxed text-muted-foreground">
                تم استخراج البيانات تلقائيًا، يرجى مراجعتها قبل الإرسال.
                {(ocrResult.confidence.sender_name < MIN_CONF ||
                  ocrResult.confidence.transaction_number < MIN_CONF ||
                  ocrResult.confidence.amount < MIN_CONF ||
                  ocrResult.confidence.transfer_date < MIN_CONF) && (
                  <> لم نتمكن من قراءة كل البيانات بدقة، يرجى إكمالها يدويًا.</>
                )}
              </p>
            </div>
          )}
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
