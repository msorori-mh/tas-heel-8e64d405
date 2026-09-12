# QB03-LEGACY-BACKFILL-DESIGN-01

Design-only package for legacy → question-bank Revision #1 backfill.

| Field | Value |
|---|---|
| Package | `QB03-LEGACY-BACKFILL-AND-RUNTIME-CUTOVER-DESIGN-01` |
| Kind | Design + contract tests only |
| Depends on | QB-01 merged schema source; PR #56 QB-02 dry-run foundation |
| Runtime default | **LEGACY** (unchanged by this package) |
| Migration changes | **ZERO** |
| Runtime / SQL / Deploy | **NO** |

```text
SCOPE LOCK
- No executable migration
- No SQL execution
- No database writes
- No runtime modification
- No remote apply
- No deploy
- No production write
```

---

## 1. Conversion pipeline

```text
legacy questions (public.questions + options JSON + correct_index 0-based)
  → logical questions (same questions.id hub; additive QB-01 columns only)
  → revision 1 (question_revisions.revision_number = 1)
  → options / accepted_answers / solutions / media (revision-scoped children)
  → payload_hash (canonical_payload_v1 + JCS + SHA-256)
  → targets (question_targets on logical question_id)
  → legacy linkage (source fingerprint + audit provenance; legacy cache untouched until later sync package)
```

### Frozen ordering

1. Classify row (`INVALID` / usage / unused).
2. Resolve identity + duplicate policy.
3. Build deterministic Revision #1 draft payload.
4. Materialize children in stable sort order.
5. Compute `source_payload_hash` then `payload_hash`.
6. Upsert targets (dedupe keys).
7. Link provenance / audit.
8. Promote status only per classification rules (never corrupt PUBLISHED).

Priority (from QB-01 freeze):

```text
INVALID > HISTORICAL_OR_ACTIVE_USAGE > UNUSED_VALID
```

| Classification | Outcome |
|---|---|
| INVALID | `HOLD_ROW` — no Revision #1 PUBLISHED |
| VALID + SQL usage evidence | R1 → publish path → `PUBLISHED` |
| VALID + verified unused | R1 `DRAFT` |
| VALID + `UNVERIFIABLE_USAGE` | `HOLD_REVIEW` — never auto-DRAFT |

---

## 2. Identity keys

| Layer | Identity key | Notes |
|---|---|---|
| Logical question | `questions.id` (uuid) | Legacy row is the hub; no second logical row |
| Stable code | `questions.code` | Required unique; see code generation |
| Revision | `(question_id, revision_number=1)` | Unique; R1 only for backfill |
| Source fingerprint | `sha256(canonical_legacy_source_v1)` | Stored as `source_payload_hash` |
| Payload | `payload_hash` + `payload_hash_version='canonical_payload_v1'` | Content digest |
| Backfill batch | `backfill_version` | Package/version label; not a schedule |
| Target | `(question_id, target_type, COALESCE(lesson_id, unit_id, subject_id))` | Matches QB-01 dedupe index |
| Option | `(question_revision_id, option_code)` | Codes `A..` by sort_order |
| Media | `(question_revision_id, media_code)` | Metadata only; no bucket create |
| Audit | `(source_system='legacy_questions', source_question_id, backfill_version, actor, at)` | Append-only provenance |

### Canonical legacy source (`canonical_legacy_source_v1`)

Deterministic object over legacy fields only:

- `id`, `code`, `question_text`, `options` (JSON array as stored), `correct_index` (0-based),
- `explanation`, `lesson_id`, `subject`/`unit` resolved ids when present,
- `max_score` / type fields if present,
- media references as stored paths/urls (normalized LF, no BOM).

Missing → JSON `null`. Empty string ≠ null.

---

## 3. Duplicate resolution

| Case | Rule |
|---|---|
| Same `questions.id` reprocessed, same `source_payload_hash` | **NOOP** (retry-safe) |
| Same id, different `source_payload_hash` | `HOLD_RECONCILIATION` — no auto-mutate R1 |
| Same `code`, different id | `HOLD_ROW` (duplicate/conflicting code) |
| Same content hash, different codes/ids | Keep both logical rows; flag `DUPLICATE_CONTENT_REVIEW` (owner content decision later) |
| Orphan / missing lesson target | See §7–8; do not invent targets |

Never create a second `revision_number=1`. Never delete prior R1 on conflict.

---

## 4. Code generation

| Condition | Action |
|---|---|
| Non-empty unique `questions.code` | Keep as-is (trim LF only for fingerprinting; persist original if already stored) |
| Empty / null code | Generate deterministic `LEGACY-<uuid without dashes uppercase>` |
| Generated code collides | `HOLD_ROW` — do not invent random suffixes |
| Code changes mid-backfill | Forbidden; code is identity-stable for this package |

Excel / import codes remain QB-02 concern. Backfill does not rewrite student-facing codes except empty → deterministic LEGACY-* .

---

## 5. Revisions

- Backfill creates **only** `revision_number = 1`.
- Initial insert status must be `DRAFT` (QB-01 lifecycle forbids insert as PUBLISHED/APPROVED/SUPERSEDED).
- Promotion to `PUBLISHED` only via authorized publish path designed for backfill executor (future package), with:
  - valid payload_hash
  - usage evidence satisfied
  - pointer set atomically
- Unused valid stays `DRAFT`.
- Invalid never reaches publish.
- Subsequent content edits are **new revisions** (out of QB-03 design scope for execution).

---

## 6. `correct_index` (0-based)

```text
Runtime / legacy cache: questions.correct_index = 0-based
Excel / QB-02 adapters: 1-based input → option_code → is_correct → derived 0-based
Backfill source: treat stored correct_index as 0-based SoT for legacy MCQ
```

| Rule | Detail |
|---|---|
| Bounds | `0 <= correct_index < options.length` |
| Out of bounds / null with options | INVALID → `HOLD_ROW` |
| SINGLE_CHOICE | Exactly one `is_correct=true`; option at `correct_index` must be that option |
| Option codes | Assign `A,B,C…` by array order (`sort_order = index`) |
| Derived cache after QB | Future `qb_sync_question_legacy` writes 0-based only — **not activated here** |
| Never | Interpret Excel 1-based values as already stored in DB cache |

Zero-tolerance for wrong-answer mapping in shadow compare (see state-machine doc).

---

## 7. Invalid legacy content

Classify INVALID (→ `HOLD_ROW`) if any:

- empty `question_text`
- invalid / non-array options JSON
- `correct_index` out of bounds
- SINGLE_CHOICE without exactly one correct answer
- duplicate/conflicting `code`
- required FK unresolvable when required for classification
- data that would change the correct answer under normalization
- MANUAL/LONG_TEXT lacking required solution when policy requires it (align QB-02 `QB_IMPORT_MANUAL_GRADING_REQUIRES_SOLUTION`)

Used-but-invalid still `HOLD_ROW`. **Never** publish corrupt R1.

---

## 8. Manual questions

| Legacy signal | Mapping |
|---|---|
| Type MANUAL / LONG_TEXT / essay-like | `grading_mode=MANUAL`, `manual_grading_required=true` |
| SHORT_TEXT / NUMERIC | `grading_mode=AUTO_TEXT` + accepted_answers (EXACT\|TRIM\|TRIM_COLLAPSE only) |
| Needs Arabic casefold / diacritic fold | Keep/force `MANUAL` — `CASEFOLD_AR` forbidden in P0 |
| Missing model answer / solution when required | `HOLD_ROW` or `HOLD_REVIEW` per severity matrix |
| Historical attempts | Remain LEGACY pin; no guessed revision backfill onto old attempts |

---

## 9. Missing lessons / orphan questions

| Case | Definition | Outcome |
|---|---|---|
| Missing lesson | `lesson_id` set but lesson row absent | INVALID relation → `HOLD_ROW` for target materialization; question may still HOLD |
| Orphan question | No lesson/unit/subject resolvable; no usage evidence | If content VALID → R1 `DRAFT` **without** targets; else HOLD |
| Orphan + usage evidence | Used in exam/assessment but no lesson | R1 publish candidate + `HOLD_REVIEW` for targets |
| Unverifiable usage path | No stable SQL evidence set | `HOLD_REVIEW` |

Do not fabricate lesson links.

---

## 10. Media links

- Map legacy media urls/paths → `question_media` metadata rows.
- `media_code` deterministic: `M{n}` by stable sort of references.
- `requires_media` mirrors legacy/QB-02 flags.
- Missing blob / unreadable path → issue `MEDIA_REFERENCE_MISSING` → row-blocking when `requires_media=true`, else warning + continue without media child.
- **No** storage bucket creation in this design package.

---

## 11. Audit provenance

Every successful or held backfill row records:

| Field | Required |
|---|---|
| `source_system` | `legacy_questions` |
| `source_question_id` | legacy uuid |
| `source_payload_hash` | yes |
| `payload_hash` | yes when revision created |
| `backfill_version` | yes |
| `classification` | INVALID / USAGE / UNUSED_VALID / UNVERIFIABLE |
| `outcome` | HOLD_ROW / HOLD_REVIEW / HOLD_RECONCILIATION / R1_DRAFT / R1_PUBLISHED / NOOP |
| `actor` | service/backfill principal (future executor) |
| `at` | timestamptz |
| `fingerprint` | request/row fingerprint for idempotency ledger |

Provenance is append-only. Rollback must not erase audit history (see rollback plan).

---

## 12. Idempotency contract (design)

Every backfill row MUST be:

| Property | Enforcement |
|---|---|
| deterministic | Same legacy snapshot → same children, codes, hashes, targets |
| resumable | Progress keyed by `source_question_id` + `backfill_version` |
| retry-safe | Same fingerprint → NOOP success |
| fingerprinted | Row + request fingerprints in idempotency ledger |
| source-linked | `source_payload_hash` + `source_question_id` always set |
| no duplicate revision | `UNIQUE(question_id, revision_number)` |
| no duplicate target | QB-01 target dedupe unique index |

```text
same source hash → NOOP
different source hash on existing R1 → HOLD_RECONCILIATION
partial batch interrupt → safe resume; no duplicate R1/targets
```

---

## 13. Explicit non-decisions (owner)

| Topic | Status |
|---|---|
| Batch size | `NEEDS_OWNER_DECISION` |
| Production schedule | `NEEDS_OWNER_DECISION` |
| Cutover time | `NEEDS_OWNER_DECISION` |
| Retention period | `NEEDS_OWNER_DECISION` |
| Cleanup of legacy columns/tables | `NEEDS_OWNER_DECISION` |
| Remote execution window | `NEEDS_OWNER_DECISION` |

---

## 14. Security notes (design)

- Backfill executor is service-only in future packages; not granted to `authenticated` students.
- Do not expose `is_correct`, solutions, or `correct_index` via new student-readable paths.
- Preserve existing REVOKE on `questions.correct_index` / `explanation`.
- No RLS weakening in this package (no SQL changes).

---

## 15. Exit criteria for this design package

- Documents A–F present under `docs/question-bank/`.
- Test matrix ≥ 150 cases.
- Contract test PASS.
- Migration / runtime / SQL deltas for this package = ZERO.
