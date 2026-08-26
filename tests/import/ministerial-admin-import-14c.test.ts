/**
 * PAST_MINISTERIAL_EXAMS_ADMIN_IMPORT_14C.2 — static contract tests.
 * No DB access: contract, code generation, and migration-source guarantees.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  M01_COLUMNS,
  M02_COLUMNS,
  M02_FORBIDDEN_COLUMNS,
  MINISTERIAL_IMPORT_ORDER,
  MINISTERIAL_TEMPLATE_KEYS,
  MinisterialContractError,
  assertNoForbiddenM02Columns,
  assertRequiredColumns,
  buildMinisterialModelCode,
  M01_REQUIRED_COLUMNS,
} from "../../src/lib/ministerial/ministerial-import-contract";

const MIGRATION = readFileSync(
  resolve(
    __dirname,
    "../../supabase/migrations-pending/20260814030000_ministerial_admin_import_14c.sql",
  ),
  "utf8",
);

describe("M01/M02 contract", () => {
  it("uses a dedicated namespace, never 10/11", () => {
    expect(MINISTERIAL_TEMPLATE_KEYS.m01).toBe("M01_ministerial_models");
    expect(MINISTERIAL_TEMPLATE_KEYS.m02).toBe("M02_ministerial_model_questions");
    expect(MINISTERIAL_IMPORT_ORDER).toEqual(["M01", "M02", "REVIEW", "PUBLISH"]);
  });

  it("M01 carries the six human inputs only", () => {
    expect([...M01_COLUMNS]).toEqual([
      "subject_code",
      "track_code",
      "academic_year",
      "exam_round_code",
      "model_variant_code",
      "model_label",
    ]);
    expect([...M01_REQUIRED_COLUMNS]).not.toContain("model_label");
  });

  it("M02 carries binding metadata only", () => {
    expect([...M02_COLUMNS]).toEqual([
      "ministerial_model_code",
      "question_code",
      "original_question_number",
      "section_code",
      "marks",
      "source_page",
      "source_reference",
      "display_order",
    ]);
    for (const forbidden of M02_FORBIDDEN_COLUMNS) {
      expect(M02_COLUMNS as readonly string[]).not.toContain(forbidden);
    }
  });

  it("rejects any answer-bearing column in M02", () => {
    for (const col of [
      "correct_answer",
      "correct_index",
      "explanation",
      "solution",
      "options",
      "question_text",
    ]) {
      expect(() => assertNoForbiddenM02Columns(["question_code", col])).toThrowError(
        MinisterialContractError,
      );
    }
    expect(() => assertNoForbiddenM02Columns([...M02_COLUMNS])).not.toThrow();
  });

  it("reports missing required columns", () => {
    expect(() =>
      assertRequiredColumns(["subject_code"], M01_REQUIRED_COLUMNS, MINISTERIAL_TEMPLATE_KEYS.m01),
    ).toThrowError(/track_code/);
  });
});

describe("TCS-2 ministerial code generation", () => {
  it("generates the canonical mex code", () => {
    expect(
      buildMinisterialModelCode({
        subjectCode: "sub-g12-001",
        trackCode: "sanaa",
        academicYear: 2025,
        roundCode: "r1",
        variantCode: "main",
      }),
    ).toBe("mex-g12-sanaa-001-2025-r1-main");
  });

  it("keeps sanaa and aden models distinct for a shared subject", () => {
    const base = {
      subjectCode: "sub-g12-001",
      academicYear: 2025,
      roundCode: "r1",
      variantCode: "main",
    };
    expect(buildMinisterialModelCode({ ...base, trackCode: "sanaa" })).not.toBe(
      buildMinisterialModelCode({ ...base, trackCode: "aden" }),
    );
  });

  it("rejects TCS-1 style subject codes", () => {
    expect(() =>
      buildMinisterialModelCode({
        subjectCode: "sub-g12-sanaa-001",
        trackCode: "sanaa",
        academicYear: 2025,
        roundCode: "r1",
        variantCode: "main",
      }),
    ).toThrowError(/TCS-2/);
  });

  it("rejects invalid round, variant, track and year", () => {
    const base = {
      subjectCode: "sub-g12-001",
      trackCode: "sanaa",
      academicYear: 2025,
      roundCode: "r1",
      variantCode: "main",
    };
    expect(() => buildMinisterialModelCode({ ...base, roundCode: "r9" })).toThrow();
    expect(() => buildMinisterialModelCode({ ...base, variantCode: "النموذج أ" })).toThrow();
    expect(() => buildMinisterialModelCode({ ...base, trackCode: "taiz" })).toThrow();
    expect(() => buildMinisterialModelCode({ ...base, academicYear: 1990 })).toThrow();
  });
});

describe("pending migration 14C.2 closes the blockers", () => {
  it("B-1: publish requires a separate capability, never is_content_staff", () => {
    expect(MIGRATION).toContain("PUBLISH_MINISTERIAL_MODEL");
    expect(MIGRATION).toMatch(/can_publish_ministerial_exams\(v_actor\)/);
    const publishBody = MIGRATION.slice(
      MIGRATION.indexOf("FUNCTION public.publish_ministerial_model"),
    );
    expect(publishBody.slice(0, 1500)).not.toMatch(/is_content_staff\(v_actor\)/);
  });

  it("B-2: publish parity compares pinned published revisions", () => {
    expect(MIGRATION).toContain(
      "q.current_published_revision_id IS DISTINCT FROM mq.published_revision_id",
    );
    expect(MIGRATION).toMatch(/v_template\.is_active IS NOT TRUE/);
  });

  it("B-3: direct DML is revoked; writes are RPC-only", () => {
    expect(MIGRATION).toContain(
      "REVOKE INSERT, UPDATE, DELETE ON public.ministerial_exam_models FROM authenticated",
    );
    expect(MIGRATION).toContain(
      "REVOKE INSERT, UPDATE, DELETE ON public.ministerial_exam_questions FROM authenticated",
    );
    expect(MIGRATION).not.toMatch(
      /CREATE POLICY[^;]*ministerial_exam_questions[\s\S]{0,120}FOR ALL/,
    );
  });

  it("B-4: model_label and M02 metadata columns exist", () => {
    for (const col of [
      "model_label",
      "original_question_number",
      "section_code",
      "source_page",
      "source_reference",
    ]) {
      expect(MIGRATION).toContain(col);
    }
  });

  it("B-5: unpublish/archive exists and is session-aware", () => {
    expect(MIGRATION).toContain("ministerial_model_set_status");
    expect(MIGRATION).toContain("MINISTERIAL_UNPUBLISH_BLOCKED_SESSIONS_EXIST");
  });

  it("B-6: SQL code builder matches the TS builder ordering", () => {
    expect(MIGRATION).toContain("mex-%s-%s-%s-%s-%s-%s");
    expect(MIGRATION).toContain("v_parts[2], _track_code, v_parts[3]");
  });

  it("pins revisions and fails closed on drift", () => {
    expect(MIGRATION).toContain("MINISTERIAL_REVISION_CHANGED_REPREPARE");
    expect(MIGRATION).toContain("pinned_revision_id");
    expect(MIGRATION).toContain("MINISTERIAL_PREPARE_EXPIRED");
  });

  it("membership import is additive and removal is an explicit guarded op", () => {
    expect(MIGRATION).not.toMatch(
      /DELETE FROM public\.ministerial_exam_questions[\s\S]{0,200}NOT IN/,
    );
    expect(MIGRATION).toContain("ministerial_membership_remove_preview");
    expect(MIGRATION).toContain("MINISTERIAL_REMOVAL_REASON_REQUIRED");
    expect(MIGRATION).toContain("MINISTERIAL_REMOVAL_BLOCKED_SESSIONS_EXIST");
  });

  it("every SECURITY DEFINER function is hardened", () => {
    const definers = MIGRATION.split("SECURITY DEFINER").slice(1);
    expect(definers.length).toBeGreaterThan(5);
    for (const chunk of definers) {
      expect(chunk.slice(0, 120)).toContain("SET search_path = public, pg_temp");
    }
    const fnNames = [...MIGRATION.matchAll(/GRANT EXECUTE ON FUNCTION public\.(\w+)/g)].map(
      (m) => m[1],
    );
    for (const fn of new Set(fnNames)) {
      expect(MIGRATION).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM anon`),
      );
    }
  });

  it("never stores answers in audit metadata", () => {
    expect(MIGRATION).not.toMatch(/audit_logs[\s\S]{0,400}correct_answer/);
  });
});
