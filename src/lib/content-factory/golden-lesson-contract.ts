import type { GoldenLessonAsset } from "./golden-lesson-assets.ts";

/**
 * Keep the v1 symbol as the default export used by the current Quran/package
 * builder. New callers must opt into v2 explicitly; this prevents an implicit
 * schema upgrade of already-published v1 manifests.
 */
export const GOLDEN_LESSON_SCHEMA_V1 = "tamkeen.golden-lesson-package.v1" as const;
export const GOLDEN_LESSON_SCHEMA_V2 = "tamkeen.golden-lesson-package.v2" as const;
export const GOLDEN_LESSON_SCHEMA = GOLDEN_LESSON_SCHEMA_V1;
export const GOLDEN_LESSON_SCHEMAS = [GOLDEN_LESSON_SCHEMA_V1, GOLDEN_LESSON_SCHEMA_V2] as const;

export type GoldenLessonSchema = (typeof GOLDEN_LESSON_SCHEMAS)[number];

export type { GoldenLessonAsset };


export const GOLDEN_CAPABILITIES_V1 = [
  "officialBookContent",
  "tamkeenExplanationHtml",
  "lessonSummaryHtml",
  "mindMapHtml",
  "labExperimentHtml",
  "officialBookQuestions",
  "selfTest",
] as const;

/** Final import/display order agreed for v2. The activity is an extra optional layer. */
export const GOLDEN_CAPABILITIES_V2 = [
  "officialBookContent",
  "tamkeenExplanationHtml",
  "lessonSummaryHtml",
  "conceptsAndTermsHtml",
  "equationsAndLawsHtml",
  "officialBookQuestions",
  "selfTest",
  "interactiveActivityHtml",
] as const;

/** Backwards-compatible alias. Existing v1 code keeps its seven-key contract. */
export const GOLDEN_CAPABILITIES = GOLDEN_CAPABILITIES_V1;

export type GoldenCapabilityV1 = (typeof GOLDEN_CAPABILITIES_V1)[number];
export type GoldenCapabilityV2 = (typeof GOLDEN_CAPABILITIES_V2)[number];
export type GoldenCapability = GoldenCapabilityV1 | GoldenCapabilityV2;
export type CapabilityApplicability = "REQUIRED" | "OPTIONAL" | "NA";
export type ContentAuthority = "OFFICIAL" | "TAMKEEN";

export const GOLDEN_CAPABILITY_AUTHORITY: Record<GoldenCapability, ContentAuthority> = {
  officialBookContent: "OFFICIAL",
  tamkeenExplanationHtml: "TAMKEEN",
  lessonSummaryHtml: "TAMKEEN",
  mindMapHtml: "TAMKEEN",
  conceptsAndTermsHtml: "TAMKEEN",
  equationsAndLawsHtml: "TAMKEEN",
  labExperimentHtml: "TAMKEEN",
  interactiveActivityHtml: "TAMKEEN",
  officialBookQuestions: "OFFICIAL",
  selfTest: "TAMKEEN",
};

export function isGoldenLessonSchema(value: unknown): value is GoldenLessonSchema {
  return typeof value === "string" && (GOLDEN_LESSON_SCHEMAS as readonly string[]).includes(value);
}

export function capabilitiesForGoldenLessonSchema(
  schema: GoldenLessonSchema,
): readonly GoldenCapability[] {
  return schema === GOLDEN_LESSON_SCHEMA_V2 ? GOLDEN_CAPABILITIES_V2 : GOLDEN_CAPABILITIES_V1;
}

export interface GoldenLessonIdentity {
  gradeCode: string;
  curriculumTrackCodes: string[];
  subjectCode: string;
  lessonCode: string;
  lessonSlug: string;
  unitCode: string | null;
  semester: number | null;
  sortOrder: number | null;
}

export interface GoldenLessonArtifact {
  capability: GoldenCapability;
  applicability: CapabilityApplicability;
  authority: ContentAuthority;
  sourcePath: string | null;
  sha256: string | null;
  provenancePath: string | null;
  provenanceSha256: string | null;
}

export interface GoldenLessonPackage {
  schema: GoldenLessonSchema;
  profileId: string;
  packageCode: string;
  identity: GoldenLessonIdentity;
  capabilityOrder: GoldenCapability[];
  artifacts: GoldenLessonArtifact[];
  /**
   * CF11: supplemental static assets referenced by the HTML bodies. Optional for
   * backwards compatibility with v1 manifests built before CF11; absent means "no
   * asset references are permitted in any HTML body" (fail-closed, not fail-open).
   */
  assets?: GoldenLessonAsset[];
  lifecycle: {
    initialStatus: "DRAFT";
    allowDirectReady: false;
  };
  security: {
    productionApply: false;
    publicPayloadContainsAnswers: false;
    answersCompanionPath: string | null;
    answersCompanionSha256: string | null;
    htmlNetworkAccess: "NONE";
  };
}


export interface GoldenLessonProfile {
  id: string;
  version: 1 | 2;
  schema: GoldenLessonSchema;
  labelAr: string;
  subjectFamily: "QURAN" | "SCIENCE";
  capabilityOrder: readonly GoldenCapability[];
  applicability: Readonly<Partial<Record<GoldenCapability, CapabilityApplicability>>>;
  notesAr: readonly string[];
}
