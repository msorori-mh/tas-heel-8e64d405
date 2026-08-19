# TAMKEEN Content V3 + Iron — RC Integration 01

Date: 2026-08-19  
Integrated main SHA: `9c6b8722fcc7f18417093e2f23d45d9287102ed9`

## Decision

`PASS_RC_INTEGRATION_SOURCE_AND_RUNTIME`

This decision covers the integrated repository release candidate. It is not a production apply verdict and performs no production write.

## Integrated lineage

| Component | Evidence |
|---|---|
| Content V3 R4 metadata closure | `e207e9358e883dbc09b6a69386e387144af03c40` |
| Content V3 merged candidate | main lineage through `cb9084f73a736be71d0d69595106905552d6ffb4` |
| Iron R2 fidelity source | `95381fac60e05c42f1ac4554a8d596017c6f3e53` |
| Iron on R4 integration | `337ff92d3a35db2378ac32f596aa6b45b885d23e` |
| Iron UI runtime closure | PR #70, squash `9c6b8722fcc7f18417093e2f23d45d9287102ed9` |

## Release invariants

```text
MIGRATION=supabase/migrations-pending/20260818210000_content_v3_21h_hardened_preflight.sql
MIGRATION_SHA256=3D8CDD27A24EA9F0E998BA14E26ADCB87DD0FF6B62FCC3FBD9B790114DD631E3
MIGRATION_BYTES_CHANGED_BY_IRON=NO
PRODUCTION_APPLY=NO
IRON_LIFECYCLE_READY=NO
IRON_FULLY_READY=NO
ANSWER_COMPANION_CLIENT_LOADED=NO
LAB_CONNECT_SRC=none
```

## Integrated automated evidence

Web CI run [32220043578](https://github.com/msorori-mh/tas-heel-8e64d405/actions/runs/32220043578):

- Typecheck, repository tests, package tests, PWA policy, and build: PASS.
- Disposable PostgreSQL 17 fixture, exact migration, postverify, and runtime contract: PASS.
- Iron Chromium runtime: PASS.
- Viewports: 360×800, 390×844, 412×915, 1280×900.
- Capabilities: 7/7 in canonical order.
- Self-test: 40 questions; no initial answer key/rationale/model-answer leak.
- Official questions: 5 Iron-scoped question groups.
- Official content: table, equations, thermochemistry values, and furnace figure rendered.
- Mind map: zero JavaScript; 44px touch targets; no outer overflow.
- Lab: Fe2+ PASS; Fe3+ PASS; reset PASS; CSP PASS; external network requests = 0.
- Screenshot artifact: `iron-ui-runtime-evidence`, artifact ID `9353649965`.

## Production preflight reconciliation

The historical read-only baseline remains evidence of the production schema and identity gap, but its locked migration hash is historical and must not be used as the apply identity. The current apply identity is only:

`3D8CDD27A24EA9F0E998BA14E26ADCB87DD0FF6B62FCC3FBD9B790114DD631E3`

Before production apply, the operator must rerun the current read-only preflight and visibility diff against production. Stop on schema drift, PostgreSQL other than 17, unexpected visibility gain/loss, unsafe READY rows, or migration hash mismatch.

## Remaining production data prerequisites

The last production read-only inventory found:

- grade 12 identity exists;
- grade 12 chemistry subject does not exist;
- Iron lesson and unit do not exist;
- Sanaa/Aden chemistry textbooks and shared activity book do not exist;
- textbook source files are not stored in the repository;
- curriculum ownership remains pending production metadata.

These are production bootstrap inputs, not defects in the integrated source candidate. IDs, hashes, and storage objects must be measured or created by the production operator; they must not be invented in source.

## Gate status

| Gate | Verdict |
|---|---|
| RC source integration | PASS |
| Content V3 PG17 rehearsal | PASS |
| Iron browser UI/runtime | PASS |
| Initial answer secrecy | PASS |
| Independent source-intake comparison | HOLD — intake is not versioned/available to CI |
| Production read-only rerun | REQUIRED |
| Production apply | NOT_EXECUTED |
| Iron production binding | BLOCKED on exact production identities and three textbook files |

## Next exact order

1. Current production read-only preflight and visibility baseline.
2. Apply the exact Content V3 migration transaction.
3. Postverify and visibility comparison.
4. Bootstrap grade-12 chemistry identity chain using measured production IDs.
5. Upload and hash the three approved textbook files.
6. Bind the seven Iron capabilities in DRAFT/REVIEW.
7. Review, transition to READY, and run authenticated Student E2E.
8. Close the Quran structured-content production binding gap separately.

No production write is authorized by this report alone.
