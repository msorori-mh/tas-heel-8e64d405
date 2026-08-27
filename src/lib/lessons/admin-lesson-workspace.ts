export type AdminQuestionContentRole = "OFFICIAL_BOOK_QUESTION" | "SELF_TEST";

function parseAdminQuestionContentRole(value: unknown): AdminQuestionContentRole | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized === "OFFICIAL_BOOK_QUESTION" || normalized === "SELF_TEST" ? normalized : null;
}

export interface AdminLessonQuestionRow {
  id: string;
  question_type: string | null;
  current_published_revision_id: string | null;
}

export interface AdminLessonQuestionRevisionRow {
  id: string;
  question_id: string;
  educational_label: string | null;
  status: string | null;
  revision_number: number | null;
  interaction_type: string | null;
  grading_mode: string | null;
}

export interface AdminQuestionRoleSummary {
  count: number;
  publishedCount: number;
  types: Record<string, number>;
}

export interface AdminLessonQuestionSummary {
  officialBook: AdminQuestionRoleSummary;
  selfTest: AdminQuestionRoleSummary;
  unclassifiedCount: number;
  invalidSelfTestCount: number;
}

const EMPTY_ROLE = (): AdminQuestionRoleSummary => ({ count: 0, publishedCount: 0, types: {} });

function isNewerRevision(
  candidate: AdminLessonQuestionRevisionRow,
  current: AdminLessonQuestionRevisionRow | undefined,
): boolean {
  if (!current) return true;
  const candidateNumber = candidate.revision_number ?? -1;
  const currentNumber = current.revision_number ?? -1;
  return (
    candidateNumber > currentNumber ||
    (candidateNumber === currentNumber && candidate.id.localeCompare(current.id) > 0)
  );
}

/**
 * Admin truth view for the two question capabilities.
 *
 * Classification is based only on the latest explicit educational role. A
 * multiple-choice official book question must never be inferred as SELF_TEST.
 */
export function summarizeAdminLessonQuestions(
  questions: readonly AdminLessonQuestionRow[],
  revisions: readonly AdminLessonQuestionRevisionRow[],
): AdminLessonQuestionSummary {
  const latestByQuestion = new Map<string, AdminLessonQuestionRevisionRow>();
  const revisionById = new Map<string, AdminLessonQuestionRevisionRow>();
  for (const revision of revisions) {
    revisionById.set(revision.id, revision);
    const current = latestByQuestion.get(revision.question_id);
    if (isNewerRevision(revision, current)) latestByQuestion.set(revision.question_id, revision);
  }

  const result: AdminLessonQuestionSummary = {
    officialBook: EMPTY_ROLE(),
    selfTest: EMPTY_ROLE(),
    unclassifiedCount: 0,
    invalidSelfTestCount: 0,
  };

  for (const question of questions) {
    const revision = latestByQuestion.get(question.id);
    const role = parseAdminQuestionContentRole(revision?.educational_label);
    if (!revision || !role) {
      result.unclassifiedCount += 1;
      continue;
    }

    if (
      role === "SELF_TEST" &&
      (revision.interaction_type !== "SINGLE_CHOICE" || revision.grading_mode !== "AUTO_SINGLE")
    ) {
      result.invalidSelfTestCount += 1;
      continue;
    }

    const target = role === "OFFICIAL_BOOK_QUESTION" ? result.officialBook : result.selfTest;
    const type = question.question_type?.trim() || revision.interaction_type?.trim() || "—";
    target.count += 1;
    target.types[type] = (target.types[type] ?? 0) + 1;
  }

  for (const question of questions) {
    if (!question.current_published_revision_id) continue;
    const published = revisionById.get(question.current_published_revision_id);
    if (!published || published.status?.toUpperCase() !== "PUBLISHED") continue;
    const role = parseAdminQuestionContentRole(published.educational_label);
    if (role === "OFFICIAL_BOOK_QUESTION") result.officialBook.publishedCount += 1;
    if (role === "SELF_TEST") result.selfTest.publishedCount += 1;
  }

  return result;
}

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

/** Safe text-only preview for authored HTML; never renders operator HTML. */
export function htmlPreviewText(value: string | null | undefined, maxLength = 200): string {
  if (!value) return "";
  const text = value
    .replace(/<(script|style|template|head)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_entity, code: string) => {
      const point = code.toLowerCase().startsWith("x")
        ? Number.parseInt(code.slice(1), 16)
        : Number.parseInt(code, 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : " ";
    })
    .replace(/&([a-z]+);/gi, (_entity, name: string) => HTML_ENTITIES[name.toLowerCase()] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;
}

export const QUESTION_TYPE_LABEL_AR: Record<string, string> = {
  MULTIPLE_CHOICE: "اختيار من متعدد",
  multiple_choice: "اختيار من متعدد",
  SINGLE_CHOICE: "اختيار واحد",
  TRUE_FALSE: "صح أو خطأ",
  SHORT_TEXT: "إجابة قصيرة",
  EXTENDED_RESPONSE: "إجابة مطولة",
  MATCHING: "مطابقة",
  FILL_BLANK: "إكمال الفراغ",
};

export function questionTypeLabelAr(type: string): string {
  return QUESTION_TYPE_LABEL_AR[type] ?? type;
}

export function questionRoleLabelAr(role: AdminQuestionContentRole): string {
  return role === "OFFICIAL_BOOK_QUESTION" ? "أسئلة الكتاب" : "اختبر فهمك";
}
