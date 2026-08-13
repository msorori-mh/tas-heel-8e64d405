CREATE OR REPLACE FUNCTION public.qb_e2e_purge_questions(p_prefix text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_ids uuid[];
  v_count integer := 0;
BEGIN
  IF p_prefix IS NULL OR left(p_prefix, 4) <> 'e2e-' THEN
    RAISE EXCEPTION 'E2E_PREFIX_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(id) INTO v_ids FROM public.questions WHERE code LIKE p_prefix || '%';
  IF v_ids IS NULL THEN
    RETURN 0;
  END IF;

  ALTER TABLE public.question_revisions DISABLE TRIGGER USER;
  ALTER TABLE public.questions DISABLE TRIGGER USER;
  BEGIN
    UPDATE public.questions SET current_published_revision_id = NULL WHERE id = ANY(v_ids);
    DELETE FROM public.question_targets WHERE question_id = ANY(v_ids);
    DELETE FROM public.assessment_questions WHERE question_id = ANY(v_ids);
    DELETE FROM public.question_revisions WHERE question_id = ANY(v_ids);
    DELETE FROM public.questions WHERE id = ANY(v_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    ALTER TABLE public.question_revisions ENABLE TRIGGER USER;
    ALTER TABLE public.questions ENABLE TRIGGER USER;
    RAISE;
  END;
  ALTER TABLE public.question_revisions ENABLE TRIGGER USER;
  ALTER TABLE public.questions ENABLE TRIGGER USER;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.qb_e2e_purge_questions(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qb_e2e_purge_questions(text) TO service_role;