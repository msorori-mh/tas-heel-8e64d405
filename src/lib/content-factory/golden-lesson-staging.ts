import {
  GOLDEN_CAPABILITIES,
  type GoldenCapability,
  type GoldenLessonPackage,
} from "./golden-lesson-contract.ts";
import {
  validateGoldenLessonPackage,
  type GoldenLessonFinding,
} from "./golden-lesson-validator.ts";

export const GOLDEN_PACKAGE_MAX_MANIFEST_BYTES = 1024 * 1024;

export const CAPABILITY_DRAFT_TARGET: Record<GoldenCapability, string> = {
  officialBookContent: "lesson_book_contents",
  tamkeenExplanationHtml: "lesson_explanations",
  lessonSummaryHtml: "lesson_summaries",
  mindMapHtml: "lesson_resources:mindmap",
  labExperimentHtml: "lesson_resources:experiment",
  officialBookQuestions: "questions+question_revisions:official",
  selfTest: "questions+question_revisions:self_test",
};

export interface GoldenLessonStagingAction {
  order: number;
  capability: GoldenCapability;
  instanceIndex?: number;
  instanceTitle?: string | null;
  target: string;
  action: "STAGE_DRAFT" | "SKIP_NA" | "SKIP_OPTIONAL_EMPTY";
  sourcePath: string | null;
  sha256: string | null;
}

export interface GoldenLessonStagingPreview {
  valid: boolean;
  packageCode: string | null;
  findings: GoldenLessonFinding[];
  actions: GoldenLessonStagingAction[];
  stagedDraftsPlanned: number;
  domainWritesPerformed: 0;
  productionWritesPerformed: 0;
  executable: false;
}

export function parseGoldenLessonManifest(raw: string): unknown {
  if (new TextEncoder().encode(raw).byteLength > GOLDEN_PACKAGE_MAX_MANIFEST_BYTES) {
    throw new Error("MANIFEST_TOO_LARGE");
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error("MANIFEST_JSON_INVALID");
  }
}

export function previewGoldenLessonStaging(value: unknown): GoldenLessonStagingPreview {
  if (
    !value ||
    typeof value !== "object" ||
    !("identity" in value) ||
    !value.identity ||
    typeof value.identity !== "object" ||
    !("security" in value) ||
    !value.security ||
    typeof value.security !== "object" ||
    !("lifecycle" in value) ||
    !value.lifecycle ||
    typeof value.lifecycle !== "object" ||
    !("artifacts" in value) ||
    !Array.isArray(value.artifacts) ||
    !("capabilityOrder" in value) ||
    !Array.isArray(value.capabilityOrder)
  ) {
    return {
      valid: false,
      packageCode: null,
      findings: [
        {
          code: "MANIFEST_SHAPE_INVALID",
          severity: "ERROR",
          field: "manifest",
          messageAr: "بنية Manifest غير صالحة.",
        },
      ],
      actions: [],
      stagedDraftsPlanned: 0,
      domainWritesPerformed: 0,
      productionWritesPerformed: 0,
      executable: false,
    };
  }

  const pkg = value as GoldenLessonPackage;
  const validation = validateGoldenLessonPackage(pkg);
  const artifacts = Array.isArray(pkg.artifacts) ? pkg.artifacts : [];
  const actions = GOLDEN_CAPABILITIES.flatMap((capability): GoldenLessonStagingAction[] => {
    const matches = artifacts
      .filter((item) => item?.capability === capability)
      .sort((left, right) => (left.instanceIndex ?? 0) - (right.instanceIndex ?? 0));
    return matches.map((artifact) => {
      const action =
        artifact.applicability === "NA"
          ? "SKIP_NA"
          : artifact.sourcePath
            ? "STAGE_DRAFT"
            : "SKIP_OPTIONAL_EMPTY";
      return {
        order: 0,
        capability,
        ...(capability === "labExperimentHtml"
          ? {
              instanceIndex: artifact.instanceIndex,
              instanceTitle: artifact.instanceTitle,
            }
          : {}),
        target: CAPABILITY_DRAFT_TARGET[capability],
        action,
        sourcePath: artifact.sourcePath,
        sha256: artifact.sha256,
      };
    });
  });
  actions.forEach((action, index) => {
    action.order = index + 1;
  });

  return {
    valid: validation.valid,
    packageCode: typeof pkg.packageCode === "string" ? pkg.packageCode : null,
    findings: validation.findings,
    actions,
    stagedDraftsPlanned: actions.filter((item) => item.action === "STAGE_DRAFT").length,
    domainWritesPerformed: 0,
    productionWritesPerformed: 0,
    executable: false,
  };
}
