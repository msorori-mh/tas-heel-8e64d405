# UNITS-POLICY-BASELINE-MIGRATION-RECONCILIATION-25

## Failure cause

After stacked fresh replay of PR #49 (`import_jobs` no-op) and PR #50 (Content Staff RBAC no-op), baseline replay stopped at:

| Field | Value |
| ----- | ----- |
| SQLSTATE | `42710` |
| Error | `policy "Units viewable per subject access" for table "units" already exists` |
| First creator | `supabase/migrations/20260731033950_a583b6d4-0360-414e-95f8-83b01f470a02.sql` |
| Conflicting migration | `supabase/migrations/20260731180000_restrict_units_select_to_authenticated.sql` |

Migration order is by filename timestamp. `20260731033950` creates the SELECT policy; `20260731180000` attempts the same `CREATE POLICY` name and aborts.

## File inventory

### Pre-repair

| Property | First (`…033950…`) | Second (`…180000…`) |
| -------- | ------------------ | ------------------- |
| Lines | 5 | 24 |
| SHA-256 | `1AB87ED0892E98E2F1CF3AAA9B2629D85BCD59B5948C3FD30B84071ABF6A5FDB` | `92D2D448384F166196B4F9F20F838ED807FEEF55DFBE5B17648FB1944FED3A13` |
| Introduced by | `1f3f1dd` — `Changes` (gpt-engineer-app[bot], 2026-07-31 03:39:56Z); applied-units sync referenced as `f5d714d` | `2f04932` — `Stabilize pre-import access and align import templates` (tarasana-mufadhala / PR #34, 2026-07-31 06:21:06+03) |

### Post-repair

| Property | First | Second |
| -------- | ----- | ------ |
| SHA-256 | unchanged `1AB87ED0892E98E2F1CF3AAA9B2629D85BCD59B5948C3FD30B84071ABF6A5FDB` | `8E50F0C5EA5DFA7B2592EA83A0AA4DD1E801ACB9C2198C5575824C333F6AC2CB` |
| Executable SQL | DROP legacy + CREATE subject-access SELECT | none |

## Semantic comparison matrix

| العنصر | Migration الأولى | Migration الثانية (pre-repair) | مطابق | أوسع | أضيق | فريد |
| ------ | ---------------- | ------------------------------ | ----- | ---- | ---- | ---- |
| DROP `"Units viewable by everyone"` ON `public.units` | yes | yes | yes | — | — | — |
| CREATE `"Units viewable per subject access"` | yes | yes | yes | — | — | — |
| Table | `public.units` | `public.units` | yes | — | — | — |
| Command | `FOR SELECT` | `FOR SELECT` | yes | — | — | — |
| Role | `TO authenticated` | `TO authenticated` | yes | — | — | — |
| USING | `public.can_access_subject(subject_id)` | `public.can_access_subject(subject_id)` | yes | — | — | — |
| WITH CHECK | none | none | yes | — | — | — |
| GRANT / REVOKE | none | none | yes | — | — | — |
| ALTER TABLE | none | none | yes | — | — | — |
| Functions / helpers defined | none | none | yes | — | — | — |
| Other non-units objects | none | none | yes | — | — | — |
| Documentation comments (PRE-IMPORT intent) | minimal | extensive | no | — | — | comments only |

Unique executable objects in second: **none**. Comments-only differences do not change authorization.

## Conflicting policy detail

| Check | First | Second (pre-repair) |
| ----- | ----- | ------------------- |
| Table | `public.units` | `public.units` |
| Command | SELECT | SELECT |
| Role | authenticated | authenticated |
| USING | `can_access_subject(subject_id)` | identical |
| WITH CHECK | — | — |
| Depends on authenticated | yes (`TO authenticated`) | yes |
| Depends on subject access | yes (`can_access_subject`) | yes |
| Grade / curriculum track | via `can_access_subject` (grade + track gates in current helper) | same gate |
| Subscription | not in current `can_access_subject` body (post free-access hardening) | same |
| `is_content_staff` | not in SELECT policy; staff use separate FOR ALL | same |
| Admin | via `can_access_subject` → `has_role(..., 'admin')` | same |

Name match alone is insufficient; object-by-object comparison of command/role/USING confirms full semantic identity.

Does the second intend to restrict an older policy? **Yes historically** — it targeted legacy `"Units viewable by everyone"` PUBLIC `USING (true)`. The first migration already performed that exact restriction earlier the same day (Lovable apply). The second should have DROPped the new name before recreate only if it were a true replacement; here recreate would be identical, so DROP+CREATE of the same final shape is unnecessary. Option A (no-op) is correct.

## Policy timeline on `public.units`

| Timestamp | Policy | Command | Role | USING / WITH CHECK | Drops prior? | Latest SELECT shape? |
| --------- | ------ | ------- | ---- | ------------------ | ------------ | -------------------- |
| `20260606004917` | Units viewable by everyone | SELECT | PUBLIC (no TO) | `USING (true)` | — | no (superseded) |
| `20260606004917` | Admins manage units | ALL | (default) | `has_role(..., 'admin')` | — | management superseded |
| `20260703121000` | Content staff manage units | ALL | authenticated | `is_content_staff(auth.uid())` | DROP Admins manage units | yes for manage |
| `20260731033950` | Units viewable per subject access | SELECT | authenticated | `can_access_subject(subject_id)` | DROP Units viewable by everyone | **yes — canonical SELECT** |
| `20260731180000` | (same CREATE, pre-repair) | SELECT | authenticated | identical | DROP legacy everyone again | duplicate — conflict |
| After `20260731180000` | — | — | — | — | no later units policy CREATE found on this branch | canonical remains first |

## Git history and security intent

```
1f3f1dd  Changes  (gpt-engineer-app[bot]) — first creator
2f04932  Stabilize pre-import access and align import templates — second file
```

Docs (`docs/PRE-IMPORT-STABILITY-AND-IMPORT-TEMPLATES-ALIGNMENT-01-REPORT.md`, `docs/PR34-MERGE-AND-LOVABLE-APPLY-PACKAGE.md`, `docs/CURSOR-INDEPENDENT-PRE-IMPORT-REVIEW-01.md`):

- Intent of the second file: close anon PUBLIC read of units; replace with authenticated + `can_access_subject`.
- Same docs note Lovable may already have applied the policy (`f5d714d` / parallel UUID migration).
- Second file was written source-only for PR #34 without knowledge that `20260731033950` already landed the identical DDL.

Security intent of the second file is therefore **already fully satisfied by the first**.

## Downstream dependencies (read paths)

Student/subject/unit UI and content gates rely on authenticated reads of `units` under `can_access_subject`. Content staff continue via `"Content staff manage units" FOR ALL`. No later migration replaces the SELECT policy name. Converting the second file to a no-op does not change the final RLS shape on fresh replay or on environments that already applied both (source edit does not re-run).

## Decision

**Option A** — second file is a full semantic duplicate of the first’s executable DDL; no unique additive objects; security intent already realized by the earlier creator.

### Reconciliation

| Item | Value |
| ---- | ----- |
| Strategy | Convert second file to documentation-only no-op |
| Canonical policy | `"Units viewable per subject access"` from `20260731033950_…sql` |
| Historical migration modified | `20260731180000_restrict_units_select_to_authenticated.sql` |
| Timestamp / filename preserved | yes |
| `CREATE POLICY IF NOT EXISTS` | **not used** |
| Authorization widened | **NO** |
| INSERT/UPDATE/DELETE policies | untouched |
| QB / PR #48 migrations | untouched |
| SQL executed / remote DB | none |

## Environment impact

| Environment | Effect |
| ----------- | ------ |
| Already applied both files | Source edit does not re-execute; live policy unchanged. No remote repair in this task. |
| Fresh replay | No SQLSTATE 42710; final shape = authenticated SELECT via `can_access_subject` + content-staff FOR ALL. |
| Applied first only | Final shape already correct; second no-op is a ledger no-op. |
| Applied neither | First migration establishes the intended hardening; second is a marker. |

## UNITS_POLICY_SECURITY_DECISION

**PASS**

| Role | Outcome |
| ---- | ------- |
| anon | no SELECT via this policy (`TO authenticated` only; legacy PUBLIC dropped) |
| authenticated | SELECT only where `can_access_subject(subject_id)` |
| content staff | retain `"Content staff manage units"` FOR ALL |
| admin | included in `can_access_subject` / `is_content_staff` |
| moderator / bare user role | not granted by these policies |

## Tests

`tests/migrations/units-policy-baseline-replay.test.mjs` (text-level; no SQL compilation claim):

1. No duplicate CREATE of the conflicting policy after repair.
2. Exactly one final CREATE by name.
3. USING/WITH CHECK match the security decision.
4. No anon/moderator/user widening.
5. No unjustified `USING (true)` on the final policy.
6. No `GRANT ALL TO authenticated`.
7. No DROP TABLE / TRUNCATE / DML in scoped files.
8. `import_jobs` repair remains no-op.
9. Content Staff RBAC repair remains no-op.
10. QB executable migration absent.
11. Filenames/timestamps preserved.
12. Runtime files out of package scope.

Companion update: `tests/security/units-select-authenticated-only.static.test.mjs` now asserts against the canonical creator and that the restrict file is a no-op (preserves PRE-IMPORT security coverage).

## Validation constraints honored

- No SQL executed.
- No Supabase local stack.
- No remote database connection.
- No QB executable migration introduced or modified.
- No merge of any PR.
- Stacked Draft PR only (after commit/push).

## Recommended next action

`UNITS-POLICY-RECONCILIATION-INDEPENDENT-REVIEW-26`
