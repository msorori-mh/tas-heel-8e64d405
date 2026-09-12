/**
 * QB03-LEGACY-BACKFILL-AND-RUNTIME-CUTOVER-DESIGN-01
 * Design-package contract tests only.
 * Forbidden: migration apply, SQL execution, DB writes, runtime modification, deploy.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..");
const docsDir = join(root, "docs", "question-bank");

const REQUIRED_DOCS = [
  "QB03-LEGACY-BACKFILL-DESIGN-01.md",
  "QB03-RUNTIME-CUTOVER-STATE-MACHINE-01.md",
  "QB03-ROLLBACK-AND-RECOVERY-PLAN-01.md",
  "QB03-PRODUCTION-PREFLIGHT-CHECKLIST-01.md",
  "QB03-BACKFILL-TEST-MATRIX-01.json",
];

const MODES = [
  "LEGACY",
  "DUAL_READ",
  "SHADOW_COMPARE",
  "QB_PRIMARY",
  "LEGACY_READ_ONLY",
  "LEGACY_RETIRED",
];

const REQUIRED_CATEGORIES = [
  "clean_migration",
  "duplicate",
  "invalid",
  "orphan",
  "media",
  "manual",
  "mcq",
  "idempotency",
  "retries",
  "interruptions",
  "partial_batches",
  "shadow_mismatch",
  "rollback",
  "concurrent_student_sessions",
  "old_exam_sessions",
  "new_exam_sessions",
];

const OWNER_TOPICS = [
  "batch_size",
  "production_schedule",
  "cutover_time",
  "retention_period",
  "cleanup",
  "remote_execution",
];

const IDENTITY_MARKERS = [
  "identity",
  "duplicate",
  "code generation",
  "revision",
  "correct_index",
  "invalid",
  "manual",
  "missing lesson",
  "orphan",
  "media",
  "audit",
  "provenance",
];

const IDEMPOTENCY_MARKERS = [
  "deterministic",
  "resumable",
  "retry-safe",
  "fingerprinted",
  "source-linked",
  "no duplicate revision",
  "no duplicate target",
];

const RE_DDL_TABLE = new RegExp(String.raw`\b(?:CREATE|ALTER|DROP)\s+TABLE\b`, "i");
const RE_TRUNCATE = new RegExp(String.raw`\bTRUNCATE\s+[a-z_]+\b`, "i");
const RE_INSERT_PUBLIC = new RegExp(String.raw`\bINSERT\s+INTO\s+public\.`, "i");

function read(path) {
  return readFileSync(path, "utf8");
}

function loadMatrix() {
  const path = join(docsDir, "QB03-BACKFILL-TEST-MATRIX-01.json");
  return JSON.parse(read(path));
}

function listGitTrackedOrWorkspaceFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) listGitTrackedOrWorkspaceFiles(p, acc);
    else acc.push(p);
  }
  return acc;
}

test("QB03 required design documents exist", () => {
  for (const name of REQUIRED_DOCS) {
    const p = join(docsDir, name);
    assert.ok(existsSync(p), `missing ${name}`);
  }
});

test("backfill design covers conversion pipeline and identity topics", () => {
  const md = read(join(docsDir, "QB03-LEGACY-BACKFILL-DESIGN-01.md")).toLowerCase();
  assert.match(md, /legacy questions/);
  assert.match(md, /logical/);
  assert.match(md, /revision\s*#?\s*1|revision_number\s*=\s*1/);
  assert.match(md, /payload_hash/);
  assert.match(md, /targets/);
  assert.match(md, /legacy linkage|source_payload_hash/);
  for (const marker of IDENTITY_MARKERS) {
    assert.ok(md.includes(marker), `backfill doc missing marker: ${marker}`);
  }
  for (const marker of IDEMPOTENCY_MARKERS) {
    assert.ok(md.includes(marker), `backfill doc missing idempotency marker: ${marker}`);
  }
  assert.match(md, /0-based/);
  assert.match(md, /needs_owner_decision/i);
  assert.match(md, /migration changes[\s\S]*zero/i);
});

test("state machine defines all modes with required dimensions", () => {
  const md = read(join(docsDir, "QB03-RUNTIME-CUTOVER-STATE-MACHINE-01.md"));
  for (const mode of MODES) {
    assert.ok(md.includes(mode), `missing mode ${mode}`);
  }
  const lower = md.toLowerCase();
  for (const dim of ["reads", "writes", "comparison", "metrics", "rollback", "exit criteria", "owner approval"]) {
    assert.ok(lower.includes(dim), `missing dimension ${dim}`);
  }
  assert.match(md, /SHADOW_TOLERANCE_CORRECT_ANSWER\s*=\s*0/);
  assert.match(md, /SHADOW_TOLERANCE_SCORE\s*=\s*0/);
  assert.match(md, /question text/i);
  assert.match(md, /options/i);
  assert.match(md, /correct answer/i);
  assert.match(md, /exam behavior/i);
  assert.match(md, /practice behavior/i);
  assert.match(md, /needs_owner_decision/i);
});

test("rollback plan preserves history and prevents mixed-session corruption", () => {
  const md = read(join(docsDir, "QB03-ROLLBACK-AND-RECOVERY-PLAN-01.md")).toLowerCase();
  assert.match(md, /revert runtime config/);
  assert.match(md, /stop writers/);
  assert.match(md, /preserve.*revision/);
  assert.match(md, /preserve.*attempt/);
  assert.match(md, /restore legacy reads/);
  assert.match(md, /mixed-session/);
  assert.ok(!/truncate\s+question_revisions/.test(md));
  assert.match(md, /forbidden/);
  assert.match(md, /needs_owner_decision/);
});

test("production preflight lists all cutover gates", () => {
  const md = read(join(docsDir, "QB03-PRODUCTION-PREFLIGHT-CHECKLIST-01.md")).toLowerCase();
  const gates = [
    "source merged",
    "local replay",
    "remote preflight",
    "remote migration",
    "dry-run",
    "backup",
    "backfill sample",
    "full backfill",
    "reconciliation",
    "shadow mode",
    "cutover",
    "monitoring",
    "rollback readiness",
  ];
  for (const g of gates) {
    assert.ok(md.includes(g), `missing gate: ${g}`);
  }
  assert.match(md, /migration changes:\s*zero/);
  assert.match(md, /runtime changes:\s*zero/);
  assert.match(md, /sql execution:\s*no/);
  assert.match(md, /deploy:\s*no/);
});

test("test matrix has >= 150 cases and required categories", () => {
  const matrix = loadMatrix();
  assert.equal(matrix.package, "QB03-LEGACY-BACKFILL-AND-RUNTIME-CUTOVER-DESIGN-01");
  assert.equal(matrix.migration_changes, 0);
  assert.equal(matrix.runtime_changes, 0);
  assert.equal(matrix.sql_execution, false);
  assert.equal(matrix.deploy, false);
  assert.ok(Array.isArray(matrix.cases));
  assert.ok(matrix.cases.length >= 150, `expected >=150 cases, got ${matrix.cases.length}`);
  assert.equal(matrix.case_count, matrix.cases.length);
  assert.deepEqual(matrix.shadow_tolerance, { correct_answer: 0, score: 0 });
  assert.deepEqual(matrix.modes, MODES);

  for (const cat of REQUIRED_CATEGORIES) {
    const count = matrix.cases.filter((c) => c.category === cat).length;
    assert.ok(count >= 1, `missing category ${cat}`);
  }

  const ids = new Set();
  for (const c of matrix.cases) {
    assert.ok(c.id && c.category && c.title && c.expected_outcome);
    assert.equal(c.design_only, true);
    assert.equal(ids.has(c.id), false, `duplicate id ${c.id}`);
    ids.add(c.id);
  }
});

test("matrix marks owner decisions and idempotency coverage", () => {
  const matrix = loadMatrix();
  for (const topic of OWNER_TOPICS) {
    assert.ok(
      matrix.owner_decision_topics.includes(topic),
      `owner topic missing: ${topic}`,
    );
    const hit = matrix.cases.some(
      (c) =>
        c.expected_outcome === "NEEDS_OWNER_DECISION" &&
        (c.tags || []).includes(topic),
    );
    assert.ok(hit, `no NEEDS_OWNER_DECISION case for ${topic}`);
  }
  for (const prop of matrix.idempotency_properties) {
    assert.ok(typeof prop === "string" && prop.length > 0);
  }
  assert.ok(matrix.backfill_identity_keys.length >= 8);
  const shadowBlocks = matrix.cases.filter((c) =>
    (c.tags || []).includes("tolerance_0"),
  );
  assert.ok(shadowBlocks.length >= 2);
  for (const c of shadowBlocks) {
    assert.equal(c.tolerance, 0);
  }
});

test("package does not add new SQL migrations or runtime activation", () => {
  const migrationsDir = join(root, "supabase", "migrations");
  assert.ok(existsSync(migrationsDir));

  for (const name of REQUIRED_DOCS) {
    const f = join(docsDir, name);
    assert.ok(existsSync(f), f);
    const body = read(f);
    assert.equal(RE_DDL_TABLE.test(body), false, `executable DDL in ${name}`);
    assert.equal(RE_TRUNCATE.test(body), false, `TRUNCATE statement in ${name}`);
    assert.equal(RE_INSERT_PUBLIC.test(body), false, `INSERT INTO public in ${name}`);
  }

  const migrationNames = readdirSync(migrationsDir);
  assert.equal(
    migrationNames.some((n) => /qb03/i.test(n)),
    false,
    "must not add qb03 migration",
  );
});

test("design docs forbid remote apply and production write in scope lock", () => {
  const backfill = read(join(docsDir, "QB03-LEGACY-BACKFILL-DESIGN-01.md"));
  assert.match(backfill, /No remote apply/);
  assert.match(backfill, /No production write/);
  assert.match(backfill, /No SQL execution/);
  assert.match(backfill, /No runtime modification/);
  assert.match(backfill, /DEFAULT RUNTIME MODE|Runtime default[\s\S]*LEGACY/i);
});

test("state machine keeps open sessions pin-stable", () => {
  const md = read(join(docsDir, "QB03-RUNTIME-CUTOVER-STATE-MACHINE-01.md"));
  assert.match(md, /Open sessions always keep their copied `attempt_pin_mode`/i);
  assert.match(md, /never silently fall back/i);
  assert.match(md, /new.*transactions only/i);
});

test("preflight gate order is fail-closed", () => {
  const md = read(join(docsDir, "QB03-PRODUCTION-PREFLIGHT-CHECKLIST-01.md"));
  assert.match(md, /FAIL-CLOSED/);
  const lower = md.toLowerCase();
  const idxMerged = lower.indexOf("## 1. source merged");
  const idxCutover = lower.indexOf("## 11. cutover");
  const idxRollback = lower.indexOf("## 13. rollback readiness");
  assert.ok(idxMerged >= 0, "missing ## 1. Source merged");
  assert.ok(idxCutover > idxMerged, "cutover must follow source merged");
  assert.ok(idxRollback > idxCutover, "rollback readiness must follow cutover");
});

test("matrix surfaces cover exam and practice session categories", () => {
  const matrix = loadMatrix();
  const oldExam = matrix.cases.filter((c) => c.category === "old_exam_sessions");
  const newExam = matrix.cases.filter((c) => c.category === "new_exam_sessions");
  assert.ok(oldExam.every((c) => c.pin_mode_expectation === "LEGACY"));
  assert.ok(newExam.every((c) => c.pin_mode_expectation === "REVISION_PINNED"));
  assert.ok(
    matrix.cases.some(
      (c) => c.category === "shadow_mismatch" && (c.surfaces || []).includes("practice"),
    ),
  );
  assert.ok(
    matrix.cases.some(
      (c) => c.category === "shadow_mismatch" && (c.surfaces || []).includes("exam"),
    ),
  );
});

test("relative package inventory stays design-only", () => {
  const files = listGitTrackedOrWorkspaceFiles(docsDir)
    .map((p) => relative(root, p).replaceAll("\\", "/"))
    .filter((p) => p.includes("QB03"));
  assert.ok(files.length >= 5);
  for (const f of files) {
    assert.ok(
      f.endsWith(".md") || f.endsWith(".json"),
      `unexpected qb03 artifact type: ${f}`,
    );
  }
});
