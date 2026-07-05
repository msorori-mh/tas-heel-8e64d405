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
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF public.has_role(v_user, 'content_manager'::public.app_role)
     OR public.has_role(v_user, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'staff_accounts_cannot_create_wallet_topup_requests' USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount_must_be_positive' USING ERRCODE = '22023';
  END IF;

  IF p_payment_method_id IS NULL THEN
    RAISE EXCEPTION 'payment_method_required' USING ERRCODE = '22023';
  END IF;

  IF p_receipt_path IS NULL OR length(trim(p_receipt_path)) = 0 THEN
    RAISE EXCEPTION 'receipt_path_required' USING ERRCODE = '22023';
  END IF;

  IF p_payment_date IS NULL THEN
    RAISE EXCEPTION 'payment_date_required' USING ERRCODE = '22023';
  END IF;

  IF p_payment_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'payment_date_cannot_be_in_future' USING ERRCODE = '22023';
  END IF;

  v_expected_prefix := v_user::text || '/wallet-topups/';
  IF p_receipt_path NOT LIKE v_expected_prefix || '%' THEN
    RAISE EXCEPTION 'invalid_receipt_path' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_method
  FROM public.payment_methods
  WHERE id = p_payment_method_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_method_not_found_or_inactive' USING ERRCODE = 'P0002';
  END IF;

  v_wallet_id := public.ensure_wallet_account(v_user, COALESCE(NULLIF(trim(p_currency), ''), 'YER'));

  INSERT INTO public.wallet_topup_requests (
    user_id,
    wallet_account_id,
    payment_method_id,
    amount,
    currency,
    receipt_path,
    sender_name,
    sender_account,
    transaction_reference,
    payment_date,
    receipt_hash,
    status
  )
  VALUES (
    v_user,
    v_wallet_id,
    p_payment_method_id,
    p_amount,
    COALESCE(NULLIF(trim(p_currency), ''), 'YER'),
    trim(p_receipt_path),
    NULLIF(trim(p_sender_name), ''),
    NULLIF(trim(p_sender_account), ''),
    NULLIF(trim(p_transaction_reference), ''),
    p_payment_date,
    NULLIF(trim(p_receipt_hash), ''),
    'submitted'
  )
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object(
    'request_id', v_request_id,
    'wallet_account_id', v_wallet_id,
    'status', 'submitted'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_wallet_topup_request(
  uuid, numeric, text, text, text, text, text, date, text
) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_wallet_topup_request(
  uuid, numeric, text, text, text, text, text, date, text
) TO authenticated;