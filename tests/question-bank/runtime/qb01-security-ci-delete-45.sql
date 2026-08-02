-- QB01_SERVICE_ROLE_CAPABILITY_CORRECTNESS_CI_DRAFT_DELETE_CORRECTION_45 / 45B
-- Local disposable Supabase/Postgres only. Host locality enforced by Node runner.
\set ON_ERROR_STOP on

CREATE TEMP TABLE r (k text PRIMARY KEY, v text, d text);
CREATE OR REPLACE FUNCTION pg_temp.p(k text, v text, d text DEFAULT NULL)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO r VALUES (k,v,d) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v, d=EXCLUDED.d;
$$;

DO $$
DECLARE
  admin_id uuid := 'a1111111-1111-4111-8111-111111111111';
  editor_id uuid := 'e1111111-1111-4111-8111-111111111111';
  other_id uuid := 'b1111111-1111-4111-8111-111111111111';
  qid uuid; q_pub uuid; q_used uuid; rid uuid; rid_pub uuid; oid uuid; aid uuid; sid uuid;
  key text; res jsonb; n int; g_id uuid; tpl uuid; sess uuid;
  h text; bad text := repeat('ab', 32);
BEGIN
  SELECT count(*) INTO n FROM supabase_migrations.schema_migrations WHERE version='20260801120000';
  PERFORM pg_temp.p('ledger', CASE WHEN n=1 THEN 'PASS' ELSE 'FAIL' END, n::text);

  PERFORM pg_temp.p('sr_cap_insert_priv',
    CASE WHEN NOT has_table_privilege('service_role','public.question_bank_capability_grants','INSERT')
     THEN 'PASS' ELSE 'FAIL' END, 'cap');
  PERFORM pg_temp.p('sr_runtime_dml',
    CASE WHEN NOT has_table_privilege('service_role','public.question_bank_runtime_config','UPDATE')
      AND NOT has_table_privilege('service_role','public.question_bank_runtime_config','INSERT')
     THEN 'PASS' ELSE 'FAIL' END, 'runtime');
  PERFORM pg_temp.p('sr_idem_dml',
    CASE WHEN NOT has_table_privilege('service_role','public.question_bank_rpc_idempotency','INSERT')
     THEN 'PASS' ELSE 'FAIL' END, 'idem');
  PERFORM pg_temp.p('sr_targets_dml',
    CASE WHEN NOT has_table_privilege('service_role','public.question_targets','INSERT')
      AND NOT has_table_privilege('service_role','public.question_targets','UPDATE')
     THEN 'PASS' ELSE 'FAIL' END, 'targets');
  PERFORM pg_temp.p('sr_snapshot_dml',
    CASE WHEN NOT has_table_privilege('service_role','public.exam_session_questions','DELETE')
      AND NOT has_table_privilege('service_role','public.exam_session_questions','INSERT')
     THEN 'PASS' ELSE 'FAIL' END, 'snap');
  PERFORM pg_temp.p('sr_review_dml',
    CASE WHEN NOT has_table_privilege('service_role','public.question_response_reviews','UPDATE')
      AND NOT has_table_privilege('service_role','public.question_response_reviews','DELETE')
     THEN 'PASS' ELSE 'FAIL' END, 'reviews');
  PERFORM pg_temp.p('sr_options_update',
    CASE WHEN NOT has_table_privilege('service_role','public.question_options','UPDATE')
     THEN 'PASS' ELSE 'FAIL' END, 'options');
  PERFORM pg_temp.p('sr_questions_delete',
    CASE WHEN NOT has_table_privilege('service_role','public.questions','DELETE')
     THEN 'PASS' ELSE 'FAIL' END, 'qdel');
  PERFORM pg_temp.p('sr_esa_update',
    CASE WHEN NOT has_table_privilege('service_role','public.exam_session_answers','UPDATE')
     THEN 'PASS' ELSE 'FAIL' END, 'esa');

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES
    (admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     '45b-admin@local.test', crypt('x', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (editor_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     '45b-editor@local.test', crypt('x', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (other_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     '45b-other@local.test', crypt('x', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}', '{}', now(), now())
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (admin_id, 'admin') ON CONFLICT DO NOTHING;

  BEGIN
    SET LOCAL ROLE service_role;
    INSERT INTO public.question_bank_capability_grants (
      user_id, capability, scope_type, scope_id, granted_by, reason
    ) VALUES (editor_id, 'PUBLISH_QUESTION_REVISION', 'GLOBAL', NULL, admin_id, 'x');
    RESET ROLE; PERFORM pg_temp.p('sr_cap_insert', 'FAIL', 'allowed');
  EXCEPTION WHEN OTHERS THEN RESET ROLE; PERFORM pg_temp.p('sr_cap_insert', 'PASS', SQLERRM); END;

  BEGIN
    SET LOCAL ROLE service_role;
    UPDATE public.question_bank_runtime_config SET attempt_pin_mode='REVISION_PINNED' WHERE id=1;
    RESET ROLE; PERFORM pg_temp.p('sr_runtime_update', 'FAIL', 'allowed');
  EXCEPTION WHEN OTHERS THEN RESET ROLE; PERFORM pg_temp.p('sr_runtime_update', 'PASS', SQLERRM); END;

  BEGIN
    SET LOCAL ROLE service_role;
    INSERT INTO public.question_bank_rpc_idempotency (
      rpc_name, actor_id, idempotency_key, request_fingerprint, result
    ) VALUES ('x', admin_id, 'k', repeat('0',64), '{}'::jsonb);
    RESET ROLE; PERFORM pg_temp.p('sr_idem_insert', 'FAIL', 'allowed');
  EXCEPTION WHEN OTHERS THEN RESET ROLE; PERFORM pg_temp.p('sr_idem_insert', 'PASS', SQLERRM); END;

  PERFORM set_config('request.jwt.claim.sub', admin_id::text, true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', admin_id::text, 'role', 'authenticated')::text, true);

  BEGIN
    res := public.grant_question_bank_capability(admin_id, 'EDIT_QUESTION_BANK', 'GLOBAL', NULL, 'self');
    PERFORM pg_temp.p('self_grant', 'FAIL', res::text);
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.p('self_grant', 'PASS', SQLERRM); END;

  -- Probe other user via client helper must fail closed
  PERFORM pg_temp.p('cap_probe_other',
    CASE WHEN public.can_edit_question_bank(other_id) = false THEN 'PASS' ELSE 'FAIL' END,
    'self-only');

  PERFORM set_config('request.jwt.claim.sub', editor_id::text, true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', editor_id::text, 'role', 'authenticated')::text, true);
  BEGIN
    res := public.grant_question_bank_capability(other_id, 'PUBLISH_QUESTION_REVISION', 'GLOBAL', NULL, 'e');
    PERFORM pg_temp.p('editor_grant', 'FAIL', res::text);
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.p('editor_grant', 'PASS', SQLERRM); END;

  PERFORM set_config('request.jwt.claim.sub', admin_id::text, true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', admin_id::text, 'role', 'authenticated')::text, true);

  res := public.grant_question_bank_capability(editor_id, 'DELETE_DRAFT_QUESTION', 'GLOBAL', NULL, 'del cap');
  g_id := (res->>'grant_id')::uuid;
  PERFORM pg_temp.p('admin_grant_delete_cap',
    CASE WHEN (res->>'success')::boolean THEN 'PASS' ELSE 'FAIL' END, res::text);

  res := public.revoke_question_bank_capability(g_id, 'revoke del');
  PERFORM pg_temp.p('admin_revoke',
    CASE WHEN (res->>'success')::boolean THEN 'PASS' ELSE 'FAIL' END, res::text);

  BEGIN
    UPDATE public.question_bank_capability_grants SET reason='mut' WHERE id=g_id;
    PERFORM pg_temp.p('cap_append_only', 'FAIL', 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.p('cap_append_only', 'PASS', SQLERRM); END;

  -- Hash integrity path
  INSERT INTO public.questions (question_text, options, correct_index, code)
  VALUES ('45b hash', '["a","b"]'::jsonb, 0, 'QB-45B-H1') RETURNING id INTO qid;
  INSERT INTO public.question_revisions (
    question_id, revision_number, status, interaction_type, grading_mode, question_text, max_score
  ) VALUES (qid, 1, 'DRAFT', 'SINGLE_CHOICE', 'AUTO_SINGLE', 'hash q', 1) RETURNING id INTO rid;
  INSERT INTO public.question_options (question_revision_id, option_code, body, is_correct, sort_order)
  VALUES (rid, 'A', 'a', true, 0), (rid, 'B', 'b', false, 1);

  BEGIN
    UPDATE public.question_revisions SET status='APPROVED', payload_hash=bad WHERE id=rid;
    PERFORM pg_temp.p('arbitrary_hash_approve', 'FAIL', 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.p('arbitrary_hash_approve', 'PASS', SQLERRM); END;

  res := public.compute_and_set_revision_payload_hash(rid);
  h := res->>'payload_hash';
  PERFORM pg_temp.p('compute_hash',
    CASE WHEN (res->>'success')::boolean AND h ~ '^[0-9a-f]{64}$' THEN 'PASS' ELSE 'FAIL' END, h);

  -- Stale hash after content change
  UPDATE public.question_options SET body='aa' WHERE question_revision_id=rid AND option_code='A';
  BEGIN
    UPDATE public.question_revisions SET status='APPROVED' WHERE id=rid;
    PERFORM pg_temp.p('stale_hash_approve', 'FAIL', 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.p('stale_hash_approve', 'PASS', SQLERRM); END;

  res := public.compute_and_set_revision_payload_hash(rid);
  h := res->>'payload_hash';
  UPDATE public.question_revisions SET status='APPROVED' WHERE id=rid;
  PERFORM pg_temp.p('fresh_hash_approve',
    CASE WHEN EXISTS (SELECT 1 FROM question_revisions WHERE id=rid AND status='APPROVED')
     THEN 'PASS' ELSE 'FAIL' END, 'ok');

  -- Correctness mutation as service_role
  SELECT id INTO oid FROM question_options WHERE question_revision_id=rid AND option_code='A';
  BEGIN
    SET LOCAL ROLE service_role;
    UPDATE public.question_options SET is_correct=false WHERE id=oid;
    RESET ROLE; PERFORM pg_temp.p('sr_is_correct', 'FAIL', 'allowed');
  EXCEPTION WHEN OTHERS THEN RESET ROLE; PERFORM pg_temp.p('sr_is_correct', 'PASS', SQLERRM); END;

  -- Publish with matching hash
  key := '45b-'||gen_random_uuid()::text;
  res := public.publish_question_revision(qid, rid, NULL, key);
  PERFORM pg_temp.p('publish_ok',
    CASE WHEN (res->>'success')::boolean THEN 'PASS' ELSE 'FAIL' END, res::text);

  -- Idempotency forgery blocked
  BEGIN
    UPDATE public.question_bank_rpc_idempotency SET result='{"success":false}'::jsonb
    WHERE idempotency_key=key;
    PERFORM pg_temp.p('idem_forge', 'FAIL', 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.p('idem_forge', 'PASS', SQLERRM); END;

  BEGIN
    DELETE FROM public.question_bank_rpc_idempotency WHERE idempotency_key=key;
    PERFORM pg_temp.p('idem_delete', 'FAIL', 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.p('idem_delete', 'PASS', SQLERRM); END;

  -- Draft delete RPC
  INSERT INTO public.questions (question_text, options, correct_index, code)
  VALUES ('45b draft', '["a","b"]'::jsonb, 0, 'QB-45B-D1') RETURNING id INTO q_used;
  INSERT INTO public.question_revisions (
    question_id, revision_number, status, interaction_type, grading_mode, question_text, max_score
  ) VALUES (q_used, 1, 'DRAFT', 'SINGLE_CHOICE', 'AUTO_SINGLE', 'd', 1);

  res := public.grant_question_bank_capability(editor_id, 'DELETE_DRAFT_QUESTION', 'GLOBAL', NULL, 'del2');
  PERFORM set_config('request.jwt.claim.sub', editor_id::text, true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', editor_id::text, 'role', 'authenticated')::text, true);
  res := public.delete_draft_question(q_used, 'cleanup', 'del-'||gen_random_uuid()::text);
  PERFORM pg_temp.p('draft_delete_rpc',
    CASE WHEN (res->>'success')::boolean AND NOT EXISTS (SELECT 1 FROM questions WHERE id=q_used)
     THEN 'PASS' ELSE 'FAIL' END, res::text);
  PERFORM pg_temp.p('draft_delete_audit',
    CASE WHEN EXISTS (SELECT 1 FROM audit_logs WHERE action='DRAFT_QUESTION_DELETED' AND target_id=q_used)
     THEN 'PASS' ELSE 'FAIL' END, 'audit');

  -- Unauthorized delete (no capability)
  PERFORM set_config('request.jwt.claim.sub', other_id::text, true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', other_id::text, 'role', 'authenticated')::text, true);
  INSERT INTO public.questions (question_text, options, correct_index)
  VALUES ('45b unauth', '["a","b"]'::jsonb, 0) RETURNING id INTO qid;
  INSERT INTO public.question_revisions (
    question_id, revision_number, status, interaction_type, grading_mode, question_text, max_score
  ) VALUES (qid, 1, 'DRAFT', 'SINGLE_CHOICE', 'AUTO_SINGLE', 'u', 1);
  BEGIN
    res := public.delete_draft_question(qid, 'no', 'x1');
    PERFORM pg_temp.p('delete_unauthorized', 'FAIL', res::text);
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.p('delete_unauthorized', 'PASS', SQLERRM); END;

  -- Published delete denied (admin)
  PERFORM set_config('request.jwt.claim.sub', admin_id::text, true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', admin_id::text, 'role', 'authenticated')::text, true);
  BEGIN
    res := public.delete_draft_question(
      (SELECT question_id FROM question_revisions WHERE status='PUBLISHED' LIMIT 1),
      'pub', 'x2');
    PERFORM pg_temp.p('delete_published', 'FAIL', res::text);
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.p('delete_published', 'PASS', SQLERRM); END;

  -- Used in template
  INSERT INTO public.questions (question_text, options, correct_index)
  VALUES ('45b used', '["a","b"]'::jsonb, 0) RETURNING id INTO q_used;
  INSERT INTO public.question_revisions (
    question_id, revision_number, status, interaction_type, grading_mode, question_text, max_score
  ) VALUES (q_used, 1, 'DRAFT', 'SINGLE_CHOICE', 'AUTO_SINGLE', 'u', 1);
  INSERT INTO public.exam_templates (title, mode) VALUES ('45bt', 'training') RETURNING id INTO tpl;
  INSERT INTO public.exam_template_questions (template_id, question_id, sort_order, points)
  VALUES (tpl, q_used, 1, 1);
  BEGIN
    res := public.delete_draft_question(q_used, 'used', 'x3');
    PERFORM pg_temp.p('delete_used', 'FAIL', res::text);
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.p('delete_used', 'PASS', SQLERRM); END;

  -- Direct delete
  BEGIN
    SET LOCAL ROLE service_role;
    DELETE FROM public.questions WHERE id=qid;
    RESET ROLE; PERFORM pg_temp.p('sr_direct_delete', 'FAIL', 'allowed');
  EXCEPTION WHEN OTHERS THEN RESET ROLE; PERFORM pg_temp.p('sr_direct_delete', 'PASS', SQLERRM); END;

  -- Snapshot immutability + direct delete block
  INSERT INTO public.exam_sessions (user_id, template_id, mode)
  VALUES (admin_id, tpl, 'training') RETURNING id INTO sess;
  SELECT id INTO rid_pub FROM question_revisions WHERE status='PUBLISHED' LIMIT 1;
  SELECT question_id INTO q_pub FROM question_revisions WHERE id=rid_pub;
  INSERT INTO public.exam_session_questions (
    exam_session_id, question_revision_id, logical_question_id, question_order,
    rendered_question_text, rendered_options, option_order_mapping, max_score, payload_hash, pin_mode
  ) VALUES (sess, rid_pub, q_pub, 1, 's', '[]'::jsonb, '[]'::jsonb, 1, repeat('11',32), 'REVISION_PINNED')
  RETURNING id INTO oid;

  BEGIN
    UPDATE public.exam_session_questions SET rendered_question_text='x' WHERE id=oid;
    PERFORM pg_temp.p('snapshot_update', 'FAIL', 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.p('snapshot_update', 'PASS', SQLERRM); END;

  BEGIN
    DELETE FROM public.exam_session_questions WHERE id=oid;
    PERFORM pg_temp.p('snapshot_delete', 'FAIL', 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.p('snapshot_delete', 'PASS', SQLERRM); END;

  -- Reparent
  INSERT INTO public.questions (question_text, options, correct_index)
  VALUES ('45b rep', '["a","b"]'::jsonb, 0) RETURNING id INTO qid;
  INSERT INTO public.question_revisions (
    question_id, revision_number, status, interaction_type, grading_mode, question_text, max_score
  ) VALUES (qid, 1, 'DRAFT', 'SINGLE_CHOICE', 'AUTO_SINGLE', 'r1', 1) RETURNING id INTO rid;
  INSERT INTO public.question_options (question_revision_id, option_code, body, is_correct, sort_order)
  VALUES (rid, 'A', 'a', true, 1) RETURNING id INTO oid;
  INSERT INTO public.question_revisions (
    question_id, revision_number, status, interaction_type, grading_mode, question_text, max_score
  ) VALUES (qid, 2, 'DRAFT', 'SINGLE_CHOICE', 'AUTO_SINGLE', 'r2', 1) RETURNING id INTO rid_pub;
  BEGIN
    UPDATE public.question_options SET question_revision_id=rid_pub WHERE id=oid;
    PERFORM pg_temp.p('reparent_denied', 'FAIL', 'allowed');
  EXCEPTION WHEN OTHERS THEN PERFORM pg_temp.p('reparent_denied', 'PASS', SQLERRM); END;

  PERFORM pg_temp.p('runtime_legacy',
    CASE WHEN (SELECT attempt_pin_mode FROM question_bank_runtime_config WHERE id=1)='LEGACY'
     THEN 'PASS' ELSE 'FAIL' END, 'LEGACY');
END $$;

SELECT * FROM r ORDER BY 1;
SELECT v, count(*) FROM r GROUP BY v ORDER BY 1;
