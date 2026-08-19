# TAMKEEN Content V3 21H — R2 Runtime-Fixes Addendum

Date: 2026-08-19 (Asia/Riyadh)

This addendum preserves the R1 history and records the narrow R2 closure work
performed from the Antigravity PostgreSQL 17 report. No production, deploy,
merge, remote database, storage, OAuth, data, or fixture operation was done.

## Source and migration identity

```text
BASE_R1_SHA=4b5465afe371868eef330c6c03766a274d2dcb52
R2_SOURCE_SHA=de8c79abf28d2f03307633a4e79088e4334d0269
BRANCH=codex/21h-r2-runtime-fixes
R1_MIGRATION_SHA256=E451B3F571D0DA197475BF44E793BF49B45F9CC08E822AC735C9D12FC1318F40
R2_MIGRATION_SHA256=78F8E642A8DB60CCA3909FCC0A7CB4124B753A122FAB92380E086EA85B02CD34
MIGRATION_CHANGED=YES_PENDING_R2_APPLY
```

The migration SHA values are canonical UTF-8 content hashes with LF line
endings. Git reports the checked-out files as `i/lf w/crlf` under
`core.autocrlf=true`; that working-tree normalization is not a semantic
migration change.

## R1 runtime findings from Antigravity

Antigravity's complete report was read from
`C:\projects\tas-heel-content-v3-21h-pg17\docs\content\TAMKEEN-CONTENT-V3-21H-PG17-RUNTIME-ANTIGRAVITY-REPORT.md`.

1. `scripts/content-v3/visibility-diff-21h.sql` failed on PostgreSQL 17 with
   SQLSTATE `42804`: `UNION ALL` attempted to combine `bigint` counters with
   the text status value.
2. The pending migration's `reveal_official_question_answer` failed at
   runtime with SQLSTATE `42P01`: `q.lesson_id` referenced an alias absent from
   the query. The query already joins `practice_attempts pa`, whose
   `pa.lesson_id` is the lesson attached to the attempt.

The same report recorded zero initial answer/rationale leakage, authorized
attempt checks, historical revision pinning, and the expected deny behavior
before the reveal function could execute successfully.

## R2 fixes and tests

- All visibility counter branches in the final `UNION ALL` are explicitly
  cast with `::text`; `EXPECTED_GAIN`, `UNEXPECTED_GAIN`, `SECURITY_FIX`,
  `UNEXPECTED_LOSS`, and `STATUS` semantics are unchanged.
- `q.lesson_id` was changed to `pa.lesson_id` after reviewing the complete
  `FROM/JOIN` and authorization predicates. The reveal query still requires
  the owned attempt, submitted attempt and response, matching logical
  question, READY/non-NA lesson gate, exact pinned revision, and existing
  answer row.
- Regression tests cover the bigint/text union, undefined alias, authorized
  reveal, wrong user/lesson denial predicates, DRAFT/REVIEW denial, historical
  pinning, no answer leak, and no rationale leak. The PG17 visibility test is
  enabled when `TAMKEEN_PG17_LOCAL_URL` is supplied and local.

```text
VISIBILITY_DIFF_SQL_TYPE_SAFE=PASS_STATIC
REVEAL_RPC_RUNTIME_SQL_VALID=PASS_STATIC_SOURCE_REVIEW; PG17_RETEST_REQUIRED=YES
REVEAL_AUTH_SEMANTICS_UNCHANGED=PASS_STATIC_SOURCE_REVIEW; PG17_RETEST_REQUIRED=YES
ANSWER_LEAK=PASS_STATIC; R1_PG17_RUNTIME_ZERO
REVISION_PINNING=PASS_STATIC; R1_PG17_RUNTIME_PASS
```

## Golden lesson consistency note

The identifiers remain unchanged:

```text
lesson_id=16c10040-7a7b-4647-add2-4aa4d3f70583
lesson_code=lesson-g10-001-001
```

NOTE: any Antigravity prose calling this lesson “سورة الحجرات” is a naming
error. The repository's Golden lesson identity is `lesson-g10-001-001`, whose
documented title is the Surah As-Sajdah lesson. No lesson identifier, content,
fixture, or data was changed.

## Verification status

```text
R1_STATIC_AND_RELEVANT_TESTS=PASS
R2_RUNTIME_FIX_STATIC_TESTS=32_PASS_1_SKIP_LOCAL_PG17_URL_UNSET
RUNTIME_REVALIDATION=REQUIRED_ON_DISPOSABLE_POSTGRESQL_17
REPORT=docs/content/TAMKEEN-CONTENT-V3-21H-R2-RUNTIME-FIXES-REPORT.md
```
