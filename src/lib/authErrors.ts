// Phase 4.2 — Auth UX cleanup: translate common Supabase auth errors to Arabic.

const PATTERNS: Array<{ test: RegExp; message: string }> = [
  { test: /invalid login credentials/i, message: "بيانات الدخول غير صحيحة. تأكد من البريد/الهاتف وكلمة المرور." },
  { test: /email not confirmed/i, message: "لم يتم تأكيد بريدك الإلكتروني بعد. يرجى فتح رسالة التأكيد." },
  { test: /user already registered|already.*registered|user.*exists/i, message: "هذا الحساب مسجّل مسبقًا. سجّل دخولك بدلًا من إنشاء حساب جديد." },
  { test: /password should be at least.*(\d+).*characters?/i, message: "كلمة المرور قصيرة جدًا. استخدم 6 أحرف على الأقل." },
  { test: /password.*(at least|minimum)/i, message: "كلمة المرور قصيرة جدًا. استخدم 6 أحرف على الأقل." },
  { test: /signup requires a valid password/i, message: "كلمة المرور غير صالحة. استخدم 6 أحرف على الأقل." },
  { test: /weak[_ ]password/i, message: "كلمة المرور ضعيفة. استخدم مزيجًا أقوى وأطول." },
  { test: /unable to validate email address|invalid.*email/i, message: "صيغة البريد الإلكتروني غير صحيحة." },
  { test: /invalid.*phone|phone.*invalid/i, message: "رقم الهاتف غير صالح." },
  { test: /phone.*rate limit|sms.*rate limit/i, message: "تم إرسال عدة رموز خلال وقت قصير. حاول مرة أخرى بعد قليل." },
  { test: /email rate limit/i, message: "تم إرسال عدة رسائل خلال وقت قصير. حاول مرة أخرى بعد قليل." },
  { test: /rate limit/i, message: "محاولات كثيرة خلال وقت قصير. انتظر قليلًا ثم حاول من جديد." },
  { test: /token has expired or is invalid|otp.*expired|expired.*otp/i, message: "انتهت صلاحية الرمز. اطلب رمزًا جديدًا." },
  { test: /invalid token|invalid.*otp|otp.*invalid/i, message: "الرمز الذي أدخلته غير صحيح." },
  { test: /user not found/i, message: "لا يوجد حساب مرتبط بهذه البيانات." },
  { test: /new password should be different/i, message: "كلمة المرور الجديدة يجب أن تكون مختلفة عن الحالية." },
  { test: /network|failed to fetch/i, message: "تعذّر الاتصال بالخادم. تحقق من الإنترنت ثم حاول مجددًا." },
];

export function translateAuthError(err: unknown): string {
  const raw =
    (err && typeof err === "object" && "message" in err && typeof (err as any).message === "string"
      ? (err as any).message
      : typeof err === "string"
        ? err
        : "") || "";
  for (const { test, message } of PATTERNS) {
    if (test.test(raw)) return message;
  }
  return raw ? raw : "حدث خطأ غير متوقع. حاول مرة أخرى.";
}
