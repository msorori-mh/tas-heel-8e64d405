# Stacked Migration Reconciliation Static Review 32

## Decision

**PASS_WITH_NOTES** for the static-only scope at `22be3505697403ca4c418271d3f3f0250aac8f14`.

This review did not execute SQL, start Docker or Supabase, connect to a database, deploy, publish, merge, or modify migrations/runtime/QB files. The empirical premise is supplied evidence: Fresh replay passed migrations `20260606003616` through `20260731120000`, then formerly stopped at `20260731180000_restrict_units_select_to_authenticated.sql` with policy `Units viewable per subject access`, SQLSTATE `42710`. That final duplicate is now resolved.

## Scope and stack

| PR | Branch | Base | Commit | Static result |
| --- | --- | --- | --- | --- |
| #49 | `fix/import-jobs-baseline-replay-19` | `main` | `552157be5ac0441cd9be31ffd48b048bd3462d7b` | Safe comments-only no-op of the later duplicate |
| #50 | `fix/content-staff-rbac-baseline-replay-22` | PR #49 branch | `bf87d20829eab6e9d8249d44c6b7907018e6eb96` | Safe comments-only no-op of the later duplicate |
| #51 | `fix/units-policy-baseline-replay-25` | PR #50 branch | `22be3505697403ca4c418271d3f3f0250aac8f14` | Safe comments-only no-op of the later duplicate |

All three historical filenames and timestamps remain present. No third executable copy was found by repository-wide `git log -S` and static CREATE searches. The later Content Staff file was introduced by `gpt-engineer-app[bot]` with commit subject `Changes`, consistent with a Lovable/gpt-engineer compacted synchronization. The canonical import file was likewise introduced by that bot after the foundation migration already existed; the later units duplicate originated in the hand-authored pre-import stabilization commit.

## Empirical calibration

Before calibration:

- P0: 48
- P1: 40
- Missing dependencies: 38
- Unresolved: 88

The complete per-finding record is in `MIGRATION-CHAIN-INVENTORY-28.json` under `calibratedFindings`. Every record includes migration, object, original classification, verified-prefix position, empirical status, external-schema status, parser-limitation flag, security-only status, final classification, confidence, evidence, and the source finding.

After calibration:

- Confirmed replay blockers: 0
- Resolved replay blockers: 3
- Empirically disproven blockers: 88 original static findings
- External Supabase schema references: 64 reference records
- Static security findings: 166
- Static uncertainties: 0 unresolved top-level DDL findings
- Post-prefix risks: 0

The improved parser independently reduces the conservative conflict candidate set from 88 to 50 and missing dependencies from 38 to 0. The 38 removed records were external-schema/table-dependency false positives. Remaining pre-prefix candidates are retained as diagnostics but cannot be P0/P1 replay blockers because the supplied replay actually passed their migrations. This is evidence precedence, not proof that their SQL is semantically ideal.

False replay-blocker attribution census (mutually exclusive primary cause):

| Cause | Count | Calibration result |
| --- | ---: | --- |
| Table parsing | 0 | Multiline table coverage added; no distinct residual original record assigned here |
| Column tracking | 8 | Index-column candidates passed replay; ALTER add/rename state is now tracked |
| External schemas | 38 | 35 policy-table plus 3 FK-target records are Supabase platform dependencies |
| Dollar quotes | 0 | Bodies are isolated; no original finding was assigned to body leakage |
| Function identity | 40 | Lexical policy-call inference; all migrations passed replay |
| Policy lifecycle | 0 | Table+policy identity and DROP/CREATE lifecycle are tracked |
| Other | 2 | Trigger-function identity candidates passed replay |
| **Total** | **88** | No original item remains a replay blocker |

Supabase-owned schemas `auth`, `storage`, `realtime`, `extensions`, `vault`, `cron`, `net`, `graphql`, `graphql_public`, and `supabase_functions` are external dependencies. Their objects (including `auth.users`, `storage.objects`, and `storage.buckets`) are not project-migration “missing relations.”

## Parser changes and remaining limitations

The linter now handles multiline `CREATE TABLE`, `ALTER TABLE ADD COLUMN`, column/table rename state, indexes created after added/renamed columns, schema-qualified and quoted identifiers, dollar-quoted bodies, function signatures/overloads, policy identity by table plus name, DROP/CREATE lifecycle, external Supabase schemas, and CRLF/LF normalization. DDL-shaped strings inside a function body are not emitted as top-level DDL. Dynamic SQL is recorded as a parser limitation rather than resolved as executable object identity.

Remaining limitations:

- This is not a PostgreSQL grammar or execution engine.
- Conditional PL/pgSQL, runtime identifier construction, psql meta-commands, generated/inherited columns, expression-index semantics, and runtime search paths can require human review.
- Function-call discovery inside policy expressions remains lexical and can identify SQL keywords/built-ins as low-confidence candidates.
- Static security signals identify review surfaces; they do not establish exploitability or effective privilege after all grants and policies compose.

## Repair 1 — `import_jobs`

Canonical: `20260628171431_298a038b-a740-482a-9530-10cb6cb377e0.sql`

No-op: `20260628190000_import_jobs_foundation.sql`

- Pre-repair copies each contained 2 CREATE TABLE, 2 CREATE POLICY, 7 CREATE INDEX, 1 CREATE TRIGGER, and 4 GRANT statements. Differences were formatting/comments rather than a unique executable object.
- Current repository-wide scan finds executable `CREATE TABLE public.import_jobs` exactly once, in the canonical file. `import_errors` also remains once.
- The no-op contains comments only; no CREATE, DROP, ALTER, TRUNCATE, or DML remains.
- Required columns, constraints, indexes, RLS, policies, trigger, and grants remain in the canonical file; its pinned SHA test protects the full bytes.
- No later migration depends on a second execution as a distinct schema event. A database that applied only the first receives no change; a database that historically recorded/applied both also receives no new change. The no-op is therefore safe for both histories, subject to the usual fact that static review cannot reconstruct remote database drift.
- History: foundation/duplicate originated in `43a154b...`; the canonical Lovable UUID file was introduced by `f0d60cf...`; repair is `552157be...`. No third current executable creator exists.

Decision: complete duplicate, no unique object lost, timestamp preserved, authorization not widened.

## Repair 2 — Content Staff RBAC

Canonical: `20260703121000_content_manager_rbac_policies.sql`

No-op: `20260703204450_5223b435-1a4d-44ab-ad03-ab3d9a8f4432.sql`

- Both pre-repair copies contained 25 CREATE POLICY, 3 CREATE FUNCTION, 3 GRANT, and 6 REVOKE statements.
- Canonical file preserves all 25 policies (23 management policies plus 2 authenticated active-template read policies), all 3 functions, and the grant/revoke sequence.
- The no-op is comments only. It cannot create a policy/function or expand privileges.
- Management predicates continue to use `is_content_staff(auth.uid())`; moderator and generic user are not added to the helper. No Content Staff management policy uses `USING (true)`.
- The two active-template read policies are intentionally dropped/recreated by the canonical file and are not recreated by the no-op.
- History: canonical created by Mokhtar Alsarori in `eb0392e...`; duplicate created by `gpt-engineer-app[bot]` in `5fd1a9c...` (`Changes`), consistent with a compacted sync; repair is `bf87d20...`. No third current executable 25-policy package exists.
- Environments that applied only the canonical package retain it unchanged. Environments that recorded/applied both retain the already-effective final objects; the no-op introduces no new divergence.

Decision: no security delta or unique object loss; no authorization widening; timestamp preserved.

## Repair 3 — units SELECT policy

Canonical: `20260731033950_a583b6d4-0360-414e-95f8-83b01f470a02.sql`

No-op: `20260731180000_restrict_units_select_to_authenticated.sql`

- Exactly one executable final policy named `Units viewable per subject access` remains.
- It is `FOR SELECT TO authenticated` with `USING (public.can_access_subject(subject_id))`.
- The legacy `Units viewable by everyone` policy is dropped. The final policy contains no anon/public role, moderator condition, or `USING (true)`.
- `Content staff manage units` remains present and neither scoped units file drops it.
- The later file is comments only, retaining the timestamp and documenting both pre-repair and canonical hashes.
- History: canonical created by `gpt-engineer-app[bot]` in `1f3f1dd...`; duplicate created in `2f04932...`; repair is `22be350...`. No third current executable policy creator exists.
- The former replay stop is therefore resolved without changing final authorization semantics. Environments that applied only the first already have the desired policy; environments that recorded both keep their existing final policy and receive no further mutation.

Decision: no anon access, no true predicate, Content Staff management preserved, no authorization widening.

## Existing test review

### `import-jobs-baseline-replay.test.mjs`

Proves filename/timestamp presence, pinned canonical bytes, one textual creator for both tables, required token presence, comments-only later file, and absence of selected destructive/workaround patterns. It does not compile SQL, prove that every named column token is structurally a column, evaluate constraints, or prove effective grants/RLS. Its line-comment stripper is CRLF-tolerant for `split("\n")` because the remaining `\r` is whitespace, but it does not remove block comments or understand quoted strings/dollar bodies. Invalid SQL retaining the expected regex tokens could pass.

### `content-staff-rbac-baseline-replay.test.mjs`

Proves the pinned canonical bytes, expected named-policy CREATE counts, helper text, selected predicates, comments-only no-op, and selected negative permission patterns. It does not parse 25 policy ASTs, validate function bodies, compile grants/revokes, or prove end-to-end role behavior. Regex blocks are sensitive to statement layout and sentinel comments; SQL could be syntactically invalid while matching. CRLF is not materially harmful to current expressions but the comment stripper is lexical only.

### `units-policy-baseline-replay.test.mjs`

Proves pinned canonical bytes, a single named CREATE, exact desired policy text, comments-only no-op, selected negative patterns, and Content Staff policy retention. It does not compile the predicate, verify that `can_access_subject` exists with the intended overload/effective permissions, or test RLS behavior. Exact whitespace regex is intentionally strict but brittle; malformed surrounding SQL could still pass.

### `units-select-authenticated-only.static.test.mjs`

Proves the expected canonical text, legacy drop, no executable later policy, no obvious later PUBLIC/anon SELECT reopening, and no selected cross-domain tokens in the canonical file. Negative-lookahead regex can miss equivalent SQL forms and does not model policy composition. It cannot establish effective access or SQL validity.

Recommendation only (outside PR #52 scope): eventually supplement these static guards with parser-backed structural assertions and an authorized database replay/integration suite. Keep byte/hash guards where immutable canonical content is intentional, but normalize CRLF explicitly and use the same comment/string-aware tokenizer for executable-SQL checks.

## Static security review

Automated signal counts:

- Critical: 0
- High: 17
- Medium: 149
- Low: 0
- Informational: 0

High consists of 13 permissive `USING/WITH CHECK (true)` candidates and 4 `SECURITY DEFINER` functions without a statically visible `search_path`. Medium consists of 145 `auth.uid()` predicates without the linter's explicit fail-closed idiom and 4 RLS-enabled tables without a statically visible SELECT/ALL policy. These are security review findings, never replay blockers.

Review conclusions:

- `SECURITY DEFINER`: four functions require human review of ownership, qualification, and callable roles; absence of a parsed `search_path` is high-priority static evidence, not an exploit finding.
- anon EXECUTE/authenticated grants: broad client-role grant candidates must be assessed with function body and RLS composition. The three reconciliation no-ops add none.
- `USING(true)` / `WITH CHECK(true)`: 13 high signals may be intentional public-read/service workflows or excessive. They need policy-by-policy authorization review; none blocks replay.
- Content Staff/admin/moderator/student: repaired RBAC preserves admin/content_manager intent and does not add moderator/user. Broader chain behavior remains compositional and is not proven by regex.
- Correct answers/exam answers: static scan does not prove absence of exposure through views/functions/policy composition. Treat as a focused future security review, not a replay failure.
- Unit access: the final units SELECT policy is authenticated and subject-scoped; legacy public access is dropped. Runtime behavior of `can_access_subject` and grants remains outside static proof.

No automatic security fix is proposed or applied in this task.

## Git-history and compatibility conclusion

The stack is linear: PR #50 is based on PR #49, PR #51 is based on PR #50, and PR #52 is based on PR #51. Each repair changes only the later duplicate into a timestamp-preserving documentation marker. There is no static evidence of a migration that needs the second execution to create a unique object. Because a comments-only migration is a valid “already reconciled” history marker, it is safe both for fresh environments and for environments whose migration ledger already contains either historical filename. This statement does not claim repair of pre-existing remote drift.

## Actionable post-prefix queue

`ACTIONABLE_POST_PREFIX_REPLAY_RISKS`: **0**.

The final chain migration is `20260731180000_restrict_units_select_to_authenticated.sql`, which is now a comments-only resolved marker. No migration exists after it on the reviewed HEAD.

`NO_STATIC_POST_PREFIX_REPLAY_BLOCKER_IDENTIFIED`

Do not classify subscription/storage candidates before the verified prefix as replay blockers: the supplied Fresh replay passed them. External storage/auth objects are platform dependencies.

## Final static decision

- Unique objects lost: no static evidence
- Authorization widened by repairs: no
- Historical timestamps preserved: yes
- Migration/runtime/QB changes in PR #52 calibration: none
- Parser deterministic: verified by byte-identical report hashes across two runs
- Decision: **PASS_WITH_NOTES** because SQL compilation/runtime authorization and remote drift are deliberately outside scope

Recommended next action: **PR52_INDEPENDENT_REVIEW**.
