/** Keep server diagnostics bounded and separate from private response bodies. */
export class OfflineDownloadError extends Error {
  constructor(
    message: string,
    readonly serverCode?: string,
  ) {
    super(message);
    this.name = "OfflineDownloadError";
  }
}

export async function offlineResponseError(response: Response, prefix: string): Promise<Error> {
  let serverCode: string | undefined;
  if (response.headers.get("content-type")?.includes("application/json")) {
    try {
      const payload = await response.json();
      if (
        typeof payload?.error === "string" &&
        /^[a-zA-Z][a-zA-Z0-9_]{0,79}$/.test(payload.error)
      ) {
        serverCode = payload.error;
      }
    } catch {
      /* A proxy may return a non-JSON error page. */
    }
  }
  return new OfflineDownloadError(`${prefix}_${response.status}`, serverCode);
}

function errorGuidance(failure: unknown): string {
  const code = failure instanceof Error ? failure.message : "";
  const serverCode = failure instanceof OfflineDownloadError ? failure.serverCode : "";
  const saved = " الملفات المكتملة محفوظة.";
  if (
    code === "OFFLINE_INSUFFICIENT_STORAGE" ||
    (failure instanceof Error && failure.name === "QuotaExceededError")
  )
    return "المساحة المتاحة لا تكفي. حرّر مساحة ثم استكمل التنزيل." + saved;
  if (/OFFLINE_(OWNER_CHANGED|UNAUTHENTICATED)$/.test(code) || /_(FETCH|DOWNLOAD)_401$/.test(code))
    return "تغيّرت جلسة الحساب أو انتهت. أعد تسجيل الدخول بالحساب نفسه ثم استكمل التنزيل." + saved;
  if (serverCode?.includes("MISCONFIGURED") || serverCode === "server_misconfigured")
    return "خدمة تنزيل المحتوى غير مهيأة على الخادم. يلزم إصلاح الخدمة قبل إعادة المحاولة." + saved;
  if (/_(FETCH|DOWNLOAD)_(429|502|503|504)$/.test(code))
    return "خادم التنزيل مشغول أو غير متاح مؤقتًا. حاول الاستكمال بعد قليل." + saved;
  if (/_(FETCH|DOWNLOAD)_500$/.test(code))
    return "تعذّر تجهيز المحتوى على الخادم. حاول مجددًا؛ إذا استمرت المشكلة أبلغ الدعم." + saved;
  if (/_(FETCH|DOWNLOAD)_(403|404)$/.test(code))
    return "أحد الملفات لم يعد متاحًا للتنزيل بحسابك. حدّث قائمة المحتوى ثم حاول مجددًا." + saved;
  if (/_(FETCH|DOWNLOAD)_409$/.test(code) || /^OFFLINE_ARTIFACT_(HASH|SIZE)_MISMATCH$/.test(code))
    return (
      "تغيّر المحتوى أو لم يطابق الملف النسخة المطلوبة. حدّث قائمة المحتوى ثم استكمل التنزيل." +
      saved
    );
  if (code === "OFFLINE_METADATA_TIMEOUT")
    return "استغرق تجهيز قائمة المحتوى وقتًا طويلًا. أعد المحاولة عند استقرار الاتصال." + saved;
  if (code === "OFFLINE_ARTIFACT_PERSISTENCE_FAILED" || /^OFFLINE_IDB_/.test(code))
    return "تعذّر حفظ الملف على الجهاز. أعد فتح التطبيق وتحقق من المساحة المتاحة." + saved;
  return "تعذّر إكمال التنزيل. تحقق من الاتصال ثم حاول الاستكمال." + saved;
}

/** A bounded support code helps report failures without exposing response bodies or account data. */
export function offlineDownloadErrorMessage(failure: unknown): string {
  const code = failure instanceof Error ? failure.message : "";
  const diagnostic = /^OFFLINE_[A-Z0-9_]{1,72}$/.test(code) ? code : "";
  const serverCode = failure instanceof OfflineDownloadError ? failure.serverCode : undefined;
  const safeServerCode =
    serverCode && /^[a-zA-Z][a-zA-Z0-9_]{0,79}$/.test(serverCode) ? serverCode : "";
  const details = [diagnostic, safeServerCode].filter(Boolean).join(" / ");
  return errorGuidance(failure) + (details ? ` رمز المشكلة: ${details}` : "");
}
