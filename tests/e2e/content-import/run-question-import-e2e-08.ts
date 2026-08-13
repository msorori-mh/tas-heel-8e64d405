/**
 * QUESTION_IMPORT_QB_BINDING_08 — Template 09 end-to-end (Non-Prod only).
 *
 * Drives the real pipeline (validate → prepare → execute) for template 09 and
 * proves the question-bank binding:
 *   - import creates DRAFT revisions only, never publishes
 *   - exact replay is a no-op (idempotency)
 *   - same content + new target = TARGET_ADDED, no new revision
 *   - changed content = new DRAFT revision, previous revision preserved
 *   - a published revision is never mutated (PUBLISHED_PRESERVED_NEW_REVISION)
 *   - a mid-batch failure rolls the whole template back
 *   - a tampered staged payload is refused (HASH_MISMATCH)
 *   - concurrent executes of the same question_code stay consistent
 *   - answers never leak to anon/student, internal RPC is not client-callable
 *
 * Safety rails: RUN_CONTENT_IMPORT_E2E=1 required; teardown only touches `e2e-`.
 *
 * Run: RUN_CONTENT_IMPORT_E2E=1 node --import tsx tests/e2e/content-import/run-question-import-e2e-08.ts
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
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

interface CycleResult {
  validateOk: boolean;
  validateErrors: number;
  jobId: string | null;
  inserted: number;
  updated: number;
  skipped: number;
  blocked: number;
  error: string | null;
}

async function prepare(
  staff: SupabaseClient<Database>,
  templateKey: ContentImportTemplateKey,
  file: string,
): Promise<{ jobId: string; validateOk: boolean; validateErrors: number } | { jobId: null; validateOk: false; validateErrors: number }> {
  const buffer = await readFile(join(FIXTURES, file));
  const hash = createHash("sha256").update(buffer).digest("hex");
  const parsed = await parseContentImportBuffer(buffer, file, templateKey);
  const report = validateContentImportSheet(templateKey, parsed);
  if (report.status === "fail" || report.errorCount > 0) {
    return { jobId: null, validateOk: false, validateErrors: report.errorCount };
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
  await stageContentImportRows(staff, jobId, templateKey, rows);
  return { jobId, validateOk: true, validateErrors: 0 };
}

async function runCycle(
  staff: SupabaseClient<Database>,
  templateKey: ContentImportTemplateKey,
  file: string,
): Promise<CycleResult> {
  const p = await prepare(staff, templateKey, file);
  if (!p.jobId) {
    return {
      validateOk: false,
      validateErrors: p.validateErrors,
      jobId: null,
      inserted: 0,
      updated: 0,
      skipped: 0,
      blocked: 0,
      error: "VALIDATION_FAILED",
    };
  }
  const exec = await executeContentImport(staff, p.jobId, [templateKey]);
  const r = exec.results[0];
  return {
    validateOk: true,
    validateErrors: 0,
    jobId: p.jobId,
    inserted: r?.inserted ?? 0,
    updated: r?.updated ?? 0,
    skipped: r?.skipped ?? 0,
    blocked: r?.blockedPublished ?? 0,
    error: exec.error,
  };
}

/* ------------------------------------------------------------------ */
/* Question bank inspection helpers                                    */
/* ------------------------------------------------------------------ */

async function questionByCode(code: string) {
  const { data } = await admin
    .from("questions")
    .select("id, code, correct_index, options, lesson_id, current_published_revision_id")
    .eq("code", code)
    .maybeSingle();
  return data;
}

async function revisionsOf(questionId: string) {
  const { data } = await admin
    .from("question_revisions")
    .select("id, revision_number, status, question_text, source_payload_hash")
    .eq("question_id", questionId)
    .order("revision_number", { ascending: true });
  return data ?? [];
}

async function targetsOf(questionId: string) {
  const { data } = await admin
    .from("question_targets")
    .select("id, target_type, subject_id, unit_id, lesson_id")
    .eq("question_id", questionId);
  return data ?? [];
}

/* ------------------------------------------------------------------ */
/* Seed / teardown of the surrounding content                          */
/* ------------------------------------------------------------------ */

const CONTENT_TEMPLATES: Array<[ContentImportTemplateKey, string]> = [
  ["subjects", "01_subjects.xlsx"],
  ["units", "02_units.xlsx"],
  ["lessons", "03_lessons.xlsx"],
];

async function teardown() {
  await purgeE2eQuestions(admin);
  const { data: subject } = await admin
    .from("subjects")
    .select("id")
    .eq("code", "e2e-sub-01")
    .maybeSingle();
  if (subject) {
    await admin.from("lessons").delete().eq("subject_id", subject.id);
    await admin.from("units").delete().eq("subject_id", subject.id);
    await admin.from("subjects").delete().eq("id", subject.id);
  }
  await admin.from("import_staging_rows").delete().like("natural_key", "e2e-%");
  await admin.from("import_errors").delete().like("row_identifier", "e2e-%");
  await admin.from("import_jobs").delete().eq("created_by", STAFF_USER_ID);
}

/* ------------------------------------------------------------------ */

async function main() {
  const staff = await mintClient(STAFF_USER_ID);
  await teardown();

  for (const [key, file] of CONTENT_TEMPLATES) {
    const r = await runCycle(staff, key, file);
    if (r.error) throw new Error(`seed template ${key} failed: ${r.error}`);
  }
  check("seed → subject/unit/lessons imported for the question fixtures", true);

  // 1 — first import ------------------------------------------------------
  const first = await runCycle(staff, "questions", "09_questions.xlsx");
  check(
    "T09 first import → 2 questions ingested",
    first.error === null && first.inserted === 2,
    `ins=${first.inserted} upd=${first.updated} skip=${first.skipped}${first.error ? ` err=${first.error}` : ""}`,
  );

  const qa = await questionByCode("e2e-qi-01");
  check("T09 → question root created", !!qa, qa ? qa.id : "missing");
  if (!qa) throw new Error("aborting: e2e-qi-01 was not created");

  const revs1 = await revisionsOf(qa.id);
  check(
    "T09 → exactly one DRAFT revision, nothing published",
    revs1.length === 1 && revs1[0]!.status === "DRAFT" && qa.current_published_revision_id === null,
    `revs=${revs1.length} status=${revs1[0]?.status}`,
  );
  check(
    "T09 → legacy answer columns left neutral (no leak surface)",
    qa.correct_index === -1 && Array.isArray(qa.options) && (qa.options as unknown[]).length === 0,
    `correct_index=${qa.correct_index}`,
  );

  const { data: opts } = await admin
    .from("question_options")
    .select("body, is_correct, sort_order")
    .eq("question_revision_id", revs1[0]!.id)
    .order("sort_order");
  check(
    "T09 → options stored with the correct answer flagged on the revision",
    (opts ?? []).length === 2 && opts![0]!.is_correct === true && opts![1]!.is_correct === false,
    JSON.stringify(opts),
  );

  const targets1 = await targetsOf(qa.id);
  check(
    "T09 → lesson target recorded",
    targets1.length === 1 && targets1[0]!.target_type === "LESSON",
    JSON.stringify(targets1.map((t) => t.target_type)),
  );

  // 2 — exact replay ------------------------------------------------------
  const replay = await runCycle(staff, "questions", "09_questions.xlsx");
  const revsAfterReplay = await revisionsOf(qa.id);
  check(
    "T09 replay → idempotent (all skipped, no new revision)",
    replay.error === null && replay.skipped === 2 && replay.inserted === 0 && revsAfterReplay.length === 1,
    `skip=${replay.skipped} ins=${replay.inserted} revs=${revsAfterReplay.length}`,
  );

  // 3 — same content, new target -----------------------------------------
  const retarget = await runCycle(staff, "questions", "09b_questions_retarget.xlsx");
  const revsAfterRetarget = await revisionsOf(qa.id);
  const targets2 = await targetsOf(qa.id);
  check(
    "T09 retarget → TARGET_ADDED without a new revision",
    retarget.error === null && retarget.updated === 1 && revsAfterRetarget.length === 1 && targets2.length === 2,
    `upd=${retarget.updated} revs=${revsAfterRetarget.length} targets=${targets2.length}`,
  );

  // 4 — changed content ---------------------------------------------------
  const changed = await runCycle(staff, "questions", "09c_questions_changed.xlsx");
  const revs2 = await revisionsOf(qa.id);
  check(
    "T09 changed content → new DRAFT revision, previous revision preserved",
    changed.error === null &&
      revs2.length === 2 &&
      revs2[0]!.id === revs1[0]!.id &&
      revs2[1]!.status === "DRAFT" &&
      revs2[1]!.revision_number === revs1[0]!.revision_number + 1,
    `revs=${revs2.length} nums=${revs2.map((r) => `${r.revision_number}:${r.status}`).join(",")}`,
  );

  // 5 — published revision preservation ----------------------------------
  const publishTarget = revs2[1]!;
  await staff.rpc("compute_and_set_revision_payload_hash", { p_revision_id: publishTarget.id });
  const { error: approveErr } = await admin
    .from("question_revisions")
    .update({ status: "APPROVED" })
    .eq("id", publishTarget.id);
  const { error: publishErr } = await staff.rpc("publish_question_revision", {
    p_question_id: qa.id,
    p_revision_id: publishTarget.id,
    p_expected_current_revision_id: null,
    p_idempotency_key: randomUUID(),
  });
  const published = !approveErr && !publishErr;
  check(
    "T09 setup → revision published for the preservation test",
    published,
    `${approveErr?.message ?? ""} ${publishErr?.message ?? ""}`.trim(),
  );

  if (published) {
    const again = await runCycle(staff, "questions", "09d_questions_after_publish.xlsx");
    const revs3 = await revisionsOf(qa.id);
    const qaAfter = await questionByCode("e2e-qi-01");
    const publishedStill = revs3.find((r) => r.id === publishTarget.id);
    check(
      "T09 vs published → published revision untouched, change lands as a new DRAFT",
      again.error === null &&
        publishedStill?.status === "PUBLISHED" &&
        qaAfter?.current_published_revision_id === publishTarget.id &&
        revs3.length === 3 &&
        revs3[2]!.status === "DRAFT",
      `revs=${revs3.length} published=${publishedStill?.status} current=${qaAfter?.current_published_revision_id === publishTarget.id}`,
    );
  }

  // 6 — atomic rollback on a mid-batch failure ---------------------------
  const invalid = await runCycle(staff, "questions", "92_invalid_questions.xlsx");
  const leaked = await questionByCode("e2e-qi-03");
  check(
    "T09 invalid row → whole template rolled back, zero partial writes",
    invalid.error !== null && leaked === null,
    `err=${invalid.error ?? "none"} partial=${leaked ? "yes" : "no"}`,
  );

  // 7 — tampered staged payload ------------------------------------------
  await purgeQuestionsOnly();
  const tamper = await prepare(staff, "questions", "09_questions.xlsx");
  let tamperError: string | null = null;
  if (tamper.jobId) {
    const { data: stagedRow } = await admin
      .from("import_staging_rows")
      .select("id, payload")
      .eq("job_id", tamper.jobId)
      .limit(1)
      .maybeSingle();
    if (stagedRow) {
      const payload = { ...(stagedRow.payload as Record<string, unknown>), question_text: "نص مزوّر" };
      await admin.from("import_staging_rows").update({ payload }).eq("id", stagedRow.id);
    }
    const exec = await executeContentImport(staff, tamper.jobId, ["questions"]);
    tamperError = exec.error;
  }
  const tamperedWrite = await questionByCode("e2e-qi-01");
  check(
    "T09 tampered staging payload → HASH_MISMATCH and zero writes",
    (tamperError ?? "").startsWith("HASH_MISMATCH") && tamperedWrite === null,
    `err=${tamperError ?? "none"} wrote=${tamperedWrite ? "yes" : "no"}`,
  );

  // 8 — concurrency -------------------------------------------------------
  await purgeQuestionsOnly();
  const jobA = await prepare(staff, "questions", "09_questions.xlsx");
  const jobB = await prepare(staff, "questions", "09_questions.xlsx");
  const [execA, execB] = await Promise.all([
    executeContentImport(staff, jobA.jobId!, ["questions"]),
    executeContentImport(staff, jobB.jobId!, ["questions"]),
  ]);
  const { data: dupes } = await admin.from("questions").select("id").eq("code", "e2e-qi-01");
  const concurrentQuestion = await questionByCode("e2e-qi-01");
  const concurrentRevs = concurrentQuestion ? await revisionsOf(concurrentQuestion.id) : [];
  check(
    "T09 concurrent executes → single question root, single revision, no duplicates",
    (dupes ?? []).length === 1 &&
      concurrentRevs.length === 1 &&
      execA.error === null &&
      execB.error === null,
    `roots=${(dupes ?? []).length} revs=${concurrentRevs.length} a=${execA.error ?? "ok"} b=${execB.error ?? "ok"}`,
  );

  // 9 — answer leakage ----------------------------------------------------
  const qid = concurrentQuestion?.id ?? "";
  const anonOptions = await anon.from("question_options").select("id, is_correct").limit(5);
  const anonAnswers = await anon.from("question_accepted_answers").select("id").limit(5);
  const anonRevisions = await anon.from("question_revisions").select("id").limit(5);
  check(
    "T09 anon → options / accepted answers / revisions all unreadable",
    (anonOptions.data ?? []).length === 0 &&
      (anonAnswers.data ?? []).length === 0 &&
      (anonRevisions.data ?? []).length === 0,
    `opts=${(anonOptions.data ?? []).length} ans=${(anonAnswers.data ?? []).length} revs=${(anonRevisions.data ?? []).length}`,
  );

  if (STUDENT_USER_ID) {
    const student = await mintClient(STUDENT_USER_ID);
    const sOpts = await student.from("question_options").select("id, is_correct").limit(5);
    const sAns = await student.from("question_accepted_answers").select("id").limit(5);
    const sQ = await student.from("questions").select("id, correct_index").eq("id", qid);
    check(
      "T09 student → no options, no accepted answers, no answer key on the root",
      (sOpts.data ?? []).length === 0 &&
        (sAns.data ?? []).length === 0 &&
        (sQ.data ?? []).every((r) => r.correct_index === -1),
      `opts=${(sOpts.data ?? []).length} ans=${(sAns.data ?? []).length}`,
    );
  } else {
    check("T09 student leakage check → skipped (E2E_STUDENT_USER_ID unset)", true);
  }

  // 10 — internal RPC is not client-callable ------------------------------
  const direct = await staff.rpc("qb_import_ingest_revision" as never, {
    _staging_row_id: randomUUID(),
  } as never);
  check(
    "T09 internal ingest RPC → not callable by a staff client",
    direct.error !== null,
    direct.error?.message ?? "call succeeded (unexpected)",
  );

  await teardown();

  const failed = results.filter(([, s]) => s === "FAIL").length;
  console.log(`\n${results.length - failed}/${results.length} PASS`);
  process.exit(failed ? 1 : 0);
}

/** Remove only the imported questions, keeping the surrounding e2e content. */
async function purgeQuestionsOnly() {
  await purgeE2eQuestions(admin);
}

main().catch(async (err) => {
  console.error(err);
  try {
    await teardown();
  } catch {
    /* best effort */
  }
  process.exit(1);
});
