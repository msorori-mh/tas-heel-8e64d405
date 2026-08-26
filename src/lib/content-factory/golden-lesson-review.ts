export const GOLDEN_REVIEW_ROLES = [
  "CONTENT_EDITOR",
  "CONTENT_REVIEWER",
  "TECHNICAL_REVIEWER",
] as const;

export type GoldenReviewRole = (typeof GOLDEN_REVIEW_ROLES)[number];
export type GoldenReviewStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "CONTENT_APPROVED"
  | "APPROVED_FOR_STAGING";

export interface GoldenReviewEvidence {
  packageValidationPassed: boolean;
  officialProvenanceChecked: boolean;
  answerSeparationChecked: boolean;
  responsivePreviewChecked: boolean;
}

export interface GoldenReviewTransition {
  from: GoldenReviewStatus;
  to: GoldenReviewStatus;
  role: GoldenReviewRole;
  requiredEvidence: readonly (keyof GoldenReviewEvidence)[];
}

export const GOLDEN_REVIEW_TRANSITIONS: readonly GoldenReviewTransition[] = [
  {
    from: "DRAFT",
    to: "SUBMITTED",
    role: "CONTENT_EDITOR",
    requiredEvidence: ["packageValidationPassed"],
  },
  {
    from: "SUBMITTED",
    to: "CONTENT_APPROVED",
    role: "CONTENT_REVIEWER",
    requiredEvidence: ["officialProvenanceChecked", "answerSeparationChecked"],
  },
  {
    from: "CONTENT_APPROVED",
    to: "APPROVED_FOR_STAGING",
    role: "TECHNICAL_REVIEWER",
    requiredEvidence: ["responsivePreviewChecked"],
  },
];

export interface GoldenReviewDecision {
  allowed: boolean;
  nextStatus: GoldenReviewStatus;
  code: "TRANSITION_ALLOWED" | "ROLE_FORBIDDEN" | "EVIDENCE_MISSING" | "TRANSITION_INVALID";
  missingEvidence: (keyof GoldenReviewEvidence)[];
  writesPerformed: 0;
}

export function evaluateGoldenReviewTransition(
  current: GoldenReviewStatus,
  requested: GoldenReviewStatus,
  role: GoldenReviewRole,
  evidence: GoldenReviewEvidence,
): GoldenReviewDecision {
  const transition = GOLDEN_REVIEW_TRANSITIONS.find(
    (item) => item.from === current && item.to === requested,
  );
  if (!transition)
    return {
      allowed: false,
      nextStatus: current,
      code: "TRANSITION_INVALID",
      missingEvidence: [],
      writesPerformed: 0,
    };
  if (transition.role !== role)
    return {
      allowed: false,
      nextStatus: current,
      code: "ROLE_FORBIDDEN",
      missingEvidence: [],
      writesPerformed: 0,
    };
  const missingEvidence = transition.requiredEvidence.filter((key) => !evidence[key]);
  if (missingEvidence.length)
    return {
      allowed: false,
      nextStatus: current,
      code: "EVIDENCE_MISSING",
      missingEvidence,
      writesPerformed: 0,
    };
  return {
    allowed: true,
    nextStatus: requested,
    code: "TRANSITION_ALLOWED",
    missingEvidence: [],
    writesPerformed: 0,
  };
}
