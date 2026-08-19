# TAMKEEN CONTENT V3 — R5 SOURCE REMEDIATION

`GATE=R5_SOURCE_REMEDIATION` · `PRODUCTION_WRITES=0`

This gate is source-only. Nothing in it has been applied to production. It exists to
remove the two Preflight blockers **honestly**, so that the later
`PRODUCTION SCHEMA APPLY` and `IRON DATA BINDING` gates can run on truthful evidence.

## 1. No fabricated approver

`ready_by` is written only when an actual READY transition for the same
`(lesson_id, capability)` exists in `audit_logs`. Those rows are labelled
`evidence_origin='AUDITED_APPROVAL'`.

Every other legacy row is labelled:

```text
evidence_origin=LEGACY_20C_VISIBLE_BASELINE
```

That value asserts exactly one thing: *this capability was already visible to students
under 20C, and its snapshot/hash record what was visible at pinning time.* It claims no
human review and no approver. A synthetic "system actor" is never used.

Both `production-preflight-readonly.sql` and `postverify-21h.sql` were updated to match:
snapshot + hash + `ready_at` are unconditionally required; `ready_by` is required unless
the row carries the documented legacy provenance. Without this change the plan would have
produced either dishonest evidence or a guaranteed Postverify failure.

## 2. No lifecycle deletion

The 40 `originalBookPdf` rows are **kept**. They are demoted out of READY to `REVIEW` and
labelled `retirement_origin='LEGACY_20C'`. 21H then flips their `applicability` to `NA`
by itself, which is already part of the approved migration.

The Preflight blocker was rewritten accordingly: the existence of an `originalBookPdf` row
is no longer a blocker; a **retired-but-still-READY** row, or a retired row without
retirement provenance, is.

Student impact is nil: `originalBookPdf` was removed from the lesson journey in 21B4E, and
the PDFs themselves live at subject level in `subject_textbooks`.

## 3. Canonical snapshot v1 (exact definition)

`public.v3_capability_snapshot(lesson_id, capability)` produces:

```json
{ "snapshotVersion": "v3.snapshot.1", "capability": "...", "lessonId": "...", "payload": ... }
```

`public.v3_capability_snapshot_hash(snapshot)` = `sha256` over
`public._v3_jcs(snapshot)` encoded as UTF-8. `_v3_jcs` is a recursive canonical serializer:
object keys sorted with `COLLATE "C"`, no insignificant whitespace, array order preserved
as produced by the ordered queries below.

Per-capability payload and ordering:

| Capability | Source | Ordering |
| --- | --- | --- |
| officialBookContent | `lesson_book_contents.content` (non-empty) | `id` |
| tamkeenExplanation | `lesson_explanations` code/title/content | `sort_order`, `id` |
| quickReview | `lesson_summaries` summary/key_points/study_tip | `id` |
| mindMap | `lesson_resources` where mindmap, non-empty url | `sort_order`, `id` |
| simulation | experiment resources + `lesson_simulations` | `sort_order`, `id` in each list |
| checkUnderstanding | `questions` + published revision id + option **codes** | question `sort_order`,`id`; options `sort_order`,`option_code` |
| lessonAssessment | `lesson_assessments` + `assessment_questions` | `sort_order`,`id` / `sort_order`,`question_id` |

Answer safety is structural, not filtered: `is_correct`, `why_correct`, `why_wrong`,
`model_answer` and `explanation` are never selected by the snapshot function, so no
snapshot or hash can carry an answer. Only PUBLISHED revisions are pinned
(`current_published_revision_id` joined with `status='PUBLISHED'`); archived questions are
excluded.

## 4. Operator privileges

`sandbox_exec` gets no permanent production grant, and specifically no standing read on
`supabase_migrations`. The baseline must be measured either by the database owner inside a
`READ ONLY` transaction, or by a temporary operator role whose grants are revoked in the
same session.

`can_access_lesson` cannot be validated by `GRANT EXECUTE` alone — `auth.uid()` stays NULL
for a bare SQL role. Visibility must be measured either with a real test-student JWT or by
evaluating the policy predicates directly against a fixed user id.

## 5. Capability mapping (fixed in source)

`src/lib/lessons/capability-mapping.ts`:

| Package | lifecycle |
| --- | --- |
| officialBookContent | officialBookContent |
| tamkeenExplanationHtml | tamkeenExplanation |
| lessonSummaryHtml | quickReview |
| mindMapHtml | mindMap |
| labExperimentHtml | simulation |
| officialBookQuestions | checkUnderstanding |
| selfTest | lessonAssessment |

Any importer that writes lifecycle rows must translate through this map; the strings are
not interchangeable.

## 6. Identity is not guessed

No default `semester`, `sort_order`, or curriculum ownership. While the official source
does not settle them:

```text
identity_status=UNRESOLVED
FULLY_READY=false
```

A defaulted-then-labelled-PENDING value would create a wrong production ordering, so the
Iron lesson is not created until identity is resolved from the official source.

## 7. Execution gates

```text
R5 SOURCE REMEDIATION            <- this document (source only, PR + PG17 + review)
PRODUCTION SCHEMA APPLY          <- read-only baseline, R5 reconciliation, Preflight,
                                    21H byte-for-byte, Postverify + visibility diff
IRON DATA BINDING                <- identity + books, DRAFT, REVIEW, READY, Student E2E
```

## Artifacts in this gate

- `supabase/migrations-pending/20260819120000_content_v3_r5_legacy_evidence_pinning.sql` (not applied)
- `scripts/content-v3/production-preflight-readonly.sql` (updated gates, still read-only)
- `scripts/content-v3/postverify-21h.sql` (updated gates, still read-only)
- `src/lib/lessons/capability-mapping.ts`
- `tests/migrations/content-v3-r5-source-remediation.test.mjs`

The approved 21H migration file is untouched; its SHA256 is unchanged
(`3D8CDD27A24EA9F0E998BA14E26ADCB87DD0FF6B62FCC3FBD9B790114DD631E3`).
