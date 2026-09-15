#!/usr/bin/env bash
set -euo pipefail
[[ "${PGHOST:-}" == "127.0.0.1" && "${PGDATABASE:-}" == "school_directory_test" ]] || exit 1
run_dir="$(mktemp -d)"
trap 'rm -rf "$run_dir"' EXIT
cat > "$run_dir/intake.sql" <<'SQL'
begin;
select school_test.actor(1);
set local role authenticated;
select public.admin_intake_schools('[{"governorate":"محافظة أولى","district":"مديرية التزامن","name":"TEST_ONLY intake concurrency","locality":""}]',true);
select pg_sleep(:hold_seconds);
commit;
SQL
PGAPPNAME=school-intake-a psql -X -v ON_ERROR_STOP=1 -v hold_seconds=3 -f "$run_dir/intake.sql" > "$run_dir/a.log" 2>&1 &
pid_a=$!
for attempt in {1..50}; do
 [[ "$(psql -XAtc "select exists(select 1 from pg_stat_activity where application_name='school-intake-a' and wait_event='PgSleep')")" == "t" ]] && break
 sleep 0.05
done
PGAPPNAME=school-intake-b psql -X -v ON_ERROR_STOP=1 -v hold_seconds=0 -f "$run_dir/intake.sql" > "$run_dir/b.log" 2>&1 &
pid_b=$!
observed_wait=false
for attempt in {1..40}; do
 if [[ "$(psql -XAtc "select exists(select 1 from pg_stat_activity where application_name='school-intake-b' and wait_event_type='Lock')")" == "t" ]]; then observed_wait=true; break; fi
 sleep 0.05
done
wait "$pid_a" || { cat "$run_dir/a.log"; exit 1; }
wait "$pid_b" || { cat "$run_dir/b.log"; exit 1; }
[[ "$observed_wait" == true ]] || { echo 'Expected intake lock contention'; exit 1; }
psql -X -v ON_ERROR_STOP=1 <<'SQL'
select school_test.assert((select count(*)=1 from public.schools where name='TEST_ONLY intake concurrency'),'concurrent imports create one identity');
select school_test.assert((select count(*)=1 from school_private.school_audit where action='intake_schools' and after_data->'schools'->0->>'name'='TEST_ONLY intake concurrency'),'concurrent replay creates one audit');
SQL
