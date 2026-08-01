# Migration Chain Conflict Census 28 — Empirical Calibration 29

Static analysis calibrated against the supplied successful Fresh replay evidence. No SQL or database was executed by this audit.

## Evidence boundary

- First successful migration: 20260606003616
- Last confirmed successful migration: 20260731120000
- Former first unresolved: 20260731180000, `Units viewable per subject access`, SQLSTATE `42710`
- Current final migration: 20260731180000_restrict_units_select_to_authenticated.sql

## Before calibration

- P0: 48
- P1: 40
- Missing dependencies: 38
- Unresolved: 88

## After parser improvement and empirical calibration

- Confirmed replay blockers: 0
- Resolved replay blockers: 3
- Empirically disproven compilation blockers retained for traceability: 0
- External Supabase schema dependency references: 45
- Static security findings: 34
- Static uncertainties: 0
- Parser limitations (dynamic SQL records): 0
- Post-prefix risks: 0
- Remaining conservative static candidates by old label: P0=0, P1=0, P2=0, P3=0

No P0/P1 candidate at or before the verified prefix is a current replay blocker. Original labels below are traceability fields, not the final decision.

| Finding | Original | Migration | Object | Prefix position | Empirical status | External status | Parser limitation | Security-only | Final classification | Confidence | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| - | - | None | - | - | - | - | - | - | - | - | - |

## Resolved blockers

- RESOLVED_IMPORT_JOBS_DUPLICATE: RESOLVED; 20260628190000_import_jobs_foundation.sql; present=true
- RESOLVED_CONTENT_STAFF_RBAC_DUPLICATE: RESOLVED; 20260703204450_5223b435-1a4d-44ab-ad03-ab3d9a8f4432.sql; present=true
- RESOLVED_UNITS_POLICY_DUPLICATE: RESOLVED; 20260731180000_restrict_units_select_to_authenticated.sql; present=true

## Security findings

- Critical: 0
- High: 17
- Medium: 17
- Low: 0
- Informational: 0

Security findings are review candidates and are not replay blockers.

## Actionable post-prefix replay risks

NO_STATIC_POST_PREFIX_REPLAY_BLOCKER_IDENTIFIED

## Linter limitations

- This is a conservative static linter, not a complete PostgreSQL parser.
- Dynamic SQL, psql meta-commands, conditional PL/pgSQL, and identifiers assembled at runtime are not resolved.
- Column and unique-key inference is best effort; inherited, generated, and expression semantics may need human review.
- Function calls in policy expressions are inferred lexically and built-in or extension functions may be excluded imperfectly.
- Security findings identify review candidates and do not prove exploitability.
