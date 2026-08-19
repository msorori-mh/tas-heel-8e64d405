# TAMKEEN — IRON PRODUCTION BINDING SOURCE BUNDLE 01

## Decision

`PASS_IRON_PRODUCTION_BINDING_SOURCE_CONTRACT`

This stage prepares identity and write contracts only. It performs no Supabase,
storage, curriculum, content, lifecycle, deploy, or production write.

## Baseline

- Source baseline: `bbe1c6d8367505f2ef68e3b68f787cb548d17f5e`
- Package: `content-packages/chemistry-g12-iron-v3`
- Production schema gate: **HOLD** pending Lovable owner-assisted R5 + 21H apply
- Package `production_apply`: **false**

## Resolved production identity

- Grade 12: `03780461-126a-4c63-bd1b-493098582dd9`
- Sanaa: `cbbe62a4-1e49-4805-9640-c23347b15619`
- Aden: `7751f472-ef61-4b50-b940-0521eac2baef`

The Grade-12 chemistry subject and iron lesson do not exist. Their UUIDs remain
`null`; later application resolves them by stable natural keys
`CHEM-G12` and `CHEM-G12-IRON-FE`. No UUID is invented.

## Binding invariants

- Lesson `unit_id = NULL`; no unit is fabricated.
- `semester` and `sort_order` stay null/PENDING until authoritative metadata.
- Lesson is free; no subscription/paywall binding.
- Exactly seven lifecycle capabilities are planned.
- Every lifecycle row begins `DRAFT`; no direct READY transition.
- Answers/rationales stay in the server-only revision-pinned layer.
- Read-before-write plus unique natural keys is mandatory.
- No deletion and no silent storage replacement on a hash conflict.

## Textbooks

The Sanaa and Aden main books share SHA-256
`59206662fee5c2e2610646d68ba8bf34afff75a667d089544751ec87178723bb`.
The plan uploads one private object and binds two track records to it.

The shared exercise book SHA-256 is
`6b6d31c3a726afc4089cae592ba6a14d538c7018e2253f5cf7444b72fcc8b4df`.

Storage object paths remain null until the storage preflight proves the bucket
contract and absence/hash of each target.

## Files

- `content-packages/chemistry-g12-iron-v3/production-binding-plan.json`
- `tests/content-packages/chemistry-g12-iron-production-binding.test.mjs`

## Exit gate

The next source stage may implement the idempotent importer and dry-run fixture.
Production remains blocked until Lovable Support confirms a restorable backup,
an owner role, and successful R5/21H post-verification.

```
FINAL_VERDICT=PASS_IRON_PRODUCTION_BINDING_SOURCE_CONTRACT
PRODUCTION_WRITES=0
PRODUCTION_APPLY=false
INITIAL_LIFECYCLE=DRAFT
IDENTITY_UUIDS_INVENTED=0
UNIT_INVENTED=0
PAYWALL=false
ANSWER_LEAK_TARGET=0
```
