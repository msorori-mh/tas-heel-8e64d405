import { writeFileSync } from "node:fs";
import { digestCanonicalPayloadV1 } from "./canonical-payload-v1.mjs";

const base = {
  question_code: "PHYS-G12-0001",
  revision_number: 1,
  interaction_type: "SINGLE_CHOICE",
  grading_mode: "AUTO_SINGLE",
  question_text: "ما وحدة القوة؟",
  stimulus_text: null,
  max_score: 1,
  allow_partial: false,
  options: [
    { option_code: "A", body: "نيوتن", sort_order: 0, is_correct: true },
    { option_code: "B", body: "جول", sort_order: 1, is_correct: false },
  ],
  accepted_answers: [],
  solutions: [],
  solution_steps: [],
  media: [],
  targets: [
    {
      is_primary: true,
      target_type: "LESSON",
      target_id: "00000000-0000-4000-8000-000000000001",
    },
  ],
};

const vectors = [];

const v1a = digestCanonicalPayloadV1(base);
vectors.push({
  id: "V1A_null_stimulus",
  expect: "digest",
  digest: v1a.digest,
  source: structuredClone(base),
});

const v1bSrc = { ...structuredClone(base), stimulus_text: "" };
const v1b = digestCanonicalPayloadV1(v1bSrc);
vectors.push({
  id: "V1B_empty_stimulus",
  expect: "digest",
  digest: v1b.digest,
  source: v1bSrc,
  assert_ne: "V1A_null_stimulus",
});

const shuffled = {
  targets: base.targets,
  allow_partial: false,
  max_score: 1,
  stimulus_text: null,
  question_text: base.question_text,
  grading_mode: "AUTO_SINGLE",
  interaction_type: "SINGLE_CHOICE",
  revision_number: 1,
  question_code: "PHYS-G12-0001",
  options: [
    { is_correct: false, sort_order: 1, body: "جول", option_code: "B" },
    { is_correct: true, sort_order: 0, body: "نيوتن", option_code: "A" },
  ],
  media: [],
  solution_steps: [],
  solutions: [],
  accepted_answers: [],
};
const v2 = digestCanonicalPayloadV1(shuffled);
vectors.push({
  id: "V2_key_order_independence",
  expect: "same_as",
  same_as: "V1A_null_stimulus",
  digest: v2.digest,
  source: shuffled,
});

const v3aSrc = { ...structuredClone(base), question_text: "سطر1\r\nسطر2" };
const v3bSrc = { ...structuredClone(base), question_text: "سطر1\nسطر2" };
const v3a = digestCanonicalPayloadV1(v3aSrc);
const v3b = digestCanonicalPayloadV1(v3bSrc);
vectors.push({
  id: "V3A_crlf_question_text",
  expect: "digest",
  digest: v3a.digest,
  source: v3aSrc,
});
vectors.push({
  id: "V3B_lf_question_text",
  expect: "same_as",
  same_as: "V3A_crlf_question_text",
  digest: v3b.digest,
  source: v3bSrc,
});

const v4aSrc = {
  ...structuredClone(base),
  options: [
    { option_code: "B", body: "جول", sort_order: 1, is_correct: false },
    { option_code: "A", body: "نيوتن", sort_order: 0, is_correct: true },
  ],
};
const v4bSrc = {
  ...structuredClone(base),
  options: [
    { option_code: "A", body: "نيوتن", sort_order: 0, is_correct: true },
    { option_code: "B", body: "جول", sort_order: 1, is_correct: false },
  ],
};
const v4cSrc = {
  ...structuredClone(base),
  options: [
    { option_code: "A", body: "جول", sort_order: 0, is_correct: true },
    { option_code: "B", body: "نيوتن", sort_order: 1, is_correct: false },
  ],
};
const v4a = digestCanonicalPayloadV1(v4aSrc);
const v4b = digestCanonicalPayloadV1(v4bSrc);
const v4c = digestCanonicalPayloadV1(v4cSrc);
vectors.push({
  id: "V4A_options_B_then_A",
  expect: "digest",
  digest: v4a.digest,
  source: v4aSrc,
});
vectors.push({
  id: "V4B_options_A_then_B",
  expect: "same_as",
  same_as: "V4A_options_B_then_A",
  digest: v4b.digest,
  source: v4bSrc,
});
vectors.push({
  id: "V4C_swapped_bodies",
  expect: "digest",
  digest: v4c.digest,
  source: v4cSrc,
  assert_ne: "V4A_options_B_then_A",
});

const v5Rows = [
  {
    answer_text: "alpha",
    normalized_answer: "alpha",
    normalization_policy: "TRIM",
    is_primary: true,
    sort_order: 0,
  },
  {
    answer_text: "beta",
    normalized_answer: "beta",
    normalization_policy: "TRIM",
    is_primary: false,
    sort_order: 0,
  },
];
const v5aSrc = {
  ...structuredClone(base),
  interaction_type: "SHORT_TEXT",
  grading_mode: "AUTO_TEXT",
  options: [],
  accepted_answers: v5Rows,
};
const v5bSrc = {
  ...structuredClone(base),
  interaction_type: "SHORT_TEXT",
  grading_mode: "AUTO_TEXT",
  options: [],
  accepted_answers: [...v5Rows].reverse(),
};
const v5a = digestCanonicalPayloadV1(v5aSrc);
const v5b = digestCanonicalPayloadV1(v5bSrc);
vectors.push({
  id: "V5A_accepted_alpha_beta",
  expect: "digest",
  digest: v5a.digest,
  source: v5aSrc,
});
vectors.push({
  id: "V5B_accepted_reverse_insert",
  expect: "same_as",
  same_as: "V5A_accepted_alpha_beta",
  digest: v5b.digest,
  source: v5bSrc,
});

const v6aSrc = { ...structuredClone(base), question_text: "قوة\u0651" };
const v6bSrc = { ...structuredClone(base), question_text: "قوّة" };
const v6a = digestCanonicalPayloadV1(v6aSrc);
const v6b = digestCanonicalPayloadV1(v6bSrc);
vectors.push({
  id: "V6A_combining_marks_as_typed",
  expect: "digest",
  digest: v6a.digest,
  source: v6aSrc,
});
vectors.push({
  id: "V6B_alternate_unicode_form",
  expect: "digest",
  digest: v6b.digest,
  source: v6bSrc,
  note: "May differ from V6A; must not be silently folded in P0",
});

const fixture = {
  payload_hash_version: "canonical_payload_v1",
  serialization: "JCS RFC 8785",
  encoding: "UTF-8 no BOM LF",
  digest_algorithm: "SHA-256 lowercase hex",
  jcs_library: "canonicalize@3.0.0",
  vectors,
};

const out = "tests/fixtures/question-bank/canonical-payload-v1.json";
writeFileSync(out, JSON.stringify(fixture, null, 2) + "\n", "utf8");
console.log("Wrote", out, "vectors=", vectors.length);
for (const v of vectors) console.log(v.id, v.digest);
console.log("checks", {
  "V1A===V2": v1a.digest === v2.digest,
  "V1A!==V1B": v1a.digest !== v1b.digest,
  "V3A===V3B": v3a.digest === v3b.digest,
  "V4A===V4B": v4a.digest === v4b.digest,
  "V4A!==V4C": v4a.digest !== v4c.digest,
  "V5A===V5B": v5a.digest === v5b.digest,
});
