# TAMKEEN Content Factory 11 — R9C Independent PG17 Gate

## Scope

This commit exists to run the repository-owned `Web CI` gate against the CF11 R9B source plus the R9C executable-gate corrections
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

- R9B source base: `05ccc375da25dfbddb0b4709cf4bcefb88ddf032`
- R9C branch head: `0dbaa18ad6f3c2db42db7b896162f566733045f0`
- CF11 migration SHA-256: `0d88ec8605c25dbf4aafa6bd4d080273ceac43a032bbbbfdf6d53d0436d03957`
- Production writes by this commit: `0`


## R9C findings from the independent gate

The first clean PG17 run failed closed because the fixture did not replay production's existing
20C lifecycle-table grant hardening. The fixture now revokes raw lifecycle DML from
`authenticated` before CF11.

The second clean PG17 run exposed a real CF11 replay defect: the durable asset plan omitted
`storageBucket` and `storagePath`, while the replay validator correctly required the exact
storage path. CF11 now pins both fields in the immutable plan. The migration bytes therefore
changed intentionally; the current SHA-256 is
`0d88ec8605c25dbf4aafa6bd4d080273ceac43a032bbbbfdf6d53d0436d03957`.

Production remains untouched until the refreshed gate passes.
