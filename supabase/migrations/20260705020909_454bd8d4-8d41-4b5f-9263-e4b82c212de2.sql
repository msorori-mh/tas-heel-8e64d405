-- PAYMENTS-PORT-DB-RLS-RPC-01: wallet top-up requests (schema, RLS, RPCs, storage hardening)

CREATE TABLE IF NOT EXISTS public.wallet_topup_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_account_id uuid REFERENCES public.wallet_accounts(id) ON DELETE RESTRICT,
  payment_method_id uuid NOT NULL REFERENCES public.payment_methods(id) ON DELETE RESTRICT,
  amount numeric(12, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'YER',
  receipt_path text NOT NULL,
  sender_name text,
  sender_account text,
  transaction_reference text,
  payment_date date,
  status text NOT NULL DEFAULT 'submitted',
  admin_notes text,
  rejection_reason text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  credited_transaction_id uuid REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
  receipt_hash text,
  fraud_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_topup_requests_amount_positive CHECK (amount > 0),
  CONSTRAINT wallet_topup_requests_status_valid CHECK (
    status = ANY (ARRAY['submitted', 'under_review', 'credited', 'rejected'])
  )
);

GRANT SELECT ON public.wallet_topup_requests TO authenticated;
GRANT ALL ON public.wallet_topup_requests TO service_role;

CREATE INDEX IF NOT EXISTS idx_wallet_topup_requests_user_id ON public.wallet_topup_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_topup_requests_status ON public.wallet_topup_requests (status);
CREATE INDEX IF NOT EXISTS idx_wallet_topup_requests_payment_method_id ON public.wallet_topup_requests (payment_method_id);
CREATE INDEX IF NOT EXISTS idx_wallet_topup_requests_created_at_desc ON public.wallet_topup_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_topup_requests_reviewed_by ON public.wallet_topup_requests (reviewed_by) WHERE reviewed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wallet_topup_requests_credited_transaction_id ON public.wallet_topup_requests (credited_transaction_id) WHERE credited_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_wallet_tx_wallet_topup_deposit
  ON public.wallet_transactions (reference_id)
  WHERE reference_type = 'wallet_topup' AND type = 'deposit';

DROP TRIGGER IF EXISTS trg_wallet_topup_requests_updated_at ON public.wallet_topup_requests;
CREATE TRIGGER trg_wallet_topup_requests_updated_at
  BEFORE UPDATE ON public.wallet_topup_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.wallet_topup_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own wallet topup requests" ON public.wallet_topup_requests;
CREATE POLICY "Users can view own wallet topup requests"
  ON public.wallet_topup_requests
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    AND NOT public.has_role(auth.uid(), 'content_manager'::public.app_role)
    AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Admins can view all wallet topup requests" ON public.wallet_topup_requests;
CREATE POLICY "Admins can view all wallet topup requests"
  ON public.wallet_topup_requests
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.create_wallet_topup_request(
  p_payment_method_id uuid,
  p_amount numeric,
  p_receipt_path text,
  p_currency text DEFAULT 'YER',
  p_sender_name text DEFAULT NULL,
  p_sender_account text DEFAULT NULL,
  p_transaction_reference text DEFAULT NULL,
  p_payment_date date DEFAULT NULL,
  p_receipt_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_wallet_id uuid;
  v_method record;
  v_request_id uuid;
  v_expected_prefix text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  IF public.has_role(v_user, 'content_manager'::public.app_role)
     OR public.has_role(v_user, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'staff_accounts_cannot_create_wallet_topup_requests' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'amount_must_be_positive' USING ERRCODE = '22023'; END IF;
  IF p_payment_method_id IS NULL THEN RAISE EXCEPTION 'payment_method_required' USING ERRCODE = '22023'; END IF;
  IF p_receipt_path IS NULL OR length(trim(p_receipt_path)) = 0 THEN RAISE EXCEPTION 'receipt_path_required' USING ERRCODE = '22023'; END IF;
  v_expected_prefix := v_user::text || '/wallet-topups/';
  IF p_receipt_path NOT LIKE v_expected_prefix || '%' THEN RAISE EXCEPTION 'invalid_receipt_path' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_method FROM public.payment_methods WHERE id = p_payment_method_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'payment_method_not_found_or_inactive' USING ERRCODE = 'P0002'; END IF;
  v_wallet_id := public.ensure_wallet_account(v_user, COALESCE(NULLIF(trim(p_currency), ''), 'YER'));
  INSERT INTO public.wallet_topup_requests (
    user_id, wallet_account_id, payment_method_id, amount, currency, receipt_path,
    sender_name, sender_account, transaction_reference, payment_date, receipt_hash, status
  ) VALUES (
    v_user, v_wallet_id, p_payment_method_id, p_amount,
    COALESCE(NULLIF(trim(p_currency), ''), 'YER'), trim(p_receipt_path),
    NULLIF(trim(p_sender_name), ''), NULLIF(trim(p_sender_account), ''),
    NULLIF(trim(p_transaction_reference), ''), p_payment_date,
    NULLIF(trim(p_receipt_hash), ''), 'submitted'
  ) RETURNING id INTO v_request_id;
  RETURN jsonb_build_object('request_id', v_request_id, 'wallet_account_id', v_wallet_id, 'status', 'submitted');
END;
$$;

REVOKE ALL ON FUNCTION public.create_wallet_topup_request(uuid, numeric, text, text, text, text, text, date, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_wallet_topup_request(uuid, numeric, text, text, text, text, text, date, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_wallet_topup_request(
  p_request_id uuid,
  p_admin_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_req record;
  v_deposit jsonb;
  v_existing_tx uuid;
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_req FROM public.wallet_topup_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_topup_request_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_req.status = 'credited' THEN
    RETURN jsonb_build_object('request_id', v_req.id, 'status', v_req.status,
      'wallet_account_id', v_req.wallet_account_id, 'credited_transaction_id', v_req.credited_transaction_id,
      'already_processed', true);
  END IF;
  IF v_req.status = 'rejected' THEN RAISE EXCEPTION 'wallet_topup_request_already_rejected' USING ERRCODE = '22023'; END IF;
  IF v_req.status NOT IN ('submitted', 'under_review') THEN
    RAISE EXCEPTION 'wallet_topup_request_not_reviewable (current: %)', v_req.status USING ERRCODE = '22023';
  END IF;
  IF v_req.wallet_account_id IS NULL THEN
    v_req.wallet_account_id := public.ensure_wallet_account(v_req.user_id, v_req.currency);
    UPDATE public.wallet_topup_requests SET wallet_account_id = v_req.wallet_account_id, updated_at = now() WHERE id = v_req.id;
  END IF;
  v_deposit := public.create_wallet_transaction(
    _user_id := v_req.user_id, _type := 'deposit', _direction := 'credit',
    _amount := v_req.amount, _currency := v_req.currency,
    _reference_type := 'wallet_topup', _reference_id := v_req.id,
    _description := 'Wallet top-up approved',
    _metadata := jsonb_build_object(
      'wallet_topup_request_id', v_req.id, 'payment_method_id', v_req.payment_method_id,
      'receipt_path', v_req.receipt_path, 'receipt_hash', v_req.receipt_hash,
      'transaction_reference', v_req.transaction_reference,
      'idempotency_key', 'wallet-topup-approval:' || v_req.id::text
    )
  );
  v_existing_tx := (v_deposit->>'transaction_id')::uuid;
  UPDATE public.wallet_topup_requests
  SET status = 'credited', reviewed_by = v_caller, reviewed_at = now(),
      admin_notes = COALESCE(p_admin_notes, admin_notes), rejection_reason = NULL,
      credited_transaction_id = v_existing_tx, updated_at = now()
  WHERE id = v_req.id;
  PERFORM public.write_audit_log('wallet_topup.approved', 'wallet_topup_request', v_req.id,
    jsonb_build_object('request_id', v_req.id, 'user_id', v_req.user_id, 'amount', v_req.amount,
      'currency', v_req.currency, 'deposit_transaction_id', v_existing_tx,
      'wallet_balance_after', (v_deposit->>'balance_after')::numeric, 'admin_notes', p_admin_notes));
  RETURN jsonb_build_object('request_id', v_req.id, 'status', 'credited',
    'wallet_account_id', v_req.wallet_account_id, 'credited_transaction_id', v_existing_tx,
    'wallet_balance_after', (v_deposit->>'balance_after')::numeric, 'already_processed', false);
END;
$$;

REVOKE ALL ON FUNCTION public.approve_wallet_topup_request(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.approve_wallet_topup_request(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_wallet_topup_request(
  p_request_id uuid,
  p_rejection_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_req record;
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_rejection_reason IS NULL OR length(trim(p_rejection_reason)) = 0 THEN
    RAISE EXCEPTION 'rejection_reason_required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_req FROM public.wallet_topup_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_topup_request_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_req.status = 'credited' THEN RAISE EXCEPTION 'credited_request_cannot_be_rejected' USING ERRCODE = '22023'; END IF;
  IF v_req.status = 'rejected' THEN
    RETURN jsonb_build_object('request_id', v_req.id, 'status', v_req.status, 'already_processed', true);
  END IF;
  IF v_req.status NOT IN ('submitted', 'under_review') THEN
    RAISE EXCEPTION 'wallet_topup_request_not_reviewable (current: %)', v_req.status USING ERRCODE = '22023';
  END IF;
  UPDATE public.wallet_topup_requests
  SET status = 'rejected', rejection_reason = trim(p_rejection_reason),
      reviewed_by = v_caller, reviewed_at = now(), updated_at = now()
  WHERE id = v_req.id;
  PERFORM public.write_audit_log('wallet_topup.rejected', 'wallet_topup_request', v_req.id,
    jsonb_build_object('request_id', v_req.id, 'user_id', v_req.user_id,
      'rejection_reason', trim(p_rejection_reason)));
  RETURN jsonb_build_object('request_id', v_req.id, 'status', 'rejected', 'already_processed', false);
END;
$$;

REVOKE ALL ON FUNCTION public.reject_wallet_topup_request(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reject_wallet_topup_request(uuid, text) TO authenticated;

DROP POLICY IF EXISTS "Users can delete own receipts when not under review" ON storage.objects;
CREATE POLICY "Users can delete own receipts when not under review"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'receipts' AND owner = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM public.payment_requests pr
      WHERE pr.user_id = auth.uid() AND pr.receipt_url IS NOT NULL
        AND pr.receipt_url LIKE '%' || storage.objects.name
        AND pr.status IN ('pending', 'approved'))
    AND NOT EXISTS (SELECT 1 FROM public.wallet_topup_requests wtr
      WHERE wtr.user_id = auth.uid() AND wtr.receipt_path = storage.objects.name
        AND wtr.status IN ('submitted', 'under_review', 'credited'))
  );

DROP POLICY IF EXISTS "Users can update own receipts when not submitted" ON storage.objects;
CREATE POLICY "Users can update own receipts when not submitted"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'receipts' AND owner = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM public.payment_requests pr
      WHERE pr.user_id = auth.uid() AND pr.receipt_url IS NOT NULL
        AND pr.receipt_url LIKE '%' || storage.objects.name
        AND pr.status IN ('pending', 'approved'))
    AND NOT EXISTS (SELECT 1 FROM public.wallet_topup_requests wtr
      WHERE wtr.user_id = auth.uid() AND wtr.receipt_path = storage.objects.name
        AND wtr.status IN ('submitted', 'under_review', 'credited'))
  )
  WITH CHECK (bucket_id = 'receipts' AND owner = auth.uid());