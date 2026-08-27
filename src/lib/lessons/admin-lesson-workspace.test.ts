import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { htmlPreviewText, summarizeAdminLessonQuestions } from "./admin-lesson-workspace";
import { V3_CAPABILITIES, V3_LABEL_AR } from "./content-v3";
import { buildLessonCapabilityContract } from "./lesson-content-contract";

const ADMIN_ROUTE_SOURCE = readFileSync(
  "src/routes/_authenticated/admin.lesson-content.$lessonId.tsx",
  "utf8",
);
const WORKSPACE_SOURCE = readFileSync("src/components/admin/LessonContentWorkspace.tsx", "utf8");

describe("admin lesson capability vocabulary", () => {
  it("uses the approved seven labels in the approved order", () => {
    assert.deepEqual(
      V3_CAPABILITIES.map((key) => V3_LABEL_AR[key]),
      [
        "محتوى الكتاب",
        "شرح تمكين",
        "ملخص الدرس",
        "الخريطة الذهنية",
        "التجربة المعملية",
        "أسئلة الكتاب",
        "اختبر فهمك",
      ],
    );
  });

  it("recognizes canonical HTML mind-map and lab resources", () => {
    const contract = buildLessonCapabilityContract({
      lessonTitle: "درس",
      bookContents: [],
      explanations: [],
      summaries: [],
      simulations: [],
      resources: [
        {
          id: "map",
          resource_type: "link",
          title: "خريطة",
          url: "",
          html_resource_type: "mind_map_html",
          resource_code: "MAP-1",
          lifecycle_status: "published",
        },
        {
          id: "lab",
          resource_type: "link",
          title: "تجربة",
          url: "",
          html_resource_type: "practical_experiment_html",
          resource_code: "LAB-1",
          lifecycle_status: "published",
        },
      ],
      officialQuestionsCount: 0,
      selfTestQuestionsCount: 0,
      assessmentsCount: 0,
    });
    assert.equal(contract.mindMap.status, "READY");
    assert.equal(contract.simulation.status, "READY");
  });

  it("keeps an unpublished canonical lab resource in draft", () => {
    const contract = buildLessonCapabilityContract({
      lessonTitle: "درس",
      bookContents: [],
      explanations: [],
      summaries: [],
      simulations: [],
      resources: [
        {
          id: "lab",
          resource_type: "link",
          title: "تجربة",
          url: "",
          html_resource_type: "practical_experiment_html",
          resource_code: "LAB-DRAFT",
          lifecycle_status: "in_review",
        },
      ],
      officialQuestionsCount: 0,
      selfTestQuestionsCount: 0,
      assessmentsCount: 0,
    });
    assert.equal(contract.simulation.status, "DRAFT");
    assert.equal(contract.simulation.studentVisible, false);
  });
});

describe("admin lesson publishing surface", () => {
  it("routes approval to the attested import center and exposes no direct transition", () => {
    assert.doesNotMatch(ADMIN_ROUTE_SOURCE, /transitionCapability|lesson_capability_transition/);
    assert.doesNotMatch(WORKSPACE_SOURCE, /onTransition|transitionCapability/);
    assert.match(WORKSPACE_SOURCE, /to="\/admin\/import"/);
    assert.match(WORKSPACE_SOURCE, /المراجعة والاعتماد الموثق/);
  });

  it("loads role revisions instead of counting assessment containers", () => {
    assert.match(ADMIN_ROUTE_SOURCE, /educational_label/);
    assert.match(ADMIN_ROUTE_SOURCE, /summarizeAdminLessonQuestions/);
    assert.doesNotMatch(ADMIN_ROUTE_SOURCE, /lesson_assessments|exam_templates/);
  });
});

describe("admin lesson question truth", () => {
  it("classifies only by the latest explicit educational role", () => {
    const summary = summarizeAdminLessonQuestions(
      [
        { id: "q1", question_type: "multiple_choice", current_published_revision_id: "r2" },
        { id: "q2", question_type: "EXTENDED_RESPONSE", current_published_revision_id: null },
        { id: "q3", question_type: "multiple_choice", current_published_revision_id: null },
      ],
      [
        {
          id: "r1",
          question_id: "q1",
          educational_label: "SELF_TEST",
          status: "PUBLISHED",
          revision_number: 1,
          interaction_type: "SINGLE_CHOICE",
          grading_mode: "AUTO_SINGLE",
        },
        {
          id: "r2",
          question_id: "q1",
          educational_label: "OFFICIAL_BOOK_QUESTION",
          status: "PUBLISHED",
          revision_number: 2,
          interaction_type: "SINGLE_CHOICE",
          grading_mode: "AUTO_SINGLE",
        },
        {
          id: "r3",
          question_id: "q2",
          educational_label: "OFFICIAL_BOOK_QUESTION",
          status: "REVIEW",
          revision_number: 1,
          interaction_type: "EXTENDED_RESPONSE",
          grading_mode: "MANUAL",
        },
      ],
    );

    assert.deepEqual(summary.officialBook, {
      count: 2,
      publishedCount: 1,
      types: { multiple_choice: 1, EXTENDED_RESPONSE: 1 },
    });
    assert.equal(summary.selfTest.count, 0);
    assert.equal(summary.unclassifiedCount, 1);
  });

  it("keeps structurally invalid self-test revisions out of ready counts", () => {
    const summary = summarizeAdminLessonQuestions(
      [{ id: "q1", question_type: "multiple_choice", current_published_revision_id: null }],
      [
        {
          id: "r1",
          question_id: "q1",
          educational_label: "SELF_TEST",
          status: "REVIEW",
          revision_number: 1,
          interaction_type: "EXTENDED_RESPONSE",
          grading_mode: "MANUAL",
        },
      ],
    );
    assert.equal(summary.selfTest.count, 0);
    assert.equal(summary.invalidSelfTestCount, 1);
  });

  it("reports the pinned published revision even while a newer draft is reviewed", () => {
    const summary = summarizeAdminLessonQuestions(
      [{ id: "q1", question_type: "EXTENDED_RESPONSE", current_published_revision_id: "r1" }],
      [
        {
          id: "r1",
          question_id: "q1",
          educational_label: "OFFICIAL_BOOK_QUESTION",
          status: "PUBLISHED",
          revision_number: 1,
          interaction_type: "EXTENDED_RESPONSE",
          grading_mode: "MANUAL",
        },
        {
          id: "r2",
          question_id: "q1",
          educational_label: "OFFICIAL_BOOK_QUESTION",
          status: "REVIEW",
          revision_number: 2,
          interaction_type: "EXTENDED_RESPONSE",
          grading_mode: "MANUAL",
        },
      ],
    );
    assert.equal(summary.officialBook.count, 1);
    assert.equal(summary.officialBook.publishedCount, 1);
  });
});

describe("admin authored HTML preview", () => {
  it("shows content text without document markup or executable blocks", () => {
    assert.equal(
      htmlPreviewText(
        "<!doctype html><html><head><title>سرّي</title><style>.x{}</style></head><body><h1>سورة السجدة</h1><script>alert(1)</script><p>مراجعة&nbsp;الدلالات</p></body></html>",
      ),
      "سورة السجدة مراجعة الدلالات",
    );
  });
});
