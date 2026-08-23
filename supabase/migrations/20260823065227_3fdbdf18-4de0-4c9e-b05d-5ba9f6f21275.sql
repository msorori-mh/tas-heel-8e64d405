CREATE OR REPLACE FUNCTION public.cf11_assert_exact_required_lifecycle_set(_lesson_id uuid, _code text)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  bad text[];
BEGIN
  -- The Golden Lesson publication contract requires the exact canonical seven rows.
  -- Applicability is authoritative metadata copied from the verified staged package:
  -- REQUIRED and OPTIONAL are both publishable when the capability row/content exists;
  -- NA is never publishable in a complete seven-artifact publication.
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