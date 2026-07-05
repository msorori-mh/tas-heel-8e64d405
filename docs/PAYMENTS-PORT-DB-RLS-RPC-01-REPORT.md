# PAYMENTS-PORT-DB-RLS-RPC-01 — Phase Report

**Phase:** Database schema, RLS, RPCs, and storage policies for wallet top-up requests  
**Repository:** `msorori-mh/tas-heel-8e64d405`  
**Branch:** `feature/port-wallet-payments-highschool-p1-db-rls-rpc`  
**Migration:** `supabase/migrations/20260704150000_wallet_topup_requests.sql`  
**Applied to Supabase:** No (Git-only per phase scope)

---

## Summary

This phase adds the new student wallet top-up path at the database layer:

1. Student calls `create_wallet_topup_request` (after uploading receipt to Storage).
2. Admin approves or rejects via `approve_wallet_topup_request` / `reject_wallet_topup_request`.
3. On approval, wallet balance is credited via existing `create_wallet_transaction` (`deposit`).
4. Student activates subscription later via existing `pay_subscription_from_wallet` (unchanged).

Legacy `payment_requests` remains untouched and read-only for the new product path.

---

## What Was Added

### Tables

#### `wallet_topup_requests`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid FK → `auth.users` | CASCADE |
| `wallet_account_id` | uuid FK → `wallet_accounts` | Set by RPC via `ensure_wallet_account` |
| `payment_method_id` | uuid FK → `payment_methods` | RESTRICT |
| `amount` | numeric(12,2) | CHECK `> 0` |
| `currency` | text | Default `YER` |
| `receipt_path` | text | Storage path under `{user_id}/wallet-topups/...` |
| `sender_name`, `sender_account` | text | Optional transfer metadata |
| `transaction_reference` | text | Optional |
| `payment_date` | date | Optional |
| `status` | text | `submitted`, `under_review`, `credited`, `rejected` |
| `admin_notes`, `rejection_reason` | text | Admin review fields |
| `reviewed_by` | uuid FK → `auth.users` | Set by approve/reject RPCs |
| `reviewed_at` | timestamptz | |
| `credited_transaction_id` | uuid FK → `wallet_transactions` | Set on approval |
| `receipt_hash` | text | Optional dedup hint (no OCR in this phase) |
| `fraud_flags` | jsonb | Default `{}` (placeholder; no fraud engine) |
| `created_at`, `updated_at` | timestamptz | `update_updated_at_column` trigger |

**Indexes:** `user_id`, `status`, `payment_method_id`, `created_at DESC`, `reviewed_by`, `credited_transaction_id`

**Unique guard:** `uniq_wallet_tx_wallet_topup_deposit` on `wallet_transactions(reference_id)` where `reference_type = 'wallet_topup'` and `type = 'deposit'` — prevents double credit for the same request.

### RPCs

| Function | Access | Purpose |
|----------|--------|---------|
| `create_wallet_topup_request(...)` | authenticated (student only) | Rejects `admin` and `content_manager`; validates caller, amount, active payment method, receipt path prefix; ensures wallet; inserts `submitted` row; **does not** change balance |
| `approve_wallet_topup_request(p_request_id, p_admin_notes)` | authenticated (admin via `has_role`) | Credits wallet via `create_wallet_transaction(deposit, credit, reference_type='wallet_topup')`; sets `credited`; audit log; idempotent if already credited |
| `reject_wallet_topup_request(p_request_id, p_rejection_reason)` | authenticated (admin) | Requires non-empty reason; sets `rejected`; audit log; no wallet change |

**Design decisions:**

- **Student-only creation** — `create_wallet_topup_request` raises if caller has `admin` or `content_manager` role; admins use separate approve/reject path only.
- **Creation via RPC only** — no client INSERT RLS policy. Simpler validation (receipt path prefix, active payment method) in one place.
- **Wallet transaction type:** `deposit` with `reference_type = 'wallet_topup'` (tas-heel enum has no `topup` type; mufadhala uses a different schema).
- **No direct admin UPDATE policy** — approve/reject mutate rows inside SECURITY DEFINER RPCs only.
- **`pay_subscription_from_wallet`** — not modified; remains the subscription activation path after wallet credit.
- **`has_active_subscription`** — not modified.

### RLS (`wallet_topup_requests`)

| Policy | Role | Operation |
|--------|------|-----------|
| Users can view own wallet topup requests | student (owner, not staff) | SELECT — `auth.uid() = user_id` and caller is neither `admin` nor `content_manager` |
| Admins can view all wallet topup requests | `admin` only | SELECT |
| *(none)* | — | INSERT / UPDATE / DELETE for clients |

**`content_manager`:** explicitly blocked — no owner SELECT policy match; `create_wallet_topup_request` rejects the role. Admin visibility and review remain on the separate admin SELECT policy and approve/reject RPCs.

### Storage (`receipts` bucket)

Existing policies already support private uploads under `{user_id}/...`:

- `Users can upload own receipts` — first path segment must equal `auth.uid()`
- `Users can view own receipts` — owner or admin

**Extended (not duplicated):** UPDATE/DELETE lock policies now also block changes when a linked `wallet_topup_requests.receipt_path` matches the object and status is `submitted`, `under_review`, or `credited`.

Expected upload path pattern:

```text
{user_id}/wallet-topups/{request_id}/{filename}
```

No new bucket created.

---

## What Was NOT Done (by design)

| Item | Status |
|------|--------|
| Supabase migration apply | Skipped |
| Deploy / merge / push | Skipped |
| UI (student or admin) | Skipped |
| Edge Functions | Skipped |
| OCR / fraud engine | Skipped |
| `promo_codes` | Skipped |
| `wallet_subscription_activations` | Skipped |
| `wallet_audit_logs` (separate table) | Skipped — uses existing `audit_logs` via `write_audit_log` |
| Data migration from mufadhala | Skipped |
| Auth changes | Skipped |
| `payment_requests` removal | Skipped — legacy/read-only |
| Manual `types.ts` update | Skipped — see below |

### `types.ts` decision

`src/integrations/supabase/types.ts` is Supabase-generated (`PostgrestVersion: "14.5"`) and cannot be regenerated without applying the migration to a database. Manual edits would drift from generated output. **Not updated in this phase.** Regenerate after migration apply in a later phase.

---

## Risks Before Applying Migration

1. **Ordering:** Migration assumes `wallet_accounts`, `wallet_transactions`, `payment_methods`, `create_wallet_transaction`, `ensure_wallet_account`, `write_audit_log`, and `has_role` already exist (they do in current tas-heel migrations).
2. **Storage policy replacement:** DROP/CREATE of receipt UPDATE/DELETE policies — brief window only during apply; functionally backward-compatible with existing `payment_requests` checks.
3. **No admin UI yet:** RPCs exist but nothing calls them until a later phase.
4. **Receipt path contract:** Clients must upload to `{uid}/wallet-topups/...` before calling `create_wallet_topup_request`; mismatch raises `invalid_receipt_path`.
5. **`under_review` status:** Allowed in approve/reject checks but no RPC transitions to it yet (future admin workflow).

---

## Steps to Apply Later

1. Review migration SQL on branch `feature/port-wallet-payments-highschool-p1-db-rls-rpc`.
2. Apply via Supabase CLI or dashboard:  
   `supabase db push` or run `20260704150000_wallet_topup_requests.sql` on staging first.
3. Regenerate TypeScript types:  
   `supabase gen types typescript --project-id <id> > src/integrations/supabase/types.ts`
4. Verify RPC grants and RLS with service-role-free client tests.

---

## Testing After Apply

### SQL / RPC smoke tests

```sql
-- As student (authenticated JWT)
SELECT create_wallet_topup_request(
  p_payment_method_id := '<active_method_uuid>',
  p_amount := 5000,
  p_receipt_path := '<uid>/wallet-topups/<request_id>/receipt.jpg'
);

-- As admin
SELECT approve_wallet_topup_request('<request_id>', 'verified');
-- or
SELECT reject_wallet_topup_request('<request_id>', 'invalid receipt');

-- Verify balance
SELECT balance FROM wallet_accounts WHERE user_id = '<uid>';

-- Verify subscription path still works
SELECT pay_subscription_from_wallet('<plan_id>', '<grade_id>', 1, 'test-key-1');
```

### RLS checks

- Student A cannot SELECT student B's top-up requests.
- `content_manager` cannot SELECT own or any `wallet_topup_requests` (owner policy excludes the role; no admin policy).
- `content_manager` cannot call `create_wallet_topup_request` (RPC rejects staff roles).
- Student cannot UPDATE/DELETE top-up rows directly.
- Student cannot upload receipts under another user's folder prefix.

### Storage checks

- Upload to `receipts/{uid}/wallet-topups/...` succeeds for owner.
- DELETE/UPDATE blocked after top-up request linked and in locked statuses.

---

## Reference

Mufadhala migration `20260422233336_b0111135-faad-42dc-9652-161ee4b57303.sql` was used as a **read-only reference** for approve/reject flow and RLS shape, adapted to tas-heel's `create_wallet_transaction` + `deposit` + `write_audit_log` patterns.

---

## Hotfix: content_manager block (PAYMENTS-PORT-DB-RLS-RPC-01-HOTFIX)

After local review of commit `051e884`, an explicit DB-layer block was added before push/PR:

1. **RLS owner SELECT** — policy `Users can view own wallet topup requests` now requires the caller not have `content_manager` or `admin` role (regular students only).
2. **`create_wallet_topup_request`** — rejects callers with `content_manager` or `admin` with `staff_accounts_cannot_create_wallet_topup_requests`.
3. **Admin path unchanged** — admins still SELECT all via admin policy and approve/reject via RPCs only; they do not use the student create path.

Unchanged by this hotfix: `payment_requests` (legacy), `pay_subscription_from_wallet`, `has_active_subscription`, Auth, UI, Lovable, Supabase apply.

---

## Checklist (phase acceptance)

| Question | Answer |
|----------|--------|
| Auth modified? | **No** |
| UI modified? | **No** |
| Lovable used? | **No** |
| Migration applied? | **No** |
| Data migrated from mufadhala? | **No** |
| `content_manager` blocked from payments/wallet? | **Yes** — explicit RPC reject + owner SELECT exclusion |
| `payment_requests` kept legacy? | **Yes** (unchanged) |
