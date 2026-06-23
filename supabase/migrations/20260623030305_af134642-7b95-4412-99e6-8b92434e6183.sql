-- C-03: Restrict get_user_email
REVOKE ALL ON FUNCTION public.get_user_email(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_email(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_email(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_email(uuid) TO service_role;

-- C-04: dashboard_stats MV
REVOKE SELECT ON extensions.dashboard_stats FROM anon;
REVOKE SELECT ON extensions.dashboard_stats FROM authenticated;
REVOKE SELECT ON extensions.dashboard_stats FROM PUBLIC;

-- H-03: has_active_subscription hardening
CREATE OR REPLACE FUNCTION public.has_active_subscription(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF auth.uid() <> _user_id AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _user_id AND status = 'active'
      AND (expires_at IS NULL OR expires_at > now())
  );
END;
$$;
REVOKE ALL ON FUNCTION public.has_active_subscription(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid) TO authenticated;

-- get_user_total_points hardening
CREATE OR REPLACE FUNCTION public.get_user_total_points(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  IF auth.uid() <> _user_id AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE((SELECT SUM(points)::integer FROM public.student_points WHERE user_id = _user_id), 0);
END;
$$;
REVOKE ALL ON FUNCTION public.get_user_total_points(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_total_points(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_total_points(uuid) TO authenticated;

-- ensure_wallet_account hardening
CREATE OR REPLACE FUNCTION public.ensure_wallet_account(_user_id uuid, _currency text DEFAULT 'YER')
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_id FROM public.wallet_accounts WHERE user_id = _user_id AND currency = _currency;
  IF v_id IS NULL THEN
    INSERT INTO public.wallet_accounts (user_id, currency) VALUES (_user_id, _currency) RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_wallet_account(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_wallet_account(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_wallet_account(uuid, text) TO authenticated;

-- questions column-level protection
REVOKE SELECT ON public.questions FROM anon;
REVOKE SELECT ON public.questions FROM authenticated;
GRANT SELECT (
  id, lesson_id, subject_id, question_text, options, question_type,
  year, sort_order, created_at, unit, semester, code
) ON public.questions TO authenticated;
REVOKE SELECT (correct_index, explanation) ON public.questions FROM anon, authenticated;
GRANT ALL ON public.questions TO service_role;