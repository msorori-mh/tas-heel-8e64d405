# PR52 Migration Linter Correction 35

## Decision

PASS_WITH_NOTES. This correction is static-only: no SQL was executed and no database, Docker, migration apply, runtime edit, deployment, or publication was used.

## Before independent review / after correction

| Area | Before | After |
| --- | ---: | ---: |
| Decision source | commit `7583183e...` snapshot (88 rows) | current parser output only |
| Current parser false findings | 50 (8 index/column, 40 function/call, 2 trigger) | 0 |
| Timestamp-only downgrade | yes | no |
| Evidence artifact | prose claim | schema-validated JSON, SHA-256 linked in every empirical overlay |
| Graph edges | duplicates present (497 reported) | 831 unique; 473 duplicates removed during current construction |
| Graph self edges | present | 0 |
| Cycle calculation | placeholder | DFS cycles plus Tarjan SCCs; 0/0 on the current chain |
| Historical high security findings | 17 mixed together | 10 downstream resolved, 1 false positive, 6 active final-state review items |

## Evidence and calibration

The tool reads `MIGRATION-REPLAY-EMPIRICAL-EVIDENCE-29.json`; missing, malformed, or schema-invalid evidence fails the run. Its canonical SHA-256 is included in the inventory and calibration outputs. The prefix is taken from the artifact, not from a script constant. The decision flow is current parser output, semantic/external/lifecycle classification, evidence overlay, then final classification.

Successful replay can only yield `EMPIRICALLY_DISPROVEN_COMPILATION_BLOCKER` for a compilation rule. Security findings are kept in the separate final-state security ledger. Unknown project functions remain `STATIC_UNCERTAINTY`; external schemas are recognized without treating `public.*` as external.

The current repository parser output has 0 replay conflict candidates. The former 50 signals were parser-resolved: nested/default commas and expression indexes, multi-action `ADD COLUMN`, materialized-view indexes, type aliases/default arguments and overload signatures, built-in/operator calls, public qualification, and trigger-function identity. Evidence override remains behaviorally tested with a synthetic compilation finding, but is not needed to hide a current-chain finding.

## Dependency graph

The graph contains 50 migration nodes and 831 unique edges. It removed 473 duplicate edge attempts, emits no inter-migration self edge, records self references separately (0 current), and reports 0 cycles and 0 non-trivial SCCs after real algorithms. Comments, string literals, and dollar-quoted function bodies do not produce external DDL dependencies. Order and serialization are deterministic.

## Security final state

Seventeen historical High findings were observed. Ten are `DOWNSTREAM_RESOLVED`, the service-role-only AI log policy is `FALSE_POSITIVE` at informational final severity, and six remain High in final state:

| Object | Final policy access | Data sensitivity / exploitability | Classification |
| --- | --- | --- | --- |
| grades | SELECT, public, `USING (true)` | reference/catalog data; intent needs confirmation | `NEEDS_PRODUCT_REVIEW` |
| contact_submissions | INSERT, public/anonymous-capable, `WITH CHECK (true)` | user-supplied contact data; abuse/rate-limit decision is runtime/product-owned | `NEEDS_PRODUCT_REVIEW` |
| badges | SELECT, public, `USING (true)` | reference/achievement catalog | `INTENTIONAL_PUBLIC_REFERENCE_DATA` |
| curriculum_tracks | SELECT, authenticated, `USING (true)` | curriculum reference data | `INTENTIONAL_PUBLIC_REFERENCE_DATA` |
| governorates | SELECT, authenticated, `USING (true)` | geographic reference data | `INTENTIONAL_PUBLIC_REFERENCE_DATA` |
| governorate_curriculum_map | SELECT, authenticated, `USING (true)` | reference mapping data | `INTENTIONAL_PUBLIC_REFERENCE_DATA` |

These labels describe static evidence and do not change policies. Product owners should confirm the grades/contact intent and runtime protections. None is treated as a replay blocker.

The 17 Medium findings are final-state `RLS_TABLE_WITHOUT_SELECT_POLICY` review candidates. The former blanket `AUTH_UID_WITHOUT_EXPLICIT_FAIL_CLOSED` rule was removed: equality with `auth.uid()` is implicitly fail-closed under SQL NULL semantics, while expressions involving `OR`/`COALESCE` remain candidates only when equality/explicit guards do not close them. Static analysis cannot prove whether no-SELECT tables are intentionally write-only, internal, or RPC-only, so they remain review items rather than asserted vulnerabilities.

## Tests and limitations

The suite now has 21 behavioral tests. Added coverage includes missing/invalid/custom evidence, security survival versus compilation overlay, current-output calibration, graph uniqueness/self-edge/cycle/SCC behavior, comment/body/literal exclusion, nested defaults and parentheses, schema-qualified/composite indexes, built-ins versus unknown public functions, trigger identity, type normalization, ALTER FUNCTION lifecycle, policy drop, grant revoke, CRLF/LF equivalence, and deterministic reports.

Limitations remain: this is a conservative static parser, not PostgreSQL compilation; dynamic SQL and runtime-assembled identifiers remain uncertain; product intent and exploitability require runtime/product review. No migration or application behavior was changed.
