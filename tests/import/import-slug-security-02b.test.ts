import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  SUBJECT_SLUG_DIGEST_HEX_LENGTH,
  SUBJECT_SLUG_SEPARATOR,
  SUBJECT_SLUG_UNIQUE_CONSTRAINT,
  SlugCollisionError,
  canonicalSubjectCodeInput,
  deriveSubjectSlug,
  isSlugSafeSubjectCode,
  planSubjectSlugs,
  sha256HexBytes,
  subjectCodeDigest,
  subjectCodeDigestAsync,
  subjectCodeDigestBytes,
} from "../../src/lib/import/subject-slug.ts";
import { IMPORT_GAP_RESOLUTIONS } from "../../src/lib/import/import-contract.ts";

const DRAFT_SQL = readFileSync(
  "docs/migration-drafts/IMPORT-EXECUTION-READINESS-02.NOT_APPLIED.sql",
  "utf8",
);

test("02B: slug digest is SHA-256 at >= 128 bits", () => {
  assert.ok(SUBJECT_SLUG_DIGEST_HEX_LENGTH >= 32, "digest suffix must be at least 128 bits");
  const code = "Sci/10";
  const expected = createHash("sha256")
    .update(Buffer.from(subjectCodeDigestBytes(code)))
    .digest("hex")
    .slice(0, SUBJECT_SLUG_DIGEST_HEX_LENGTH);
  assert.equal(subjectCodeDigest(code), expected);
  assert.equal(sha256HexBytes(new TextEncoder().encode("abc")).length, 64);
  assert.equal(
    sha256HexBytes(new TextEncoder().encode("abc")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("02B: browser (Web Crypto) and server derivations are byte-identical", async () => {
  for (const code of ["Sci/10", "رياضيات-10", "MATH_10", "a b c", "١٠"]) {
    assert.equal(await subjectCodeDigestAsync(code), subjectCodeDigest(code));
    const nodeDigest = createHash("sha256")
      .update(Buffer.from(subjectCodeDigestBytes(code)))
      .digest("hex")
      .slice(0, SUBJECT_SLUG_DIGEST_HEX_LENGTH);
    assert.equal(subjectCodeDigest(code), nodeDigest);
  }
});

test("02B: canonical normalization is shared and stable", () => {
  assert.equal(canonicalSubjectCodeInput("  math   10 "), "math 10");
  assert.equal(deriveSubjectSlug("math-10"), deriveSubjectSlug(" math-10 "));
  assert.throws(() => deriveSubjectSlug("   "));
});

test("02B: the '--' separator is reserved and keeps both branches disjoint", () => {
  assert.equal(isSlugSafeSubjectCode("math-10"), true);
  assert.equal(
    isSlugSafeSubjectCode("math--10"),
    false,
    "a raw code containing -- is never identity-mapped",
  );
  const slug = deriveSubjectSlug("math--10");
  assert.ok(slug.includes(SUBJECT_SLUG_SEPARATOR));
  assert.notEqual(slug, "math--10");
  assert.equal(slug.split(SUBJECT_SLUG_SEPARATOR).pop()!.length, SUBJECT_SLUG_DIGEST_HEX_LENGTH);
});

test("02B: forced digest collision fails closed with zero planned writes", () => {
  const forced = () => "f".repeat(SUBJECT_SLUG_DIGEST_HEX_LENGTH);
  assert.throws(
    () => planSubjectSlugs(["Sci/10", "Sci.10"], { digest: forced }),
    (err: unknown) => err instanceof SlugCollisionError && err.code === "SLUG_COLLISION",
  );

  // Collision against an already stored subject owned by a different code.
  const existing = new Map([["math-10", "MATH-10-OTHER"]]);
  assert.throws(
    () => planSubjectSlugs(["math-10"], { existingSlugs: existing }),
    (err: unknown) => err instanceof SlugCollisionError,
  );

  // Same code twice is not a collision.
  const plan = planSubjectSlugs(["math-10", " math-10 ", "phys-10"]);
  assert.deepEqual([...plan.keys()], ["math-10", "phys-10"]);
});

test("02B: the contract never claims collisions are impossible", () => {
  const decision = IMPORT_GAP_RESOLUTIONS["GAP-07-SUBJECT-SLUG"].decision;
  assert.ok(!/impossible|never derive|never collide/i.test(decision));
  assert.ok(decision.includes("SLUG_COLLISION"));
  assert.ok(decision.includes("subjects_slug_key"));
  assert.equal(SUBJECT_SLUG_UNIQUE_CONSTRAINT, "subjects_slug_key");
});

test("02B: draft SQL grants, RLS and search_path are complete", () => {
  assert.ok(!/^\s*GRANT[^;]*TO\s+anon/im.test(DRAFT_SQL), "no GRANT to anon in the draft");
  for (const table of ["content_review_state", "import_staging_rows"]) {
    assert.ok(DRAFT_SQL.includes(`CREATE TABLE IF NOT EXISTS public.${table}`));
    assert.ok(new RegExp(`GRANT[^;]+ON public\\.${table} TO service_role`).test(DRAFT_SQL));
    assert.ok(DRAFT_SQL.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`));
    assert.ok(new RegExp(`ON public\\.${table} FOR`).test(DRAFT_SQL), `${table}: needs a policy`);
  }
  const functions = DRAFT_SQL.match(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/g) ?? [];
  assert.ok(functions.length >= 2);
  for (const fn of functions) assert.ok(fn.includes("SET search_path = public"));
});

test("02B: staging reads are owner-scoped, not blanket content-staff", () => {
  assert.ok(DRAFT_SQL.includes("j.created_by = auth.uid()"));
  assert.ok(DRAFT_SQL.includes("full admins read all staging rows"));
  assert.ok(DRAFT_SQL.includes("NOT APPLIED"));
});
