export function translateAuthError(error: unknown): string {
  if (!error) return "حدث خطأ غير متوقع";
  const msg = (error as { message?: string })?.message ?? String(error);
  const m = msg.toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials"))
    return "البريد الإلكتروني أو كلمة المرور غير صحيحة";
  if (m.includes("email not confirmed")) return "يجب تأكيد البريد الإلكتروني أولاً";
  if (m.includes("user already registered") || m.includes("already registered"))
    return "هذا البريد مسجّل مسبقاً، حاول تسجيل الدخول";
  if (m.includes("password should be at least") || m.includes("weak password"))
    return "كلمة المرور ضعيفة، استخدم 6 أحرف على الأقل";
  const wait = m.match(/after (\d+) seconds?/);
  if (m.includes("for security purposes") || wait)
    return wait
      ? `لأسباب أمنية، يمكنك المحاولة مرة أخرى بعد ${wait[1]} ثانية`
      : "لأسباب أمنية، حاول مرة أخرى بعد قليل";
  if (m.includes("rate limit") || m.includes("too many")) return "محاولات كثيرة، حاول بعد قليل";
  if (m.includes("network") || m.includes("fetch"))
    return "تعذّر الاتصال بالخادم، تحقّق من الإنترنت";
  if (m.includes("invalid email")) return "صيغة البريد غير صحيحة";
  if (m.includes("otp") || (m.includes("token") && m.includes("expired")))
    return "انتهت صلاحية الرابط، اطلب رابطاً جديداً";
  return msg;
}

export function getAuthRedirectUrl(path: string = "/auth/callback"): string {
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}
