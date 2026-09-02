/**
 * OFFLINE-02 — deterministic, fail-closed subject pack materialization.
 *
 * Only student-safe, self-contained lesson bodies, authenticated private
 * assessment artifacts, and attested textbooks may enter a manifest. Private
 * answer bytes are content-addressed but never embedded in the manifest.
 */

import { ANSWER_LEAK_PATTERNS } from "@/lib/lessons/html-content-standard";

import {
  OFFLINE_PACK_MAX_ARTIFACT_BYTES,
  OFFLINE_PACK_SCHEMA_VERSION,
  parseOfflinePackManifest,
  sha256Hex,
  type OfflinePackArtifact,
  type OfflinePackManifest,
} from "./offline-pack-contract";
import {
  parseOfflineAssessmentBundle,
  type OfflineAssessmentKind,
} from "./offline-assessment-contract";
import type { OfflineAssessmentSource } from "./offline-assessment-contract";

const HTML_MAX_BYTES = 5 * 1024 * 1024;
const SHA256_RE = /^[a-f0-9]{64}$/;
const REMOTE_REFERENCE_RE =
  /(?:src|href)\s*=\s*["'](?:https?:)?\/\/|url\(\s*["']?(?:https?:)?\/\/|\bfetch\s*\(\s*["']https?:\/\//i;

export const OFFLINE_TEXT_SOURCE_TYPES = [
  "official-book",
  "tamkeen-explanation",
  "quick-review",
  "mind-map",
  "lab-experiment",
] as const;

export type OfflineTextSourceType = (typeof OFFLINE_TEXT_SOURCE_TYPES)[number];

export const OFFLINE_SOURCE_CAPABILITY: Record<OfflineTextSourceType, string> = {
  "official-book": "officialBookContent",
  "tamkeen-explanation": "tamkeenExplanation",
  "quick-review": "quickReview",
  "mind-map": "mindMap",
  "lab-experiment": "simulation",
};

export type OfflineManifestLesson = {
  id: string;
  title: string;
  sortOrder: number;
  updatedAt: string;
  managed: boolean;
  visible: boolean;
  readyCapabilities: Readonly<Record<string, { sha256: string; readyAt: string }>>;
};

export type OfflineTextSource = {
  sourceType: OfflineTextSourceType;
  sourceId: string;
  lessonId: string;
  title: string;
  body: string;
  updatedAt: string;
  sortOrder: number;
  attestation: "lifecycle" | "body";
  /** Exact-body attestation stored with interactive CF11 resources. */
  bodySha256?: string | null;
};

export type OfflineTextbookSource = {
  sourceId: string;
  title: string;
  byteSize: number;
  sha256: string;
  updatedAt: string;
  sortOrder: number;
};

export type OfflinePackBuildInput = {
  scope: OfflinePackManifest["scope"];
  subjectTitle: string;
  lessons: readonly OfflineManifestLesson[];
  textSources: readonly OfflineTextSource[];
  textbooks: readonly OfflineTextbookSource[];
  assessmentSources?: readonly OfflineAssessmentSource[];
};

export type OfflineManifestOmissionCode =
  | "LESSON_NOT_VISIBLE"
  | "CAPABILITY_NOT_READY"
  | "EMPTY_BODY"
  | "REMOTE_DEPENDENCY"
  | "ASSESSMENT_PAYLOAD_INVALID"
  | "TEXTBOOK_ATTESTATION_MISSING";

export type OfflinePackBuildResult = {
  manifest: OfflinePackManifest;
  omissions: ReadonlyArray<{ sourceId: string; code: OfflineManifestOmissionCode }>;
};

function assertSafeTextBody(body: string): void {
  if (ANSWER_LEAK_PATTERNS.some((pattern) => pattern.test(body))) {
    throw new Error("OFFLINE_ANSWER_LEAK_DETECTED");
  }
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function dateMs(value: string): number {
  const milliseconds = Date.parse(value);
  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) {
    throw new Error("OFFLINE_SOURCE_TIMESTAMP_INVALID");
  }
  return milliseconds;
}

function textKind(sourceType: OfflineTextSourceType): OfflinePackArtifact["kind"] {
  return sourceType === "quick-review" ? "quick-review" : "lesson-html";
}

function sourceOrder(sourceType: OfflineTextSourceType): number {
  return OFFLINE_TEXT_SOURCE_TYPES.indexOf(sourceType);
}

function assessmentCapability(kind: OfflineAssessmentKind): string {
  return kind === "official-questions" ? "checkUnderstanding" : "lessonAssessment";
}

function assessmentKind(kind: OfflineAssessmentKind): OfflinePackArtifact["kind"] {
  return kind === "official-questions" ? "assessment" : "self-test";
}

export function parseOfflineTextResourceId(value: string): {
  sourceType: OfflineTextSourceType;
  sourceId: string;
} {
  const separator = value.indexOf(":");
  const sourceType = value.slice(0, separator) as OfflineTextSourceType;
  const sourceId = value.slice(separator + 1);
  if (separator <= 0 || !OFFLINE_TEXT_SOURCE_TYPES.includes(sourceType) || !sourceId) {
    throw new Error("OFFLINE_TEXT_RESOURCE_ID_INVALID");
  }
  return { sourceType, sourceId };
}

export async function buildOfflineSubjectPack(
  input: OfflinePackBuildInput,
): Promise<OfflinePackBuildResult> {
  const lessons = new Map(input.lessons.map((lesson) => [lesson.id, lesson]));
  const omissions: Array<{ sourceId: string; code: OfflineManifestOmissionCode }> = [];
  const artifacts: OfflinePackArtifact[] = [];
  const timestamps: number[] = [];

  const orderedTextSources = [...input.textSources].sort((left, right) => {
    const leftLesson = lessons.get(left.lessonId);
    const rightLesson = lessons.get(right.lessonId);
    return (
      (leftLesson?.sortOrder ?? 0) - (rightLesson?.sortOrder ?? 0) ||
      sourceOrder(left.sourceType) - sourceOrder(right.sourceType) ||
      left.sortOrder - right.sortOrder ||
      left.sourceId.localeCompare(right.sourceId)
    );
  });

  for (const source of orderedTextSources) {
    const lesson = lessons.get(source.lessonId);
    if (!lesson || !lesson.visible) {
      omissions.push({ sourceId: source.sourceId, code: "LESSON_NOT_VISIBLE" });
      continue;
    }

    const capability = OFFLINE_SOURCE_CAPABILITY[source.sourceType];
    const ready = lesson.readyCapabilities[capability];
    if (lesson.managed && !ready) {
      omissions.push({ sourceId: source.sourceId, code: "CAPABILITY_NOT_READY" });
      continue;
    }

    if (!source.body.trim()) {
      omissions.push({ sourceId: source.sourceId, code: "EMPTY_BODY" });
      continue;
    }
    assertSafeTextBody(source.body);
    if (REMOTE_REFERENCE_RE.test(source.body)) {
      omissions.push({ sourceId: source.sourceId, code: "REMOTE_DEPENDENCY" });
      continue;
    }

    const bytes = new TextEncoder().encode(source.body);
    if (bytes.byteLength > HTML_MAX_BYTES) throw new Error("OFFLINE_HTML_TOO_LARGE");
    const observedSha256 = await sha256Hex(bytes);
    if (source.attestation === "lifecycle" && ready && observedSha256 !== ready.sha256) {
      throw new Error("OFFLINE_SOURCE_READY_HASH_MISMATCH");
    }
    if (source.attestation === "body") {
      if (!source.bodySha256 || !SHA256_RE.test(source.bodySha256)) {
        throw new Error("OFFLINE_SOURCE_BODY_HASH_MISSING");
      }
      if (observedSha256 !== source.bodySha256) {
        throw new Error("OFFLINE_SOURCE_BODY_HASH_MISMATCH");
      }
    }

    const resourceId = `${source.sourceType}:${source.sourceId}`;
    const lessonOrder = Math.max(0, lesson.sortOrder);
    artifacts.push({
      artifactId: resourceId,
      kind: textKind(source.sourceType),
      resourceId,
      lessonId: source.lessonId,
      lessonTitle: lesson.title,
      title: source.title || lesson.title,
      relativePath: `packs/${safeSegment(input.scope.subjectId ?? "subject")}/lessons/${safeSegment(source.lessonId)}/${source.sourceType}-${safeSegment(source.sourceId)}.html`,
      contentType: "text/html; charset=utf-8",
      byteSize: bytes.byteLength,
      sha256: observedSha256,
      sortOrder: lessonOrder * 10 + sourceOrder(source.sourceType),
    });
    timestamps.push(dateMs(source.updatedAt), dateMs(lesson.updatedAt));
    if (ready) timestamps.push(dateMs(ready.readyAt));
  }

  for (const source of [...(input.assessmentSources ?? [])].sort((left, right) => {
    const leftLesson = lessons.get(left.lessonId);
    const rightLesson = lessons.get(right.lessonId);
    return (
      (leftLesson?.sortOrder ?? 0) - (rightLesson?.sortOrder ?? 0) ||
      left.sortOrder - right.sortOrder ||
      left.sourceType.localeCompare(right.sourceType)
    );
  })) {
    const lesson = lessons.get(source.lessonId);
    if (!lesson || !lesson.visible) {
      omissions.push({
        sourceId: `${source.sourceType}:${source.lessonId}`,
        code: "LESSON_NOT_VISIBLE",
      });
      continue;
    }
    const capability = assessmentCapability(source.sourceType);
    const ready = lesson.readyCapabilities[capability];
    if (lesson.managed && !ready) {
      omissions.push({
        sourceId: `${source.sourceType}:${source.lessonId}`,
        code: "CAPABILITY_NOT_READY",
      });
      continue;
    }
    let bundle: ReturnType<typeof parseOfflineAssessmentBundle>;
    try {
      bundle = parseOfflineAssessmentBundle(source.body);
    } catch {
      omissions.push({
        sourceId: `${source.sourceType}:${source.lessonId}`,
        code: "ASSESSMENT_PAYLOAD_INVALID",
      });
      continue;
    }
    if (bundle.kind !== source.sourceType || bundle.lessonId !== source.lessonId) {
      throw new Error("OFFLINE_ASSESSMENT_BINDING_MISMATCH");
    }
    if (source.body.byteLength > HTML_MAX_BYTES) {
      throw new Error("OFFLINE_ASSESSMENT_TOO_LARGE");
    }
    const resourceId = `${source.sourceType}:${source.lessonId}`;
    const lessonOrder = Math.max(0, lesson.sortOrder);
    artifacts.push({
      artifactId: resourceId,
      kind: assessmentKind(source.sourceType),
      resourceId,
      lessonId: source.lessonId,
      lessonTitle: lesson.title,
      title: source.title,
      relativePath: `packs/${safeSegment(input.scope.subjectId ?? "subject")}/lessons/${safeSegment(source.lessonId)}/assessments/${source.sourceType}.json`,
      contentType: "application/json; charset=utf-8",
      byteSize: source.body.byteLength,
      sha256: await sha256Hex(source.body),
      sortOrder: lessonOrder * 10 + 6 + source.sortOrder,
    });
    timestamps.push(dateMs(source.updatedAt), dateMs(lesson.updatedAt));
    if (ready) timestamps.push(dateMs(ready.readyAt));
  }

  for (const textbook of [...input.textbooks].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder || left.sourceId.localeCompare(right.sourceId),
  )) {
    if (
      !Number.isSafeInteger(textbook.byteSize) ||
      textbook.byteSize <= 0 ||
      textbook.byteSize > OFFLINE_PACK_MAX_ARTIFACT_BYTES ||
      !SHA256_RE.test(textbook.sha256)
    ) {
      omissions.push({ sourceId: textbook.sourceId, code: "TEXTBOOK_ATTESTATION_MISSING" });
      continue;
    }
    artifacts.push({
      artifactId: `textbook:${textbook.sourceId}`,
      kind: "textbook-pdf",
      resourceId: textbook.sourceId,
      lessonId: null,
      title: textbook.title,
      relativePath: `packs/${safeSegment(input.scope.subjectId ?? "subject")}/textbooks/${safeSegment(textbook.sourceId)}.pdf`,
      contentType: "application/pdf",
      byteSize: textbook.byteSize,
      sha256: textbook.sha256,
      sortOrder: 90_000 + textbook.sortOrder,
    });
    timestamps.push(dateMs(textbook.updatedAt));
  }

  if (artifacts.length === 0) throw new Error("OFFLINE_PACK_EMPTY");
  const generatedAtMs = Math.max(...timestamps);
  const manifest = parseOfflinePackManifest({
    schemaVersion: OFFLINE_PACK_SCHEMA_VERSION,
    packId: `subject-${input.scope.subjectId}`,
    revision: generatedAtMs,
    generatedAt: new Date(generatedAtMs).toISOString(),
    scope: { ...input.scope, subjectTitle: input.subjectTitle },
    artifacts,
  });
  return { manifest, omissions };
}
