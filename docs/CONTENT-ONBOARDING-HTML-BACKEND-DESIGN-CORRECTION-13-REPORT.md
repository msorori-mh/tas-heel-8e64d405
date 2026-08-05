# CONTENT_ONBOARDING_HTML_BACKEND_DESIGN_CORRECTION_13 REPORT

**Document ID:** `CONTENT-ONBOARDING-HTML-BACKEND-DESIGN-CORRECTION-13-REPORT`  
**Repository:** `msorori-mh/tas-heel-8e64d405`  
**Branch:** `docs/content-onboarding-html-operational-backend-design-03`  
**Starting HEAD:** `343f14401c9d990dd7f41711e090168178ba66bd`  
**Decision:** **PASS**

---

## 1. Storage Operations State Machine Unification (`storage_operations`)

### Enum Definition
The status enum `storage_operation_status` contains strictly the 8 legal states:
1. `pending`
2. `uploaded`
3. `verified`
4. `promoted`
5. `cleanup_pending`
6. `cleaned`
7. `failed`
8. `compensated`

> **Prohibition of `completed`**: The state `completed` is completely removed from `storage_operation_status` as it is not part of the legal saga enum.

### Terminal States
The only legal terminal states are:
- `cleaned`
- `failed`
- `compensated`

State `promoted` is **NOT** a terminal state. Its only legal non-failed state transition is `promoted → cleanup_pending`.

---

## 2. Explicit Transition Matrix

```
             +------------+
             |  pending   |
             +------------+
               /        \
              /          \
             v            v
      +------------+   +------------+
      |  uploaded  |   |   failed   | <-------------------------------+
      +------------+   +------------+                                 |
        /        \       | (retry creates new row with parent_id)    |
       /          \      v                                            |
      v            v   +------------+                                 |
+------------+     |   | compensated| (terminal)                      |
|  verified  |     |   +------------+                                 |
+------------+     |                                                  |
  /        \       |                                                  |
 /          \      |                                                  |
v            v     |                                                  |
+------------+     |                                                  |
|  promoted  | ----+--------------------------------------------------+
+------------+     |
      |            |
      v            |
+------------------+
| cleanup_pending  |
+------------------+
  /        \
 /          \
v            v
+------------+   +------------+
|  cleaned   |   |   failed   |
+------------+   +------------+
 (terminal)       (terminal)
```

| Source Status | Allowed Target Statuses | Transition Purpose |
| :--- | :--- | :--- |
| `pending` | `uploaded`, `failed` | Staging file upload completed or failed |
| `uploaded` | `verified`, `failed` | SHA-256 hash & manifest verification passed or failed |
| `verified` | `promoted`, `failed` | Files copied to published storage bucket or failed |
| `promoted` | `cleanup_pending`, `failed` | Staging artifacts marked for background cleanup or failed |
| `cleanup_pending` | `cleaned`, `failed` | Cleanup job confirmed artifact removal or failed |
| `failed` | `compensated` | Saga compensation executed (reverting allocations) |
| `cleaned` | *None* | Terminal state |
| `compensated` | *None* | Terminal state |

---

## 3. Trigger Enforcement (`fn_enforce_storage_operation_transition`)

The PL/pgSQL function `fn_enforce_storage_operation_transition()` is bound to `storage_operations` (`BEFORE UPDATE OR DELETE`):

1. **Delete Prohibition**: `IF TG_OP = 'DELETE'` raises exception `STORAGE_OPERATION_DELETE_DENIED`.
2. **Terminal State Protection**: Updates on `OLD.status IN ('cleaned', 'failed', 'compensated')` raise exception `STORAGE_OPERATION_TERMINAL_IMMUTABLE`.
3. **Identity Field Immutability**: Prohibits updates to `id`, `batch_id`, `resource_version_id`, `operation_type`, `source_path`, `target_path`, `expected_hash`, `idempotency_key`, `created_at`.
4. **Non-decreasing `attempt_count`**: Rejects updates where `NEW.attempt_count < OLD.attempt_count`.
5. **Transition Matrix Compliance**: Validates `NEW.status` against `OLD.status` using explicit `CASE` block matching the transition matrix.
6. **Completion Timestamp**: Automatically sets `NEW.completed_at = now()` when transitioning to terminal states (`cleaned`, `failed`, `compensated`).

---

## 4. Storage Operation History & Retry Model

- **Immutable History**: Retries after a `failed` state do NOT modify the existing `failed` row.
- **Parent Reference**: A new `storage_operations` row is created with `parent_operation_id` pointing to the previous failed operation.
- **Monotonic Increment**: `retry_number` increments (`parent.retry_number + 1`).
- **Idempotency**: A new unique `idempotency_key` is assigned to each retry attempt.
- **Evidence Fields**:
  - `failed_evidence`: Diagnostic stack traces and error metadata.
  - `compensation_evidence`: Reversion steps and storage deletion logs.
  - `cleanup_verification`: Verified cleanup metadata for orphaned artifacts.

---

## 5. Canonical Constraints & Teardown Consistency

### The 4 Canonical Constraint Names
1. `uq_resource_version_id_resource`
2. `fk_lesson_resources_current_draft_same_resource`
3. `fk_lesson_resources_approved_same_resource`
4. `fk_lesson_resources_published_same_resource`

### Alignment Rules
- **DDL Creation**: All 4 canonical constraint names are declared explicitly in table definitions.
- **Validation**: Foreign key constraints are created `NOT VALID` and validated via `VALIDATE CONSTRAINT`.
- **Development Teardown**: Teardown scripts use all 4 canonical constraint names (`DROP CONSTRAINT IF EXISTS`). `uq_resource_version_id_resource` is acknowledged as a Core Retained Constraint.
- **Production Rollback**: Zero constraints, tables, or audit logs are dropped in production.

---

## 6. Analytical Contract Tests (`content-onboarding-html-backend-design-contract.test.mjs`)

Custom SQL AST extraction helpers parse document content for semantic verification:
- `extractTypeEnumBlock()`: Extracts DDL enum array and verifies strict match with legal 8 states without `completed`.
- `extractFunctionBody()`: Extracts PL/pgSQL function body for `fn_enforce_storage_operation_transition` and verifies DELETE rejection, terminal immutability, identity field checks, and transition matrix logic.
- `extractTriggerBindings()`: Confirms trigger binding to `public.storage_operations`.
- `extractConstraintBlocks()`, `extractValidateBlocks()`, `extractTeardownBlock()`: Verifies the 4 canonical constraint names across creation, validation, and teardown.

---

## 7. Machine-Readable Leakage Vectors Validation

`docs/CONTENT-ONBOARDING-HTML-LEAKAGE-VECTORS-03.json` specifies machine-readable vectors with explicit `vector_id`, `file_type`, `forbidden_field`, `payload`, and `classification`:

- **Negative Vectors (`REJECT`)**:
  - `VEC-NEG-001` (HTML / `explanation`)
  - `VEC-NEG-002` (JSON / `explanation`)
  - `VEC-NEG-003` (JavaScript / `explanation`)
  - `VEC-NEG-004` (manifest / `answer_explanation`)
  - `VEC-NEG-005` (local_asset / `correct_explanation`)
- **Allowed Vectors (`ACCEPT`)**:
  - `VEC-POS-001` (`lesson_summary` without answer mapping)
  - `VEC-POS-002` (`post_reveal_server_response` outside Package)

---

## 8. Verification Results

| Command | Status | Result |
| :--- | :--- | :--- |
| `npm ci` | **PASS** | Dependencies verified clean |
| `node --test tests/question-bank/content-onboarding-html-backend-design-contract.test.mjs` | **PASS** | 23 / 23 subtests passed cleanly |
| `npm test` | **PASS** | 32 / 32 subtests passed cleanly |
| `npx --no-install tsc --noEmit` | **PASS** | Zero TypeScript compilation errors |
| `git diff --check` | **PASS** | Clean whitespace checks |
| `git status --short` | **PASS** | Working tree verified |

- **Source modified (`src/`)**: NO
- **SQL executed**: NO
- **Database**: ZERO
- **Migration applied**: ZERO
- **Deploy**: NO
