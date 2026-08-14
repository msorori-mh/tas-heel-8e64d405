/**
 * SHARED_CURRICULUM_SUBJECT_MAPPING_13C — TCS-2 + multi-track availability.
 */

import { describe, expect, it } from "vitest";
import {
  CONTENT_CODE_SCHEME_VERSION,
  allocateTcs2Codes,
  assertNewContentCodeAllowed,
  buildLessonCode,
  buildQuestionCode,
  buildSubjectCode,
  isLegacyTcs1Code,
  isTcs2Code,
  nextAllocatedNumber,
  parseTcs2Code,
} from "@/lib/content-codes/tcs2";
import { validateContentImportSheet } from "@/lib/content-import/content-import-validators";
import {
  templateColumnsForEntity,
  ROW_HASH_FIELDS,
} from "@/lib/import/import-contract";

const SUBJECT_COLUMNS = templateColumnsForEntity("subjects");

function subjectSheet(rows: Array<Record<string, string>>) {
  return {
    detectedColumns: [...SUBJECT_COLUMNS],
    fileName: "01_subjects_template.xlsx",
    rows: rows.map((data, i) => ({ rowNumber: i + 2, data })),
  };
}

function subjectRow(over: Record<string, string> = {}): Record<string, string> {
  return {
    subject_code: "sub-g10-001",
    name: "الفيزياء",
    group_code: "",
    group_name: "",
    grade_slug: "grade-10",
    track_codes: "sanaa|aden",
    semester: "1",
    icon: "",
    color: "",
    sort_order: "1",
    editor_notes: "",
    review_status: "",
    ...over,
  };
}

describe("TCS-2 scheme", () => {
  it("is the official scheme version", () => {
    expect(CONTENT_CODE_SCHEME_VERSION).toBe("TCS-2");
  });

  it("builds codes without any track segment", () => {
    expect(buildSubjectCode({ gradeSlug: "grade-12" }, 1)).toBe("sub-g12-001");
    expect(buildLessonCode({ gradeSlug: "grade-12" }, 1, 3)).toBe("lesson-g12-001-003");
    expect(buildQuestionCode({ gradeSlug: "grade-12" }, 1, 7)).toBe("q-g12-001-00007");
  });

  it("parses back to grade + numbers", () => {
    const parsed = parseTcs2Code("unit-g10-002-05");
    expect(parsed).toMatchObject({
      kind: "unit",
      gradeShort: "g10",
      gradeSlug: "grade-10",
      numbers: [2, 5],
    });
    expect(parsed?.trackCode).toBeUndefined();
  });


  it("allocates the next free number and never reuses one", () => {
    const existing = ["sub-g10-001", "sub-g10-003"];
    expect(nextAllocatedNumber(existing, "subject", { gradeSlug: "grade-10" })).toBe(4);
    expect(
      allocateTcs2Codes({ existingCodes: existing, kind: "subject", scope: { gradeSlug: "grade-10" }, count: 2 }),
    ).toEqual(["sub-g10-004", "sub-g10-005"]);
  });

  it("shares one identity across tracks: the same code serves sanaa and aden", () => {
    const sanaa = buildSubjectCode({ gradeSlug: "grade-12" }, 4);
    const aden = buildSubjectCode({ gradeSlug: "grade-12" }, 4);
    expect(sanaa).toBe(aden);
  });

  it("rejects frozen TCS-1 codes", () => {
    expect(isLegacyTcs1Code("sub-g10-aden-001")).toBe(true);
    expect(isLegacyTcs1Code("sub-g10-001")).toBe(false);
    expect(isTcs2Code("sub-g10-aden-001")).toBe(false);
    expect(() => assertNewContentCodeAllowed("lesson-g12-sanaa-001-002")).toThrow(
      /LEGACY_CODE_SCHEME_NOT_ALLOWED/,
    );
    expect(() => assertNewContentCodeAllowed("lesson-g12-001-002")).not.toThrow();
  });
});

describe("subjects template contract", () => {
  it("exposes track_codes and no longer exposes track_code", () => {
    expect(SUBJECT_COLUMNS).toContain("track_codes");
    expect(SUBJECT_COLUMNS).not.toContain("track_code");
    expect(ROW_HASH_FIELDS.subjects).toContain("track_codes");
  });

  it("accepts a shared subject declared once for two tracks", () => {
    const report = validateContentImportSheet("subjects", subjectSheet([subjectRow()]));
    expect(report.errors).toEqual([]);
  });

  it("requires at least one track", () => {
    const report = validateContentImportSheet(
      "subjects",
      subjectSheet([subjectRow({ track_codes: "" })]),
    );
    expect(report.errors.map((e) => e.code)).toContain("TRACK_CODES_REQUIRED");
  });

  it("rejects an unknown track code", () => {
    const report = validateContentImportSheet(
      "subjects",
      subjectSheet([subjectRow({ track_codes: "sanaa|dubai" })]),
    );
    expect(report.errors.map((e) => e.code)).toContain("UNKNOWN_TRACK_CODE");
  });

  it("rejects a duplicated track code inside one row", () => {
    const report = validateContentImportSheet(
      "subjects",
      subjectSheet([subjectRow({ track_codes: "aden|aden" })]),
    );
    expect(report.errors.map((e) => e.code)).toContain("DUPLICATE_TRACK_CODE");
  });

  it("rejects legacy TCS-1 codes in the sheet", () => {
    const report = validateContentImportSheet(
      "subjects",
      subjectSheet([subjectRow({ subject_code: "sub-g10-aden-001" })]),
    );
    expect(report.errors.map((e) => e.code)).toContain("LEGACY_CODE_SCHEME_NOT_ALLOWED");
  });

  it("keeps group-name consistency scoped to the grade, not the track", () => {
    const report = validateContentImportSheet(
      "subjects",
      subjectSheet([
        subjectRow({
          subject_code: "sub-g10-002",
          group_code: "grp-g10-01",
          group_name: "اللغة العربية",
          track_codes: "sanaa",
        }),
        subjectRow({
          subject_code: "sub-g10-003",
          group_code: "grp-g10-01",
          group_name: "العربية",
          track_codes: "aden",
        }),
      ]),
    );
    expect(report.errors.map((e) => e.code)).toContain("GROUP_NAME_CONFLICT");
  });
});
