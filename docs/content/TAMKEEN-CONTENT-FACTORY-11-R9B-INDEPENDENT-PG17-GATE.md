# TAMKEEN Content Factory 11 — R9B Independent PG17 Gate

## Scope

This commit exists to run the repository-owned `Web CI` gate against the exact CF11 R9B source state
`05ccc375da25dfbddb0b4709cf4bcefb88ddf032`.

No migration is applied to production by this commit and no production content is written.

## Required gate

The existing `content-factory-pg17` job must execute on an isolated PostgreSQL 17 instance and run:

- `scripts/content-factory/pg17/rehearse-content-factory-04.sh`
- `scripts/content-factory/pg17/rehearse-content-factory-11.sh`

The CF11 rehearsal covers the clean CF04→CF11 chain and its post-verification assertions.

## Decision rule

- CI success: source is eligible for the production CF11 preflight/apply gate.
- Any CI failure: fail closed; do not apply CF11 and do not import the Iron package.

## Pinned identity

- R9B source: `05ccc375da25dfbddb0b4709cf4bcefb88ddf032`
- CF11 migration SHA-256: `311265f33580f2ce1cffbc56a974c0978e5d8bf7e2713141db637c975ac69691`
- Production writes by this commit: `0`
