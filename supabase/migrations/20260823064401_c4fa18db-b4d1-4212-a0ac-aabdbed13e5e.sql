-- Upgrade the deployed CF11 publisher from pilot-specific question counts to exact staged sets.
-- The original CF11 source migration is also corrected so fresh environments install the final contract directly.
DO $migration$
DECLARE
  fn text;
  old_block text;
  new_block text;
BEGIN
  SELECT pg_get_functiondef('public.golden_lesson_publish_cf11(uuid,uuid,text,jsonb,text,text)'::regprocedure)
    INTO fn;

  -- Idempotent when the corrected definition is already installed.
  IF fn LIKE '%expected_official_codes text[];%' THEN
    RETURN;
  END IF;

  IF fn NOT LIKE '%official_codes text[];%self_codes text[];%' THEN
    RAISE EXCEPTION 'CF11_DYNAMIC_SET_PATCH_UNEXPECTED_DECLARATIONS';
  END IF;
  fn := replace(fn,
    E'  official_codes text[];\n  self_codes text[];',
    E'  official_codes text[];\n  self_codes text[];\n  expected_official_codes text[];\n  expected_self_codes text[];');

  old_block := $old$
  SELECT coalesce(array_agg(code ORDER BY code), ARRAY[]::text[]) INTO official_codes
    FROM public.questions WHERE lesson_id = lesson_row.id AND code LIKE ext_code || '-OFFQ-%';
  SELECT coalesce(array_agg(code ORDER BY code), ARRAY[]::text[]) INTO self_codes
    FROM public.questions WHERE lesson_id = lesson_row.id AND code LIKE ext_code || '-SELF-%';
  IF array_length(official_codes,1) IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION 'CF11_OFFICIAL_QUESTION_COUNT: %', coalesce(array_length(official_codes,1),0)
      USING ERRCODE = '23514';
  END IF;
  IF array_length(self_codes,1) IS DISTINCT FROM 40 THEN
    RAISE EXCEPTION 'CF11_SELFTEST_QUESTION_COUNT: %', coalesce(array_length(self_codes,1),0)
      USING ERRCODE = '23514';
  END IF;
  question_codes := official_codes || self_codes;
$old$;

  new_block := $new$
  -- The verified, byte-pinned CF08 payload is authoritative. Question counts vary by lesson;
  -- compare exact sorted code sets rather than enforcing the Iron rehearsal fixture's 5/40.
  SELECT coalesce(array_agg(ext_code || '-OFFQ-' || coalesce(item->>'question_number', item->>'id')
                            ORDER BY ext_code || '-OFFQ-' || coalesce(item->>'question_number', item->>'id')),
                  ARRAY[]::text[])
    INTO expected_official_codes
    FROM public.golden_lesson_domain_stage_entries e
    CROSS JOIN LATERAL jsonb_array_elements(
      coalesce((convert_from(e.source_payload,'UTF8')::jsonb)->'questions','[]'::jsonb)) AS item
   WHERE e.batch_id = _batch_id AND e.capability = 'officialBookQuestions';
  SELECT coalesce(array_agg(ext_code || '-SELF-' || (item->>'id')
                            ORDER BY ext_code || '-SELF-' || (item->>'id')),
                  ARRAY[]::text[])
    INTO expected_self_codes
    FROM public.golden_lesson_domain_stage_entries e
    CROSS JOIN LATERAL jsonb_array_elements(
      coalesce((convert_from(e.source_payload,'UTF8')::jsonb)->'questions','[]'::jsonb)) AS item
   WHERE e.batch_id = _batch_id AND e.capability = 'selfTest';

  IF coalesce(array_length(expected_official_codes,1),0) = 0
     OR array_position(expected_official_codes,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'CF11_OFFICIAL_QUESTION_SET_INVALID' USING ERRCODE = '23514';
  END IF;
  IF coalesce(array_length(expected_self_codes,1),0) = 0
     OR array_position(expected_self_codes,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'CF11_SELFTEST_QUESTION_SET_INVALID' USING ERRCODE = '23514';
  END IF;
  IF cardinality(expected_official_codes) <> cardinality(ARRAY(SELECT DISTINCT unnest(expected_official_codes))) THEN
    RAISE EXCEPTION 'CF11_OFFICIAL_QUESTION_CODES_DUPLICATED' USING ERRCODE = '23514';
  END IF;
  IF cardinality(expected_self_codes) <> cardinality(ARRAY(SELECT DISTINCT unnest(expected_self_codes))) THEN
    RAISE EXCEPTION 'CF11_SELFTEST_QUESTION_CODES_DUPLICATED' USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(array_agg(code ORDER BY code), ARRAY[]::text[]) INTO official_codes
    FROM public.questions WHERE lesson_id = lesson_row.id AND code LIKE ext_code || '-OFFQ-%';
  SELECT coalesce(array_agg(code ORDER BY code), ARRAY[]::text[]) INTO self_codes
    FROM public.questions WHERE lesson_id = lesson_row.id AND code LIKE ext_code || '-SELF-%';
  IF official_codes IS DISTINCT FROM expected_official_codes THEN
    RAISE EXCEPTION 'CF11_OFFICIAL_QUESTION_SET_MISMATCH: expected=[%] actual=[%]',
      array_to_string(expected_official_codes,','), array_to_string(official_codes,',')
      USING ERRCODE = '23514';
  END IF;
  IF self_codes IS DISTINCT FROM expected_self_codes THEN
    RAISE EXCEPTION 'CF11_SELFTEST_QUESTION_SET_MISMATCH: expected=[%] actual=[%]',
      array_to_string(expected_self_codes,','), array_to_string(self_codes,',')
      USING ERRCODE = '23514';
  END IF;
  question_codes := official_codes || self_codes;
$new$;

  IF strpos(fn, old_block) = 0 THEN
    RAISE EXCEPTION 'CF11_DYNAMIC_SET_PATCH_OLD_GATE_NOT_FOUND';
  END IF;
  fn := replace(fn, old_block, new_block);
  fn := replace(fn,
    'IF jsonb_array_length(official_plan) <> 5 OR jsonb_array_length(self_plan) <> 40 THEN',
    E'IF jsonb_array_length(official_plan) <> cardinality(expected_official_codes)\n     OR jsonb_array_length(self_plan) <> cardinality(expected_self_codes) THEN');
  fn := replace(fn,
    E'''assessment'', jsonb_build_object(''code'', ext_code || ''-SELFTEST'', ''memberCount'', 40,',
    E'''assessment'', jsonb_build_object(''code'', ext_code || ''-SELFTEST'',\n                                     ''memberCount'', cardinality(expected_self_codes),');
  fn := replace(fn,
    'IF member_count <> 40 OR official_in_assessment <> 0 THEN',
    'IF member_count <> cardinality(expected_self_codes) OR official_in_assessment <> 0 THEN');

  IF fn LIKE '%CF11_OFFICIAL_QUESTION_COUNT:%'
     OR fn LIKE '%jsonb_array_length(official_plan) <> 5%'
     OR fn LIKE '%member_count <> 40%' THEN
    RAISE EXCEPTION 'CF11_DYNAMIC_SET_PATCH_INCOMPLETE';
  END IF;

  EXECUTE fn;
END
$migration$;

REVOKE ALL ON FUNCTION public.golden_lesson_publish_cf11(uuid, uuid, text, jsonb, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.golden_lesson_publish_cf11(uuid, uuid, text, jsonb, text, text)
  TO authenticated;