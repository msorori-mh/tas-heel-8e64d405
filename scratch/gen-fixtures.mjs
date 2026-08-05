import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getOperationalFixture } from "../tests/fixtures/question-bank/import/oracle-harness.ts";

const vectorsFile = readFileSync(join(process.cwd(), "docs/question-bank/QB02-IMPORT-TEST-VECTORS-50.json"), "utf8");
const parsed = JSON.parse(vectorsFile);

const fixturesMap = {};

function cleanRow(rowObj) {
  if (!rowObj || typeof rowObj !== "object" || Array.isArray(rowObj)) return rowObj;
  const clean = { ...rowObj };
  delete clean.attack;
  delete clean.mutation;
  delete clean.boundary;
  delete clean.scenario;
  delete clean.category;
  delete clean.tags;
  delete clean.source_contract;
  delete clean.preconditions;
  delete clean.threat_ids;
  delete clean.variant;
  delete clean.value;
  return clean;
}

for (const vec of parsed.vectors) {
  const fix = getOperationalFixture(vec);

  // Explicit overrides for specific vectors
  if (vec.test_id === "QB02-055") {
    fix.input_format = undefined;
    fix.headers = ["unsupported_col1", "unsupported_col2"];
  }
  if (vec.test_id === "QB02-066" || vec.test_id === "QB02-111") {
    fix.input_format = "official_flat_v0";
    fix.headers = ["question_code", "question_text", "interaction_type", "grading_mode", "option_1", "option_2", "option_3", "option_4", "option_5", "option_6", "correct_index", "accepted_answers", "explanation", "stimulus_text", "max_score", "allow_partial", "subject_code", "lesson_code", "media_url", "media_type", "media_alt"];
    fix.rows = [{
      question_code: "Q-DEFAULT",
      question_text: "Sample Question Text",
      interaction_type: "SINGLE_CHOICE",
      grading_mode: "AUTO_SINGLE",
      option_1: "Option 1",
      option_2: "Option 2",
      correct_index: 1,
      max_score: "invalid",
      subject_code: "MATH-G10",
      lesson_code: "MATH-L1",
    }];
  }
  if (vec.test_id === "QB02-158" || vec.test_id === "QB02-159") {
    fix.binary_fixture = "zip_ratio_overflow";
  }
  if (vec.test_id === "QB02-160" || vec.test_id === "QB02-161") {
    fix.binary_fixture = "ooxml_external_rel";
  }

  const cleanedRows = Array.isArray(fix.rows) ? fix.rows.map(cleanRow) : fix.rows;

  fixturesMap[vec.test_id] = {
    vector_id: vec.test_id,
    fixture_kind: fix.fixture_kind ?? "validator",
    input_format: fix.input_format,
    file_name: fix.file_name ?? "workbook.xlsx",
    file_bytes: fix.file_bytes,
    content_type: fix.content_type ?? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    headers: fix.headers,
    rows: cleanedRows,
    authorization_state: fix.authorization_state ?? "authenticated",
    catalog_state: fix.catalog_state,
    binary_fixture_id: fix.binary_fixture,
    parser_state: fix.parser_state,
    apply_state: fix.apply_state,
  };
}

const tsContent = `// Explicit Operational Fixtures Manifest for all 197 vectors
// THIS FILE IS A STATIC TEST-ONLY SOURCE FIXTURE MANIFEST.
// IT DOES NOT CONTAIN ORACLE LABELS, EXPECTED ERRORS, ATTACK/MUTATION/TAGS/CATEGORY METADATA.

export type CatalogState = {
  authorized_subjects?: string[];
  existing_codes?: Record<string, string>;
  subjects?: string[];
  lessons?: string[];
  lesson_subjects?: Record<string, string>;
};

export type ApplyState = {
  scenario?: "preview-token" | "stale-validation" | "content-hash" | "toctou" | "atomic-plan";
  preview_token?: unknown;
  token_binding?: unknown;
  expected_snapshot?: unknown;
  current_snapshot?: unknown;
  expected_content_hash?: string | null;
  current_content_hash?: string | null;
  expected_validation_hash?: string | null;
  current_validation_hash?: string | null;
  atomic_plan?: unknown;
  observed_state?: unknown;
  rows?: unknown[];
};

export type ExplicitOperationalFixture = {
  vector_id: string;
  fixture_kind: "apply-verification" | "binary" | "authorization" | "adapter" | "validator" | "workbook";
  input_format?: "official_flat_v0" | "legacy_flat_15col" | "teacher_flat_ar_v0";
  file_name: string;
  file_bytes?: number;
  content_type?: string;
  headers?: string[];
  rows?: Record<string, unknown>[];
  authorization_state: "authenticated" | "unauthorized" | "viewer" | "unauthenticated";
  catalog_state?: CatalogState;
  binary_fixture_id?: string;
  parser_state?: Record<string, unknown>;
  apply_state?: ApplyState;
};

export const OPERATIONAL_FIXTURES: Record<string, ExplicitOperationalFixture> = ${JSON.stringify(fixturesMap, null, 2)};
`;

writeFileSync(join(process.cwd(), "tests/fixtures/question-bank/import/qb02-operational-fixtures.ts"), tsContent, "utf8");
console.log(`Generated cleaned explicit operational fixtures for ${Object.keys(fixturesMap).length} vectors.`);
