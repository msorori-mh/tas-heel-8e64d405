import { Buffer } from "node:buffer";

import {
  GOLDEN_CAPABILITIES,
  type GoldenCapability,
  type GoldenLessonArtifact,
} from "./golden-lesson-contract";
import type { VerifiedGoldenLessonBundle } from "./golden-lesson-bundle-verifier";

export const GOLDEN_DOMAIN_TARGETS: Record<GoldenCapability, string> = {
  officialBookContent: "lesson_book_contents",
  tamkeenExplanationHtml: "lesson_explanations",
  lessonSummaryHtml: "lesson_summaries",
  mindMapHtml: "lesson_resources:mindmap",
  labExperimentHtml: "lesson_resources:experiment",
  officialBookQuestions: "questions:official",
  selfTest: "lesson_assessments:self_test",
};

export const GOLDEN_LIFECYCLE_TARGETS: Record<GoldenCapability, string> = {
  officialBookContent: "officialBookContent",
  tamkeenExplanationHtml: "tamkeenExplanation",
  lessonSummaryHtml: "quickReview",
  mindMapHtml: "mindMap",
  labExperimentHtml: "simulation",
  officialBookQuestions: "checkUnderstanding",
  selfTest: "lessonAssessment",
};

export interface GoldenDomainStageEntry {
  capability: GoldenCapability;
  instanceIndex?: number;
  instanceTitle?: string | null;
  lifecycleCapability: string;
  targetPlan: string;
  applicability: GoldenLessonArtifact["applicability"];
  authority: GoldenLessonArtifact["authority"];
  sourcePath: string | null;
  sourceSha256: string | null;
  sourceBase64: string | null;
  provenancePath: string | null;
  provenanceSha256: string | null;
  provenanceBase64: string | null;
}

export interface GoldenDomainStageEnvelope {
  entries: GoldenDomainStageEntry[];
  answersCompanion: { path: string; sha256: string; base64: string } | null;
}

/**
 * The legacy CF08 package RPC stores one row per capability and therefore cannot represent
 * repeated lab artifacts without a schema change. The active Golden Lesson builder publishes
 * through LCPV2; keep the legacy RPC fail-closed instead of allowing a partial stage.
 */
export function assertLegacyGoldenDomainStageCompatible(envelope: GoldenDomainStageEnvelope): void {
  if (envelope.entries.filter((entry) => entry.capability === "labExperimentHtml").length > 1) {
    throw new Error("DOMAIN_STAGE_MULTI_LAB_REQUIRES_COMPONENT_V2");
  }
}

export function buildGoldenDomainStageEnvelope(
  bundle: VerifiedGoldenLessonBundle,
): GoldenDomainStageEnvelope {
  const files = new Map(bundle.files.map((file) => [file.path, file]));
  const bytes = (path: string | null, expected: string | null): string | null => {
    if (path === null && expected === null) return null;
    if (!path || !expected) throw new Error("DOMAIN_STAGE_FILE_REFERENCE_INCOMPLETE");
    const file = files.get(path);
    if (!file || file.sha256 !== expected) throw new Error("DOMAIN_STAGE_VERIFIED_FILE_MISSING");
    return Buffer.from(file.bytes).toString("base64");
  };
  const entries = GOLDEN_CAPABILITIES.flatMap((capability): GoldenDomainStageEntry[] => {
    const artifacts = bundle.manifest.artifacts
      .filter((item) => item.capability === capability)
      .sort((left, right) => (left.instanceIndex ?? 0) - (right.instanceIndex ?? 0));
    if (artifacts.length === 0) throw new Error("DOMAIN_STAGE_CAPABILITY_MISSING");
    return artifacts.map((artifact) => ({
      capability,
      ...(capability === "labExperimentHtml"
        ? { instanceIndex: artifact.instanceIndex, instanceTitle: artifact.instanceTitle }
        : {}),
      lifecycleCapability: GOLDEN_LIFECYCLE_TARGETS[capability],
      targetPlan: GOLDEN_DOMAIN_TARGETS[capability],
      applicability: artifact.applicability,
      authority: artifact.authority,
      sourcePath: artifact.sourcePath,
      sourceSha256: artifact.sha256,
      sourceBase64: bytes(artifact.sourcePath, artifact.sha256),
      provenancePath: artifact.provenancePath,
      provenanceSha256: artifact.provenanceSha256,
      provenanceBase64: bytes(artifact.provenancePath, artifact.provenanceSha256),
    }));
  });
  const answerPath = bundle.manifest.security.answersCompanionPath;
  const answerSha = bundle.manifest.security.answersCompanionSha256;
  return {
    entries,
    answersCompanion:
      answerPath && answerSha
        ? { path: answerPath, sha256: answerSha, base64: bytes(answerPath, answerSha)! }
        : null,
  };
}
