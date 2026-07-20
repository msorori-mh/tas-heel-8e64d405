export type RevealableQuestion = {
  correct_index?: number | null;
  explanation?: string | null;
};

/**
 * Defense in depth for exam payloads. The RPC remains responsible for not
 * returning answers before submission; this prevents accidental UI exposure.
 */
export function redactExamAnswers<T extends RevealableQuestion>(
  questions: readonly T[],
  reveal: boolean,
): T[] {
  if (reveal) return questions.map((question) => ({ ...question }));
  return questions.map((question) => ({
    ...question,
    correct_index: null,
    explanation: null,
  }));
}

export function safeExamMutationMessage(error: unknown, action: "answer" | "submit"): string {
  const online = typeof navigator === "undefined" ? true : navigator.onLine !== false;
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String((error as { message?: unknown })?.message ?? "").toLowerCase();
  const networkFailure =
    !online ||
    message.includes("fetch") ||
    message.includes("network") ||
    message.includes("offline") ||
    message.includes("timeout");

  if (networkFailure) {
    return action === "answer"
      ? "انقطع الاتصال ولم تُحفظ الإجابة. تحقق من الشبكة ثم أعد اختيارها."
      : "انقطع الاتصال ولم نتأكد من تسليم الاختبار. بعد عودة الاتصال حدّث الصفحة للتحقق من حالة الجلسة قبل أي محاولة أخرى.";
  }
  return action === "answer"
    ? "تعذر حفظ الإجابة. حاول مرة أخرى."
    : "تعذر تسليم الاختبار. حاول مرة أخرى.";
}

/** Synchronous guard: blocks a second click before React updates pending state. */
export function createSingleFlightGuard() {
  let active = false;
  return {
    enter() {
      if (active) return false;
      active = true;
      return true;
    },
    leave() {
      active = false;
    },
    isActive() {
      return active;
    },
  };
}

export function canRetryAfterServerReconciliation(result: unknown): boolean {
  return (
    (result as { status?: unknown } | null)?.status === "success" &&
    (result as { data?: { session?: { status?: unknown } } } | null)?.data?.session?.status ===
      "in_progress"
  );
}
