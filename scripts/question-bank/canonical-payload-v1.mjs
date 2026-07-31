/**
 * canonical_payload_v1 builder + digester.
 * Serialization: JCS RFC 8785 via `canonicalize` (Anders Rundgren / Samuel Erdtman).
 * Digest: SHA-256 lowercase hex over UTF-8 bytes of the JCS string (no BOM).
 */
import canonicalize from "canonicalize";
import { createHash } from "node:crypto";

export const PAYLOAD_HASH_VERSION = "canonical_payload_v1";

const SCHEMA_KEYS = [
  "schema_version",
  "question_code",
  "revision_number",
  "interaction_type",
  "grading_mode",
  "question_text",
  "stimulus_text",
  "max_score",
  "allow_partial",
  "options",
  "accepted_answers",
  "solutions",
  "solution_steps",
  "media",
  "targets",
];

/** Normalize CRLF/CR to LF inside string values (text contract). */
export function normalizeLf(value) {
  if (typeof value !== "string") return value;
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function cmpStr(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function sortOptions(options) {
  return [...options].sort((a, b) => cmpStr(a.option_code, b.option_code));
}

function sortAcceptedAnswers(rows) {
  return [...rows].sort((a, b) => {
    const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (so !== 0) return so;
    const na = cmpStr(a.normalized_answer, b.normalized_answer);
    if (na !== 0) return na;
    return cmpStr(a.normalization_policy, b.normalization_policy);
  });
}

function sortSolutions(rows) {
  return [...rows].sort((a, b) => {
    const st = cmpStr(a.solution_type, b.solution_type);
    if (st !== 0) return st;
    const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (so !== 0) return so;
    return cmpStr(a.solution_code, b.solution_code);
  });
}

function sortSolutionSteps(rows) {
  return [...rows].sort((a, b) => {
    const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (so !== 0) return so;
    return cmpStr(a.step_code ?? a.id ?? "", b.step_code ?? b.id ?? "");
  });
}

function sortMedia(rows) {
  return [...rows].sort((a, b) => {
    const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (so !== 0) return so;
    return cmpStr(a.media_code, b.media_code);
  });
}

function sortTargets(rows) {
  return [...rows].sort((a, b) => {
    const primary = Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary));
    if (primary !== 0) return primary;
    const tt = cmpStr(a.target_type, b.target_type);
    if (tt !== 0) return tt;
    return cmpStr(a.target_id, b.target_id);
  });
}

function normalizeOption(o) {
  return {
    option_code: normalizeLf(o.option_code),
    body: normalizeLf(o.body),
    sort_order: o.sort_order,
    is_correct: o.is_correct,
  };
}

function normalizeAccepted(a) {
  return {
    answer_text: normalizeLf(a.answer_text),
    normalized_answer: normalizeLf(a.normalized_answer),
    normalization_policy: a.normalization_policy,
    is_primary: a.is_primary,
    sort_order: a.sort_order,
  };
}

function normalizeSolution(s) {
  return {
    solution_code: normalizeLf(s.solution_code),
    solution_type: s.solution_type,
    sort_order: s.sort_order,
    model_answer: s.model_answer == null ? null : normalizeLf(s.model_answer),
    explanation: s.explanation == null ? null : normalizeLf(s.explanation),
    hint: s.hint == null ? null : normalizeLf(s.hint),
    common_mistakes: s.common_mistakes == null ? null : normalizeLf(s.common_mistakes),
    simplified_rubric: s.simplified_rubric == null ? null : normalizeLf(s.simplified_rubric),
  };
}

function normalizeStep(s) {
  return {
    step_code: normalizeLf(s.step_code),
    sort_order: s.sort_order,
    body: normalizeLf(s.body),
    solution_code: s.solution_code == null ? null : normalizeLf(s.solution_code),
  };
}

function normalizeMedia(m) {
  return {
    media_code: normalizeLf(m.media_code),
    storage_path: normalizeLf(m.storage_path),
    mime_type: m.mime_type,
    file_size: m.file_size == null ? null : m.file_size,
    sha256: m.sha256 == null ? null : m.sha256,
    alt_text_ar: normalizeLf(m.alt_text_ar),
    caption: m.caption == null ? null : normalizeLf(m.caption),
    sort_order: m.sort_order,
    requires_media: Boolean(m.requires_media),
  };
}

function normalizeTarget(t) {
  return {
    is_primary: Boolean(t.is_primary),
    target_type: t.target_type,
    target_id: t.target_id,
  };
}

/**
 * Build a canonical_payload_v1 object: all schema keys present, arrays sorted,
 * text LF-normalized. Missing source fields become JSON null.
 */
export function buildCanonicalPayloadV1(input) {
  const src = input ?? {};
  const payload = {
    schema_version: PAYLOAD_HASH_VERSION,
    question_code: src.question_code == null ? null : normalizeLf(src.question_code),
    revision_number: src.revision_number == null ? null : src.revision_number,
    interaction_type: src.interaction_type == null ? null : src.interaction_type,
    grading_mode: src.grading_mode == null ? null : src.grading_mode,
    question_text: src.question_text == null ? null : normalizeLf(src.question_text),
    stimulus_text:
      src.stimulus_text === undefined
        ? null
        : src.stimulus_text === null
          ? null
          : normalizeLf(src.stimulus_text),
    max_score: src.max_score == null ? null : src.max_score,
    allow_partial: src.allow_partial == null ? false : Boolean(src.allow_partial),
    options: sortOptions((src.options ?? []).map(normalizeOption)),
    accepted_answers: sortAcceptedAnswers((src.accepted_answers ?? []).map(normalizeAccepted)),
    solutions: sortSolutions((src.solutions ?? []).map(normalizeSolution)),
    solution_steps: sortSolutionSteps((src.solution_steps ?? []).map(normalizeStep)),
    media: sortMedia((src.media ?? []).map(normalizeMedia)),
    targets: sortTargets((src.targets ?? []).map(normalizeTarget)),
  };

  for (const key of SCHEMA_KEYS) {
    if (!(key in payload)) {
      throw new Error(`canonical_payload_v1 missing key: ${key}`);
    }
  }
  return payload;
}

/** JCS (RFC 8785) string. */
export function toJcs(payload) {
  const out = canonicalize(payload);
  if (typeof out !== "string") {
    throw new Error("canonicalize returned non-string");
  }
  return out;
}

/** SHA-256 lowercase hex of JCS bytes. */
export function sha256Hex(jcs) {
  return createHash("sha256").update(jcs, "utf8").digest("hex");
}

/** End-to-end: source object → digest. */
export function digestCanonicalPayloadV1(input) {
  const payload = buildCanonicalPayloadV1(input);
  const jcs = toJcs(payload);
  return {
    payload,
    jcs,
    digest: sha256Hex(jcs),
    payload_hash_version: PAYLOAD_HASH_VERSION,
  };
}
