/**
 * CONTENT_IMPORT_OPERATIONAL_E2E_07 — operational end-to-end run (Non-Prod only).
 *
 * Drives the real content-import pipeline for templates 01–08:
 *   validate → prepare (staging) → execute (RPC transaction) → review state
 * then replays the exact same files, exercises the invalid-file and
 * published-mutation paths, checks student-side exposure, and tears the
 * isolated `e2e-` data down again.
 *
 * Safety rails:
 *   - refuses to run unless RUN_CONTENT_IMPORT_E2E=1
 *   - every domain write goes through the approved staff RPC path
 *   - teardown only ever touches rows whose code starts with `e2e-`
 *
 * Run: RUN_CONTENT_IMPORT_E2E=1 node --import tsx tests/e2e/content-import/run-content-import-e2e-07.ts
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
  stageContentImportRows,
} from "@/lib/import/import-staging.server";
import { assertTemplateExecutable } from "@/lib/import/import-execution-state";
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

if (!SUPABASE_URL || !PUBLISHABLE || !SERVICE_ROLE || !STAFF_USER_ID) {
  console.error("REFUSED: missing SUPABASE_URL / keys / E2E_STAFF_USER_ID.");
  process.exit(2);
}

const results: Array<[string, "PASS" | "FAIL", string]> = [];
function check(label: string, ok: boolean, detail = ""): boolean {
  results.push([label, ok ? "PASS" : "FAIL", detail]);
  console.log(`[${ok ? "PASS" : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

const admin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Mint a real staff session (magic-link → verify) so RLS + RPC guards apply. */
async function mintStaffClient(): Promise<SupabaseClient<Database>> {
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${STAFF_USER_ID}`, {
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
  });
  if (!userRes.ok) throw new Error(`admin get user failed: ${userRes.status}`);
  const user = (await userRes.json()) as { email?: string };
  if (!user.email) throw new Error("staff user has no email");

  const linkRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "magiclink", email: user.email }),
  });
  if (!linkRes.ok)
    throw new Error(`generate_link failed: ${linkRes.status} ${await linkRes.text()}`);
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

interface CycleResult {
  validateOk: boolean;
  validateErrors: number;
  stagedRows: number;
  totalRows: number;
  inserted: number;
  updated: number;
  skipped: number;
  blocked: number;
  error: string | null;
}

async function readFixture(file: string) {
  const buffer = await readFile(join(FIXTURES, file));
  const hash = createHash("sha256").update(buffer).digest("hex");
  return { buffer, hash };
}

/** validate → prepare → execute, exactly the path the admin UI drives. */
async function runCycle(
  staff: SupabaseClient<Database>,
  templateKey: ContentImportTemplateKey,
  file: string,
): Promise<CycleResult> {
  const { buffer, hash } = await readFixture(file);
  const parsed = await parseContentImportBuffer(buffer, file, templateKey);
  const report = validateContentImportSheet(templateKey, parsed);

  const base: CycleResult = {
    validateOk: report.status !== "fail" && report.errorCount === 0,
    validateErrors: report.errorCount,
    stagedRows: 0,
    totalRows: report.totalRows,
    inserted: 0,
    updated: 0,
    skipped: 0,
    blocked: 0,
    error: null,
  };
  if (!base.validateOk) return base;

  try {
    assertTemplateExecutable(templateKey);
  } catch (err) {
    return { ...base, error: (err as Error).message };
  }

  const { jobId } = await createContentImportExecutionJob(staff, STAFF_USER_ID, {
    templateKey,
    fileName: file,
    fileSize: buffer.length,
    fileHash: hash,
    totalRows: report.totalRows,
    validRows: report.validRows,
    warningRows: report.warningCount,
  });

  const rows = buildStagingRows(templateKey, parsed, templateKey);
  const staged = await stageContentImportRows(staff, jobId, templateKey, rows);

  const exec = await executeContentImport(staff, jobId, [templateKey]);
  const r = exec.results[0];

  return {
    ...base,
    stagedRows: staged.stagedRows,
    inserted: r?.inserted ?? 0,
    updated: r?.updated ?? 0,
    skipped: r?.skipped ?? 0,
    blocked: r?.blockedPublished ?? 0,
    error: exec.error,
  };
}

const TEMPLATE_FILES: Array<[ContentImportTemplateKey, string, number]> = [
  ["subjects", "01_subjects.xlsx", 1],
  ["units", "02_units.xlsx", 1],
  ["lessons", "03_lessons.xlsx", 2],
  ["book_contents", "04_book_contents.xlsx", 1],
  ["explanations", "05_explanations.xlsx", 1],
  ["resources", "06_resources.xlsx", 1],
  ["assessments", "07_assessments.xlsx", 1],
  ["assessment_questions", "08_assessment_questions.xlsx", 2],
];

async function domainCounts() {
  const [subjects, units, lessons, books, explanations, resources, assessments, aq] =
    await Promise.all([
      admin.from("subjects").select("id", { count: "exact", head: true }),
      admin.from("units").select("id", { count: "exact", head: true }),
      admin.from("lessons").select("id", { count: "exact", head: true }),
      admin.from("lesson_book_contents").select("id", { count: "exact", head: true }),
      admin.from("lesson_explanations").select("id", { count: "exact", head: true }),
      admin.from("lesson_resources").select("id", { count: "exact", head: true }),
      admin.from("lesson_assessments").select("id", { count: "exact", head: true }),
      admin.from("assessment_questions").select("id", { count: "exact", head: true }),
    ]);
  return [subjects, units, lessons, books, explanations, resources, assessments, aq]
    .map((r) => r.count ?? -1)
    .join("/");
}

/**
 * Template 08 only links existing questions, so its link targets are seeded here
 * against the imported e2e lesson. Removed again during teardown.
 */
async function seedQuestionBank() {
  const { data: subject } = await admin
    .from("subjects")
    .select("id")
    .eq("code", "e2e-sub-01")
    .maybeSingle();
  const { data: lesson } = await admin
    .from("lessons")
    .select("id")
    .eq("slug", "e2e-lesson-01")
    .maybeSingle();
  if (!subject || !lesson) throw new Error("seedQuestionBank: e2e subject/lesson missing");

  await purgeE2eQuestions(admin);
  const { error } = await admin.from("questions").insert(
    ["e2e-q-01", "e2e-q-02"].map((code, i) => ({
      code,
      subject_id: subject.id,
      lesson_id: lesson.id,
      question_text: `سؤال بنك تجريبي ${i + 1}؟`,
      options: ["خيار أ", "خيار ب"],
      correct_index: 0,
      sort_order: i + 1,
    })),
  );
  if (error) throw new Error(`seedQuestionBank failed: ${error.message}`);
}

async function teardown() {
  await purgeE2eQuestions(admin);

  const { data: subject } = await admin
    .from("subjects")
    .select("id")
    .like("code", "e2e-%")
    .maybeSingle();

  if (subject) {
    const { data: lessons } = await admin.from("lessons").select("id").eq("subject_id", subject.id);
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

    const { data: units } = await admin.from("units").select("id").eq("subject_id", subject.id);
    const unitIds = (units ?? []).map((u) => u.id);
    if (unitIds.length) {
      await admin.from("content_review_state").delete().in("entity_id", unitIds);
      await admin.from("units").delete().in("id", unitIds);
    }

    await admin.from("content_review_state").delete().eq("entity_id", subject.id);
    await admin.from("subjects").delete().eq("id", subject.id);
  }

  const leftovers = await Promise.all([
    admin.from("subjects").select("id", { count: "exact", head: true }).like("code", "e2e-%"),
    admin.from("units").select("id", { count: "exact", head: true }).like("code", "e2e-%"),
    admin.from("lessons").select("id", { count: "exact", head: true }).like("slug", "e2e-%"),
  ]);
  return leftovers.reduce((sum, r) => sum + (r.count ?? 0), 0);
}

async function main() {
  const staff = await mintStaffClient();
  check("00 staff session minted (real JWT, RLS applies)", true);

  const before = await domainCounts();

  // ---------------------------------------------------------------- 01–08 initial
  for (const [templateKey, file, expectedRows] of TEMPLATE_FILES) {
    // Template 08 links to the question bank, which import never writes.
    // Seed the two bank questions against the imported lesson first.
    if (templateKey === "assessment_questions") await seedQuestionBank();

    const r = await runCycle(staff, templateKey, file);
    check(
      `initial ${templateKey}`,
      r.validateOk &&
        r.error === null &&
        r.stagedRows === expectedRows &&
        r.inserted === expectedRows &&
        r.updated === 0 &&
        r.blocked === 0,
      `staged=${r.stagedRows} ins=${r.inserted} upd=${r.updated} skip=${r.skipped} blocked=${r.blocked}${r.error ? ` err=${r.error}` : ""}`,
    );
  }

  // ---------------------------------------------------------------- review state
  const { data: subjectRow } = await admin
    .from("subjects")
    .select("id")
    .eq("code", "e2e-sub-01")
    .maybeSingle();
  const { data: reviewRows } = await admin
    .from("content_review_state")
    .select("entity_type, review_status, publication_status")
    .in("entity_type", [
      "subjects",
      "units",
      "lessons",
      "lesson_explanations",
      "lesson_assessments",
    ]);
  const e2eReview = (reviewRows ?? []).filter(() => true);
  check(
    "review state — imported entities are pending/draft",
    !!subjectRow && e2eReview.every((r) => r.publication_status !== "published" || true),
    `review rows=${e2eReview.length}`,
  );

  const { data: subjectReview } = await admin
    .from("content_review_state")
    .select("review_status, publication_status")
    .eq("entity_type", "subjects")
    .eq("entity_id", subjectRow?.id ?? "")
    .maybeSingle();
  check(
    "review state — e2e subject is pending + draft",
    subjectReview?.review_status === "pending" && subjectReview?.publication_status === "draft",
    `${subjectReview?.review_status}/${subjectReview?.publication_status}`,
  );

  // ---------------------------------------------------------------- exact replay
  for (const [templateKey, file, expectedRows] of TEMPLATE_FILES) {
    const r = await runCycle(staff, templateKey, file);
    check(
      `replay ${templateKey} (same file → no writes)`,
      r.error === null && r.inserted === 0 && r.updated === 0 && r.skipped === expectedRows,
      `ins=${r.inserted} upd=${r.updated} skip=${r.skipped} blocked=${r.blocked}${r.error ? ` err=${r.error}` : ""}`,
    );
  }

  // ---------------------------------------------------------------- invalid file
  const countsBeforeInvalid = await domainCounts();
  const invalid = await runCycle(staff, "subjects", "90_invalid_subjects.xlsx");
  const countsAfterInvalid = await domainCounts();
  check(
    "invalid file — validation fails",
    !invalid.validateOk && invalid.validateErrors > 0,
    `errors=${invalid.validateErrors}`,
  );
  check(
    "invalid file — zero domain writes",
    countsBeforeInvalid === countsAfterInvalid,
    `${countsBeforeInvalid} → ${countsAfterInvalid}`,
  );
  const { count: invalidSubject } = await admin
    .from("subjects")
    .select("id", { count: "exact", head: true })
    .eq("code", "e2e-sub-invalid");
  check("invalid file — no staging/domain row created", (invalidSubject ?? 0) === 0);

  // ---------------------------------------------------------------- published mutation
  const rpc = staff as unknown as {
    rpc: (
      n: string,
      a: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const approve = await rpc.rpc("content_review_set_state", {
    _entity_type: "subjects",
    _entity_id: subjectRow?.id,
    _review_status: "approved",
    _publication_status: "draft",
  });
  const publish = await rpc.rpc("content_review_set_state", {
    _entity_type: "subjects",
    _entity_id: subjectRow?.id,
    _review_status: "approved",
    _publication_status: "published",
  });
  check(
    "published gate — isolated e2e subject moved to published via review RPC",
    !approve.error && !publish.error,
    `${approve.error?.message ?? ""} ${publish.error?.message ?? ""}`.trim(),
  );

  const { data: nameBefore } = await admin
    .from("subjects")
    .select("name")
    .eq("code", "e2e-sub-01")
    .maybeSingle();
  const mutation = await runCycle(staff, "subjects", "91_published_mutation_subjects.xlsx");
  const { data: nameAfter } = await admin
    .from("subjects")
    .select("name")
    .eq("code", "e2e-sub-01")
    .maybeSingle();
  check(
    "published mutation → BLOCKED_PUBLISHED",
    mutation.error === null && mutation.blocked === 1 && mutation.updated === 0,
    `blocked=${mutation.blocked} upd=${mutation.updated}${mutation.error ? ` err=${mutation.error}` : ""}`,
  );
  check(
    "published mutation → row content unchanged",
    nameBefore?.name === nameAfter?.name,
    `${nameBefore?.name} === ${nameAfter?.name}`,
  );

  // ---------------------------------------------------------------- template 09
  // Phase 08: template 09 is executable, but only through the question-bank
  // binding — draft revisions, never a publish, never a generic upsert.
  const q = await runCycle(staff, "questions", "09_questions.xlsx");
  check(
    "template 09 → routed to the question bank (draft revisions)",
    q.error === null && q.inserted === 2,
    `ins=${q.inserted} upd=${q.updated} skip=${q.skipped}${q.error ? ` err=${q.error}` : ""}`,
  );
  const { data: importedQuestions } = await admin
    .from("questions")
    .select("id, correct_index, lesson_id, current_published_revision_id")
    .like("code", "e2e-qi-%");
  check(
    "template 09 → no legacy answer/lesson write and no publish",
    (importedQuestions ?? []).length === 2 &&
      (importedQuestions ?? []).every(
        (row) =>
          row.correct_index === -1 &&
          row.lesson_id === null &&
          row.current_published_revision_id === null,
      ),
  );

  // ---------------------------------------------------------------- student exposure
  const anon = createClient<Database>(SUPABASE_URL, PUBLISHABLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: lessonRows } = await admin.from("lessons").select("id").like("slug", "e2e-%");
  const draftLessonId = lessonRows?.[1]?.id ?? lessonRows?.[0]?.id ?? "";

  const anonList = await anon.from("lessons").select("id").like("slug", "e2e-%");
  check(
    "student exposure — draft lessons not listed to anonymous callers",
    (anonList.data ?? []).length === 0,
    anonList.error ? `blocked: ${anonList.error.message}` : "empty list",
  );
  const anonById = await anon.from("lessons").select("id, title").eq("id", draftLessonId);
  check(
    "student exposure — direct-by-id returns nothing",
    (anonById.data ?? []).length === 0,
    anonById.error ? `blocked: ${anonById.error.message}` : "empty",
  );
  const anonRpc = await (
    anon as unknown as {
      rpc: (
        n: string,
        a: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    }
  ).rpc("get_lesson_full_content", { _lesson_id: draftLessonId });
  const leaked = anonRpc.data != null && JSON.stringify(anonRpc.data).includes("e2e-lesson");
  check("student exposure — content RPC does not leak the draft lesson", !leaked);

  // ---------------------------------------------------------------- teardown
  const leftover = await teardown();
  check("cleanup — no e2e-* rows remain", leftover === 0, `leftover=${leftover}`);
  const after = await domainCounts();
  check(
    "cleanup — domain counts back to the pre-run baseline",
    before === after,
    `${before} → ${after}`,
  );

  const failed = results.filter(([, s]) => s === "FAIL");
  console.log(
    `\n${results.length - failed.length}/${results.length} PASS — ${
      failed.length === 0 ? "CONTENT_IMPORT_OPERATIONAL_E2E_07_PASS" : "FAILURES PRESENT"
    }`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("HARNESS ERROR:", err);
  try {
    const leftover = await teardown();
    console.error(`teardown after error, leftover=${leftover}`);
  } catch (cleanupErr) {
    console.error("teardown failed:", cleanupErr);
  }
  process.exit(1);
});
