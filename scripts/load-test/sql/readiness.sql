-- Read-only inventory for staging/production comparison. No credentials or student data.
-- Compare function/policy/index fingerprints before transferring capacity claims.
SELECT 'runtime' AS kind, 'postgres' AS name,
       jsonb_build_object('version',version(),'max_connections',current_setting('max_connections'),
         'database_bytes',pg_database_size(current_database())) AS details
UNION ALL
SELECT 'function',p.oid::regprocedure::text,
       jsonb_build_object('definition_md5',md5(pg_get_functiondef(p.oid)),
         'security_definer',p.prosecdef,'settings',p.proconfig,'grants',p.proacl::text)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN (
  'get_student_unified_performance','_up_sessions','_up_occurrences','_up_progress',
  'lessons_student_visible','lesson_student_content_gate','apply_offline_learning_mutation',
  'create_ministerial_exam_session','get_ministerial_session_state','_ministerial_session_guard',
  'answer_ministerial_exam_question','answer_ministerial_text_question','submit_ministerial_exam_session')
UNION ALL
SELECT 'policy',schemaname||'.'||tablename||'.'||policyname,
       jsonb_build_object('command',cmd,'roles',roles,'permissive',permissive,
         'using_md5',md5(qual),'check_md5',md5(with_check))
FROM pg_policies WHERE schemaname='public' AND tablename IN (
  'profiles','subjects','units','lessons','lesson_resources','user_progress',
  'offline_learning_mutations','exam_sessions','exam_session_questions','exam_session_answers')
UNION ALL
SELECT 'index',schemaname||'.'||tablename||'.'||indexname,
       jsonb_build_object('definition_md5',md5(indexdef))
FROM pg_indexes WHERE schemaname='public' AND tablename IN (
  'profiles','subjects','units','lessons','lesson_resources','user_progress',
  'offline_learning_mutations','exam_sessions','exam_session_questions','exam_session_answers')
UNION ALL
SELECT 'rls',n.nspname||'.'||c.relname,
       jsonb_build_object('enabled',c.relrowsecurity,'forced',c.relforcerowsecurity)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN (
  'profiles','subjects','units','lessons','lesson_resources','user_progress',
  'offline_learning_mutations','exam_sessions','exam_session_questions','exam_session_answers')
ORDER BY 1,2;
