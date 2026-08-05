# Content Onboarding HTML Backend Design Correction 15 Report

**Document ID:** `CONTENT-ONBOARDING-HTML-BACKEND-DESIGN-CORRECTION-15-REPORT`  
**Repository:** `msorori-mh/tas-heel-8e64d405`  
**Branch:** `docs/content-onboarding-html-operational-backend-design-03`  
**Starting HEAD:** `ae39b8e27d96e116f647965e9c118317eee5f73c`  
**Status:** COMPLETE (Docs, Contracts, and Design Tests Only)

---

## Executive Summary

Task `CONTENT-ONBOARDING-HTML-BACKEND-DESIGN-CORRECTION-15` resolves the final design blockers in the Storage Saga state machine, trigger semantics, retry identity contracts, composite foreign key validation scoping, machine-readable transition matrix, leakage scanner test vectors, and contract test suite verification.

---

## 1. Storage Saga Transition Matrix & Compensation Executability

### 1.1 `failed` Status Classification
- `failed` is classified strictly as a **restricted, non-terminal state** (`failure-awaiting-compensation`).
- It represents an operation that encountered an error during execution and is awaiting compensation or reconciliation.
- **Terminal States**: Real terminal states are strictly `cleaned` and `compensated`.
- **Legal Transition**: The single legal status transition out of `failed` is `failed` → `compensated`.

### 1.2 Pseudo-SQL Trigger Architecture & Guard Order
The pseudo-SQL trigger function `fn_enforce_storage_operation_transition()` on `public.storage_operations` was updated to remove pre-guards that blocked `UPDATE` on `failed` prior to `CASE OLD.status` evaluation.

**Strict Trigger Execution Order:**
1. **Reject DELETE**: `IF TG_OP = 'DELETE' THEN RAISE EXCEPTION ...`
2. **Immutable Identity Check**: Rejects updates to `id`, `parent_operation_id`, `retry_number`, `batch_id`, `resource_version_id`, `operation_type`, `source_path`, `target_path`, `expected_hash`, `idempotency_key`, and `created_at`.
3. **Attempt Counter Check**: Prohibits `NEW.attempt_count < OLD.attempt_count`.
4. **Transition Matrix Enforcement (`CASE OLD.status`)**:
   - `pending` → `['uploaded', 'failed']`
   - `uploaded` → `['verified', 'failed']`
   - `verified` → `['promoted', 'failed']`
   - `promoted` → `['cleanup_pending', 'failed']`
   - `cleanup_pending` → `['cleaned', 'failed']`
   - `failed` → `['compensated']` (`IF NEW.status <> 'compensated' THEN RAISE EXCEPTION ...`)
   - `cleaned` → `[]` (`RAISE EXCEPTION STORAGE_OPERATION_TERMINAL_IMMUTABLE`)
   - `compensated` → `[]` (`RAISE EXCEPTION STORAGE_OPERATION_TERMINAL_IMMUTABLE`)
   - `ELSE` → `RAISE EXCEPTION INVALID_STORAGE_TRANSITION`
5. **Completion Timestamp**: `completed_at` is populated ONLY upon transitioning to terminal states (`cleaned`, `compensated`).

---

## 2. Machine-Readable Transition Matrix

Created single authoritative machine-readable source:
`docs/CONTENT-ONBOARDING-HTML-STORAGE-TRANSITIONS-03.json`

```json
{
  "system": "tas-heel-html-content-onboarding",
  "version": "0.3",
  "document_id": "CONTENT-ONBOARDING-HTML-STORAGE-TRANSITIONS-03",
  "description": "Machine-readable Storage Saga State Transition Matrix for HTML interactive content onboarding",
  "transitions": {
    "pending": ["uploaded", "failed"],
    "uploaded": ["verified", "failed"],
    "verified": ["promoted", "failed"],
    "promoted": ["cleanup_pending", "failed"],
    "cleanup_pending": ["cleaned", "failed"],
    "failed": ["compensated"],
    "cleaned": [],
    "compensated": []
  },
  "terminal_states": ["cleaned", "compensated"],
  "failure_awaiting_compensation_states": ["failed"]
}
```

All design documents (`DATA-MODEL-03`, `STORAGE-CONTRACT-03`, `OPERATIONAL-BACKEND-DESIGN-03`, `MIGRATION-PROPOSAL-03`) and contract tests are 100% aligned with this machine-readable matrix.

---

## 3. Immutable Retry Identity & Row Contract

To prevent state corruption during Saga retries:
1. **Immutable Retry Identity Fields**: `parent_operation_id` and `retry_number` are added to the immutable identity check within `fn_enforce_storage_operation_transition()`. Once inserted, `parent_operation_id` cannot be modified, and `retry_number` cannot be modified or decreased.
2. **New-Row Retry Rule**: Initiating a retry after an operation enters `failed` creates a **new row** in `storage_operations`. The previous failed row is not modified (except transitioning to `compensated` when compensation executes).
3. **Parent & Retry Counters**:
   - `parent_operation_id` points to previous failed operation record.
   - `retry_number = previous.retry_number + 1`.
4. **Table Constraints**:
   - `CHECK (retry_number >= 0)`
   - `CONSTRAINT check_storage_operation_retry_identity CHECK ((parent_operation_id IS NULL AND retry_number = 0) OR (parent_operation_id IS NOT NULL AND retry_number > 0))`

---

## 4. Constraint Block Scoping & Development Teardown

1. **Composite Foreign Key Scoping**:
   - `fk_lesson_resources_current_draft_same_resource`
   - `fk_lesson_resources_approved_same_resource`
   - `fk_lesson_resources_published_same_resource`
   - Each constraint block is defined with `ADD CONSTRAINT <name> ... NOT VALID` within its own block.
   - Each constraint is individually validated via `ALTER TABLE public.lesson_resources VALIDATE CONSTRAINT <name>;`.
2. **Development Teardown**:
   - Explicitly references all 4 canonical constraint names (`uq_resource_version_id_resource`, `fk_lesson_resources_current_draft_same_resource`, `fk_lesson_resources_approved_same_resource`, `fk_lesson_resources_published_same_resource`).
   - Production rollback drops zero tables and zero audit records (`DROP TABLE` and `CASCADE` prohibited).

---

## 5. Leakage Security Vectors ACCEPT Semantics

Metadata and structural compliance for `ACCEPT` test vectors in `docs/CONTENT-ONBOARDING-HTML-LEAKAGE-VECTORS-03.json`:

1. `lesson_summary` vector (`VEC-POS-001`):
   - `file_type`: `"lesson_summary"`
   - `location`: `"package_allowed_content"`
   - `no_answer_mapping`: `true`
   - `classification`: `"ACCEPT"`
   - Payload verified free of all forbidden answer and explanation fields (`correct_index`, `correct_answer`, `answer_key`, `hashed_answer`, `explanation`, `answer_explanation`, `correct_explanation`, `solution_key`).

2. `post_reveal_server_response` vector (`VEC-POS-002`):
   - `file_type`: `"post_reveal_server_response"`
   - `location`: `"outside_package"`
   - `reveal_required`: `true`
   - `classification`: `"ACCEPT"`
   - Confirms post-reveal educational explanations are served strictly via Server/Application endpoints outside the HTML content package.

---

## 6. Semantic Contract Tests Verification Results

Executed `node --test tests/question-bank/content-onboarding-html-backend-design-contract.test.mjs`:

- **Enum Parsing**: Extracted `storage_operation_status` enum (8 legal states).
- **Trigger Parsing**: Extracted `CASE OLD.status` from trigger function body using SQL AST / arm parser.
- **Matrix Comparison**: Built actual transition map and compared literally (deepEqual) with `STORAGE-TRANSITIONS-03.json`.
- **Reachability**: Verified `failed` → `compensated` is reachable.
- **Disallowed Transitions**: Rejection verified for `failed` → `cleaned`, `failed` → `uploaded`, and `failed` → `failed`.
- **Terminal Updates**: Verified `cleaned` and `compensated` reject all `UPDATE` attempts.
- **Guard Ordering**: Confirmed no pre-guards block `failed` before `CASE OLD.status`.
- **FK Scoping**: Proved `NOT VALID` and `VALIDATE CONSTRAINT` scoping per block.
- **Leakage Vectors**: Verified all 5 REJECT vectors and 2 ACCEPT vectors with explicit metadata checks.
- **Test Suite Results**: 23/23 tests passed cleanly (0 failed, 0 skipped).

---

## 7. Verification Commands Summary

| Verification Step | Command | Result |
| :--- | :--- | :--- |
| **Package Verification** | `npm ci` | SUCCESS |
| **Design Contract Test** | `node --test tests/question-bank/content-onboarding-html-backend-design-contract.test.mjs` | PASS (23/23) |
| **Full Test Suite** | `npm test` | PASS |
| **Typecheck** | `npx --no-install tsc --noEmit` | PASS (0 errors) |
| **Git Diff Check** | `git diff --check` | PASS (Clean) |
| **Working Tree** | `git status --short` | Clean |

---

## 8. Compliance & Boundary Guarantees

- `src/` modified: **NO**
- `supabase/migrations/` modified: **NO**
- SQL executed: **NO**
- Database: **ZERO**
- Migration applied: **ZERO**
- Deploy: **NO**
- Merge / PR: **NO**
