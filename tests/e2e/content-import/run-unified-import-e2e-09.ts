/**
 * CONTENT_AND_QUESTION_UNIFIED_OPERATIONAL_E2E_09 — the whole import suite as
 * one package (Non-Prod only).
 *
 * Drives every template together against a single subject/unit/lesson tree, in
 * the dependency order derived from the contract (never a hard-coded 01→09
 * list), through the real path: validate → prepare/stage → execute → review.
 *
 * Passes:
 *   1 first unified import
 *   2 exact replay of the same package        → idempotent
 *   3 partial update (one lesson, one question)
 *   4 existing question + new target          → TARGET_ADDED, no new revision
 *   5 broken file inside the package          → per-template rollback, later
 *                                               dependent templates never start
 *   6 review state + real student visibility / answer leakage (mandatory)
 *   7 domain teardown, audit jobs retained
 *
 * Safety rails: RUN_CONTENT_IMPORT_E2E=1 required; only `e2e-u9-`/`e2e-` rows
 * are ever written or deleted; import_jobs are kept for audit.
 *
 * Run:
 *   RUN_CONTENT_IMPORT_E2E=1 E2E_STAFF_USER_ID=<uuid> E2E_STUDENT_USER_ID=<uuid> \
 *     node --import tsx tests/e2e/content-import/run-unified-import-e2e-09.ts
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Database } from "@/integrations/supabase/types";
import type { ContentImportTemplateKey } from "@/lib/content-import/content-import-templates";
import { validateContentImportSheet } from "@/lib/content-import/content-import-validators";
import { parseContentImportBuffer } from "@/lib/content-import/content-import-dry-run.server";
import { createContentImportExecutionJob } from "@/lib/import/import-job-create.server";
import {
  buildStagingRows,
  executeContentImport,
  orderTemplatesByDependency,
  stageContentImportRows,
  type ExecuteTemplateResult,
} from "@/lib/import/import-staging.server";
import { IMPORT_EXECUTION_ORDER } from "@/lib/import/import-contract";
import { purgeE2eQuestions } from "./qb-e2e-teardown";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

if (process.env["RUN_CONTENT_IMPORT_E2E"] !== "1") {
  console.error("REFUSED: set RUN_CONTENT_IMPORT_E2E=1 (Non-Prod only).");
  process.exit(2);
}

const SUPABASE_URL = process.env["SUPABASE_URL"]!;
const PUBLISHABLE = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
const SERVICE_ROLE = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const STAFF_USER_ID = process.env["E2E_STAFF_USER_ID"]!;
const STUDENT_USER_ID = process.env["E2E_STUDENT_USER_ID"] ?? "";

if (!SUPABASE_URL || !PUBLISHABLE || !SERVICE_ROLE || !STAFF_USER_ID) {
  console.error("REFUSED: missing SUPABASE_URL / keys / E2E_STAFF_USER_ID.");
  process.exit(2);
}
if (!STUDENT_USER_ID) {
  // Draft visibility and answer leakage are security gates, not optional extras.
  console.error("UNIFIED_E2E_INCOMPLETE: E2E_STUDENT_USER_ID is required — NOT PASS.");
  process.exit(2);
}

/* ------------------------------------------------------------------ */

const results: Array<[string, "PASS" | "FAIL", string]> = [];
function check(label: string, ok: boolean, detail = ""): boolean {
  results.push([label, ok ? "PASS" : "FAIL", detail]);
  console.log(`[${ok ? "PASS" : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

const admin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient<Database>(SUPABASE_URL, PUBLISHABLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type RpcClient = {
  rpc: (
    n: string,
    a: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

/** Mint a real session for a user (magic-link → verify) so RLS applies. */
async function mintClient(userId: string): Promise<SupabaseClient<Database>> {
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
  });
  if (!userRes.ok) throw new Error(`admin get user failed: ${userRes.status}`);
  const user = (await userRes.json()) as { email?: string };
  if (!user.email) throw new Error(`user ${userId} has no email`);

  const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "magiclink", email: user.email }),
  });
  if (!linkRes.ok) throw new Error(`generate_link failed: ${linkRes.status}`);
  const link = (await linkRes.json()) as { hashed_token?: string };
  if (!link.hashed_token) throw new Error("generate_link returned no hashed_token");

  const client = createClient<Database>(SUPABASE_URL, PUBLISHABLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.hashed_token,
  });
  if (error || !data.session) throw new Error(`verifyOtp failed: ${error?.message}`);
  return client;
}

/* ------------------------------------------------------------------ */
/* The unified package                                                 */
/* ------------------------------------------------------------------ */

const PREFIX = "e2e-u9-";

/**
 * file per template — the package ships every content template.
 *
 * `assessment_questions` (template 08) is deliberately NOT part of the package:
 * imported questions are draft-only identity shells with no legacy
 * lesson/subject binding (that binding is what would leak drafts to students),
 * and `validate_assessment_question_link` refuses to link such a question. The
 * refusal is asserted explicitly in its own pass below (gap G-1).
 */
const PACKAGE_FILES: Record<string, string> = {
  subjects: "u09_01_subjects.xlsx",
  units: "u09_02_units.xlsx",
  lessons: "u09_03_lessons.xlsx",
  book_contents: "u09_04_book_contents.xlsx",
  explanations: "u09_05_explanations.xlsx",
  resources: "u09_06_resources.xlsx",
  assessments: "u09_07_assessments.xlsx",
  questions: "u09_09_questions.xlsx",
};

const PACKAGE_TEMPLATES = Object.keys(PACKAGE_FILES) as ContentImportTemplateKey[];

const EXPECTED_ROWS: Record<string, number> = {
  subjects: 1,
  units: 1,
  lessons: 2,
  book_contents: 1,
  explanations: 1,
  resources: 2,
  assessments: 1,
  questions: 3,
};

interface PackageRun {
  jobId: string | null;
  order: ContentImportTemplateKey[];
  results: Map<ContentImportTemplateKey, ExecuteTemplateResult>;
  executed: ContentImportTemplateKey[];
  failedTemplate: ContentImportTemplateKey | null;
  error: string | null;
  validationErrors: Array<[ContentImportTemplateKey, number]>;
}

async function readFixture(file: string) {
  const buffer = await readFile(join(FIXTURES, file));
  return { buffer, hash: createHash("sha256").update(buffer).digest("hex") };
}

/**
 * validate → stage every template into ONE job → execute the whole package in
 * contract dependency order. Exactly the admin path, batched as a package.
 */
async function runPackage(
  staff: SupabaseClient<Database>,
  files: Record<string, string>,
): Promise<PackageRun> {
  const templates = Object.keys(files) as ContentImportTemplateKey[];
  const order = orderTemplatesByDependency(templates);
  const validationErrors: Array<[ContentImportTemplateKey, number]> = [];

  const parsedPerTemplate = new Map<
    ContentImportTemplateKey,
    {
      rows: ReturnType<typeof buildStagingRows>;
      totalRows: number;
      validRows: number;
      warningRows: number;
    }
  >();

  let firstFile = "";
  let firstHash = "";
  let firstSize = 0;

  for (const templateKey of order) {
    const file = files[templateKey]!;
    const { buffer, hash } = await readFixture(file);
    if (!firstFile) {
      firstFile = file;
      firstHash = hash;
      firstSize = buffer.length;
    }
    const parsed = await parseContentImportBuffer(buffer, file, templateKey);
    const report = validateContentImportSheet(templateKey, parsed);
    if (report.status === "fail" || report.errorCount > 0) {
      validationErrors.push([templateKey, report.errorCount]);
      continue;
    }
    parsedPerTemplate.set(templateKey, {
      rows: buildStagingRows(templateKey, parsed, templateKey),
      totalRows: report.totalRows,
      validRows: report.validRows,
      warningRows: report.warningCount,
    });
  }

  if (validationErrors.length) {
    return {
      jobId: null,
      order,
      results: new Map(),
      executed: [],
      failedTemplate: validationErrors[0]![0],
      error: "VALIDATION_FAILED",
      validationErrors,
    };
  }

  const totals = [...parsedPerTemplate.values()].reduce(
    (acc, p) => ({
      totalRows: acc.totalRows + p.totalRows,
      validRows: acc.validRows + p.validRows,
      warningRows: acc.warningRows + p.warningRows,
    }),
    { totalRows: 0, validRows: 0, warningRows: 0 },
  );

  const { jobId } = await createContentImportExecutionJob(staff, STAFF_USER_ID, {
    templateKey: order[0]!,
    fileName: firstFile,
    fileSize: firstSize,
    fileHash: firstHash,
    ...totals,
  });

  for (const templateKey of order) {
    await stageContentImportRows(
      staff,
      jobId,
      templateKey,
      parsedPerTemplate.get(templateKey)!.rows,
    );
  }

  const exec = await executeContentImport(staff, jobId, order);
  const map = new Map<ContentImportTemplateKey, ExecuteTemplateResult>();
  for (const r of exec.results) map.set(r.templateKey, r);

  return {
    jobId,
    order,
    results: map,
    executed: exec.results.map((r) => r.templateKey),
    failedTemplate: exec.failedTemplate,
    error: exec.error,
    validationErrors,
  };
}

/* ------------------------------------------------------------------ */
/* Inspection helpers                                                  */
/* ------------------------------------------------------------------ */

async function subjectId(): Promise<string | null> {
  const { data } = await admin
    .from("subjects")
    .select("id")
    .eq("code", `${PREFIX}sub`)
    .maybeSingle();
  return data?.id ?? null;
}

async function lessonIdBySlug(slug: string): Promise<string | null> {
  const { data } = await admin.from("lessons").select("id").eq("slug", slug).maybeSingle();
  return data?.id ?? null;
}

async function packageQuestions() {
  const { data } = await admin
    .from("questions")
    .select("id, code, correct_index, options, current_published_revision_id")
    .like("code", `${PREFIX}q-%`)
    .order("code");
  return data ?? [];
}

async function revisionsOf(questionId: string) {
  const { data } = await admin
    .from("question_revisions")
    .select("id, revision_number, status, question_text")
    .eq("question_id", questionId)
    .order("revision_number");
  return data ?? [];
}

async function targetsOf(questionId: string) {
  const { data } = await admin
    .from("question_targets")
    .select("id, target_type")
    .eq("question_id", questionId);
  return data ?? [];
}

async function domainCounts(): Promise<string> {
  const tables = [
    admin.from("subjects").select("id", { count: "exact", head: true }),
    admin.from("units").select("id", { count: "exact", head: true }),
    admin.from("lessons").select("id", { count: "exact", head: true }),
    admin.from("lesson_book_contents").select("id", { count: "exact", head: true }),
    admin.from("lesson_explanations").select("id", { count: "exact", head: true }),
    admin.from("lesson_resources").select("id", { count: "exact", head: true }),
    admin.from("lesson_assessments").select("id", { count: "exact", head: true }),
    admin.from("assessment_questions").select("id", { count: "exact", head: true }),
    admin.from("questions").select("id", { count: "exact", head: true }),
  ];
  const rows = await Promise.all(tables);
  return rows.map((r) => r.count ?? -1).join("/");
}

/** Domain teardown for the package. import_jobs are deliberately retained. */
async function teardownDomain(): Promise<number> {
  await purgeE2eQuestions(admin);

  const sid = await subjectId();
  if (sid) {
    const { data: lessons } = await admin.from("lessons").select("id").eq("subject_id", sid);
    const lessonIds = (lessons ?? []).map((l) => l.id);
    if (lessonIds.length) {
      const { data: assessments } = await admin
        .from("lesson_assessments")
        .select("id")
        .in("lesson_id", lessonIds);
      const assessmentIds = (assessments ?? []).map((a) => a.id);
      if (assessmentIds.length) {
        await admin.from("assessment_questions").delete().in("assessment_id", assessmentIds);
        await admin.from("content_review_state").delete().in("entity_id", assessmentIds);
        await admin.from("lesson_assessments").delete().in("id", assessmentIds);
      }
      const { data: explanations } = await admin
        .from("lesson_explanations")
        .select("id")
        .in("lesson_id", lessonIds);
      const explanationIds = (explanations ?? []).map((e) => e.id);
      if (explanationIds.length) {
        await admin.from("content_review_state").delete().in("entity_id", explanationIds);
      }
      await admin.from("lesson_explanations").delete().in("lesson_id", lessonIds);
      await admin.from("lesson_resources").delete().in("lesson_id", lessonIds);
      await admin.from("lesson_book_contents").delete().in("lesson_id", lessonIds);
      await admin.from("content_review_state").delete().in("entity_id", lessonIds);
      await admin.from("lessons").delete().in("id", lessonIds);
    }

    const { data: units } = await admin.from("units").select("id").eq("subject_id", sid);
    const unitIds = (units ?? []).map((u) => u.id);
    if (unitIds.length) {
      await admin.from("content_review_state").delete().in("entity_id", unitIds);
      await admin.from("units").delete().in("id", unitIds);
    }
    await admin.from("content_review_state").delete().eq("entity_id", sid);
    await admin.from("subjects").delete().eq("id", sid);
  }

  const leftovers = await Promise.all([
    admin.from("subjects").select("id", { count: "exact", head: true }).like("code", `${PREFIX}%`),
    admin.from("units").select("id", { count: "exact", head: true }).like("code", `${PREFIX}%`),
    admin.from("lessons").select("id", { count: "exact", head: true }).like("slug", `${PREFIX}%`),
    admin.from("questions").select("id", { count: "exact", head: true }).like("code", `${PREFIX}%`),
  ]);
  return leftovers.reduce((sum, r) => sum + (r.count ?? 0), 0);
}

/* ------------------------------------------------------------------ */

async function main() {
  const staff = await mintClient(STAFF_USER_ID);
  check("00 staff session minted (real JWT, RLS applies)", true);

  await teardownDomain();
  const baseline = await domainCounts();

  // ---------------------------------------------------------------- order
  const contractOrder = IMPORT_EXECUTION_ORDER.filter((k) => PACKAGE_TEMPLATES.includes(k));
  const runnerOrder = orderTemplatesByDependency(PACKAGE_TEMPLATES);
  check(
    "01 runner order === contract dependency order (not the numeric 01→09 list)",
    JSON.stringify(runnerOrder) === JSON.stringify(contractOrder),
    runnerOrder.join(" → "),
  );
  const fullOrder = orderTemplatesByDependency([...PACKAGE_TEMPLATES, "assessment_questions"]);
  check(
    "02 dependency graph — parents precede children, questions precede the assessment link",
    fullOrder.indexOf("subjects") < fullOrder.indexOf("units") &&
      fullOrder.indexOf("units") < fullOrder.indexOf("lessons") &&
      fullOrder.indexOf("lessons") < fullOrder.indexOf("assessments") &&
      fullOrder.indexOf("assessments") < fullOrder.indexOf("assessment_questions") &&
      fullOrder.indexOf("questions") < fullOrder.indexOf("assessment_questions"),
    fullOrder.join(" → "),
  );

  // ---------------------------------------------------------------- pass 1
  const first = await runPackage(staff, PACKAGE_FILES);
  check(
    "03 first unified import → whole package applied in one job",
    first.error === null && first.executed.length === PACKAGE_TEMPLATES.length,
    `err=${first.error ?? "none"} executed=${first.executed.length}`,
  );
  for (const key of runnerOrder) {
    const r = first.results.get(key);
    check(
      `04 first import — ${key} inserted ${EXPECTED_ROWS[key]}`,
      !!r && r.inserted === EXPECTED_ROWS[key] && r.updated === 0 && r.blockedPublished === 0,
      `ins=${r?.inserted} upd=${r?.updated} skip=${r?.skipped}`,
    );
  }

  const sid = await subjectId();
  const lessonA = await lessonIdBySlug(`${PREFIX}les-01`);
  const lessonB = await lessonIdBySlug(`${PREFIX}les-02`);
  check("05 package tree exists (subject + both lessons)", !!sid && !!lessonA && !!lessonB);
  if (!sid || !lessonA || !lessonB) throw new Error("aborting: package tree missing");

  const questionsAfterFirst = await packageQuestions();
  check(
    "06 questions → 3 roots, all draft-only, no auto publish, no legacy answer key",
    questionsAfterFirst.length === 3 &&
      questionsAfterFirst.every(
        (q) =>
          q.current_published_revision_id === null &&
          q.correct_index === -1 &&
          Array.isArray(q.options) &&
          (q.options as unknown[]).length === 0,
      ),
    `roots=${questionsAfterFirst.length}`,
  );

  // G-1 — template 08 against imported (draft-only) questions.
  // The question root has no legacy lesson/subject binding on purpose, so the
  // link guard must refuse and write nothing.
  const linkRun = await runPackage(staff, {
    assessment_questions: "u09_08_assessment_questions.xlsx",
  });
  const { count: linkedCount } = await admin
    .from("assessment_questions")
    .select("id", { count: "exact", head: true })
    .in(
      "question_id",
      questionsAfterFirst.map((q) => q.id),
    );
  check(
    "07 G-1 — linking a draft-only question is refused, zero links written",
    linkRun.error !== null &&
      linkRun.failedTemplate === "assessment_questions" &&
      linkedCount === 0,
    `err=${linkRun.error ?? "none"} links=${linkedCount}`,
  );

  // ---------------------------------------------------------------- review state
  const { data: subjectReview } = await admin
    .from("content_review_state")
    .select("review_status, publication_status")
    .eq("entity_type", "subjects")
    .eq("entity_id", sid)
    .maybeSingle();
  check(
    "08 review state — imported subject is pending + draft",
    subjectReview?.review_status === "pending" && subjectReview?.publication_status === "draft",
    `${subjectReview?.review_status}/${subjectReview?.publication_status}`,
  );

  // ---------------------------------------------------------------- pass 2
  const replay = await runPackage(staff, PACKAGE_FILES);
  check(
    "09 exact replay → package-level idempotency (zero writes)",
    replay.error === null &&
      runnerOrder.every((k) => {
        const r = replay.results.get(k);
        return !!r && r.inserted === 0 && r.updated === 0 && r.skipped === EXPECTED_ROWS[k];
      }),
    runnerOrder.map((k) => `${k}:${replay.results.get(k)?.skipped ?? "-"}`).join(" "),
  );
  const revsAfterReplay = await revisionsOf(questionsAfterFirst[0]!.id);
  check(
    "10 replay → no extra question revision",
    revsAfterReplay.length === 1,
    `revs=${revsAfterReplay.length}`,
  );

  // ---------------------------------------------------------------- pass 3
  // Approve lesson B first so the hash-change reset is observable.
  await (staff as unknown as RpcClient).rpc("content_review_set_state", {
    _entity_type: "lessons",
    _entity_id: lessonB,
    _review_status: "approved",
    _publication_status: "draft",
  });

  const partial = await runPackage(staff, {
    ...PACKAGE_FILES,
    lessons: "u09_03_lessons_changed.xlsx",
    questions: "u09_09_questions_changed.xlsx",
  });
  const lessonsRes = partial.results.get("lessons");
  check(
    "11 partial update → only the changed lesson is updated, siblings skipped",
    partial.error === null && lessonsRes?.updated === 1 && lessonsRes?.skipped === 1,
    `upd=${lessonsRes?.updated} skip=${lessonsRes?.skipped}`,
  );
  check(
    "12 partial update → untouched templates stay skipped",
    ["subjects", "units", "book_contents", "explanations", "resources", "assessments"].every(
      (k) => {
        const r = partial.results.get(k as ContentImportTemplateKey);
        return !!r && r.inserted === 0 && r.updated === 0;
      },
    ),
  );
  const revsAfterChange = await revisionsOf(questionsAfterFirst[0]!.id);
  check(
    "13 changed question → new DRAFT revision, previous revision preserved",
    revsAfterChange.length === 2 &&
      revsAfterChange[1]!.status === "DRAFT" &&
      revsAfterChange[0]!.id === revsAfterReplay[0]!.id,
    `revs=${revsAfterChange.map((r) => `${r.revision_number}:${r.status}`).join(",")}`,
  );
  const { data: lessonBReview } = await admin
    .from("content_review_state")
    .select("review_status")
    .eq("entity_type", "lessons")
    .eq("entity_id", lessonB)
    .maybeSingle();
  check(
    "14 review state reset — approved lesson returns to pending after a content change",
    lessonBReview?.review_status === "pending",
    `${lessonBReview?.review_status}`,
  );

  // ---------------------------------------------------------------- pass 4
  const targetsBefore = await targetsOf(questionsAfterFirst[0]!.id);
  const retarget = await runPackage(staff, { questions: "u09_09_questions_retarget.xlsx" });
  const targetsAfter = await targetsOf(questionsAfterFirst[0]!.id);
  const revsAfterRetarget = await revisionsOf(questionsAfterFirst[0]!.id);
  check(
    "15 existing question + new target → TARGET_ADDED without a new revision",
    retarget.error === null &&
      targetsAfter.length === targetsBefore.length + 1 &&
      revsAfterRetarget.length === revsAfterChange.length,
    `targets ${targetsBefore.length}→${targetsAfter.length} revs=${revsAfterRetarget.length}`,
  );

  // ---------------------------------------------------------------- pass 5
  const countsBeforeFailure = await domainCounts();
  const broken = await runPackage(staff, {
    ...PACKAGE_FILES,
    lessons: "u09_03_lessons_broken.xlsx",
  });
  const countsAfterFailure = await domainCounts();

  check(
    "16 broken file → the failing template is reported and the package stops",
    broken.error !== null && broken.failedTemplate === "lessons",
    `failed=${broken.failedTemplate} err=${broken.error ?? "none"}`,
  );
  const brokenLesson = await lessonIdBySlug(`${PREFIX}les-broken`);
  check("17 broken template → full rollback, zero partial rows", brokenLesson === null);
  check(
    "18 atomicity is per-template — earlier committed templates survive untouched",
    countsBeforeFailure === countsAfterFailure,
    `${countsBeforeFailure} → ${countsAfterFailure}`,
  );
  const dependentsOfLessons = runnerOrder.slice(runnerOrder.indexOf("lessons") + 1);
  check(
    "19 templates after the failure were never started",
    dependentsOfLessons.every((k) => !broken.executed.includes(k)),
    `executed=${broken.executed.join(",") || "none"}`,
  );
  const { data: brokenJob } = await admin
    .from("import_jobs")
    .select("execution_state, status")
    .eq("id", broken.jobId ?? "")
    .maybeSingle();
  check(
    "20 failed job reaches a terminal failed state (no dangling 'applying')",
    brokenJob?.execution_state === "failed" && brokenJob?.status === "failed",
    `${brokenJob?.execution_state}/${brokenJob?.status}`,
  );
  const retryFailed = await executeContentImport(staff, broken.jobId!, ["subjects"]);
  check(
    "21 staged rows of a failed job cannot be executed later",
    retryFailed.error !== null,
    retryFailed.error ?? "execute succeeded (unexpected)",
  );

  // ---------------------------------------------------------------- pass 6
  const student = await mintClient(STUDENT_USER_ID);
  const sLessons = await student.from("lessons").select("id").like("slug", `${PREFIX}%`);
  check(
    "22 student → draft package lessons are not listed",
    (sLessons.data ?? []).length === 0,
    sLessons.error ? `blocked: ${sLessons.error.message}` : "empty",
  );
  const sLessonById = await student.from("lessons").select("id, title").eq("id", lessonA);
  check("23 student → direct lesson-by-id returns nothing", (sLessonById.data ?? []).length === 0);
  const sContent = await (student as unknown as RpcClient).rpc("get_lesson_full_content", {
    _lesson_id: lessonA,
  });
  check(
    "24 student → content RPC does not leak the draft lesson",
    !(sContent.data != null && JSON.stringify(sContent.data).includes(PREFIX)),
    sContent.error ? `blocked: ${sContent.error.message}` : "no leak",
  );
  const sOptions = await student.from("question_options").select("id, is_correct").limit(5);
  const sAnswers = await student.from("question_accepted_answers").select("id").limit(5);
  const sRevisions = await student.from("question_revisions").select("id").limit(5);
  check(
    "25 student → zero options / accepted answers / revisions readable",
    (sOptions.data ?? []).length === 0 &&
      (sAnswers.data ?? []).length === 0 &&
      (sRevisions.data ?? []).length === 0,
    `opts=${(sOptions.data ?? []).length} ans=${(sAnswers.data ?? []).length} revs=${(sRevisions.data ?? []).length}`,
  );
  const sQuestions = await student
    .from("questions")
    .select("id, correct_index, options")
    .like("code", `${PREFIX}q-%`);
  check(
    "26 student → no answer key on the question roots",
    (sQuestions.data ?? []).every(
      (q) =>
        q.correct_index === -1 && Array.isArray(q.options) && (q.options as unknown[]).length === 0,
    ),
    `rows=${(sQuestions.data ?? []).length}`,
  );
  const aOptions = await anon.from("question_options").select("id").limit(5);
  const aQuestions = await anon.from("questions").select("id").like("code", `${PREFIX}q-%`);
  check(
    "27 anonymous → nothing readable from the package question bank",
    (aOptions.data ?? []).length === 0 && (aQuestions.data ?? []).length === 0,
  );
  const finalQuestions = await packageQuestions();
  check(
    "28 no auto-publish — current_published_revision_id is NULL for every imported question",
    finalQuestions.length > 0 &&
      finalQuestions.every((q) => q.current_published_revision_id === null),
    `roots=${finalQuestions.length}`,
  );

  // ---------------------------------------------------------------- pass 7
  const { count: jobsBefore } = await admin
    .from("import_jobs")
    .select("id", { count: "exact", head: true })
    .eq("created_by", STAFF_USER_ID);
  const leftover = await teardownDomain();
  check("29 teardown — no e2e-u9 domain rows remain", leftover === 0, `leftover=${leftover}`);
  const after = await domainCounts();
  check(
    "30 teardown — domain counts back to the pre-run baseline",
    baseline === after,
    `${baseline} → ${after}`,
  );
  const { count: jobsAfter } = await admin
    .from("import_jobs")
    .select("id", { count: "exact", head: true })
    .eq("created_by", STAFF_USER_ID);
  check(
    "31 audit — import_jobs history retained through teardown",
    (jobsAfter ?? 0) >= (jobsBefore ?? 0) && (jobsAfter ?? 0) > 0,
    `${jobsBefore} → ${jobsAfter}`,
  );
  const { count: dangling } = await admin
    .from("import_jobs")
    .select("id", { count: "exact", head: true })
    .eq("created_by", STAFF_USER_ID)
    .eq("execution_state", "applying");
  check(
    "32 audit — zero jobs left in the 'applying' state",
    (dangling ?? 0) === 0,
    `applying=${dangling}`,
  );

  const failed = results.filter(([, s]) => s === "FAIL");
  console.log(
    `\n${results.length - failed.length}/${results.length} PASS — ${
      failed.length === 0 ? "UNIFIED_IMPORT_E2E_09_PASS" : "FAILURES PRESENT"
    }`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("HARNESS ERROR:", err);
  try {
    const leftover = await teardownDomain();
    console.error(`teardown after error, leftover=${leftover}`);
  } catch (cleanupErr) {
    console.error("teardown failed:", cleanupErr);
  }
  process.exit(1);
});
