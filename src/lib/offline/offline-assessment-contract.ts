/** OFFLINE-05 — deterministic private assessment payloads for a verified pack. */

import { z } from "zod";

const id = z.string().trim().min(1).max(160);

export const offlineQuestionOptionSchema = z
  .object({
    id,
    text: z.string().trim().min(1).max(8_000),
    sortOrder: z.number().int().min(0).max(10_000),
  })
  .strict();

const baseQuestionShape = {
  questionId: id,
  revisionId: id,
  questionText: z.string().trim().min(1).max(32_000),
  questionType: z.string().trim().min(1).max(120),
  sortOrder: z.number().int().min(0).max(100_000),
  options: z.array(offlineQuestionOptionSchema).max(40),
};

export const offlineOfficialQuestionSchema = z
  .object({
    ...baseQuestionShape,
    modelAnswer: z.string().trim().min(1).max(64_000),
    explanation: z.string().max(64_000).nullable(),
    correctOptionIds: z.array(id).max(40),
  })
  .strict();

export const offlineSelfTestQuestionSchema = z
  .object({
    ...baseQuestionShape,
    correctOptionId: id,
    explanation: z.string().max(64_000).nullable(),
    feedbackByOption: z.record(
      id,
      z
        .object({
          whyCorrect: z.string().max(64_000).nullable(),
          whyWrong: z.string().max(64_000).nullable(),
        })
        .strict(),
    ),
  })
  .strict();

export const offlineOfficialQuestionsBundleSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal("official-questions"),
    lessonId: id,
    questions: z.array(offlineOfficialQuestionSchema).min(1).max(500),
  })
  .strict();

export const offlineSelfTestBundleSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal("self-test"),
    lessonId: id,
    questions: z.array(offlineSelfTestQuestionSchema).min(1).max(500),
  })
  .strict();

export const offlineAssessmentBundleSchema = z.discriminatedUnion("kind", [
  offlineOfficialQuestionsBundleSchema,
  offlineSelfTestBundleSchema,
]);

export type OfflineQuestionOption = z.infer<typeof offlineQuestionOptionSchema>;
export type OfflineOfficialQuestion = z.infer<typeof offlineOfficialQuestionSchema>;
export type OfflineSelfTestQuestion = z.infer<typeof offlineSelfTestQuestionSchema>;
export type OfflineAssessmentBundle = z.infer<typeof offlineAssessmentBundleSchema>;
export type OfflineAssessmentKind = OfflineAssessmentBundle["kind"];
export type OfflineAssessmentSource = {
  sourceType: OfflineAssessmentKind;
  lessonId: string;
  title: string;
  body: Uint8Array;
  updatedAt: string;
  sortOrder: number;
};

export function offlineAssessmentResourceId(kind: OfflineAssessmentKind, lessonId: string): string {
  return `${kind}:${lessonId}`;
}

export function parseOfflineAssessmentResourceId(value: string): {
  kind: OfflineAssessmentKind;
  lessonId: string;
} {
  const separator = value.indexOf(":");
  const kind = value.slice(0, separator) as OfflineAssessmentKind;
  const lessonId = value.slice(separator + 1).trim();
  if (separator <= 0 || (kind !== "official-questions" && kind !== "self-test") || !lessonId) {
    throw new Error("OFFLINE_ASSESSMENT_RESOURCE_ID_INVALID");
  }
  return { kind, lessonId };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("OFFLINE_ASSESSMENT_NUMBER_INVALID");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  throw new Error("OFFLINE_ASSESSMENT_VALUE_INVALID");
}

export function encodeOfflineAssessmentBundle(input: unknown): Uint8Array {
  const bundle = offlineAssessmentBundleSchema.parse(input);
  return new TextEncoder().encode(canonicalJson(bundle));
}

export function parseOfflineAssessmentBundle(bytes: Uint8Array): OfflineAssessmentBundle {
  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("OFFLINE_ASSESSMENT_PAYLOAD_INVALID");
  }
  return offlineAssessmentBundleSchema.parse(decoded);
}
