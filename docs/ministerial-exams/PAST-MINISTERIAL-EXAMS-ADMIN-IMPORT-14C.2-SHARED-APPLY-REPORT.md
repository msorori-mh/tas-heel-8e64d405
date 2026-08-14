# PAST_MINISTERIAL_EXAMS_ADMIN_IMPORT_14C.2 — SHARED APPLY REPORT

**Date (UTC):** 2026-08-14 21:17
**Authorization:** `PAST_MINISTERIAL_EXAMS_ADMIN_IMPORT_14C.2_SHARED_APPLY = AUTHORIZED`
**Verdict:** `PASS`

---

## 1. Migration identity

| Field | Value |
| --- | --- |
| Source (pending) | `supabase/migrations-pending/20260814030000_ministerial_admin_import_14c.sql` |
| Pre-apply SHA256 | `639d68251df5cf0899be6d56c8eaff23b2d4035d3c1c05c57f82761b1a641b26` |
| Applied file | `supabase/migrations/20260814211702_99c9fbbe-9aa9-4109-8908-5e28513ac14f.sql` |
| Applied SHA256 | `3130988400f3ae194db10fdfa6712c483e4c16328835afc3fbe1f89384140a96` |
| Text delta | Byte-identical except a single trailing newline (`diff` clean after `\n` normalization). No SQL edited during apply. |
| Lines | 1018 |
| Pending file | Removed after successful apply (now tracked under `supabase/migrations/`). |

---

## 2. Pre-apply state (shared DB)

| Table | Rows |
| --- | --- |
| `ministerial_exam_models` | 0 |
| `ministerial_exam_questions` | 0 |
| `exam_templates` | 0 |
| `exam_template_questions` | 0 |
| `exam_sessions` | 0 |
| `questions` | 0 |
| `question_revisions` | 0 |

Curriculum baseline: `subjects = 16`, `units = 0`, `lessons = 0`.

---

## 3. Post-apply verification

### A. IMPORT FOUNDATION
- `ministerial_m01_prepare(jsonb)` / `ministerial_m01_execute(uuid)` — present, `SECURITY DEFINER`. **M01 operational**
- `ministerial_m02_prepare(jsonb)` / `ministerial_m02_execute(uuid)` — present, `SECURITY DEFINER`. **M02 operational**
- `ministerial_import_prepares` staging table created (RLS enabled, actor-scoped SELECT policy, actor index).
- Admin read path `ministerial_models_admin_list()` present; client contract wired via `src/lib/ministerial/ministerial-import-contract.ts` and `src/lib/ministerial/ministerial-admin-api.ts`.
- Context-aware code generator `ministerial_build_model_code(text,text,integer,text,text)` present; rejects TCS-1 codes, invalid track / round / variant / year.

### B. RPC-ONLY WRITES
`pg_class.relacl` after apply (all three ministerial tables):

```
authenticated=rDxtm/postgres      -- SELECT + references/trigger only; NO a/w/d
service_role=arwdDxtm/postgres
anon: (absent)
```

- Direct `INSERT` / `UPDATE` / `DELETE` as `authenticated` = **DENY** (privilege revoked; no write policy exists either).
- All writes flow through the SECURITY DEFINER RPCs. **PASS**

### C. PERMISSIONS
- `content_manager` (via `is_content_staff`) may run M01/M02 prepare + execute → draft creation/import **ALLOW**.
- Publish path (`publish_ministerial_model`, `ministerial_model_set_status`, membership removal) gated by `can_publish_ministerial_exams()` = `qb_has_capability(_, 'PUBLISH_MINISTERIAL_MODEL')`, deliberately **not** `is_content_staff` → `content_manager` publish **DENY**.
- Capability enum extended with `PUBLISH_MINISTERIAL_MODEL` (constraint verified).
- Students / non-staff: no DML grant, no staff policy → **DENY**.
- `anon` EXECUTE on every new/modified sensitive function = **false** (verified via `has_function_privilege`). **ZERO**

### D. REVISION PINNING
- `ministerial_m02_prepare` stores `pinned_revision_id` = `questions.current_published_revision_id` per staged row.
- `ministerial_m02_execute` Pass 1 revalidates every actionable row before any write; on drift raises `MINISTERIAL_REVISION_CHANGED_REPREPARE` (`40001`) and aborts the whole transaction.
- Revision must still be `PUBLISHED`; model must still be `draft`.
- R3→R4 drift before Execute = **FAIL CLOSED / REPREPARE**. No silent upgrade path exists.

### E. M02 SAFETY
- Published questions only (`QUESTION_NOT_PUBLISHED` block).
- `question.subject_id = model.subject_id` plus `question_targets.subject_id` parity (`TARGET_SUBJECT_MISMATCH`).
- Writes are additive: `ON CONFLICT (model_id, question_id) DO UPDATE` — replay produces no duplicates.
- Omission of a row from a new file performs no delete; removal is only possible through the explicit, capability-gated, reason-required `ministerial_membership_remove_execute`.
- Forbidden answer-bearing columns rejected up front (`M02_FORBIDDEN_COLUMN`).

### F. PUBLISH GATE (`can_publish_ministerial_model`)
Verified in SQL: model is draft → active `subject_curriculum_tracks` assignment → template exists, `mode = 'ministry'`, active, subject match → membership and template question sets non-empty, equal in count and identical in membership → every membership row pinned to the question's live `PUBLISHED` revision with matching target subject. Capability enforced server-side inside `publish_ministerial_model`.

### G. SECURITY
- **ANSWER_LEAK = ZERO** — no answer/solution column is read or written by any ministerial RPC; M02 rejects them at input.
- Student direct membership read = **DENY** (`ministerial_exam_questions` SELECT policy is staff-only).
- PUBLIC / `anon` sensitive EXECUTE = **ZERO** (`REVOKE ALL ... FROM PUBLIC, anon` on all 12 functions; re-verified).
- `SECURITY DEFINER search_path` fixed = `public, pg_temp` on all definer functions (`ministerial_build_model_code` is `IMMUTABLE` / non-definer by design).
- Post-apply linter: 143 findings, all pre-existing project-wide warnings; none attributable to the 14C.2 objects (all new definer functions carry a fixed `search_path` and no `anon` EXECUTE).

### H. DATA
| Check | Result |
| --- | --- |
| Real ministerial models inserted | **0** |
| Real ministerial memberships inserted | **0** |
| `exam_templates` / `exam_template_questions` / `exam_sessions` | 0 / 0 / 0 (unchanged) |
| Curriculum content (`subjects` 16, `units` 0, `lessons` 0) | **unchanged** |

### I. REGRESSION

| Suite | Result |
| --- | --- |
| vitest (14C / 14B / student / security / TCS-2 / shared-subject guards) | **88 / 88 PASS** |
| `test:question-bank-import` | **438 / 438 PASS** |
| `test:question-bank-source` | **37 / 37 PASS** |
| `test:import-contract` | 59 / 60 — 1 known failure |
| `tsgo --noEmit` | **clean** |

**Known failure (out of scope):** `import-staging-execution-03 › resource metadata allowlist in SQL matches the contract allowlist` — expects `is_primary` in the metadata allowlist, which is introduced by the still-pending `20260815010000_lesson_external_pdf_delivery_13f.sql` (13F). Unrelated to 14C.2; pre-existing before this apply.

---

## 4. Verdict

`PAST_MINISTERIAL_EXAMS_ADMIN_IMPORT_14C.2_SHARED_APPLY = PASS`

Ministerial import foundation is live on the shared datastore with RPC-only writes, exact revision pinning, and a separated publish capability. No ministerial or curriculum data was created or modified.
