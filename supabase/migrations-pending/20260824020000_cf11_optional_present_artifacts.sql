-- Align CF11 with the authoritative package applicability contract.
-- OPTIONAL means the artifact may be omitted at intake; once present in the verified exact
-- seven-artifact package it is publishable. NA remains forbidden for complete publication.
CREATE OR REPLACE FUNCTION public.cf11_assert_exact_required_lifecycle_set(_lesson_id uuid, _code text)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  bad text[];
BEGIN
  PERFORM public.cf11_assert_exact_lifecycle_set(_lesson_id, _code);

  SELECT coalesce(
           array_agg(capability || ':' || applicability::text ORDER BY capability),
           ARRAY[]::text[]
         )
    INTO bad
    FROM public.lesson_capability_lifecycle
   WHERE lesson_id = _lesson_id
     AND applicability NOT IN ('REQUIRED', 'OPTIONAL');

  IF coalesce(array_length(bad, 1), 0) > 0 THEN
    RAISE EXCEPTION 'CF11_LIFECYCLE_APPLICABILITY_NOT_PUBLISHABLE %: [%]',
      _code, array_to_string(bad, ',')
      USING ERRCODE = '23514';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.cf11_assert_exact_required_lifecycle_set(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cf11_assert_exact_required_lifecycle_set(uuid, text)
  TO authenticated, service_role;