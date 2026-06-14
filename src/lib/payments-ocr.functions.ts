import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  imageBase64: z.string().min(32).max(12_000_000), // ~9MB base64
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

export type ReceiptExtraction = {
  sender_name: string | null;
  transaction_number: string | null;
  amount: number | null;
  transfer_date: string | null; // ISO YYYY-MM-DD
  confidence: {
    sender_name: number;
    transaction_number: number;
    amount: number;
    transfer_date: number;
  };
};

const SYSTEM_PROMPT = `أنت مساعد لقراءة سندات الحوالات المالية اليمنية (الكريمي، الحساب البنكي، الصرافات…).
استخرج البيانات التالية من صورة السند:
- sender_name: اسم المرسل كما يظهر في السند (نص عربي مسموح).
- transaction_number: الرقم المرجعي للعملية / رقم الإيصال (أرقام/حروف لاتينية فقط).
- amount: المبلغ كرقم عشري (بدون فواصل أو رمز عملة).
- transfer_date: تاريخ التحويل بصيغة YYYY-MM-DD. حوّل أي تاريخ هجري إلى ميلادي إن أمكن، وإلا اتركه null.
- confidence: ثقتك في كل حقل من 0 إلى 1.

أرجع JSON فقط بهذا الشكل بالضبط:
{"sender_name": string|null, "transaction_number": string|null, "amount": number|null, "transfer_date": string|null,
"confidence": {"sender_name": number, "transaction_number": number, "amount": number, "transfer_date": number}}

إذا لم تكن متأكدًا من حقل ضع قيمته null وثقته أقل من 0.5. لا تخمّن. لا تضف نصًا خارج JSON.`;

export const extractReceiptData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }): Promise<ReceiptExtraction> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const dataUrl = `data:${data.mimeType};base64,${data.imageBase64}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "استخرج بيانات هذا السند:" },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      if (res.status === 429) throw new Error("rate_limited");
      if (res.status === 402) throw new Error("credits_exhausted");
      throw new Error(`gateway_error_${res.status}`);
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Try to find a JSON object in the content
      const match = content.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : {};
    }

    const num = (v: unknown): number => {
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
    };
    const str = (v: unknown): string | null => {
      if (typeof v !== "string") return null;
      const t = v.trim();
      return t.length > 0 ? t.slice(0, 200) : null;
    };
    const amt = (v: unknown): number | null => {
      if (v == null) return null;
      const n = typeof v === "number" ? v : Number(String(v).replace(/[,\s]/g, ""));
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const date = (v: unknown): string | null => {
      const s = str(v);
      if (!s) return null;
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
    };

    const conf = parsed?.confidence ?? {};
    return {
      sender_name: str(parsed?.sender_name),
      transaction_number: str(parsed?.transaction_number),
      amount: amt(parsed?.amount),
      transfer_date: date(parsed?.transfer_date),
      confidence: {
        sender_name: num(conf.sender_name),
        transaction_number: num(conf.transaction_number),
        amount: num(conf.amount),
        transfer_date: num(conf.transfer_date),
      },
    };
  });
