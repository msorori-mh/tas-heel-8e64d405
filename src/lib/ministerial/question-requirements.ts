/** Explicit references only: the word "shape" alone need not imply an image. */
export function refersToAttachedFigure(text: string): boolean {
  const plain = text
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/\s+/g, " ");
  return /(?:الشكل|الرسم(?: التوضيحي)?|الصورة|الجدول) (?:المرفق|التالي|المقابل|الموضح|أدناه)/.test(
    plain,
  );
}

export function assertQuestionFigure(text: string, hasQuestionImage: boolean, context: string) {
  if (!hasQuestionImage && refersToAttachedFigure(text)) {
    throw new Error(
      `${context}: يشير السؤال إلى شكل أو صورة مرفقة، لكن صورة السؤال غير محددة. أرفق الصورة قبل الاستيراد.`,
    );
  }
}
