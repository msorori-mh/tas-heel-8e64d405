import { Buffer } from "node:buffer";

import {
  capabilitiesForGoldenLessonSchema,
  type GoldenCapability,
  type GoldenLessonArtifact,
} from "./golden-lesson-contract.ts";
import type { VerifiedGoldenLessonBundle } from "./golden-lesson-bundle-verifier.ts";

export const GOLDEN_DOMAIN_TARGETS: Record<GoldenCapability, string> = {
  officialBookContent: "lesson_book_contents",
  tamkeenExplanationHtml: "lesson_explanations",
  lessonSummaryHtml: "lesson_summaries",
  mindMapHtml: "lesson_resources:mindmap",
  conceptsAndTermsHtml: "lesson_resources:concepts_and_terms_html",
  equationsAndLawsHtml: "lesson_resources:equations_and_laws_html",
  labExperimentHtml: "lesson_resources:experiment",
  interactiveActivityHtml: "lesson_resources:interactive_activity_html",
  officialBookQuestions: "questions:official",
  selfTest: "lesson_assessments:self_test",
};

export const GOLDEN_LIFECYCLE_TARGETS: Record<GoldenCapability, string> = {
  officialBookContent: "officialBookContent",
  tamkeenExplanationHtml: "tamkeenExplanation",
  lessonSummaryHtml: "quickReview",
  mindMapHtml: "mindMap",
  conceptsAndTermsHtml: "conceptsAndTerms",
  equationsAndLawsHtml: "equationsAndLaws",
  labExperimentHtml: "simulation",
  interactiveActivityHtml: "interactiveActivity",
  officialBookQuestions: "checkUnderstanding",
  selfTest: "lessonAssessment",
};

export interface GoldenDomainStageEntry {
  capability: GoldenCapability;
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

export function buildGoldenDomainStageEnvelope(bundle: VerifiedGoldenLessonBundle): GoldenDomainStageEnvelope {
  const files = new Map(bundle.files.map((file) => [file.path, file]));
  const bytes = (path: string | null, expected: string | null): string | null => {
    if (path === null && expected === null) return null;
    if (!path || !expected) throw new Error("DOMAIN_STAGE_FILE_REFERENCE_INCOMPLETE");
    const file = files.get(path);
    if (!file || file.sha256 !== expected) throw new Error("DOMAIN_STAGE_VERIFIED_FILE_MISSING");
    return Buffer.from(file.bytes).toString("base64");
  };
  const byCapability = new Map(bundle.manifest.artifacts.map((item) => [item.capability, item]));
  const entries = capabilitiesForGoldenLessonSchema(bundle.manifest.schema).map((capability): GoldenDomainStageEntry => {
    const artifact = byCapability.get(capability);
    if (!artifact) throw new Error("DOMAIN_STAGE_CAPABILITY_MISSING");
    return {
      capability,
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
    };
  });
  const answerPath = bundle.manifest.security.answersCompanionPath;
  const answerSha = bundle.manifest.security.answersCompanionSha256;
  return {
    entries,
    answersCompanion: answerPath && answerSha
      ? { path: answerPath, sha256: answerSha, base64: bytes(answerPath, answerSha)! }
      : null,
  };
}
