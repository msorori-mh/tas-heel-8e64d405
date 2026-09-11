#!/usr/bin/env bash
set -euo pipefail
# Disposable CI database only. Never accepts a provider URL.
[[ "${PGHOST:-}" == "127.0.0.1" && "${PGDATABASE:-}" == "school_directory_test" ]] || { echo 'Isolated school test database required'; exit 1; }
run_dir="$(mktemp -d)"
trap 'rm -rf "$run_dir"' EXIT
psql -X -v ON_ERROR_STOP=1 <<'SQL'
insert into public.profiles(user_id,full_name,school_name,governorate_id,school_district,school_locality)
 select id,'TEST_ONLY concurrent','TEST_ONLY مدرسة التزامن','10000000-0000-0000-0000-000000000001','مديرية التزامن','حي التزامن'
 from auth.users where id in ('00000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000010');
SQL
cat > "$run_dir/review.sql" <<'SQL'
begin;
select school_test.actor(1);
set local role authenticated;
select public.admin_review_school_profile('student', :'user_id'::uuid,
 jsonb_build_object('school_id',null,'school_name','TEST_ONLY مدرسة التزامن','governorate_id','10000000-0000-0000-0000-000000000001','school_district','مديرية التزامن','school_locality','حي التزامن'),
 jsonb_build_object('name','TEST_ONLY مدرسة التزامن','governorate_id','10000000-0000-0000-0000-000000000001','district','مديرية التزامن','locality','حي التزامن'));
select pg_sleep(:hold_seconds);
commit;
SQL
PGAPPNAME=school-review-a psql -X -v ON_ERROR_STOP=1 -v user_id=00000000-0000-0000-0000-000000000009 -v hold_seconds=3 -f "$run_dir/review.sql" > "$run_dir/a.log" 2>&1 &
pid_a=$!
for attempt in {1..50}; do
  [[ "$(psql -XAtc "select exists(select 1 from pg_stat_activity where application_name='school-review-a' and wait_event='PgSleep')")" == "t" ]] && break
  sleep 0.05
done
PGAPPNAME=school-review-b psql -X -v ON_ERROR_STOP=1 -v user_id=00000000-0000-0000-0000-000000000010 -v hold_seconds=0 -f "$run_dir/review.sql" > "$run_dir/b.log" 2>&1 &
pid_b=$!
observed_wait=false
for attempt in {1..40}; do
  if [[ "$(psql -XAtc "select exists(select 1 from pg_stat_activity where application_name='school-review-b' and wait_event_type='Lock')")" == "t" ]]; then observed_wait=true; break; fi
  sleep 0.05
done
wait "$pid_a" || { cat "$run_dir/a.log"; exit 1; }
wait "$pid_b" || { cat "$run_dir/b.log"; exit 1; }
[[ "$observed_wait" == true ]] || { echo 'Concurrency collision was not observed'; exit 1; }
psql -X -v ON_ERROR_STOP=1 <<'SQL'
select school_test.assert((select count(*)=1 from public.schools where name='TEST_ONLY مدرسة التزامن'),'concurrent approvals create one directory identity');
select school_test.assert((select count(*)=2 and count(distinct school_id)=1 from public.profiles where school_name='TEST_ONLY مدرسة التزامن' and school_id is not null),'concurrent approvals link both profiles to same identity');
select count(*) as passed_checks from school_test.checks;
SQL
echo 'PASS: two simultaneous reviews, observed lock contention, one school identity.'
