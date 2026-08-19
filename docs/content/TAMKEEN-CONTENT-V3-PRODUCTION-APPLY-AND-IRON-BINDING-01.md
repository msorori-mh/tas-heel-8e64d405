# TAMKEEN_CONTENT_V3_PRODUCTION_APPLY_AND_IRON_BINDING_01

Operator: Lovable (Production Operator)
Date (UTC): 2026-08-19
Repository: msorori-mh/tas-heel-8e64d405

## Executive verdict

`FINAL_VERDICT=HOLD_PRODUCTION_PREFLIGHT`

Step 0 (source and file identity) **passed in full**. Step 1 (production read-only
preflight) **failed**: production emitted two explicit `STOP_PRODUCTION_STATE_INCOMPATIBLE`
conditions, and the available operator role cannot complete the remaining read-only
gates. Per the mission contract, **no migration was applied and no write of any kind was
performed** — no schema change, no storage upload, no subject/lesson bootstrap, no
capability binding.

## 0 — Source and file lock (PASS)

| Check | Result |
| --- | --- |
| HEAD SHA | `62c01c801bc04e88106fe5c92e061c47dd8d1f48` = REQUIRED_MAIN_SHA |
| Migration file | `supabase/migrations-pending/20260818210000_content_v3_21h_hardened_preflight.sql` |
| Migration SHA256 | `3D8CDD27A24EA9F0E998BA14E26ADCB87DD0FF6B62FCC3FBD9B790114DD631E3` (matches EXPECTED byte-for-byte) |
| Package | `content-packages/chemistry-g12-iron-v3` present (manifest, official-content, explanation, summary, mindmap, lab, official-questions, self-test, answer-companion.server-only.json, assets, provenance) |

### Uploaded textbook identity

| File | Size (bytes) | Pages | SHA256 |
| --- | --- | --- | --- |
| كتاب_الكيمياء_الصف_ثالث_ثانوي_منهج_صنعاء.pdf | 10,852,623 | 195 | `59206662fee5c2e2610646d68ba8bf34afff75a667d089544751ec87178723bb` |
| كتاب_الكيمياء_الصف_ثالث_ثانوي_منهج_عدن.pdf | 10,852,623 | 195 | `59206662fee5c2e2610646d68ba8bf34afff75a667d089544751ec87178723bb` |
| كتاب_الكيمياء_-_الانشطة_والتجارب_العملية_منهج_صنعاء_وعدن.pdf | 3,821,240 | 51 | `6b6d31c3a726afc4089cae592ba6a14d538c7018e2253f5cf7444b72fcc8b4df` |

The Sanaa and Aden main textbooks are **byte-identical** — proven by SHA256, not assumed.
Any future binding must therefore create two `subject_textbooks` rows (one per track)
pointing at content with a single shared content hash, and must not silently treat them
as different editions.

## 1 — Production read-only preflight (FAIL)

Executed read-only, inside `BEGIN; SET TRANSACTION READ ONLY; ... ROLLBACK;`:

- `scripts/content-v3/production-preflight-readonly.sql`
- `scripts/content-v3/visibility-diff-21h.sql`

Environment: `postgres`, `server_version_num=170006` (PostgreSQL 17 — PASS),
operator role `sandbox_exec`.

Object presence:

| Object | Present |
| --- | --- |
| `public.lessons` | yes |
| `public.lesson_capability_lifecycle` | yes |
| `public.question_option_rationales` | no (expected, created by 21H) |
| `public.official_question_answers` | no (expected, created by 21H) |
| `public.get_lesson_official_questions(uuid)` | no (expected) |
| `public.reveal_official_question_answer(uuid,uuid)` | no (expected) |
| `public.lesson_capability_transition(...)` | yes |
| `public.touch_lesson_capability_lifecycle()` | yes |

Passing gates: no duplicate lifecycle keys (0), no orphan/invalid capability rows (0),
no READY rows without underlying content (0), lifecycle policy count = 2 with only the
two expected policy names, no `PUBLIC`/`anon` grant, no `authenticated` write grant,
no duplicate/overlapping lifecycle relations or functions, and no legacy answer-layer
tables (`question_option_rationales`, `official_question_answers` are absent — so there
is no pre-existing unsafe answer schema).

### Blocking condition 1 — unpinned READY rows

`STOP_PRODUCTION_STATE_INCOMPATIBLE READY_rows_without_current_evidence=104`

| status | capability | rows | missing ready_by | missing ready_snapshot | missing ready_hash |
| --- | --- | --- | --- | --- | --- |
| READY | officialBookContent | 21 | 21 | 21 | 21 |
| READY | tamkeenExplanation | 40 | 39 | 40 | 40 |
| READY | originalBookPdf | 40 | 40 | 40 | 40 |
| READY | quickReview | 1 | 0 | 1 | 1 |
| READY | checkUnderstanding | 1 | 1 | 1 | 1 |
| READY | lessonAssessment | 1 | 1 | 1 | 1 |

All 104 rows have `ready_at` set but no snapshot/hash (and mostly no `ready_by`). These
are legacy 20C rows created before the snapshot contract. The 21H contract requires every
READY row to carry auditable evidence, so applying on top of this state would leave
unverifiable READY content inside the new gating logic.

### Blocking condition 2 — legacy `originalBookPdf` lifecycle rows

`STOP_PRODUCTION_STATE_INCOMPATIBLE legacy_originalBookPdf_lifecycle_rows_present=40`

The final V3 capability contract **excludes** `originalBookPdf`. Forty READY rows for that
capability still exist in production (Quran/PDF era rows).

### Blocking condition 3 — operator role cannot complete the preflight

- `permission denied for schema supabase_migrations` — the migration-history variant gate
  (checking for duplicated 20C history entries) could not be evaluated.
- `permission denied for function can_access_lesson` — `visibility-diff-21h.sql` aborted,
  so `BEFORE_VISIBLE` / `AFTER_EXPECTED_VISIBLE` counts **could not be measured**.

Without a measured before-visibility baseline there is no way to prove
`UNEXPECTED_VISIBILITY_GAIN=0` / `LOSS=0` after apply. That alone forbids apply.

## 2–8 — Not executed

Sections 2 (apply), 3 (postverify), 4 (Grade 12 chemistry bootstrap), 5 (textbook storage
and binding), 6 (Iron seven-capability binding), 7 (review/READY) and 8 (student E2E) are
gated on preflight success and were **not started**. Zero writes were issued to production
(no `INSERT`/`UPDATE`/`DELETE`/DDL/RPC mutation, no storage object created).

Existing content is untouched: the Quran lesson set and all current lessons remain exactly
as measured.

## Required remediation before a re-run

1. **Grant a real operator role.** The apply operator needs read on
   `supabase_migrations.schema_migrations` and `EXECUTE` on `public.can_access_lesson`, so
   the visibility diff can produce a genuine before/after baseline.
2. **Resolve the 104 unpinned READY rows.** Either (a) an audited backfill migration that
   attaches `ready_by`, `ready_snapshot`, and `ready_hash` from the current live content —
   which is a content-visibility decision the 21H file deliberately refuses to make — or
   (b) a documented grandfather rule accepted in writing and encoded as an explicit
   preflight exemption list.
3. **Decide the fate of the 40 `originalBookPdf` rows.** The V3 contract excludes the
   capability; production still carries READY rows for it. They must be retired through an
   explicit, auditable migration (not silently dropped) or the exclusion contract must be
   amended.
4. Re-run preflight; only a clean run authorises apply.

Nothing above may be done implicitly by the apply operator — each item changes what
students can see, so each needs its own approved change.

## Final report block

```
FINAL_VERDICT=HOLD_PRODUCTION_PREFLIGHT
SOURCE_SHA=62c01c801bc04e88106fe5c92e061c47dd8d1f48
MIGRATION_SHA256=3D8CDD27A24EA9F0E998BA14E26ADCB87DD0FF6B62FCC3FBD9B790114DD631E3
POSTGRES_VERSION=17.0 (server_version_num=170006)
PREFLIGHT=FAIL
MIGRATION_APPLIED=false
POSTVERIFY=NOT_RUN
VISIBILITY_GAIN=NOT_MEASURABLE (can_access_lesson permission denied)
VISIBILITY_LOSS=NOT_MEASURABLE (can_access_lesson permission denied)
GRADE12_ID=NOT_RESOLVED
CHEMISTRY_SUBJECT_ID=NOT_CREATED
SANAA_TRACK_ID=NOT_RESOLVED
ADEN_TRACK_ID=NOT_RESOLVED
IRON_LESSON_ID=NOT_CREATED
SANAA_BOOK_SHA256=59206662fee5c2e2610646d68ba8bf34afff75a667d089544751ec87178723bb
ADEN_BOOK_SHA256=59206662fee5c2e2610646d68ba8bf34afff75a667d089544751ec87178723bb
ACTIVITY_BOOK_SHA256=6b6d31c3a726afc4089cae592ba6a14d538c7018e2253f5cf7444b72fcc8b4df
CAPABILITIES_BOUND=0
READY_CAPABILITIES=0
FULLY_READY=false
FREE_ACCESS=UNCHANGED (no gate created, no paywall touched)
PAYWALL=NONE_CREATED
ANSWER_LEAK=0 (no answer payload written; answer-companion remained server-only in repo)
STUDENT_E2E=NOT_RUN
CRITICAL=0
HIGH=2 (unpinned READY rows=104; legacy originalBookPdf READY rows=40)
MEDIUM=1 (operator role cannot complete read-only preflight gates)
REPORT=docs/content/TAMKEEN-CONTENT-V3-PRODUCTION-APPLY-AND-IRON-BINDING-01.md
PR=NOT_OPENED (git branch/commit/push is managed by the platform, not the operator sandbox)
```
