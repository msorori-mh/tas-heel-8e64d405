import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const catalogPath = new URL(
  "../../scripts/teacher-academy/program-content/program-catalog.json",
  import.meta.url,
);
const standardPath = new URL(
  "../../docs/teacher-academy/program-production-standard.md",
  import.meta.url,
);
const generalUpgradePath = new URL(
  "../../scripts/teacher-academy/program-content/general-effective-teaching-v2.json",
  import.meta.url,
);
const generalUpgradeSqlPath = new URL(
  "../../scripts/teacher-academy/program-content/render-general-upgrade-sql.mjs",
  import.meta.url,
);
const chemistryProgramPath = new URL(
  "../../scripts/teacher-academy/program-content/chemistry-safe-practical-teaching-v1.json",
  import.meta.url,
);
const islamicProgramPath = new URL(
  "../../scripts/teacher-academy/program-content/islamic-effective-teaching-v1.json",
  import.meta.url,
);
const mathematicsProgramPath = new URL(
  "../../scripts/teacher-academy/program-content/mathematics-problem-solving-v1.json",
  import.meta.url,
);
const arabicProgramPath = new URL(
  "../../scripts/teacher-academy/program-content/arabic-effective-teaching-v1.json",
  import.meta.url,
);
const englishProgramPath = new URL(
  "../../scripts/teacher-academy/program-content/english-communicative-teaching-v1.json",
  import.meta.url,
);
const subjectProgramSqlPath = new URL(
  "../../scripts/teacher-academy/program-content/render-new-subject-program-sql.mjs",
  import.meta.url,
);

const [
  catalogSource,
  standard,
  generalUpgradeSource,
  generalUpgradeSql,
  chemistryProgramSource,
  islamicProgramSource,
  mathematicsProgramSource,
  arabicProgramSource,
  englishProgramSource,
  subjectProgramSql,
] = await Promise.all([
  readFile(catalogPath, "utf8"),
  readFile(standardPath, "utf8"),
  readFile(generalUpgradePath, "utf8"),
  readFile(generalUpgradeSqlPath, "utf8"),
  readFile(chemistryProgramPath, "utf8"),
  readFile(islamicProgramPath, "utf8"),
  readFile(mathematicsProgramPath, "utf8"),
  readFile(arabicProgramPath, "utf8"),
  readFile(englishProgramPath, "utf8"),
  readFile(subjectProgramSqlPath, "utf8"),
]);
const catalog = JSON.parse(catalogSource);
const generalUpgrade = JSON.parse(generalUpgradeSource);
const chemistryProgram = JSON.parse(chemistryProgramSource);
const islamicProgram = JSON.parse(islamicProgramSource);
const mathematicsProgram = JSON.parse(mathematicsProgramSource);
const arabicProgram = JSON.parse(arabicProgramSource);
const englishProgram = JSON.parse(englishProgramSource);

const expectedSubjects = [
  "ARABIC",
  "ISLAMIC",
  "MATHEMATICS",
  "ENGLISH",
  "PHYSICS",
  "CHEMISTRY",
  "BIOLOGY",
  "SOCIAL_STUDIES",
  "COMPUTER",
];

const assertCompleteSubjectProgram = (program, subjectCode, questionCount) => {
  assert.equal(program.bundleType, "NEW_SUBJECT_PROGRAM");
  assert.equal(program.metadata.audienceType, "SUBJECT_SPECIFIC");
  assert.equal(program.metadata.subjectCode, subjectCode);
  assert.equal(program.metadata.estimatedMinutes, 210);
  assert.ok(program.metadata.detailedDescription.length >= 500);
  assert.ok(program.metadata.objectives.length >= 4);
  assert.ok(program.metadata.prerequisites.length >= 3);
  assert.ok(program.metadata.instructions.length >= 5);
  assert.equal(program.lessons.length, 6);
  assert.equal(
    program.lessons.reduce((total, lesson) => total + lesson.durationMinutes, 0),
    program.metadata.estimatedMinutes,
  );
  for (const lesson of program.lessons) {
    assert.ok(lesson.durationMinutes >= 25 && lesson.durationMinutes <= 40);
    assert.ok(lesson.sections.objective.length >= 60);
    assert.ok(lesson.sections.introduction.length >= 120);
    assert.ok(lesson.sections.content.length >= 800);
    assert.ok(lesson.sections.example.length >= 200);
    assert.ok(lesson.sections.activity.length >= 180);
    assert.ok(lesson.sections.summary.length >= 100);
  }
  assert.equal(program.assessment.passPercentage, 75);
  assert.equal(program.assessment.questions.length, questionCount);
  assert.deepEqual(
    program.assessment.questions.map((question) => question.correctOption),
    Array.from({ length: questionCount }, (_, index) => "abcd"[index % 4]),
  );
  for (const question of program.assessment.questions) {
    assert.equal(question.options.length, 4);
    assert.equal(new Set(question.options).size, 4);
  }
  assert.equal(program.liveSessionPlan.durationMinutes, 75);
  assert.equal(program.liveSessionPlan.requiredForCertificate, false);
  assert.equal(
    program.liveSessionPlan.schedulingStatus,
    "AWAITING_CONFIRMED_SPEAKER_DATE_AND_HTTPS_LINK",
  );
  assert.equal("meetingUrl" in program.liveSessionPlan, false);
};

test("the specialty catalog covers the nine active academy subjects exactly once", () => {
  assert.equal(catalog.programType, "SUBJECT_SPECIFIC");
  assert.equal(catalog.programs.length, expectedSubjects.length);
  assert.deepEqual(
    catalog.programs.map((program) => program.subjectCode).sort(),
    [...expectedSubjects].sort(),
  );
  assert.equal(
    new Set(catalog.programs.map((program) => program.key)).size,
    catalog.programs.length,
  );
});

test("every foundational specialty program has fixed objectives, lessons, and a live-session plan", () => {
  for (const program of catalog.programs) {
    assert.match(program.key, /^[a-z0-9-]+$/);
    assert.ok(program.title.length >= 10);
    assert.ok(program.objectives.length >= 4 && program.objectives.length <= 6);
    assert.equal(program.lessons.length, 6);
    assert.equal(new Set(program.lessons).size, program.lessons.length);
    assert.ok(program.liveSessionTitle.length >= 15);
  }
});

test("assessment and live-session gates match the production standard", () => {
  assert.deepEqual(catalog.assessment, {
    questionCountMin: 12,
    questionCountMax: 15,
    passPercentage: 75,
  });
  assert.equal(catalog.liveSession.durationMinutesMin, 60);
  assert.equal(catalog.liveSession.durationMinutesMax, 90);
  assert.equal(catalog.liveSession.requiredForCertificate, false);
  assert.match(standard, /`SUBJECT_SPECIFIC`/);
  assert.match(standard, /مادة نشطة واحدة فقط/);
  assert.match(standard, /`OBJECTIVE`/);
  assert.match(standard, /`INTRODUCTION`/);
  assert.match(standard, /`CONTENT`/);
  assert.match(standard, /`EXAMPLE`/);
  assert.match(standard, /`ACTIVITY`/);
  assert.match(standard, /`SUMMARY`/);
  assert.match(standard, /12 إلى 15 سؤال/);
  assert.match(standard, /لا تُنشأ جلسة مؤقتة ببيانات وهمية/);
});

test("the general-program upgrade replaces generic learning scaffolds without inventing a session", () => {
  assert.equal(generalUpgrade.bundleType, "PUBLISHED_VERSION_UPGRADE");
  assert.equal(generalUpgrade.metadata.audienceType, "ALL_TEACHERS");
  assert.equal(generalUpgrade.metadata.estimatedMinutes, 180);
  assert.ok(generalUpgrade.metadata.objectives.length >= 4);
  assert.equal(generalUpgrade.lessonEnhancements.length, 8);
  assert.equal(
    new Set(generalUpgrade.lessonEnhancements.map((lesson) => lesson.sourceLessonTitle)).size,
    8,
  );
  assert.equal(
    generalUpgrade.lessonEnhancements.reduce((total, lesson) => total + lesson.durationMinutes, 0),
    generalUpgrade.metadata.estimatedMinutes,
  );
  for (const lesson of generalUpgrade.lessonEnhancements) {
    assert.ok(lesson.objective.length >= 60);
    assert.ok(lesson.introduction.length >= 120);
    assert.ok(lesson.example.length >= 180);
    assert.ok(lesson.activity.length >= 180);
    assert.ok(lesson.summary.length >= 100);
  }
  assert.equal(generalUpgrade.assessmentAdditions.length, 5);
  assert.deepEqual(
    generalUpgrade.assessmentAdditions.map((question) => question.correctOption),
    ["a", "b", "c", "d", "a"],
  );
  assert.equal(
    generalUpgrade.liveSessionPlan.schedulingStatus,
    "AWAITING_CONFIRMED_SPEAKER_DATE_AND_HTTPS_LINK",
  );
  assert.equal("meetingUrl" in generalUpgrade.liveSessionPlan, false);
});

test("the general-program production renderer is transactional, capability-bound, and fail-closed", () => {
  assert.match(generalUpgradeSql, /ACADEMY_ADMIN_EMAIL is required/);
  assert.match(generalUpgradeSql, /begin;/);
  assert.match(generalUpgradeSql, /set local role authenticated/);
  assert.match(generalUpgradeSql, /academy\.admin_create_draft_version/);
  assert.match(generalUpgradeSql, /academy\.admin_update_draft_program_v2/);
  assert.match(generalUpgradeSql, /academy\.admin_save_structured_lesson/);
  assert.match(generalUpgradeSql, /academy\.admin_add_assessment_question/);
  assert.match(generalUpgradeSql, /academy\.admin_validate_program/);
  assert.match(generalUpgradeSql, /ACADEMY_GENERAL_V2_UNCONFIRMED_SESSION_PRESENT/);
  assert.match(generalUpgradeSql, /academy\.admin_publish_program/);
  assert.match(generalUpgradeSql, /commit;/);
  assert.doesNotMatch(
    generalUpgradeSql.slice(generalUpgradeSql.lastIndexOf("commit;")),
    /current_setting\('academy\.release_draft_id'\)/,
  );
  assert.doesNotMatch(generalUpgradeSql, /session_replication_role/);
  assert.doesNotMatch(generalUpgradeSql, /disable trigger/i);
});

test("the chemistry pilot is a complete one-subject program with safe practical content", () => {
  assert.equal(chemistryProgram.bundleType, "NEW_SUBJECT_PROGRAM");
  assert.equal(chemistryProgram.metadata.audienceType, "SUBJECT_SPECIFIC");
  assert.equal(chemistryProgram.metadata.subjectCode, "CHEMISTRY");
  assert.equal(chemistryProgram.metadata.estimatedMinutes, 210);
  assert.equal(chemistryProgram.lessons.length, 6);
  assert.equal(
    chemistryProgram.lessons.reduce((total, lesson) => total + lesson.durationMinutes, 0),
    chemistryProgram.metadata.estimatedMinutes,
  );
  for (const lesson of chemistryProgram.lessons) {
    assert.ok(lesson.sections.objective.length >= 60);
    assert.ok(lesson.sections.introduction.length >= 120);
    assert.ok(lesson.sections.content.length >= 800);
    assert.ok(lesson.sections.example.length >= 200);
    assert.ok(lesson.sections.activity.length >= 180);
    assert.ok(lesson.sections.summary.length >= 100);
  }
  assert.equal(chemistryProgram.assessment.passPercentage, 75);
  assert.equal(chemistryProgram.assessment.questions.length, 15);
  assert.equal(
    chemistryProgram.liveSessionPlan.schedulingStatus,
    "AWAITING_CONFIRMED_SPEAKER_DATE_AND_HTTPS_LINK",
  );
  assert.equal("meetingUrl" in chemistryProgram.liveSessionPlan, false);
});

test("the Islamic education program is complete, source-bound, and privacy-safe", () => {
  assertCompleteSubjectProgram(islamicProgram, "ISLAMIC", 12);
  const source = JSON.stringify(islamicProgram);
  assert.match(source, /المصادر المعتمدة/);
  assert.match(source, /خصوصية/);
  assert.match(source, /فتوى شخصية/);
  assert.doesNotMatch(source, /https?:\/\//);
});

test("the mathematics program covers diagnosis, representations, errors, and reasoning", () => {
  assertCompleteSubjectProgram(mathematicsProgram, "MATHEMATICS", 12);
  const lessonTitles = mathematicsProgram.lessons.map((lesson) => lesson.title);
  assert.ok(lessonTitles.some((title) => title.includes("الفجوات")));
  assert.ok(lessonTitles.some((title) => title.includes("التمثيل")));
  assert.ok(lessonTitles.some((title) => title.includes("أخطاء")));
  assert.ok(lessonTitles.some((title) => title.includes("حل المشكلات")));
  assert.doesNotMatch(JSON.stringify(mathematicsProgram), /https?:\/\//);
});

test("the Arabic program integrates text, grammar, rhetoric, writing, and assessment", () => {
  assertCompleteSubjectProgram(arabicProgram, "ARABIC", 12);
  const lessonTitles = arabicProgram.lessons.map((lesson) => lesson.title).join(" ");
  assert.match(lessonTitles, /الأدب والنصوص/);
  assert.match(lessonTitles, /النحو والصرف/);
  assert.match(lessonTitles, /البلاغة/);
  assert.match(lessonTitles, /الكتابة/);
  assert.doesNotMatch(JSON.stringify(arabicProgram), /https?:\/\//);
});

test("the English program is communicative, integrated, and performance-assessed", () => {
  assertCompleteSubjectProgram(englishProgram, "ENGLISH", 12);
  const source = JSON.stringify(englishProgram);
  assert.match(source, /form وmeaning وuse/);
  assert.match(source, /القراءة والاستماع/);
  assert.match(source, /التحدث والكتابة/);
  assert.match(source, /غرض أو فجوة معلومات/);
  assert.doesNotMatch(source, /https?:\/\//);
});

test("the reusable subject-program renderer publishes only after exact validation", () => {
  assert.match(subjectProgramSql, /bundleType must be NEW_SUBJECT_PROGRAM/);
  assert.match(subjectProgramSql, /ACADEMY_SUBJECT_PROGRAM_ALREADY_EXISTS/);
  assert.match(subjectProgramSql, /set local role authenticated/);
  assert.match(subjectProgramSql, /academy\.admin_create_program_v2/);
  assert.match(subjectProgramSql, /academy\.admin_save_structured_lesson/);
  assert.match(subjectProgramSql, /ACADEMY_SUBJECT_PROGRAM_DURATION_INVALID/);
  assert.match(subjectProgramSql, /ACADEMY_SUBJECT_PROGRAM_UNCONFIRMED_SESSION_PRESENT/);
  assert.match(subjectProgramSql, /academy\.admin_validate_program/);
  assert.match(subjectProgramSql, /academy\.admin_publish_program/);
  assert.match(subjectProgramSql, /commit;/);
  assert.doesNotMatch(
    subjectProgramSql.slice(subjectProgramSql.lastIndexOf("commit;")),
    /current_setting\('academy\.release_program_version_id'\)/,
  );
  assert.doesNotMatch(subjectProgramSql, /session_replication_role/);
  assert.doesNotMatch(subjectProgramSql, /disable trigger/i);
});
