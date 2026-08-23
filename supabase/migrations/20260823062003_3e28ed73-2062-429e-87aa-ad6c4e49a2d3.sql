CREATE OR REPLACE FUNCTION public.cf10_question_text(_item jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT nullif(btrim(coalesce(
    nullif(btrim(coalesce(_item->>'official_text','')),''),
    nullif(btrim(coalesce(_item->>'question_text','')),''),
    nullif(btrim(coalesce(_item->>'question','')),''),
    nullif(btrim(coalesce(_item->>'prompt','')),''),
    nullif(btrim(coalesce(_item->>'text','')),''),
    ''
  )),'')
$$;

GRANT EXECUTE ON FUNCTION public.cf10_question_text(jsonb) TO authenticated, service_role;

DO $migration$
DECLARE
  fn_oid oid;
  fn_sql text;
  before_count int;
BEGIN
  SELECT p.oid INTO fn_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'golden_lesson_materialize_domain_batch'
    AND pg_get_function_identity_arguments(p.oid) = '_batch_id uuid, _actor_id uuid, _mode text, _expected_plan_sha256 text, _idempotency_key text';

  IF fn_oid IS NULL THEN
    RAISE EXCEPTION 'CF10_FUNCTION_NOT_FOUND';
  END IF;

  fn_sql := pg_get_functiondef(fn_oid);

  before_count := (length(fn_sql) - length(replace(fn_sql, 'item->>''official_text''', '')))
                  + (length(fn_sql) - length(replace(fn_sql, 'item->>''question''', '')));
  IF before_count = 0 THEN
    RAISE EXCEPTION 'CF10_PATCH_ANCHOR_NOT_FOUND';
  END IF;

  fn_sql := replace(fn_sql, 'item->>''official_text''', 'public.cf10_question_text(item)');
  fn_sql := replace(fn_sql, 'item->>''question''', 'public.cf10_question_text(item)');

  EXECUTE fn_sql;
END
$migration$;

COMMENT ON FUNCTION public.cf10_question_text(jsonb) IS
  'CF10: canonical question text accessor. Accepts official_text / question_text / question / prompt / text so Excel-derived and JSON-authored packages both materialize without NOT NULL violations.';