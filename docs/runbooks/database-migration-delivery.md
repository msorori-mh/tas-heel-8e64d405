# Database migration delivery

## The problem this documents

**Merging a migration does not apply it.** Nothing in this repository deploys SQL. All
three workflows in `.github/workflows` are test-only — none contains a deploy step, no
`supabase db push`, no database credentials. Migrations reach production only when a
human replays them through Lovable.

Measured on 2026-08-28: **55 of 195 migration files had never been applied.** The last
hand-authored migration to reach the database was `20260824010000`. Everything written
after it — including the database half of a merged pull request — existed only in git.

This has already cost real behaviour:

- `20260826040000_independent_lesson_component_publishing.sql` merged with a pull
  request and never ran. `mark_lesson_component_draft` does not exist in production, so
  the per-component draft demotion that PR promised is not actually in force.
- `lesson_student_visible` was edited **directly in production**, outside the migration
  system. Its live body appears in no file in this repository, and the only recorded
  migration touching that function contains the *older* rule. Replaying repository
  migrations would have silently reverted a live fix.

Drift runs in both directions. The repository is not a description of production, and
production is not a replay of the repository.

## Check the gap

Ask the database what it has actually run:

```sql
SELECT string_agg(version, ',' ORDER BY version)
FROM supabase_migrations.schema_migrations;
```

Then compare against the repository:

```bash
node scripts/migrations/unapplied-report.mjs --applied-file applied.txt
```

Exit code `1` means at least one migration has never been applied; `0` means the
backlog is empty. The report separates genuine drift from the ±3s recording skew
Lovable introduces — without that split the first audit showed 83 "missing" files, 27
of which were only a timestamp artifact.

## Apply the backlog

There is no safe bulk replay. These files were written against the schema as it stood
at the time, and 55 of them have never met each other in this order.

1. Read the file. A migration that never ran has never been proven against anything.
2. Apply the **oldest first**, one at a time.
3. After each one, confirm the object it claims to create actually exists.
4. Record it, so the ledger stops lying:

```sql
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260831010000', 'lesson_component_independent_publishing_02')
ON CONFLICT (version) DO NOTHING;
```

Skipping step 4 is how the current mess started.

## Prove a migration before it merges

The PG17 jobs apply migrations **by explicit filename** — they do not scan the folder.
A migration that is not named in a workflow is never executed by CI, no matter how
green the pull request looks. Wire every new migration into a gate that can actually
run it:

- `supabase/migrations-pending/` is **misleadingly named**: 12 of its files are live in
  production. Treat the folder as a naming accident, not as a status.
- `lesson_student_visible` and other `LANGUAGE sql` functions resolve their references
  at `CREATE` time, so they cannot be applied in a container that lacks the dependency.
  The Content V3 job builds neither CF10 nor CF11; the CF04–CF11 rehearsal builds both.
  Put the migration where its dependencies exist.
- Prefer `LANGUAGE plpgsql` for helpers that call across subsystems. A plpgsql body
  resolves at call time, so the migration stops depending on the order earlier
  migrations happened to be applied in.

## What would actually fix this

A deployment step with database credentials, running the outstanding set in order on
merge to `main`. That needs a secret this repository does not have and a decision about
who is allowed to change production. Until then this runbook and its report are the
control: they make the gap countable instead of invisible.
