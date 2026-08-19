export const GOLDEN_LESSON_SCHEMA = "tamkeen.golden-lesson-package.v1" as const;

export const GOLDEN_CAPABILITIES = [
  "officialBookContent",
  "tamkeenExplanationHtml",
  "lessonSummaryHtml",
  "mindMapHtml",
  "labExperimentHtml",
  "officialBookQuestions",
  "selfTest",
] as const;

export type GoldenCapability = (typeof GOLDEN_CAPABILITIES)[number];
export type CapabilityApplicability = "REQUIRED" | "OPTIONAL" | "NA";
export type ContentAuthority = "OFFICIAL" | "TAMKEEN";

export const GOLDEN_CAPABILITY_AUTHORITY: Record<GoldenCapability, ContentAuthority> = {
  officialBookContent: "OFFICIAL",
  tamkeenExplanationHtml: "TAMKEEN",
  lessonSummaryHtml: "TAMKEEN",
  mindMapHtml: "TAMKEEN",
  labExperimentHtml: "TAMKEEN",
  officialBookQuestions: "OFFICIAL",
  selfTest: "TAMKEEN",
};

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
}

export interface GoldenLessonPackage {
  schema: typeof GOLDEN_LESSON_SCHEMA;
  profileId: string;
  packageCode: string;
  identity: GoldenLessonIdentity;
  capabilityOrder: GoldenCapability[];
  artifacts: GoldenLessonArtifact[];
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
  version: 1;
  labelAr: string;
  subjectFamily: "QURAN" | "SCIENCE";
  capabilityOrder: readonly GoldenCapability[];
  applicability: Readonly<Record<GoldenCapability, CapabilityApplicability>>;
  notesAr: readonly string[];
}
