export type QuestionPreviewCapability = "officialBookQuestions" | "selfTest";

export interface QuestionPreviewRow {
  code: string;
  text: string;
  interactionType: string;
  options: string[];
  image?: unknown;
  correctIndex: number | null;
  modelAnswer: string;
  explanation: string;
  gradingMode: string;
  acceptedAnswers: string[];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Join the validated public artifact with admin-local answers without changing either. */
export function buildQuestionPreview(
  capability: QuestionPreviewCapability,
  payload: unknown,
  answers: ReadonlyArray<Record<string, unknown>>,
): QuestionPreviewRow[] {
  const source = record(payload);
  if (
    source.capability !== capability ||
    !Array.isArray(source.questions) ||
    !source.questions.length
  )
    throw new Error("ملف المعاينة لا يحتوي أسئلة صالحة لهذا المكوّن. أعد اختيار ملف Excel.");
  const byCode = new Map(
    answers
      .filter((answer) => answer.capability === capability)
      .map((answer) => [text(answer.question_id).trim().toUpperCase(), answer]),
  );
  return source.questions.map((value) => {
    const question = record(value);
    const code = text(question.question_code || question.id);
    const body = text(question.question_text || question.question);
    if (
      !code ||
      !body ||
      !Array.isArray(question.options) ||
      question.options.some((option) => typeof option !== "string")
    )
      throw new Error("بنية سؤال المعاينة غير صالحة. أعد اختيار ملف Excel.");
    const options = question.options as string[];
    const answer = byCode.get(code.trim().toUpperCase());
    const correctIndex = answer?.correct_index;
    return {
      code,
      text: body,
      interactionType: text(question.interaction_type) || "SINGLE_CHOICE",
      options,
      image: question.question_image,
      // Workbook indices are one-based. Never infer correctness from option order.
      correctIndex:
        typeof correctIndex === "number" &&
        Number.isInteger(correctIndex) &&
        correctIndex >= 1 &&
        correctIndex <= options.length
          ? correctIndex
          : null,
      modelAnswer: text(answer?.model_answer),
      explanation: text(answer?.explanation),
      gradingMode: text(answer?.grading_mode),
      acceptedAnswers: Array.isArray(answer?.accepted_answers)
        ? answer.accepted_answers.filter((entry): entry is string => typeof entry === "string")
        : [],
    };
  });
}
