-- Read-only snapshots before, during and after each run. Do not reset shared stats.
SELECT now() AS observed_at,
       current_setting('max_connections')::int AS max_connections,
       count(*) AS connections,
       count(*) FILTER (WHERE state='active') AS active,
       count(*) FILTER (WHERE wait_event_type='Lock') AS lock_waiters,
       max(now()-query_start) FILTER (WHERE state='active') AS oldest_active
FROM pg_stat_activity;
SELECT now() AS observed_at, datname, numbackends, xact_commit, xact_rollback,
       blks_read, blks_hit, temp_bytes, deadlocks
FROM pg_stat_database WHERE datname=current_database();
SELECT now() AS observed_at, queryid, calls, total_exec_time, mean_exec_time,
       max_exec_time, rows, shared_blks_hit, shared_blks_read, temp_blks_written
FROM extensions.pg_stat_statements
WHERE query LIKE '%"public"."get_student_unified_performance"%'
   OR query LIKE '%"public"."create_ministerial_exam_session"%'
   OR query LIKE '%"public"."submit_ministerial_exam_session"%'
   OR query LIKE '%"public"."apply_offline_learning_mutation"%';
