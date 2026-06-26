/** Maps start_exam_session RPC errors to Arabic user messages. */
export function mapStartExamError(err: unknown): string {
  const msg =
    (err as { message?: string })?.message ??
    (err as { error?: { message?: string } })?.error?.message ??
    "";

  if (msg.includes("subscription_required")) {
    return "تحتاج إلى اشتراك نشط لبدء هذا الاختبار.";
  }
  if (msg.includes("curriculum_mismatch")) {
    return "هذا الاختبار غير متاح لمنهجك الحالي.";
  }
  if (msg.includes("grade_mismatch")) {
    return "هذا الاختبار غير متاح لصفك الدراسي.";
  }
  if (msg.includes("template_scope_missing")) {
    return "تعذر تحديد نطاق هذا الاختبار. يرجى التواصل مع الإدارة.";
  }
  if (msg.includes("template_inactive")) {
    return "هذا الاختبار غير متاح حالياً.";
  }
  return "تعذر بدء الاختبار حالياً. حاول لاحقاً.";
}
