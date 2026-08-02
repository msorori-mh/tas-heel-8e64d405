import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const docs = join(root, "docs", "question-bank");
const codes = JSON.parse(readFileSync(join(docs, "QB02-IMPORT-VALIDATION-CODES-50.json"), "utf8"));
const oracle = JSON.parse(readFileSync(join(docs, "QB02-IMPORT-TEST-VECTORS-50.json"), "utf8"));

test("oracle JSON documents have expected versions and size", () => {
  assert.equal(codes.oracle_version, "QB02-IMPORT-VALIDATION-CODES-50");
  assert.equal(codes.closed_registry, true);
  assert.equal(codes.codes.length, 60);
  assert.equal(oracle.oracle_version, "QB02-IMPORT-TEST-VECTORS-50");
  assert.equal(oracle.target_contract, "official_normalized_v1");
  assert.equal(oracle.vectors.length, 197);
});

test("validation codes unique and blocking defaults consistent", () => {
  const seen = new Set();
  for (const item of codes.codes) {
    assert.ok(!seen.has(item.code));
    seen.add(item.code);
    assert.equal(item.row_blocking && item.file_blocking, false);
  }
});

test("every vector references registered codes only", () => {
  const registry = new Set(codes.codes.map((item) => item.code));
  for (const vector of oracle.vectors) {
    for (const issue of vector.expected_errors) {
      assert.ok(registry.has(issue.code), issue.code);
    }
  }
});
