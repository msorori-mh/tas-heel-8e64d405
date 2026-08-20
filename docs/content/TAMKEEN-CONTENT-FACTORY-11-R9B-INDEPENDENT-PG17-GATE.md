# TAMKEEN Content Factory 11 — R9C Independent PG17 Gate

## Scope

Independent source and executable release gate for CF11 R9C. No migration was applied to
production and no production content was written by this gate.

## Pinned identity

- R9B source base: `05ccc375da25dfbddb0b4709cf4bcefb88ddf032`
- Validated branch head before this evidence-only update: `f28cf0bf71ae92d0fdec3b2b6656bdb7f1a1056e`
- CF11 migration SHA-256: `0d88ec8605c25dbf4aafa6bd4d080273ceac43a032bbbbfdf6d53d0436d03957`
- GitHub Actions run: `32355862673`
- Production writes: `0`

The historical R8B/R9B migration hash `311265f33580f2ce1cffbc56a974c0978e5d8bf7e2713141db637c975ac69691`
must not be applied; R9C changed the migration intentionally to pin durable asset storage identity.

## Independent gate result

The repository-owned Web CI completed successfully on GitHub-hosted runners:

- Content Factory persistent staging PG17: **PASS**
  - CF04→CF09 rehearsal: PASS
  - clean CF04→CF11 publication chain: PASS
  - CF11 postverify and rollback-isolated withdrawal proofs: PASS
- Content V3 disposable PG17 runtime: **PASS**
- TypeScript typecheck, unit/contract tests, PWA policy, and production build: **PASS**
- Iron seven-capability Chromium runtime and CSP evidence upload: **PASS**

During earlier fail-closed attempts the gate found and closed:

1. Fixture grant drift from the production 20C lifecycle hardening.
2. Missing `storageBucket`/`storagePath` in the immutable asset replay plan.
3. Test-only drift probes that were correctly blocked by live immutability triggers.
4. A lifecycle alias mismatch in the demotion probe.
5. A private-helper call from an authenticated-role probe.
6. Destructive withdrawal evidence persisting into canonical postverify.
7. CI referencing an obsolete CF11 R4 test filename.

## Decision

CF11 R9C is eligible for the production preflight/apply gate. Production apply must use the exact
current migration bytes and hash above, then run production postverify before any Iron package
import.

**FINAL_VERDICT = PASS_CF11_R9C_PRODUCTION_PREFLIGHT_GATE_READY**

## Addendum — CF11-R9 fixture execution-order blocker (23502 on `lessons.subject_id`)

Reported base: `78d382a896e88c165e97762d180e1c2c12be6556`. Source-only; no migration apply and no
production content writes.

- Root cause (as reported): the legacy lesson `43000000-...-099` was inserted before the Iron
  lesson `43000000-...-012` existed and derived `subject_id` from a subquery over that not-yet
  created row, yielding NULL.
- Current fixture state (`scripts/content-factory/pg17/content-factory-11-fixture.sql`): the Iron
  lesson is inserted first; the legacy lesson and its READY lifecycle row follow it and bind
  `subject_id` to the authoritative fixture subject literal `42000000-...-012`. No nullable
  pre-creation subquery remains for any lesson insert.
- New regression: `R9/1` in `tests/content-factory/content-factory-11-r8.static.test.mjs` asserts
  (a) no `INSERT INTO public.lessons` derives `subject_id` from a subquery, (b) the Iron block
  precedes the legacy insert, (c) the legacy lifecycle row follows its lesson, and (d) the legacy
  row carries the literal subject id.
- R8/R8B security behaviour, migration logic, and hashes are unchanged by this addendum.

FIXTURE_ORDER = FIXED (Iron before legacy, literal subject_id)
STATIC_TESTS = 103/103 PASS
PRODUCTION_WRITES = 0
PG17 = NOT PASS until the independent transaction rerun succeeds.
