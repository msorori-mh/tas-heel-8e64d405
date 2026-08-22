import type { GoldenCapability } from "./golden-lesson-contract.ts";
import {
  validateHtmlAgainstProfile,
  type HtmlProfile,
} from "../lessons/html-content-standard.ts";

export type GoldenArtifactFormat = "HTML" | "JSON";

export interface GoldenArtifactFileContract {
  formats: readonly GoldenArtifactFormat[];
  extensions: readonly string[];
  accept: string;
  expectedAr: string;
}

export interface GoldenArtifactFileFinding {
  code: string;
  messageAr: string;
}

export interface GoldenArtifactFileValidation {
  valid: boolean;
  findings: GoldenArtifactFileFinding[];
}

export const GOLDEN_ARTIFACT_FILE_CONTRACTS: Record<GoldenCapability, GoldenArtifactFileContract> = {
  officialBookContent: {
    formats: ["HTML", "JSON"],
    extensions: [".html", ".json"],
    accept: ".html,.json,text/html,application/json",
    expectedAr: "HTML أو JSON للمحتوى الرسمي فقط",
  },
  tamkeenExplanationHtml: {
    formats: ["HTML"],
    extensions: [".html"],
    accept: ".html,text/html",
    expectedAr: "ملف HTML ثابت للشرح",
  },
  lessonSummaryHtml: {
    formats: ["HTML"],
    extensions: [".html"],
    accept: ".html,text/html",
    expectedAr: "ملف HTML ثابت للملخص",
  },
  mindMapHtml: {
    formats: ["HTML"],
    extensions: [".html"],
    accept: ".html,text/html",
    expectedAr: "ملف HTML ثابت للخريطة الذهنية",
  },
  labExperimentHtml: {
    formats: ["HTML"],
    extensions: [".html"],
    accept: ".html,text/html",
    expectedAr: "ملف HTML تفاعلي للتجربة أو النشاط",
  },
  officialBookQuestions: {
    formats: ["JSON"],
    extensions: [".json"],
    accept: ".json,application/json",
    expectedAr: "JSON لأسئلة الكتاب الأصلية مع الإجابات النموذجية",
  },
  selfTest: {
    formats: ["JSON"],
    extensions: [".json"],
    accept: ".json,application/json",
    expectedAr: "JSON لاختبر فهمك مع الإجابة الصحيحة والشرح",
  },
};

function extensionOf(path: string): string {
  const normalized = path.trim().toLocaleLowerCase("en-US");
  const index = normalized.lastIndexOf(".");
  return index >= 0 ? normalized.slice(index) : "";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function questionsFrom(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (isPlainRecord(value) && Array.isArray(value.questions)) return value.questions;
  return null;
}

function questionText(question: Record<string, unknown>): unknown {
  return question.question_text ?? question.official_text ?? question.question ?? question.prompt ?? question.text;
}

function correctAnswer(question: Record<string, unknown>): unknown {
  return question.correct_index ?? question.correctIndex ?? question.correct_option_id ??
    question.correctOptionId ?? question.correct_option ?? question.correctOption ??
    question.correct_answer ?? question.correctAnswer ?? question.answer;
}

function questionId(question: Record<string, unknown>): string | null {
  const value = question.id ?? question.question_id ?? question.questionId ?? question.question_code ??
    question.questionCode ?? question.question_number ?? question.questionNumber;
  return typeof value === "string" || typeof value === "number" ? String(value).trim() || null : null;
}

function validateJsonCapability(
  capability: GoldenCapability,
  value: unknown,
  findings: GoldenArtifactFileFinding[],
): void {
  if (isPlainRecord(value) && nonEmptyString(value.capability) && value.capability !== capability) {
    findings.push({
      code: "ARTIFACT_CAPABILITY_MISMATCH",
      messageAr: `الملف يعرّف نفسه للقدرة ${String(value.capability)} وليس ${capability}.`,
    });
  }

  if (capability === "officialBookContent") {
    if (!isPlainRecord(value) && !Array.isArray(value)) {
      findings.push({ code: "OFFICIAL_CONTENT_JSON_SHAPE_INVALID", messageAr: "بنية محتوى الكتاب JSON غير صالحة." });
    } else if (Array.isArray(value) && value.length === 0) {
      findings.push({ code: "OFFICIAL_CONTENT_JSON_EMPTY", messageAr: "محتوى الكتاب JSON فارغ." });
    } else if (isPlainRecord(value) && Object.keys(value).length === 0) {
      findings.push({ code: "OFFICIAL_CONTENT_JSON_EMPTY", messageAr: "محتوى الكتاب JSON فارغ." });
    }
    return;
  }

  const questions = questionsFrom(value);
  if (!questions?.length) {
    findings.push({ code: "QUESTIONS_ARRAY_MISSING", messageAr: "الملف يجب أن يحتوي مصفوفة questions غير فارغة." });
    return;
  }

  questions.forEach((entry, index) => {
    if (!isPlainRecord(entry)) {
      findings.push({ code: "QUESTION_SHAPE_INVALID", messageAr: `السؤال رقم ${index + 1} ليس كائن JSON صالحًا.` });
      return;
    }
    if (!nonEmptyString(questionText(entry))) {
      findings.push({ code: "QUESTION_TEXT_MISSING", messageAr: `نص السؤال رقم ${index + 1} مفقود.` });
    }
    if (!questionId(entry)) {
      findings.push({ code: "QUESTION_ID_MISSING", messageAr: `معرّف السؤال رقم ${index + 1} مفقود.` });
    }
    if (capability === "officialBookQuestions") {
      return;
    }

    const options = entry.options;
    if (!Array.isArray(options) || options.filter(nonEmptyString).length < 2) {
      findings.push({ code: "SELF_TEST_OPTIONS_MISSING", messageAr: `السؤال رقم ${index + 1} يحتاج خيارين على الأقل.` });
    }
    if (correctAnswer(entry) !== undefined || entry.explanation !== undefined || entry.rationale !== undefined) {
      findings.push({
        code: "ANSWER_LEAKAGE_DETECTED",
        messageAr: `إجابة السؤال رقم ${index + 1} يجب أن تكون في الملف الخادمي المنفصل.`,
      });
    }
  });
}

interface QuestionAnswerRequirement {
  capability: "officialBookQuestions" | "selfTest";
  questionId: string;
}

function answerRequirements(
  capability: GoldenCapability,
  fileName: string,
  bytes: Uint8Array,
): QuestionAnswerRequirement[] {
  if (capability !== "officialBookQuestions" && capability !== "selfTest") return [];
  if (extensionOf(fileName) !== ".json") return [];
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    return [];
  }
  const questions = questionsFrom(value) ?? [];
  return questions.flatMap((entry) => {
    if (!isPlainRecord(entry)) return [];
    const id = questionId(entry);
    return id ? [{ capability, questionId: id }] : [];
  });
}

function companionAnswers(value: unknown): Array<Record<string, unknown> & { capability: string }> {
  if (!isPlainRecord(value) || !Array.isArray(value.answers)) return [];
  const topCapability = nonEmptyString(value.capability) ? String(value.capability) : "";
  return value.answers.flatMap((entry) => {
    if (!isPlainRecord(entry)) return [];
    const capability = nonEmptyString(entry.capability) ? String(entry.capability) : topCapability;
    return capability ? [{ ...entry, capability }] : [];
  });
}

export function validateGoldenLessonAnswerCoverage(
  artifacts: Partial<Record<GoldenCapability, { fileName: string; bytes: Uint8Array }>>,
  companion: { fileName: string; bytes: Uint8Array } | null,
): GoldenArtifactFileValidation {
  const findings: GoldenArtifactFileFinding[] = [];
  const requirements = (["officialBookQuestions", "selfTest"] as const).flatMap((capability) => {
    const artifact = artifacts[capability];
    return artifact ? answerRequirements(capability, artifact.fileName, artifact.bytes) : [];
  });
  if (requirements.length === 0) return { valid: true, findings };
  if (!companion) {
    return {
      valid: false,
      findings: [{
        code: "ANSWER_COMPANION_REQUIRED",
        messageAr: "ملف الإجابات الخادمي مطلوب لتغطية أسئلة الكتاب و«اختبر فهمك».",
      }],
    };
  }
  if (!companion.fileName.toLowerCase().endsWith(".server-only.json")) {
    findings.push({ code: "ANSWER_COMPANION_PATH_UNSAFE", messageAr: "ملف الإجابات يجب أن ينتهي بـ .server-only.json." });
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(companion.bytes)) as unknown;
  } catch {
    return { valid: false, findings: [{ code: "ANSWER_COMPANION_JSON_INVALID", messageAr: "ملف الإجابات الخادمي JSON غير صالح." }] };
  }
  const answers = companionAnswers(value);
  if (answers.length === 0) {
    findings.push({ code: "ANSWER_COMPANION_EMPTY", messageAr: "ملف الإجابات الخادمي لا يحتوي إجابات." });
    return { valid: false, findings };
  }

  for (const requirement of requirements) {
    const answer = answers.find((entry) => {
      const id = entry.question_id ?? entry.questionId ?? entry.question_code ?? entry.questionNumber;
      return entry.capability === requirement.capability && String(id ?? "").trim() === requirement.questionId;
    });
    if (!answer) {
      findings.push({
        code: "ANSWER_COMPANION_COVERAGE_MISSING",
        messageAr: `لا توجد إجابة خادمية للسؤال ${requirement.questionId} ضمن ${requirement.capability}.`,
      });
      continue;
    }
    if (requirement.capability === "officialBookQuestions") {
      const model = answer.model_answer ?? answer.modelAnswer ?? answer.answer ?? answer.solution;
      if (!nonEmptyString(model)) {
        findings.push({
          code: "MODEL_ANSWER_MISSING",
          messageAr: `الإجابة النموذجية للسؤال ${requirement.questionId} مفقودة من الملف الخادمي.`,
        });
      }
    } else {
      const correct = correctAnswer(answer);
      if (!(nonEmptyString(correct) || typeof correct === "number")) {
        findings.push({
          code: "SELF_TEST_CORRECT_ANSWER_MISSING",
          messageAr: `الإجابة الصحيحة للسؤال ${requirement.questionId} مفقودة من الملف الخادمي.`,
        });
      }
      if (!nonEmptyString(answer.explanation ?? answer.rationale)) {
        findings.push({
          code: "SELF_TEST_EXPLANATION_MISSING",
          messageAr: `شرح إجابة السؤال ${requirement.questionId} مفقود من الملف الخادمي.`,
        });
      }
    }
  }

  return { valid: findings.length === 0, findings };
}

export function validateGoldenLessonArtifactPath(
  capability: GoldenCapability,
  fileName: string,
): GoldenArtifactFileValidation {
  const findings: GoldenArtifactFileFinding[] = [];
  const contract = GOLDEN_ARTIFACT_FILE_CONTRACTS[capability];
  const extension = extensionOf(fileName);
  if (!contract.extensions.includes(extension)) {
    findings.push({
      code: "ARTIFACT_EXTENSION_FORBIDDEN",
      messageAr: `${contract.expectedAr}. الامتداد ${extension || "غير موجود"} غير مسموح.`,
    });
  }
  if (extension === ".zip") {
    findings.push({ code: "NESTED_ZIP_FORBIDDEN", messageAr: "لا ترفع الحزمة ZIP داخل خانة محتوى منفردة." });
  }
  return { valid: findings.length === 0, findings };
}

export function validateGoldenLessonArtifactBytes(
  capability: GoldenCapability,
  fileName: string,
  bytes: Uint8Array,
): GoldenArtifactFileValidation {
  const findings = [...validateGoldenLessonArtifactPath(capability, fileName).findings];
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    findings.push({ code: "NESTED_ZIP_FORBIDDEN", messageAr: "محتوى الملف حزمة ZIP وليس ملف القدرة المطلوب." });
  }
  if (findings.length > 0) return { valid: false, findings };

  let textValue: string;
  try {
    textValue = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { valid: false, findings: [{ code: "ARTIFACT_UTF8_INVALID", messageAr: "الملف ليس نص UTF-8 صالحًا." }] };
  }
  if (!textValue.trim()) {
    return { valid: false, findings: [{ code: "ARTIFACT_EMPTY", messageAr: "الملف فارغ." }] };
  }

  const extension = extensionOf(fileName);
  if (extension === ".html") {
    const profile: HtmlProfile = capability === "labExperimentHtml"
      ? "INTERACTIVE_EDUCATIONAL_HTML"
      : "STATIC_EDUCATIONAL_HTML";
    const result = validateHtmlAgainstProfile(textValue, { profile });
    for (const finding of result.findings.filter((item) => item.severity === "error")) {
      findings.push({ code: finding.code, messageAr: finding.message });
    }
  } else if (extension === ".json") {
    let value: unknown;
    try {
      value = JSON.parse(textValue) as unknown;
    } catch {
      findings.push({ code: "ARTIFACT_JSON_INVALID", messageAr: "JSON غير صالح أو غير مكتمل." });
      return { valid: false, findings };
    }
    validateJsonCapability(capability, value, findings);
  }

  return { valid: findings.length === 0, findings };
}
