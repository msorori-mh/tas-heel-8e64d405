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

function modelAnswer(question: Record<string, unknown>): unknown {
  return question.model_answer ?? question.modelAnswer ?? question.answer ?? question.solution;
}

function correctAnswer(question: Record<string, unknown>): unknown {
  return question.correct_index ?? question.correctIndex ?? question.correct_option_id ??
    question.correctOptionId ?? question.correct_answer ?? question.correctAnswer ?? question.answer;
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
    if (capability === "officialBookQuestions") {
      if (!nonEmptyString(modelAnswer(entry))) {
        findings.push({ code: "MODEL_ANSWER_MISSING", messageAr: `الإجابة النموذجية للسؤال رقم ${index + 1} مفقودة.` });
      }
      return;
    }

    const options = entry.options;
    if (!Array.isArray(options) || options.filter(nonEmptyString).length < 2) {
      findings.push({ code: "SELF_TEST_OPTIONS_MISSING", messageAr: `السؤال رقم ${index + 1} يحتاج خيارين على الأقل.` });
    }
    const correct = correctAnswer(entry);
    if (!(nonEmptyString(correct) || typeof correct === "number")) {
      findings.push({ code: "SELF_TEST_CORRECT_ANSWER_MISSING", messageAr: `الإجابة الصحيحة للسؤال رقم ${index + 1} مفقودة.` });
    }
    if (!nonEmptyString(entry.explanation ?? entry.rationale)) {
      findings.push({ code: "SELF_TEST_EXPLANATION_MISSING", messageAr: `شرح الإجابة للسؤال رقم ${index + 1} مفقود.` });
    }
  });
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
