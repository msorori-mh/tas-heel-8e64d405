-- Applicability controls whether an artifact is mandatory at intake; it must not weaken the
-- withdrawal boundary after that artifact has been published and attested READY.
CREATE OR REPLACE FUNCTION public.cf11_assert_demotion_allowed(
  _lesson_id uuid,
  _capability text,
  _from_status text,
  _to_status text,
  _applicability text,
  _origin text
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF _from_status IS DISTINCT FROM 'READY' THEN RETURN; END IF;
  IF _to_status IS NOT DISTINCT FROM 'READY' THEN RETURN; END IF;
  IF NOT (_capability = ANY (public.cf11_lifecycle_capabilities())) THEN RETURN; END IF;
  IF NOT public.cf11_is_managed_lesson(_lesson_id) THEN RETURN; END IF;
  IF public.cf11_has_revocation_ticket(_lesson_id) THEN RETURN; END IF;

  RAISE EXCEPTION
    'CF11_DIRECT_TRANSITION_FORBIDDEN: % READY -> % for CF11 lesson % must go through golden_lesson_revoke_cf11_ready (origin=%)',
    _capability, coalesce(_to_status, 'DELETED'), _lesson_id, _origin
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.cf11_assert_demotion_allowed(uuid, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;