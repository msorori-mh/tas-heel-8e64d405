# QUESTION-BANK-PAYLOAD-HASH-GOLDEN-VECTORS-01

Documentation-only golden vectors for `canonical_payload_v1`.
Not executable tests. Not runtime code.

| Field | Value |
|---|---|
| Recipe | `docs/QB-01-DESIGN-FREEZE-DECISION-07.md` §9 |
| Version | `canonical_payload_v1` |
| Serialization | JCS RFC 8785 |
| Encoding | UTF-8, no BOM, LF |
| Digest | SHA-256 lowercase hex |

```text
PAYLOAD_HASH_DECISION: PASS
```

---

## Minimal fixture shape (illustrative)

All schema keys always present. Missing source → JSON `null`. Empty string and empty array remain distinct from `null`.

```json
{
  "schema_version": "canonical_payload_v1",
  "question_code": "PHYS-G12-0001",
  "revision_number": 1,
  "interaction_type": "SINGLE_CHOICE",
  "grading_mode": "AUTO_SINGLE",
  "question_text": "ما وحدة القوة؟",
  "stimulus_text": null,
  "max_score": 1,
  "allow_partial": false,
  "options": [
    {"option_code": "A", "body": "نيوتن", "sort_order": 0, "is_correct": true},
    {"option_code": "B", "body": "جول", "sort_order": 1, "is_correct": false}
  ],
  "accepted_answers": [],
  "solutions": [],
  "solution_steps": [],
  "media": [],
  "targets": [
    {"is_primary": true, "target_type": "LESSON", "target_id": "00000000-0000-4000-8000-000000000001"}
  ]
}
```

Digests below are **placeholders for future executable harness** — documentation asserts relative equality / inequality only until a harness lands. Do not treat hex as production-locked until computed by an approved tool.

---

## Vector 1 — Null vs empty string

| Case | `stimulus_text` | Expected |
|---|---|---|
| A | `null` | Hash H1 |
| B | `""` | Hash H2 ≠ H1 |

---

## Vector 2 — Key order independence (JCS)

Same semantic object with object keys shuffled before canonicalization → **identical** hash.

---

## Vector 3 — Line endings

| Case | `question_text` raw | After LF normalize | Expected |
|---|---|---|---|
| A | `سطر1\r\nسطر2` | `سطر1\nسطر2` | Hash H3 |
| B | `سطر1\nسطر2` | `سطر1\nسطر2` | Same as H3 |

---

## Vector 4 — Options order by `option_code`

| Case | Input array order | Canonical order | Expected |
|---|---|---|---|
| A | B then A | A then B | Hash H4 |
| B | A then B | A then B | Same as H4 |
| C | Swap bodies of A/B | A then B with swapped bodies | Hash ≠ H4 |

---

## Vector 5 — Accepted answers equal `sort_order` tie-break

Two answers with same `sort_order` ordered by `normalized_answer ASC`, then `normalization_policy ASC`. Unique constraint forbids unresolved ties.

| Case | Rows | Expected |
|---|---|---|
| A | (0, "alpha", TRIM), (0, "beta", TRIM) | Deterministic order alpha→beta |
| B | Same rows inserted opposite DB order | Same hash as A |

---

## Vector 6 — Arabic Unicode without hidden normalization

| Case | `question_text` | Expected |
|---|---|---|
| A | Arabic with combining marks as typed | Hash H6 |
| B | NFC/NFKC-altered form not required by contract | May differ — **must not** be silently folded in P0 |

`CASEFOLD_AR` is **NOT ALLOWED IN QB-01**.

---

## Non-goals

- No runtime hash service in this docs package.
- No reinterpretation of historical hashes when recipe changes (bump `payload_hash_version`).
