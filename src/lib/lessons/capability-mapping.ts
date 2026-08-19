/**
 * Content V3 — package capability name -> production lifecycle capability.
 *
 * The package artifact (`content-packages/*\/manifest.json`) uses presentation
 * names such as `tamkeenExplanationHtml`. The production
 * `lesson_capability_lifecycle.capability` column uses the 20C vocabulary.
 * They are NOT identical strings; every import must translate through this map.
 */

export const V3_PACKAGE_CAPABILITIES = [
  "officialBookContent",
  "tamkeenExplanationHtml",
  "lessonSummaryHtml",
  "mindMapHtml",
  "labExperimentHtml",
  "officialBookQuestions",
  "selfTest",
] as const;

export type V3PackageCapability = (typeof V3_PACKAGE_CAPABILITIES)[number];

export const V3_LIFECYCLE_CAPABILITIES = [
  "officialBookContent",
  "tamkeenExplanation",
  "quickReview",
  "mindMap",
  "simulation",
  "checkUnderstanding",
  "lessonAssessment",
] as const;

export type V3LifecycleCapability = (typeof V3_LIFECYCLE_CAPABILITIES)[number];

/** Package name -> lifecycle capability, in student journey order. */
export const V3_CAPABILITY_MAP: Record<V3PackageCapability, V3LifecycleCapability> = {
  officialBookContent: "officialBookContent",
  tamkeenExplanationHtml: "tamkeenExplanation",
  lessonSummaryHtml: "quickReview",
  mindMapHtml: "mindMap",
  labExperimentHtml: "simulation",
  officialBookQuestions: "checkUnderstanding",
  selfTest: "lessonAssessment",
};

/** Reverse lookup, for reporting production state back in package vocabulary. */
export const V3_LIFECYCLE_TO_PACKAGE: Record<V3LifecycleCapability, V3PackageCapability> =
  Object.fromEntries(
    Object.entries(V3_CAPABILITY_MAP).map(([pkg, lifecycle]) => [lifecycle, pkg]),
  ) as Record<V3LifecycleCapability, V3PackageCapability>;

export function toLifecycleCapability(name: string): V3LifecycleCapability {
  const mapped = V3_CAPABILITY_MAP[name as V3PackageCapability];
  if (!mapped) {
    throw new Error(`Unknown Content V3 package capability: ${name}`);
  }
  return mapped;
}

/**
 * Capabilities retired from the V3 contract. They keep their lifecycle history
 * rows (retirement_origin='LEGACY_20C') and must never be READY.
 */
export const V3_RETIRED_CAPABILITIES = ["originalBookPdf", "supportingResources"] as const;
