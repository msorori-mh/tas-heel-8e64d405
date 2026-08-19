# TAMKEEN Content V3 / 21H R3 — Final Schema Runtime Closure

Date: 2026-08-19  
Base R2 SHA: `20708f21d992cada0e8494a7a878add275ecc607`  
Branch: `codex/21h-r3-schema-runtime-closure`

## Verdict

`PASS_21H_R3_READY_FOR_FINAL_PARALLEL_REVIEW_AND_PG17`

The source, fixture, runner, static contracts, application regression, typecheck,
and build are ready. The remaining runtime gate is deliberately local-only:
this environment has no `psql`, `initdb`, or PostgreSQL 17 server, so no PG17
database write or remote database access was attempted.

Production, deploy, merge, and remote DB operations were not performed.

## R2 contradiction and confirmed defect

R2 changed the reveal query to:

```sql
SELECT pa.lesson_id, paq.question_revision_id
FROM public.practice_attempts pa
```

The canonical QB-01 migration defines `practice_attempts.lesson_assessment_id`
and does not define `practice_attempts.lesson_id`. Therefore the R2 source was
a confirmed defect, not a valid schema choice:

```text
PRACTICE_ATTEMPTS_COLUMNS=attempt_pin_mode,attempt_type,grading_status,id,lesson_assessment_id,max_score,started_at,submitted_at,total_score,unit_id,user_id
LESSON_ID_PRESENT=NO
CONFIRMED_R2_DEFECT=practice_attempts.lesson_id referenced by R2 reveal RPC
```

The canonical path is:

```text
practice_attempt
  -> practice_attempts.lesson_assessment_id
  -> lesson_assessments.id
  -> lesson_assessments.lesson_id
```

Question membership is then checked through `assessment_questions`, and the
question's canonical `questions.lesson_id` must match the derived lesson.

## Canonical schema proof

The proof was extracted from applied/source migrations, not prior fixtures or
reports:

- `lessons`: `supabase/migrations/20260606003842_a271db04-ff59-4b13-8785-56e938afc1cc.sql:62`, with later `unit_id`, `semester`, and content delivery additions.
- `questions`: same migration `:82`, with later `unit`, `semester`, `code`, `current_published_revision_id`, and archive metadata additions.
- `lesson_assessments`: `supabase/migrations/20260606004917_18901270-9c14-4c37-bea7-1b33e3e26812.sql:177`, with `assessment_code` added by `supabase/migrations/20260812234007_72545986-dc43-4ccb-bcde-18d11c1bd95c.sql:109`.
- `practice_attempts`, `practice_attempt_questions`, and `practice_attempt_responses`: `supabase/migrations/20260801120000_qb01_question_bank_schema_foundation.sql:2015`, `:2037`, and `:2114`; the later canonical replay source is also present at `supabase/migrations/20260813002624_0b9b5ed3-ed54-4c33-9987-a38d718234d4.sql:139`, `:161`, and `:238`.
- `assessment_questions`: `supabase/migrations/20260606004917_18901270-9c14-4c37-bea7-1b33e3e26812.sql:271`.

The schema gate reports these canonical sets:

```text
LESSONS_COLUMNS=content_pdf_url,content_text,created_at,delivery_mode,duration,has_content_pdf,has_video,id,is_free,semester,slug,sort_order,subject_id,title,unit_id,updated_at,video_url
QUESTIONS_COLUMNS=archived_at,archived_by,code,correct_index,created_at,created_by,current_published_revision_id,explanation,id,lesson_id,options,question_text,question_type,semester,sort_order,subject_id,unit,year
LESSON_ASSESSMENTS_COLUMNS=assessment_code,created_at,id,instructions,lesson_id,sort_order,title
PRACTICE_ATTEMPTS_COLUMNS=attempt_pin_mode,attempt_type,grading_status,id,lesson_assessment_id,max_score,started_at,submitted_at,total_score,unit_id,user_id
PRACTICE_ATTEMPT_QUESTIONS_COLUMNS=created_at,id,logical_question_id,max_score,option_order_mapping,payload_hash,payload_hash_version,practice_attempt_id,question_order,question_revision_id,rendered_options,rendered_question_text,rendered_stimulus_text
LESSON_ID_PRESENT=NO
```

## Fixture fidelity

Added `scripts/content-v3/pg17-21h-canonical-fixture.sql`. It contains no
invented `practice_attempts.lesson_id`; it uses `lesson_assessment_id` and the
actual assessment/question relationships.

Added `scripts/content-v3/verify-21h-fixture-schema.mjs`. It reads every
canonical migration, compares fixture table columns against canonical columns,
and fails closed on extras. Current gate:

```text
FIXTURE_SCHEMA_MATCH=PASS
```

The PG17 runner invokes this gate before looking up `psql`, and then runs the
fixture, migration, read-only postverify, and R3 runtime contract in sequence.

## RPC before / after

Before (R2):

```sql
SELECT pa.lesson_id, paq.question_revision_id
```

After (R3):

```sql
SELECT la.lesson_id, paq.question_revision_id
FROM public.practice_attempts pa
JOIN public.lesson_assessments la
  ON la.id = pa.lesson_assessment_id
JOIN public.practice_attempt_questions paq
  ON paq.practice_attempt_id = pa.id
JOIN public.assessment_questions aq
  ON aq.assessment_id = la.id
 AND aq.question_id = paq.logical_question_id
JOIN public.practice_attempt_responses par
  ON par.practice_attempt_question_id = paq.id
JOIN public.questions q
  ON q.id = paq.logical_question_id
 AND q.lesson_id = la.lesson_id
```

The gate retains owner and submitted-state checks, requires a `LESSON` attempt,
requires response ownership through `par.practice_attempt_id`, pins the exact
`paq.question_revision_id`, and preserves the READY/non-N/A lifecycle gate.
Answer and rationale rows are only selected after all gates succeed. The
revision-pinned answer foreign keys were also corrected to match the canonical
`question_revisions(question_id, id)` unique key.

The initial question payload remains answer-free. A new draft revision cannot
replace a historical attempt revision; duplicate reveal calls are deterministic.

## Migration hashes

R1/R2 values are historical only:

```text
R1_MIGRATION_SHA256=E451B3F571D0DA197475BF44E793BF49B45F9CC08E822AC735C9D12FC1318F40
R2_MIGRATION_SHA256=78F8E642A8DB60CCA3909FCC0A7CB4124B753A122FAB92380E086EA85B02CD34
CURRENT_R3_SOURCE_SHA=f42c22b9f013834b78347bf125d0742363dc27e0
CURRENT_R3_MIGRATION_SHA256=3D8CDD27A24EA9F0E998BA14E26ADCB87DD0FF6B62FCC3FBD9B790114DD631E3
```

R1 and R2 values are historical only. The current R3 identity is the exact
pending migration at the locked R3 source; no applied migration was rewritten.

## Visibility

The R2 `UNION ALL` explicit text casts and the two-way gain/loss classifier were
preserved. Static tests continue to cover expected gain, unexpected gain,
unexpected loss, unchanged, and security-fix classification.

The actual before/after visibility SQL was not executed because the local PG17
client/server is absent. The runner remains local-only and the final operator
gate is to execute the read-only visibility diff before and after the candidate,
then record `UNEXPECTED_GAIN_COUNT=0` and `UNEXPECTED_LOSS_COUNT=0`.

## Tests

Passed:

- Application regression: `209/209` (`npm test`).
- QB source: `37/37`.
- QB hash vectors: `12` canonical vectors.
- QB import suite: `438/438`; oracle reconciliation `197/197`.
- 20C functional lifecycle test: `8/8`.
- 21H R1/R2/R3 migration contracts: `36 passed, 1 expected PG17 skip`.
- Typecheck: `npx tsc --noEmit`.
- Build: `npm run build`.
- Fixture gate: `FIXTURE_SCHEMA_MATCH=PASS`.

Blocked only by local tooling:

- 20C disposable PG17 runner: `initdb: command not found`.
- 21H PG17 runner: locality guard passed, then `psql was not found`.

## R4 metadata closure addendum

This R4 change closes release metadata identity only. The migration SQL bytes
remain unchanged.

```text
QWEN_R3:
CRITICAL=0
HIGH hash identity finding=CLOSED
MEDIUM documentation consistency finding=CLOSED
QWEN_REVIEW_AFTER_R4=NOT_CLAIMED
```

The Qwen fields record closure of the finding; they do not claim that Qwen
performed a review after R4.
- 21H visibility runtime test: skipped because `TAMKEEN_PG17_LOCAL_URL` is unset.

No remote target was substituted for the missing local PG17 environment.

## Remaining runtime gate

On a disposable local PostgreSQL 17 instance, run:

```powershell
$env:TAMKEEN_PG17_LOCAL_URL = 'postgresql://localhost:5432/tamkeen'
.\scripts\content-v3\pg17-runner.ps1
```

Then run the read-only before/after visibility diff and retain both result
sets. This is the final external runtime confirmation; it is not a production
apply instruction.
