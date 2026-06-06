-- ===== 20260523035814 wallet revokes =====
REVOKE ALL ON FUNCTION public.ensure_wallet_account(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ensure_wallet_account(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.auto_create_wallet_for_profile() FROM public, anon;
REVOKE ALL ON FUNCTION public.prevent_wallet_tx_mutation() FROM public, anon;

-- ===== 20260523040112 payment_requests fraud cols =====
ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS transaction_reference text NULL,
  ADD COLUMN IF NOT EXISTS sender_name text NULL,
  ADD COLUMN IF NOT EXISTS payment_date date NULL,
  ADD COLUMN IF NOT EXISTS receipt_hash text NULL,
  ADD COLUMN IF NOT EXISTS normalized_amount numeric NULL,
  ADD COLUMN IF NOT EXISTS fraud_flags jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS idx_payment_requests_transaction_reference ON public.payment_requests (transaction_reference) WHERE transaction_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_requests_receipt_hash ON public.payment_requests (receipt_hash) WHERE receipt_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON public.payment_requests (status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_requests_receipt_hash ON public.payment_requests (receipt_hash) WHERE receipt_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_requests_method_txref ON public.payment_requests (payment_method_id, transaction_reference) WHERE transaction_reference IS NOT NULL AND payment_method_id IS NOT NULL;

-- ===== 20260523040623 wallet tx unique + approve_payment_request v1 =====
CREATE UNIQUE INDEX IF NOT EXISTS wallet_tx_unique_payment_request ON public.wallet_transactions (reference_id) WHERE reference_type = 'payment_request';

-- ===== 20260523040942 audit_logs + write_audit_log =====
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL, target_type text NOT NULL, target_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_target ON public.audit_logs(target_type, target_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at DESC);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.write_audit_log(_action text, _target_type text, _target_id uuid, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), _action, _target_type, _target_id, COALESCE(_metadata, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ===== reject_payment_request =====
CREATE OR REPLACE FUNCTION public.reject_payment_request(_request_id uuid, _admin_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller uuid := auth.uid(); v_req record; v_sub record; v_now timestamptz := now(); v_sub_cancelled boolean := false;
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_req FROM public.payment_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment request not found' USING ERRCODE = 'P0002'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'payment request is not pending (current: %)', v_req.status USING ERRCODE = '22023'; END IF;
  UPDATE public.payment_requests SET status='rejected', admin_notes=_admin_notes, reviewed_by=v_caller, reviewed_at=v_now WHERE id = _request_id;
  IF v_req.subscription_id IS NOT NULL THEN
    SELECT * INTO v_sub FROM public.subscriptions WHERE id = v_req.subscription_id FOR UPDATE;
    IF FOUND AND v_sub.status = 'pending' THEN
      UPDATE public.subscriptions SET status='cancelled', updated_at=v_now WHERE id = v_req.subscription_id;
      v_sub_cancelled := true;
    END IF;
  END IF;
  PERFORM public.write_audit_log('payment_request.rejected', 'payment_request', v_req.id,
    jsonb_build_object('request_id', v_req.id, 'subscription_id', v_req.subscription_id, 'subscription_cancelled', v_sub_cancelled, 'reason', _admin_notes));
  RETURN jsonb_build_object('request_id', v_req.id, 'status','rejected', 'subscription_id', v_req.subscription_id, 'subscription_cancelled', v_sub_cancelled);
END;
$$;
REVOKE ALL ON FUNCTION public.reject_payment_request(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reject_payment_request(uuid, text) TO authenticated;

-- ===== 20260523042649 unique sub_payment + approve_payment_request final =====
CREATE UNIQUE INDEX IF NOT EXISTS uniq_wallet_tx_subscription_payment ON public.wallet_transactions(reference_id)
WHERE reference_type = 'subscription' AND type = 'subscription_payment';

CREATE OR REPLACE FUNCTION public.approve_payment_request(_request_id uuid, _admin_notes text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_caller uuid := auth.uid(); v_req record; v_plan record; v_sub record; v_duration_months int;
  v_now timestamptz := now(); v_expires timestamptz; v_starts timestamptz; v_flags jsonb;
  v_deposit jsonb; v_debit jsonb; v_debit_amount numeric;
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_req FROM public.payment_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment request not found' USING ERRCODE = 'P0002'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'payment request is not pending (current: %)', v_req.status USING ERRCODE = '22023'; END IF;
  IF v_req.amount IS NULL OR v_req.amount <= 0 THEN RAISE EXCEPTION 'invalid amount' USING ERRCODE = '22023'; END IF;
  IF v_req.payment_method_id IS NULL THEN RAISE EXCEPTION 'missing payment_method_id' USING ERRCODE = '22023'; END IF;
  IF v_req.subscription_id IS NULL THEN RAISE EXCEPTION 'missing subscription_id' USING ERRCODE = '22023'; END IF;
  IF v_req.plan_id IS NULL THEN RAISE EXCEPTION 'missing plan_id' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_req.plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_sub FROM public.subscriptions WHERE id = v_req.subscription_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription not found' USING ERRCODE = 'P0002'; END IF;
  IF v_req.currency <> v_plan.currency THEN RAISE EXCEPTION 'currency_mismatch: receipt=% plan=%', v_req.currency, v_plan.currency USING ERRCODE = '22023'; END IF;
  v_flags := COALESCE(v_req.fraud_flags, '[]'::jsonb);
  IF v_req.amount < v_plan.price THEN RAISE EXCEPTION 'insufficient_payment_amount: receipt=% plan=%', v_req.amount, v_plan.price USING ERRCODE = '22023'; END IF;
  IF v_req.amount > v_plan.price THEN
    v_flags := v_flags || jsonb_build_array(jsonb_build_object('flag','amount_surplus','expected_amount', v_plan.price,'actual_amount', v_req.amount,'surplus', v_req.amount - v_plan.price,'flagged_at', v_now));
  END IF;
  v_duration_months := COALESCE(v_plan.duration_months, 6);
  v_starts := v_now; v_expires := v_now + (v_duration_months || ' months')::interval; v_debit_amount := v_plan.price;
  UPDATE public.payment_requests SET status='approved', admin_notes=_admin_notes, reviewed_by=v_caller, reviewed_at=v_now, fraud_flags=v_flags WHERE id = _request_id;
  v_deposit := public.create_wallet_transaction(_user_id := v_req.user_id, _type := 'deposit', _direction := 'credit', _amount := v_req.amount, _currency := v_req.currency,
    _reference_type := 'payment_request', _reference_id := v_req.id, _description := 'Payment receipt approved',
    _metadata := jsonb_build_object('plan_id', v_req.plan_id, 'subscription_id', v_req.subscription_id, 'transaction_reference', v_req.transaction_reference, 'receipt_hash', v_req.receipt_hash, 'payment_method_id', v_req.payment_method_id));
  v_debit := public.create_wallet_transaction(_user_id := v_req.user_id, _type := 'subscription_payment', _direction := 'debit', _amount := v_debit_amount, _currency := v_req.currency,
    _reference_type := 'subscription', _reference_id := v_req.subscription_id, _description := 'Subscription activated from wallet deposit',
    _metadata := jsonb_build_object('payment_request_id', v_req.id, 'plan_id', v_req.plan_id, 'subscription_id', v_req.subscription_id, 'deposit_transaction_id', v_deposit->>'transaction_id', 'transaction_reference', v_req.transaction_reference, 'receipt_hash', v_req.receipt_hash));
  UPDATE public.subscriptions SET status='active', starts_at=v_starts, expires_at=v_expires, updated_at=v_now WHERE id = v_req.subscription_id;
  PERFORM public.write_audit_log('payment_request.approved', 'payment_request', v_req.id,
    jsonb_build_object('request_id', v_req.id, 'subscription_id', v_req.subscription_id, 'deposit_transaction_id', v_deposit->>'transaction_id', 'subscription_payment_transaction_id', v_debit->>'transaction_id', 'wallet_balance_after', (v_debit->>'balance_after')::numeric, 'amount', v_req.amount, 'plan_price', v_plan.price, 'currency', v_req.currency, 'fraud_flags', v_flags, 'admin_notes', _admin_notes));
  RETURN jsonb_build_object('request_id', v_req.id, 'subscription_id', v_req.subscription_id, 'deposit_transaction_id', v_deposit->>'transaction_id', 'subscription_payment_transaction_id', v_debit->>'transaction_id', 'wallet_balance_after', (v_debit->>'balance_after')::numeric, 'status','approved', 'fraud_flags', v_flags);
END;
$function$;
REVOKE ALL ON FUNCTION public.approve_payment_request(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.approve_payment_request(uuid, text) TO authenticated;

-- ===== 20260523043357 pay_subscription_from_wallet =====
CREATE OR REPLACE FUNCTION public.pay_subscription_from_wallet(_plan_id uuid, _grade_id uuid DEFAULT NULL, _semester integer DEFAULT NULL, _idempotency_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE v_user uuid := auth.uid(); v_plan record; v_wallet record; v_now timestamptz := now(); v_expires timestamptz; v_sub_id uuid; v_tx jsonb; v_existing_tx record; v_existing_sub uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  IF _idempotency_key IS NOT NULL AND length(trim(_idempotency_key)) > 0 THEN
    SELECT * INTO v_existing_tx FROM public.wallet_transactions
    WHERE user_id = v_user AND type = 'subscription_payment' AND direction = 'debit' AND metadata->>'idempotency_key' = _idempotency_key LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('subscription_id', v_existing_tx.reference_id, 'wallet_transaction_id', v_existing_tx.id, 'balance_after', v_existing_tx.balance_after, 'idempotent_replay', true);
    END IF;
  END IF;
  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = _plan_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found_or_inactive' USING ERRCODE = 'P0002'; END IF;
  IF v_plan.price IS NULL OR v_plan.price <= 0 THEN RAISE EXCEPTION 'invalid_plan_price' USING ERRCODE = '22023'; END IF;
  SELECT id INTO v_existing_sub FROM public.subscriptions
  WHERE user_id = v_user AND status = 'active' AND (expires_at IS NULL OR expires_at > v_now)
    AND COALESCE(plan_id::text,'') = COALESCE(_plan_id::text,'')
    AND COALESCE(grade_id::text,'') = COALESCE(_grade_id::text,'')
    AND COALESCE(semester, -1) = COALESCE(_semester, -1) LIMIT 1;
  IF v_existing_sub IS NOT NULL THEN RAISE EXCEPTION 'active_subscription_exists' USING ERRCODE = '23505'; END IF;
  SELECT * INTO v_wallet FROM public.wallet_accounts WHERE user_id = v_user AND currency = v_plan.currency FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_wallet.status <> 'active' THEN RAISE EXCEPTION 'wallet_not_active' USING ERRCODE = '42501'; END IF;
  IF v_wallet.balance < v_plan.price THEN RAISE EXCEPTION 'insufficient_balance: balance=% price=%', v_wallet.balance, v_plan.price USING ERRCODE = '22023'; END IF;
  v_expires := v_now + (COALESCE(v_plan.duration_months, 6) || ' months')::interval;
  INSERT INTO public.subscriptions (user_id, plan_id, grade_id, semester, status, starts_at, expires_at)
  VALUES (v_user, _plan_id, _grade_id, _semester, 'active', v_now, v_expires) RETURNING id INTO v_sub_id;
  DECLARE v_before numeric := v_wallet.balance; v_after numeric := v_wallet.balance - v_plan.price; v_tx_id uuid;
  BEGIN
    INSERT INTO public.wallet_transactions (wallet_account_id, user_id, type, direction, amount, currency, balance_before, balance_after, reference_type, reference_id, description, metadata, created_by)
    VALUES (v_wallet.id, v_user, 'subscription_payment', 'debit', v_plan.price, v_plan.currency, v_before, v_after, 'subscription', v_sub_id, 'Subscription paid from wallet balance',
      jsonb_build_object('plan_id', _plan_id, 'subscription_id', v_sub_id, 'source', 'wallet_balance', 'idempotency_key', _idempotency_key), v_user)
    RETURNING id INTO v_tx_id;
    UPDATE public.wallet_accounts SET balance = v_after, updated_at = v_now WHERE id = v_wallet.id;
    v_tx := jsonb_build_object('transaction_id', v_tx_id, 'balance_after', v_after);
  END;
  PERFORM public.write_audit_log('subscription.paid_from_wallet', 'subscription', v_sub_id,
    jsonb_build_object('plan_id', _plan_id, 'amount', v_plan.price, 'currency', v_plan.currency, 'wallet_transaction_id', v_tx->>'transaction_id', 'balance_after', v_tx->'balance_after', 'idempotency_key', _idempotency_key));
  RETURN jsonb_build_object('subscription_id', v_sub_id, 'wallet_transaction_id', v_tx->>'transaction_id', 'balance_after', (v_tx->>'balance_after')::numeric, 'expires_at', v_expires);
END;
$function$;
REVOKE ALL ON FUNCTION public.pay_subscription_from_wallet(uuid, uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pay_subscription_from_wallet(uuid, uuid, integer, text) TO authenticated;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_wallet_tx_idempotency_key ON public.wallet_transactions ((metadata->>'idempotency_key'))
WHERE metadata->>'idempotency_key' IS NOT NULL AND type = 'subscription_payment';

-- ===== 20260523044900 wallet types + refunded statuses =====
ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_tx_type_valid;
ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_tx_type_valid
  CHECK (type = ANY (ARRAY['deposit','subscription_payment','refund','adjustment','manual_correction','subscription_reversal','external_refund']));
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS reverses_transaction_id uuid NULL REFERENCES public.wallet_transactions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_wallet_tx_reverses ON public.wallet_transactions(reverses_transaction_id) WHERE reverses_transaction_id IS NOT NULL;

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status = ANY (ARRAY['pending','active','expired','cancelled','refunded']));
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_reason text NULL,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS refunded_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS refund_reason text NULL;

ALTER TABLE public.payment_requests DROP CONSTRAINT IF EXISTS payment_requests_status_check;
ALTER TABLE public.payment_requests ADD CONSTRAINT payment_requests_status_check
  CHECK (status = ANY (ARRAY['pending','approved','rejected','refunded','reversed']));
ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS refunded_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS refund_transaction_id uuid NULL REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversal_reason text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_wallet_tx_subscription_refund ON public.wallet_transactions(reference_id)
WHERE reference_type = 'subscription' AND type IN ('refund', 'subscription_reversal');
CREATE UNIQUE INDEX IF NOT EXISTS uniq_wallet_tx_payment_request_refund ON public.wallet_transactions(reference_id)
WHERE reference_type = 'payment_request' AND type = 'refund';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_wallet_tx_external_refund ON public.wallet_transactions(reverses_transaction_id)
WHERE type = 'external_refund' AND reverses_transaction_id IS NOT NULL;

-- ===== 20260523045305 admin_adjust_wallet =====
CREATE UNIQUE INDEX IF NOT EXISTS uniq_wallet_tx_adjustment_idempotency ON public.wallet_transactions ((metadata->>'idempotency_key'))
WHERE type = 'adjustment' AND (metadata ? 'idempotency_key');

CREATE OR REPLACE FUNCTION public.admin_adjust_wallet(_user_id uuid, _amount numeric, _direction text, _reason text, _idempotency_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_wallet public.wallet_accounts; v_balance_before numeric; v_balance_after numeric; v_tx_id uuid; v_existing_tx uuid; v_metadata jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_id_required'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'amount_must_be_positive'; END IF;
  IF _direction IS NULL OR _direction NOT IN ('credit','debit') THEN RAISE EXCEPTION 'invalid_direction'; END IF;
  IF _reason IS NULL OR length(btrim(_reason)) = 0 THEN RAISE EXCEPTION 'reason_required'; END IF;
  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_tx FROM public.wallet_transactions WHERE type = 'adjustment' AND metadata->>'idempotency_key' = _idempotency_key LIMIT 1;
    IF v_existing_tx IS NOT NULL THEN RAISE EXCEPTION 'duplicate_idempotency_key'; END IF;
  END IF;
  SELECT * INTO v_wallet FROM public.wallet_accounts WHERE user_id = _user_id AND currency = 'YER' FOR UPDATE;
  IF NOT FOUND THEN INSERT INTO public.wallet_accounts (user_id, currency, balance, status) VALUES (_user_id, 'YER', 0, 'active') RETURNING * INTO v_wallet; END IF;
  IF v_wallet.status <> 'active' THEN RAISE EXCEPTION 'wallet_not_active'; END IF;
  v_balance_before := v_wallet.balance;
  IF _direction = 'credit' THEN v_balance_after := v_balance_before + _amount;
  ELSE v_balance_after := v_balance_before - _amount;
    IF v_balance_after < 0 THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
  END IF;
  v_metadata := jsonb_build_object('reason', _reason, 'adjusted_user_id', _user_id, 'admin_id', auth.uid());
  IF _idempotency_key IS NOT NULL THEN v_metadata := v_metadata || jsonb_build_object('idempotency_key', _idempotency_key); END IF;
  INSERT INTO public.wallet_transactions (wallet_account_id, user_id, type, direction, amount, currency, reference_type, reference_id, description, metadata, balance_before, balance_after, created_by)
  VALUES (v_wallet.id, _user_id, 'adjustment', _direction, _amount, 'YER', 'manual_adjustment', NULL, _reason, v_metadata, v_balance_before, v_balance_after, auth.uid())
  RETURNING id INTO v_tx_id;
  UPDATE public.wallet_accounts SET balance = v_balance_after, updated_at = now() WHERE id = v_wallet.id;
  PERFORM public.write_audit_log('wallet.adjusted', 'wallet_account', v_wallet.id,
    jsonb_build_object('adjusted_user_id', _user_id, 'amount', _amount, 'direction', _direction, 'reason', _reason, 'transaction_id', v_tx_id, 'balance_before', v_balance_before, 'balance_after', v_balance_after, 'idempotency_key', _idempotency_key));
  RETURN jsonb_build_object('wallet_account_id', v_wallet.id, 'transaction_id', v_tx_id, 'balance_before', v_balance_before, 'balance_after', v_balance_after);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_adjust_wallet(uuid, numeric, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_adjust_wallet(uuid, numeric, text, text, text) TO authenticated;

-- ===== 20260523045928 admin_refund_subscription =====
CREATE UNIQUE INDEX IF NOT EXISTS uniq_wallet_tx_one_refund_per_subscription ON public.wallet_transactions (reference_id)
WHERE reference_type = 'subscription' AND type IN ('refund', 'subscription_reversal');

CREATE OR REPLACE FUNCTION public.admin_refund_subscription(_subscription_id uuid, _amount numeric DEFAULT NULL, _reason text DEFAULT NULL, _cancel_subscription boolean DEFAULT true, _idempotency_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin uuid := auth.uid(); v_sub record; v_paid_tx record; v_wallet record; v_refund_amount numeric; v_partial boolean; v_new_balance numeric; v_new_tx_id uuid; v_new_status text; v_existing uuid;
BEGIN
  IF v_admin IS NULL OR NOT has_role(v_admin, 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF _subscription_id IS NULL THEN RAISE EXCEPTION 'subscription_id_required' USING ERRCODE = '22023'; END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN RAISE EXCEPTION 'reason_required' USING ERRCODE = '22023'; END IF;
  IF _amount IS NOT NULL AND _amount <= 0 THEN RAISE EXCEPTION 'amount_must_be_positive' USING ERRCODE = '22023'; END IF;
  IF _idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing FROM wallet_transactions WHERE metadata->>'idempotency_key' = _idempotency_key AND type IN ('refund', 'subscription_reversal') LIMIT 1;
    IF v_existing IS NOT NULL THEN RAISE EXCEPTION 'duplicate_idempotency_key' USING ERRCODE = '23505'; END IF;
  END IF;
  SELECT * INTO v_sub FROM subscriptions WHERE id = _subscription_id FOR UPDATE;
  IF v_sub.id IS NULL THEN RAISE EXCEPTION 'subscription_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_sub.status IN ('refunded', 'cancelled') THEN RAISE EXCEPTION 'subscription_already_closed' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_paid_tx FROM wallet_transactions WHERE reference_type = 'subscription' AND reference_id = _subscription_id AND type = 'subscription_payment' AND direction = 'debit' ORDER BY created_at ASC LIMIT 1;
  IF v_paid_tx.id IS NULL THEN RAISE EXCEPTION 'no_payment_transaction_found' USING ERRCODE = 'P0002'; END IF;
  IF _amount IS NULL THEN v_refund_amount := v_paid_tx.amount;
  ELSE
    IF _amount > v_paid_tx.amount THEN RAISE EXCEPTION 'amount_exceeds_paid' USING ERRCODE = '22023'; END IF;
    v_refund_amount := _amount;
  END IF;
  v_partial := v_refund_amount < v_paid_tx.amount;
  SELECT * INTO v_wallet FROM wallet_accounts WHERE user_id = v_sub.user_id AND currency = v_paid_tx.currency FOR UPDATE;
  IF v_wallet.id IS NULL THEN INSERT INTO wallet_accounts (user_id, currency, balance, status) VALUES (v_sub.user_id, v_paid_tx.currency, 0, 'active') RETURNING * INTO v_wallet; END IF;
  IF v_wallet.status <> 'active' THEN RAISE EXCEPTION 'wallet_not_active' USING ERRCODE = '22023'; END IF;
  v_new_balance := v_wallet.balance + v_refund_amount;
  INSERT INTO wallet_transactions (wallet_account_id, user_id, type, direction, amount, currency, balance_before, balance_after, reference_type, reference_id, reverses_transaction_id, description, created_by, metadata)
  VALUES (v_wallet.id, v_sub.user_id, 'refund', 'credit', v_refund_amount, v_paid_tx.currency, v_wallet.balance, v_new_balance, 'subscription', _subscription_id, v_paid_tx.id, _reason, v_admin,
    jsonb_build_object('reason', _reason, 'paid_transaction_id', v_paid_tx.id, 'paid_amount', v_paid_tx.amount, 'partial', v_partial, 'cancel_subscription', _cancel_subscription, 'idempotency_key', _idempotency_key))
  RETURNING id INTO v_new_tx_id;
  UPDATE wallet_accounts SET balance = v_new_balance, updated_at = now() WHERE id = v_wallet.id;
  v_new_status := v_sub.status;
  IF _cancel_subscription AND NOT v_partial THEN
    UPDATE subscriptions SET status = 'refunded', refunded_at = now(), refunded_by = v_admin, refund_reason = _reason, updated_at = now() WHERE id = _subscription_id;
    v_new_status := 'refunded';
  END IF;
  PERFORM write_audit_log('subscription.refunded', 'subscription', _subscription_id,
    jsonb_build_object('amount', v_refund_amount, 'currency', v_paid_tx.currency, 'partial', v_partial, 'cancel_subscription', _cancel_subscription, 'refund_transaction_id', v_new_tx_id, 'reason', _reason, 'user_id', v_sub.user_id));
  RETURN jsonb_build_object('subscription_id', _subscription_id, 'refund_transaction_id', v_new_tx_id, 'amount', v_refund_amount, 'balance_after', v_new_balance, 'partial', v_partial, 'subscription_status', v_new_status);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_refund_subscription(uuid, numeric, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_refund_subscription(uuid, numeric, text, boolean, text) TO authenticated;

-- ===== 20260523095017 lesson buckets admin-only =====
DROP POLICY IF EXISTS "Admins can upload videos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update videos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete videos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view videos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view pdfs" ON storage.objects;
DROP POLICY IF EXISTS "Admins manage lesson files - select" ON storage.objects;
DROP POLICY IF EXISTS "Admins manage lesson files - insert" ON storage.objects;
DROP POLICY IF EXISTS "Admins manage lesson files - update" ON storage.objects;
DROP POLICY IF EXISTS "Admins manage lesson files - delete" ON storage.objects;
CREATE POLICY "Admins manage lesson files - select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id IN ('lesson-pdfs', 'lesson-videos') AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins manage lesson files - insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id IN ('lesson-pdfs', 'lesson-videos') AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins manage lesson files - update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id IN ('lesson-pdfs', 'lesson-videos') AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (bucket_id IN ('lesson-pdfs', 'lesson-videos') AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins manage lesson files - delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id IN ('lesson-pdfs', 'lesson-videos') AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- ===== 20260523234720 RLS hardening =====
DROP POLICY IF EXISTS "Users can insert own payment requests" ON public.payment_requests;
CREATE POLICY "Users can insert own payment requests" ON public.payment_requests FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND status = 'pending' AND reviewed_at IS NULL AND reviewed_by IS NULL);
DROP POLICY IF EXISTS "System can insert points" ON public.student_points;
DROP POLICY IF EXISTS "System can insert badges" ON public.student_badges;
DROP POLICY IF EXISTS "Anyone can view comments" ON public.lesson_comments;
CREATE POLICY "Users with lesson access can view comments" ON public.lesson_comments FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.can_access_lesson(lesson_id));
DROP POLICY IF EXISTS "Users can insert referrals" ON public.referrals;
CREATE POLICY "Users can insert valid referrals" ON public.referrals FOR INSERT TO authenticated
WITH CHECK (auth.uid() = referred_id AND referrer_id <> referred_id AND EXISTS (
  SELECT 1 FROM public.profiles p_referrer JOIN public.profiles p_referred ON p_referred.user_id = auth.uid()
  WHERE p_referrer.user_id = referrals.referrer_id AND p_referrer.referral_code IS NOT NULL AND p_referred.referred_by IS NOT NULL AND upper(p_referrer.referral_code) = upper(p_referred.referred_by)));

-- ===== 20260523235107 admin guards =====
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS TABLE(total_grades bigint, total_subjects bigint, total_lessons bigint, total_questions bigint, total_students bigint, pending_payments bigint, approved_payments bigint, rejected_payments bigint, total_revenue numeric, active_subscriptions bigint, pending_subscriptions bigint, expired_subscriptions bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT * FROM extensions.dashboard_stats LIMIT 1;
END;
$function$;
CREATE OR REPLACE FUNCTION public.refresh_dashboard_stats()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.dashboard_stats;
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_report_subscription_status(_months_back integer DEFAULT 0, _grade_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(status text, sub_count bigint) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT s.status, count(*) FROM subscriptions s
  WHERE (_months_back = 0 OR s.created_at >= date_trunc('month', now()) - (_months_back || ' months')::interval)
    AND (_grade_id IS NULL OR s.grade_id = _grade_id) GROUP BY 1;
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_report_grade_content()
RETURNS TABLE(grade_name text, subjects_count bigint, lessons_count bigint) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT g.name, (SELECT count(*) FROM subjects s WHERE s.grade_id = g.id), (SELECT count(*) FROM lessons l JOIN subjects s ON s.id = l.subject_id WHERE s.grade_id = g.id) FROM grades g ORDER BY g.sort_order;
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_report_monthly_data(_months_back integer DEFAULT 12, _grade_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(year_month text, revenue numeric, new_students bigint) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY WITH months AS (SELECT to_char(date_trunc('month', now()) - (i || ' months')::interval, 'YYYY-MM') AS ym FROM generate_series(0, _months_back - 1) AS i),
  rev AS (SELECT to_char(created_at, 'YYYY-MM') AS ym, SUM(amount) AS total FROM payment_requests WHERE status = 'approved' AND created_at >= date_trunc('month', now()) - (_months_back || ' months')::interval GROUP BY 1),
  stu AS (SELECT to_char(created_at, 'YYYY-MM') AS ym, count(*) AS total FROM profiles WHERE created_at >= date_trunc('month', now()) - (_months_back || ' months')::interval AND (_grade_id IS NULL OR grade_id = _grade_id::text) GROUP BY 1)
  SELECT m.ym, COALESCE(r.total, 0), COALESCE(s.total, 0) FROM months m LEFT JOIN rev r ON r.ym = m.ym LEFT JOIN stu s ON s.ym = m.ym ORDER BY m.ym;
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_report_governorate_data(_months_back integer DEFAULT 0, _grade_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(governorate text, student_count bigint) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT COALESCE(p.governorate, 'غير محدد'), count(*) FROM profiles p
  WHERE (_months_back = 0 OR p.created_at >= date_trunc('month', now()) - (_months_back || ' months')::interval)
    AND (_grade_id IS NULL OR p.grade_id = _grade_id::text) GROUP BY 1 ORDER BY 2 DESC;
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_report_school_data(_months_back integer DEFAULT 0, _grade_id uuid DEFAULT NULL::uuid, _limit integer DEFAULT 15)
RETURNS TABLE(school_name text, governorate text, student_count bigint) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT p.school_name, COALESCE(p.governorate, 'غير محدد'), count(*) FROM profiles p
  WHERE p.school_name IS NOT NULL AND trim(p.school_name) != ''
    AND (_months_back = 0 OR p.created_at >= date_trunc('month', now()) - (_months_back || ' months')::interval)
    AND (_grade_id IS NULL OR p.grade_id = _grade_id::text) GROUP BY 1, 2 ORDER BY 3 DESC LIMIT _limit;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.write_audit_log(text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- ===== 20260525011430 defense-in-depth lesson media access =====
CREATE POLICY "Students can read lesson media with lesson access" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id IN ('lesson-pdfs', 'lesson-videos') AND (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (SELECT 1 FROM public.lessons l WHERE public.can_access_lesson(l.id) AND (l.video_url LIKE '%/' || objects.name OR l.video_url LIKE '%' || objects.name OR l.content_pdf_url LIKE '%/' || objects.name OR l.content_pdf_url LIKE '%' || objects.name))
  OR EXISTS (SELECT 1 FROM public.lesson_resources lr WHERE public.can_access_lesson(lr.lesson_id) AND lr.url LIKE '%' || objects.name)
  OR EXISTS (SELECT 1 FROM public.lesson_book_contents lbc WHERE public.can_access_lesson(lbc.lesson_id) AND lbc.pdf_url LIKE '%' || objects.name)
));
