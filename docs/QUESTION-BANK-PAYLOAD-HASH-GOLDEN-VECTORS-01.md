# QUESTION-BANK-PAYLOAD-HASH-GOLDEN-VECTORS-01

Executable golden vectors for `canonical_payload_v1`.

| Field | Value |
|---|---|
| Recipe | `docs/QB-01-DESIGN-FREEZE-DECISION-07.md` §9 |
| Version | `canonical_payload_v1` |
| Serialization | JCS RFC 8785 via `canonicalize@3.0.0` |
| Encoding | UTF-8, no BOM, LF |
| Digest | SHA-256 lowercase hex |
| Fixture | `tests/fixtures/question-bank/canonical-payload-v1.json` |
| Harness | `scripts/question-bank/canonical-payload-v1.mjs` |
| Verify | `npm run test:question-bank-hash` |

```text
PAYLOAD_HASH_DECISION: PASS
DIGESTS_LOCKED: YES (QB-01-EXECUTABLE-MIGRATION-SOURCE-ONLY-14)
```

---

## Minimal fixture shape

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

---

## Locked digests (computed)

| Vector | Digest (SHA-256 lowercase hex) | Notes |
|---|---|---|
| V1A_null_stimulus | `902ee3319e1a3953cf264a754ee98b17c0a97aefc90d8cadf228467ebf3a271f` | Baseline; `stimulus_text: null` |
| V1B_empty_stimulus | `ad349b398edc32d1f584ec11cfc967ec0725a9a086dcc409f94c5632be2338ea` | `stimulus_text: ""` ≠ V1A |
| V2_key_order_independence | `902ee3319e1a3953cf264a754ee98b17c0a97aefc90d8cadf228467ebf3a271f` | Same as V1A after JCS |
| V3A_crlf_question_text | `4a455ee7eae4035b4dd4fc84ffdf6b9f7f39d3eba84e22e0e80122849e02717a` | CRLF normalized to LF |
| V3B_lf_question_text | `4a455ee7eae4035b4dd4fc84ffdf6b9f7f39d3eba84e22e0e80122849e02717a` | Same as V3A |
| V4A_options_B_then_A | `902ee3319e1a3953cf264a754ee98b17c0a97aefc90d8cadf228467ebf3a271f` | Canonical option_code ASC |
| V4B_options_A_then_B | `902ee3319e1a3953cf264a754ee98b17c0a97aefc90d8cadf228467ebf3a271f` | Same as V4A |
| V4C_swapped_bodies | `861805066d9768e24086634cef3f6bc6fbcdc578764bca5da743495dcaf0f8e9` | ≠ V4A |
| V5A_accepted_alpha_beta | `5c8e144e114e0670e6a6007497e042b868e9bc55ca89fe41a30751fb7eddc056` | Tie-break order |
| V5B_accepted_reverse_insert | `5c8e144e114e0670e6a6007497e042b868e9bc55ca89fe41a30751fb7eddc056` | Same as V5A |
| V6A_combining_marks_as_typed | `161fb044fb298d7a4351924d1df126383ffd894de81bbff1190d1dec4620655c` | No silent Unicode fold |
| V6B_alternate_unicode_form | `e08355164cfbefbea84171291afc653618ee4eb0eca49a7026cb3098db2aec8e` | May differ; not folded |

`CASEFOLD_AR` is **NOT ALLOWED IN QB-01**.

---

## Relative contracts (still asserted by harness)

1. Null vs empty string → different digests
2. Key order independence under JCS → identical digest
3. CRLF → LF normalize → identical digest
4. Options sorted by `option_code ASC`
5. Accepted answers tie-break: `sort_order`, `normalized_answer`, `normalization_policy`
6. Arabic combining marks preserved as typed (no NFC/NFKC fold in P0)

---

## Non-goals

- No runtime hash service activation in this package.
- No reinterpretation of historical hashes when recipe changes (bump `payload_hash_version`).
