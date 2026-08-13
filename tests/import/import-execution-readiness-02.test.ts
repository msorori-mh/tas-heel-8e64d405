import assert from "node:assert/strict";
import { test } from "node:test";

import {
  IMPORT_ENTITY_CONTRACTS,
  IMPORT_GAP_IDS,
  IMPORT_GAP_RESOLUTIONS,
  RESOURCE_METADATA_ALLOWLIST,
  ROW_HASH_EXCLUDED_FIELDS,
  ROW_HASH_FIELDS,
  deriveSubjectSlug,
  isAllowedResourceMetadataKey,
  listOpenGaps,
} from "../../src/lib/import/import-contract.ts";
import {
  EXECUTION_RULES,
  EXECUTION_STATES,
  EXECUTION_DESIGN_STATUS,
  QUESTION_BANK_ROUTED_TEMPLATES,
  STAGING_TABLES,
  canTransition,
  isExecutableAction,
} from "../../src/lib/import/import-staging-design.ts";
import { CONTENT_IMPORT_CODES } from "../../src/lib/import/import-error-codes.ts";
import { CONTENT_IMPORT_TEMPLATE_KEYS } from "../../src/lib/content-import/content-import-templates.ts";

test("all 7 execution blockers are design-closed", () => {
  assert.equal(IMPORT_GAP_IDS.length, 7);
  assert.deepEqual(listOpenGaps(), []);
  for (const id of IMPORT_GAP_IDS) {
    const r = IMPORT_GAP_RESOLUTIONS[id];
    assert.equal(r.gapId, id);
    assert.ok(r.decision.length > 40, `${id}: decision must be explicit`);
    assert.ok(r.entities.length > 0, `${id}: must name affected entities`);
  }
});

test("schema-change resolutions are either an unapplied draft or a verified applied change", () => {
  for (const id of IMPORT_GAP_IDS) {
    const r = IMPORT_GAP_RESOLUTIONS[id];
    if (r.kind === "schema_change" && r.status === "closed_design") {
      assert.ok(r.migrationDraftRef?.includes("NOT_APPLIED"), `${id}: schema change needs a NOT_APPLIED draft`);
      assert.ok(r.migrationDraftRef?.startsWith("docs/"), `${id}: drafts must stay outside supabase/migrations`);
    } else if (r.status === "applied") {
      assert.equal(r.migrationDraftRef, undefined, `${id}: an applied gap must not point at a draft`);
      assert.ok((r.appliedObjects?.length ?? 0) > 0, `${id}: an applied gap must name the DB objects it created`);
    } else {
      assert.equal(r.migrationDraftRef, undefined, `${id}: non-schema change must not reference a migration`);
    }
  }
});

test("every declared gapId on an entity resolves to a known resolution", () => {
  for (const key of CONTENT_IMPORT_TEMPLATE_KEYS) {
    for (const id of IMPORT_ENTITY_CONTRACTS[key].gapIds ?? []) {
      assert.ok(IMPORT_GAP_RESOLUTIONS[id], `${key}: unknown gap id ${id}`);
      assert.ok(
        IMPORT_GAP_RESOLUTIONS[id].entities.includes(key),
        `${key}: ${id} does not list this entity`,
      );
    }
  }
});

test("GAP-02: sort_order never takes part in a natural key", () => {
  for (const key of CONTENT_IMPORT_TEMPLATE_KEYS) {
    assert.ok(
      !IMPORT_ENTITY_CONTRACTS[key].naturalKey.includes("sort_order"),
      `${key}: sort_order must not be part of the identity`,
    );
  }
  assert.ok(IMPORT_ENTITY_CONTRACTS.explanations.naturalKey.includes("explanation_code"));
  assert.ok(IMPORT_ENTITY_CONTRACTS.resources.naturalKey.includes("resource_code"));
});

test("GAP-06: lesson-scoped templates require subject_code", () => {
  for (const key of ["book_contents", "explanations", "resources", "assessments"] as const) {
    const contract = IMPORT_ENTITY_CONTRACTS[key];
    const subjectField = contract.fields.find((f) => f.field === "subject_code");
    assert.ok(subjectField, `${key}: subject_code column missing`);
    assert.equal(subjectField?.required, true, `${key}: subject_code must be required`);
  }
});

test("GAP-04: resource_url is required", () => {
  const url = IMPORT_ENTITY_CONTRACTS.resources.fields.find((f) => f.field === "resource_url");
  assert.equal(url?.required, true);
  assert.equal(url?.column, "url");
});

test("GAP-05: every metadata column maps into the closed allowlist", () => {
  const mapped = IMPORT_ENTITY_CONTRACTS.resources.fields
    .filter((f) => f.column === "metadata")
    .map((f) => f.field);
  assert.deepEqual([...mapped].sort(), [...RESOURCE_METADATA_ALLOWLIST].sort());
  for (const key of mapped) assert.ok(isAllowedResourceMetadataKey(key));
  assert.equal(isAllowedResourceMetadataKey("__proto__"), false);
  assert.equal(isAllowedResourceMetadataKey("correct_index"), false);
});

test("GAP-07: subject slug derivation is deterministic and collision-detected", () => {
  assert.equal(deriveSubjectSlug("math-10"), "math-10");
  assert.equal(deriveSubjectSlug("math-10"), deriveSubjectSlug(" math-10 "));

  // Codes that normalize to the same stem must NOT collide.
  const a = deriveSubjectSlug("MATH_10");
  const b = deriveSubjectSlug("math.10");
  assert.notEqual(a, b);
  assert.ok(a.startsWith("math-10--") && b.startsWith("math-10--"));

  // Arabic / non-latin codes still produce a usable, unique slug.
  const ar1 = deriveSubjectSlug("رياضيات-10");
  const ar2 = deriveSubjectSlug("رياضيات-11");
  assert.notEqual(ar1, ar2);
  assert.ok(/^[a-z0-9-]+$/.test(ar1));

  // Injectivity over a broad sample.
  const samples = [
    "a", "A", "a-", "-a", "a--b", "a_b", "a.b", "a b", "١٠", "علوم", "علوم-2", "Sci/10", "Sci-10",
  ];
  const slugs = samples.map(deriveSubjectSlug);
  assert.equal(new Set(slugs).size, samples.length, "distinct subject codes must not derive the same slug");

  assert.throws(() => deriveSubjectSlug("   "));
});

test("row hash inputs exclude operator and workflow columns", () => {
  for (const key of CONTENT_IMPORT_TEMPLATE_KEYS) {
    const fields = ROW_HASH_FIELDS[key];
    assert.ok(fields.length > 0, `${key}: row hash fields missing`);
    for (const excluded of ROW_HASH_EXCLUDED_FIELDS) {
      assert.ok(!fields.includes(excluded), `${key}: ${excluded} must not affect the row hash`);
    }
    assert.equal(new Set(fields).size, fields.length, `${key}: duplicate row hash field`);
    const known = new Set(IMPORT_ENTITY_CONTRACTS[key].fields.map((f) => f.field));
    for (const field of fields) {
      assert.ok(known.has(field), `${key}: row hash references unknown column ${field}`);
    }
  }
});

test("new phase-02 error codes exist with coherent blocking flags", () => {
  const required = [
    "MISSING_SUBJECT_SCOPE",
    "AMBIGUOUS_LESSON_CODE",
    "MISSING_ENTITY_CODE",
    "MISSING_RESOURCE_URL",
    "UNSUPPORTED_METADATA_KEY",
    "SLUG_COLLISION",
    "REVIEW_STATE_RESET",
    "EXECUTION_FAILED",
  ] as const;
  for (const code of required) {
    const def = CONTENT_IMPORT_CODES[code];
    assert.ok(def, `${code} missing`);
    assert.ok(def.ar.length > 0, `${code}: needs an Arabic message`);
    assert.ok(!(def.rowBlocking && def.fileBlocking), `${code}: cannot block both row and file`);
  }
  assert.equal(CONTENT_IMPORT_CODES.EXECUTION_FAILED.fileBlocking, true);
  assert.equal(CONTENT_IMPORT_CODES.REVIEW_STATE_RESET.severity, "warning");
});

test("execution design is explicitly not applied", () => {
  assert.equal(EXECUTION_DESIGN_STATUS, "design_closed_not_applied");
  assert.equal(EXECUTION_RULES.publishedOverwrite, "forbidden");
  assert.equal(EXECUTION_RULES.revalidation, "mandatory_inside_transaction");
  assert.equal(EXECUTION_RULES.atomicity, "per_template_transaction");
});

test("execution state machine has no path out of a terminal state", () => {
  assert.ok(EXECUTION_STATES.includes("applying"));
  assert.ok(EXECUTION_STATES.includes("failed"));
  assert.equal(canTransition("validated", "applying"), true);
  assert.equal(canTransition("applying", "applied"), true);
  assert.equal(canTransition("applied", "applying"), false);
  assert.equal(canTransition("failed", "applying"), false);
  assert.equal(canTransition("uploaded", "applied"), false);
});

test("BLOCKED_PUBLISHED is never executable", () => {
  assert.equal(isExecutableAction("BLOCKED_PUBLISHED"), false);
  assert.equal(isExecutableAction("INSERT"), true);
  assert.equal(isExecutableAction("NEW_REVISION"), true);
});

test("questions stay on the question-bank workflow", () => {
  assert.deepEqual([...QUESTION_BANK_ROUTED_TEMPLATES], ["questions"]);
  assert.equal(IMPORT_ENTITY_CONTRACTS.questions.questionBankWorkflow, true);
});

test("staging tables are content-staff scoped and job-keyed", () => {
  const staging = STAGING_TABLES.find((t) => t.table === "import_staging_rows");
  assert.ok(staging);
  assert.ok(staging!.indexes.some((i) => i.includes("UNIQUE (job_id, template_key, natural_key)")));
  for (const t of STAGING_TABLES) {
    assert.ok(/staff|admin/i.test(t.access), `${t.table}: access rule must be staff-scoped`);
    assert.ok(!/anon/i.test(t.access.replace(/no anon/i, "")), `${t.table}: anon must not be granted`);
  }
});

test("review state is bound to the content hash", () => {
  const review = STAGING_TABLES.find((t) => t.table === "content_review_state");
  assert.ok(review);
  assert.ok(review!.columns.some((c) => c.name === "content_hash" && c.notNull));
});
