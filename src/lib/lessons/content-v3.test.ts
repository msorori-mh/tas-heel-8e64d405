/**
 * TAMKEEN_LESSON_CONTENT_ARCHITECTURE_V3_FULL_SOURCE_CLOSURE_21C_21G
 * Unified test matrix: HTML standard · official questions · self test ·
 * readiness · student UX · admin · regressions.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

/** Minimal expect shim over node:assert (project runs node --test). */
function expect(actual: any) {
  return {
    toBe: (v: any) => assert.strictEqual(actual, v),
    toEqual: (v: any) => assert.deepStrictEqual(actual, v),
    toBeNull: () => assert.strictEqual(actual, null),
    toHaveLength: (n: number) => assert.strictEqual(actual.length, n),
    toContain: (v: any) => assert.ok(actual.includes(v), `expected to contain ${String(v)}`),
    toBeGreaterThan: (n: number) => assert.ok(actual > n),
    not: {
      toContain: (v: any) => assert.ok(!actual.includes(v), `expected NOT to contain ${String(v)}`),
      toBe: (v: any) => assert.notStrictEqual(actual, v),
    },
  };
}
import {
  buildV3CapabilityView,
  computeV3Readiness,
  studentV3Journey,
  v3ProgressTotal,
  V3_CAPABILITIES,
  V3_CONTENT_OWNER,
  V3_LABEL_AR,
  V3_STUDENT_ORDER,
  V3_TO_LEGACY_KEY,
  type ApplicabilityMap,
} from "./content-v3";
import {
  buildLessonCapabilityContract,
  STUDENT_CAPABILITY_ORDER,
  type LessonCapabilityContract,
  type LessonContentContractInput,
} from "./lesson-content-contract";
import {
  htmlProfileFor,
  nextWorkflowStep,
  validateHtmlAgainstProfile,
  ANSWER_LEAK_PATTERNS,
} from "./html-content-standard";
import {
  buildRevealPayload,
  containsAnswerLeak,
  evaluateReveal,
  isAutoGradable,
  OFFICIAL_QUESTION_TYPES,
  toPublicQuestion,
} from "./official-book-questions";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function contractFor(overrides: Partial<LessonContentContractInput> = {}) {
  const input: LessonContentContractInput = {
    lessonTitle: "الدرس الأول",
    bookContents: [{ content: "نص الكتاب الرسمي للدرس", updated_at: "2026-01-01" }],
    explanations: [{ updated_at: "2026-01-02" }],
    resources: [
      {
        id: "mm1",
        resource_type: "mindmap",
        title: "خريطة",
        url: "supabase-storage://pkg/mm1",
        html_resource_type: "mindmap",
        lifecycle_status: "published",
        resource_code: "QRN-G10-L01-MM",
      },
    ],
    simulations: [],
    summaries: [{ summary: "ملخص الدرس", updated_at: "2026-01-03" }],
    questionsCount: 5,
    assessmentsCount: 1,
    lessonExamCount: 0,
    ...overrides,
  };
  return buildLessonCapabilityContract(input);
}

const fullyReady: LessonCapabilityContract = contractFor();

/* ------------------------------------------------------------------ */
/* 1 — HTML STANDARD (21C)                                             */
/* ------------------------------------------------------------------ */

const STATIC_HTML = `<!doctype html><html dir="rtl"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><h1>شرح</h1></body></html>`;

describe("21C — unified HTML content standard", () => {
  it("assigns the right profile per capability", () => {
    expect(htmlProfileFor("tamkeenExplanationHtml")).toBe("STATIC_EDUCATIONAL_HTML");
    expect(htmlProfileFor("lessonSummaryHtml")).toBe("STATIC_EDUCATIONAL_HTML");
    expect(htmlProfileFor("mindMapHtml")).toBe("INTERACTIVE_EDUCATIONAL_HTML");
    expect(htmlProfileFor("labExperimentHtml")).toBe("INTERACTIVE_EDUCATIONAL_HTML");
    expect(htmlProfileFor("officialBookContent")).toBeNull();
  });

  it("accepts a compliant RTL mobile-first static package", () => {
    const res = validateHtmlAgainstProfile(STATIC_HTML, {
      profile: "STATIC_EDUCATIONAL_HTML",
      resourceCode: "QRN-G10-L01-MM",
    });
    expect(res.isValid).toBe(true);
  });

  it("denies JavaScript in the static profile but allows it for labs", () => {
    const withJs = STATIC_HTML.replace("<body>", "<body><script>let a=1</script>");
    const staticRes = validateHtmlAgainstProfile(withJs, { profile: "STATIC_EDUCATIONAL_HTML" });
    expect(staticRes.isValid).toBe(false);
    expect(staticRes.findings.map((f) => f.code)).toContain("JS_NOT_ALLOWED_IN_STATIC_PROFILE");

    const labRes = validateHtmlAgainstProfile(withJs, {
      profile: "INTERACTIVE_EDUCATIONAL_HTML",
    });
    expect(labRes.isValid).toBe(true);
  });

  it("rejects external CDN dependencies in both profiles", () => {
    const cdn = STATIC_HTML.replace(
      "</head>",
      `<link href="https://cdn.example.com/a.css" rel="stylesheet"></head>`,
    );
    for (const profile of ["STATIC_EDUCATIONAL_HTML", "INTERACTIVE_EDUCATIONAL_HTML"] as const) {
      const res = validateHtmlAgainstProfile(cdn, { profile });
      expect(res.findings.map((f) => f.code)).toContain("EXTERNAL_RESOURCE_FORBIDDEN");
      expect(res.isValid).toBe(false);
    }
  });

  it("requires RTL and a responsive viewport", () => {
    const res = validateHtmlAgainstProfile("<html><body>نص</body></html>", {
      profile: "STATIC_EDUCATIONAL_HTML",
    });
    const codes = res.findings.map((f) => f.code);
    expect(codes).toContain("RTL_DIRECTION_MISSING");
    expect(codes).toContain("RESPONSIVE_VIEWPORT_MISSING");
  });

  it("blocks answer leakage inside authored HTML", () => {
    const leaky = STATIC_HTML.replace("<h1>", `<h1 data-answer="ب">`);
    const res = validateHtmlAgainstProfile(leaky, { profile: "STATIC_EDUCATIONAL_HTML" });
    expect(res.findings.map((f) => f.code)).toContain("ANSWER_LEAKAGE_DETECTED");
    expect(ANSWER_LEAK_PATTERNS.length).toBeGreaterThan(3);
  });

  it("walks the admin workflow one validated step at a time", () => {
    expect(nextWorkflowStep("UPLOAD", false)).toBe("VALIDATE");
    expect(nextWorkflowStep("VALIDATE", false)).toBeNull();
    expect(nextWorkflowStep("VALIDATE", true)).toBe("DRAFT");
    expect(nextWorkflowStep("REVIEW", true)).toBe("READY");
    expect(nextWorkflowStep("READY", true)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* 2 — OFFICIAL BOOK QUESTIONS (21D)                                   */
/* ------------------------------------------------------------------ */

describe("21D — official book questions answer layer", () => {
  it("supports every real question type", () => {
    expect(OFFICIAL_QUESTION_TYPES).toHaveLength(8);
    expect(OFFICIAL_QUESTION_TYPES).toContain("multipart");
    expect(isAutoGradable("essay")).toBe(false);
    expect(isAutoGradable("short_text")).toBe(false);
    expect(isAutoGradable("single_choice")).toBe(true);
  });

  it("never serializes an answer into the initial client payload", () => {
    const raw = {
      id: "q1",
      question_type: "single_choice",
      question_text: "ما حكم المد؟",
      sort_order: 1,
      correct_option: "b",
      model_answer: "الإجابة النموذجية",
      options: [
        { id: "a", option_text: "أ", is_correct: false, why_wrong: "خطأ" },
        { id: "b", option_text: "ب", is_correct: true, why_correct: "صحيح" },
      ],
    };
    const publicQuestion = toPublicQuestion(raw);
    expect(containsAnswerLeak(raw)).toBe(true);
    expect(containsAnswerLeak(publicQuestion)).toBe(false);
    expect(JSON.stringify(publicQuestion)).not.toContain("الإجابة النموذجية");
    expect(publicQuestion.options).toHaveLength(2);
  });

  it("refuses to reveal before the student submits an answer", () => {
    const base = {
      servedRevisionId: "r1",
      attemptRevisionId: "r1",
      capabilityReady: true,
    };
    expect(evaluateReveal({ ...base, attemptSubmitted: false, submittedAnswer: null })).toEqual({
      allowed: false,
      reason: "NO_ATTEMPT_SUBMITTED",
    });
    expect(evaluateReveal({ ...base, attemptSubmitted: true, submittedAnswer: "" })).toEqual({
      allowed: false,
      reason: "EMPTY_SUBMISSION",
    });
  });

  it("fails closed on revision mismatch and unready lessons", () => {
    expect(
      evaluateReveal({
        attemptSubmitted: true,
        submittedAnswer: "x",
        servedRevisionId: "r1",
        attemptRevisionId: "r2",
        capabilityReady: true,
      }).reason,
    ).toBe("REVISION_MISMATCH");
    expect(
      evaluateReveal({
        attemptSubmitted: true,
        submittedAnswer: "x",
        servedRevisionId: "r1",
        attemptRevisionId: "r1",
        capabilityReady: false,
      }).reason,
    ).toBe("LESSON_NOT_READY");
  });

  it("grades auto-gradable types and marks essays as comparison-only", () => {
    const entry = {
      questionId: "q1",
      correctOptionIds: ["b"],
      modelAnswer: "إجابة نموذجية",
      explanation: "لأن...",
      rationales: [{ optionId: "b", whyCorrect: "صحيح" }],
    };
    expect(buildRevealPayload(entry, "single_choice", ["b"]).isCorrect).toBe(true);
    expect(buildRevealPayload(entry, "single_choice", ["a"]).isCorrect).toBe(false);
    const essay = buildRevealPayload(entry, "essay", []);
    expect(essay.isCorrect).toBeNull();
    expect(essay.comparisonOnly).toBe(true);
    expect(essay.modelAnswer).toBe("إجابة نموذجية");
  });
});

/* ------------------------------------------------------------------ */
/* 3 — SELF TEST (21E)                                                 */
/* ------------------------------------------------------------------ */

describe("21E — self test", () => {
  it("pins the served revision to the attempt", () => {
    const q = toPublicQuestion({ id: "q1", question_text: "س", revision_id: "rev-9" });
    expect(q.revisionId).toBe("rev-9");
    expect(
      evaluateReveal({
        attemptSubmitted: true,
        submittedAnswer: "a",
        servedRevisionId: q.revisionId,
        attemptRevisionId: "rev-9",
        capabilityReady: true,
      }).allowed,
    ).toBe(true);
  });

  it("keeps option rationale out of the pre-reveal payload", () => {
    const q = toPublicQuestion({
      id: "q1",
      question_text: "س",
      options: [{ id: "a", option_text: "أ", why_wrong: "تسريب" }],
    });
    expect(JSON.stringify(q)).not.toContain("تسريب");
  });

  it("reveals rationale only through the reveal payload", () => {
    const payload = buildRevealPayload(
      {
        questionId: "q1",
        correctOptionIds: ["a"],
        modelAnswer: null,
        explanation: "شرح تعليمي",
        rationales: [
          { optionId: "a", whyCorrect: "لأنها القاعدة" },
          { optionId: "b", whyWrong: "خلط بين قاعدتين" },
        ],
      },
      "single_choice",
      ["a"],
    );
    expect(payload.rationales).toHaveLength(2);
    expect(payload.explanation).toBe("شرح تعليمي");
  });
});

/* ------------------------------------------------------------------ */
/* 4 — READINESS (21F)                                                 */
/* ------------------------------------------------------------------ */

describe("21F — capability + readiness contract", () => {
  it("exposes exactly the seven final capabilities", () => {
    expect(V3_CAPABILITIES).toHaveLength(7);
    expect(V3_CAPABILITIES).not.toContain("originalBookPdf" as never);
    expect(V3_CAPABILITIES).not.toContain("studentPerformance" as never);
    expect(V3_CAPABILITIES).not.toContain("supportingResources" as never);
  });

  it("separates official from Tamkeen content", () => {
    expect(V3_CONTENT_OWNER.officialBookContent).toBe("OFFICIAL");
    expect(V3_CONTENT_OWNER.officialBookQuestions).toBe("OFFICIAL");
    expect(V3_CONTENT_OWNER.tamkeenExplanationHtml).toBe("TAMKEEN");
    expect(V3_CONTENT_OWNER.selfTest).toBe("TAMKEEN");
  });

  it("computes all four readiness levels for a complete lesson", () => {
    const r = computeV3Readiness(fullyReady);
    expect(r.bookReady).toBe(true);
    expect(r.learningReady).toBe(true);
    expect(r.assessmentReady).toBe(true);
    expect(r.fullyReady).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it("never requires the lab experiment by default", () => {
    const r = computeV3Readiness(fullyReady);
    expect(r.missingForLearning).not.toContain("labExperimentHtml");
  });

  it("requires the lab experiment when marked REQUIRED", () => {
    const app: ApplicabilityMap = { labExperimentHtml: "REQUIRED" };
    const r = computeV3Readiness(fullyReady, app);
    expect(r.learningReady).toBe(false);
    expect(r.missingForLearning).toContain("labExperimentHtml");
  });

  it("treats N/A capabilities as satisfied but hidden", () => {
    const noMap = contractFor({ resources: [] });
    expect(computeV3Readiness(noMap).learningReady).toBe(false);
    const r = computeV3Readiness(noMap, { mindMapHtml: "NA" });
    expect(r.learningReady).toBe(true);
    expect(studentV3Journey(noMap, { mindMapHtml: "NA" }).map((c) => c.key)).not.toContain(
      "mindMapHtml",
    );
  });

  it("fails closed when the official book content is missing", () => {
    const c = contractFor({ bookContents: [], inlineContent: null });
    const r = computeV3Readiness(c);
    expect(r.bookReady).toBe(false);
    expect(r.learningReady).toBe(false);
    expect(r.fullyReady).toBe(false);
    expect(r.missing).toContain("officialBookContent");
  });

  it("blocks ASSESSMENT_READY without questions or self test", () => {
    const c = contractFor({ questionsCount: 0, assessmentsCount: 0, lessonExamCount: 0 });
    const r = computeV3Readiness(c);
    expect(r.assessmentReady).toBe(false);
    expect(r.missingForAssessment).toEqual(["officialBookQuestions", "selfTest"]);
  });

  it("hides DRAFT capabilities from the student journey", () => {
    const c = contractFor({ lifecycle: { tamkeenExplanation: "DRAFT" } });
    expect(studentV3Journey(c).map((x) => x.key)).not.toContain("tamkeenExplanationHtml");
    expect(computeV3Readiness(c).learningReady).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* 5 — STUDENT UX (21G-B)                                              */
/* ------------------------------------------------------------------ */

describe("21G-B — student lesson journey", () => {
  it("renders the exact V3 order", () => {
    expect(V3_STUDENT_ORDER).toEqual([
      "officialBookContent",
      "tamkeenExplanationHtml",
      "lessonSummaryHtml",
      "mindMapHtml",
      "labExperimentHtml",
      "officialBookQuestions",
      "selfTest",
    ]);
    expect(studentV3Journey(fullyReady).map((c) => c.key)).toEqual([
      "officialBookContent",
      "tamkeenExplanationHtml",
      "lessonSummaryHtml",
      "mindMapHtml",
      "officialBookQuestions",
      "selfTest",
    ]);
  });

  it("keeps the shared contract order aligned with V3", () => {
    const v3Legacy = V3_STUDENT_ORDER.map((k) => V3_TO_LEGACY_KEY[k]);
    expect(STUDENT_CAPABILITY_ORDER.slice(0, 7)).toEqual(v3Legacy);
    expect(STUDENT_CAPABILITY_ORDER).not.toContain("originalBookPdf");
  });

  it("never emits empty or not-available cards", () => {
    const c = contractFor({ questionsCount: 0, assessmentsCount: 0, lessonExamCount: 0 });
    const journey = studentV3Journey(c);
    expect(journey.every((x) => x.ready)).toBe(true);
    expect(journey.map((x) => x.key)).not.toContain("officialBookQuestions");
  });

  it("derives progress from real capabilities only", () => {
    expect(v3ProgressTotal(fullyReady)).toBe(6);
    expect(v3ProgressTotal(contractFor({ resources: [] }))).toBe(5);
    expect(v3ProgressTotal(contractFor({ bookContents: [], inlineContent: null }))).toBe(5);
  });
});

/* ------------------------------------------------------------------ */
/* 6 — ADMIN (21G)                                                     */
/* ------------------------------------------------------------------ */

describe("21G — admin workspace view", () => {
  it("labels capability 7 as اختبر فهمك after official questions", () => {
    expect(V3_STUDENT_ORDER.slice(-2)).toEqual(["officialBookQuestions", "selfTest"]);
    expect(V3_LABEL_AR.selfTest).toBe("اختبر فهمك");
  });

  it("lists all seven capabilities with applicability and lifecycle state", () => {
    const view = buildV3CapabilityView(fullyReady, { labExperimentHtml: "NA" });
    expect(view).toHaveLength(7);
    expect(view.find((c) => c.key === "labExperimentHtml")?.applicability).toBe("NA");
    expect(view.find((c) => c.key === "officialBookContent")?.state.sourceRef).toContain(
      "lesson_book_contents",
    );
    expect(view.every((c) => typeof c.state.status === "string")).toBe(true);
  });

  it("keeps legacy PDF data reachable without making it a student step", () => {
    const c = contractFor({
      resources: [
        {
          id: "p1",
          resource_type: "pdf",
          title: "الكتاب",
          url: "supabase-storage://x/p1.pdf",
          is_primary: true,
        },
      ],
    });
    expect(c.originalBookPdf.present).toBe(true);
    expect(studentV3Journey(c).map((x) => x.key)).not.toContain("originalBookPdf" as never);
  });
});
