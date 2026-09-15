-- Read-only staging preflight. Execute only against project qwfvlppsffcmmbjpznkw.
-- A DB_SCHEMA_PASS is not approval to run traffic: matching web deployment,
-- isolated test identities, auth journeys and monitoring must be verified separately.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
WITH required_tables(name) AS (
  VALUES ('lesson_book_contents'), ('lesson_explanations'),
         ('lesson_summaries'), ('lesson_resources')
), metadata AS (
  SELECT r.name,
    coalesce(a.attgenerated = 's' AND a.atttypid = 'jsonb'::regtype, false) AS ready
  FROM required_tables r
  LEFT JOIN pg_namespace n ON n.nspname = 'public'
  LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = r.name
  LEFT JOIN pg_attribute a ON a.attrelid = c.oid
    AND a.attname = 'offline_metadata_v1' AND NOT a.attisdropped
), gate AS (
  SELECT p.oid, NOT p.prosecdef AS invoker
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.lesson_student_content_gates(uuid[])')
)
SELECT jsonb_build_object(
  'checked_at', now(),
  'schema_gate', CASE WHEN
    (SELECT bool_and(ready) FROM metadata)
    AND coalesce((SELECT invoker
      AND has_function_privilege('authenticated', oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', oid, 'EXECUTE') FROM gate), false)
    THEN 'DB_SCHEMA_PASS' ELSE 'HOLD' END,
  'metadata_columns', (SELECT jsonb_object_agg(name, ready) FROM metadata),
  'batched_gate_exists', EXISTS (SELECT 1 FROM gate),
  'batched_gate_security_invoker', coalesce((SELECT invoker FROM gate), false),
  'tagged_test_accounts', (SELECT count(*) FROM auth.users
    WHERE raw_app_meta_data @> '{"test_only":true}'::jsonb),
  'web_deployment_gate', 'NOT_VERIFIED',
  'full_journey_load_gate', 'HOLD'
) AS preflight;
COMMIT;
