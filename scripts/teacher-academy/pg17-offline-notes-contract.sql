\set ON_ERROR_STOP on
-- Run after the existing academy fixture and pg17-contract in the same psql session.
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
select academy.save_offline_note('10000000-0000-0000-0000-000000000001', :'lesson_id'::uuid, 'ملاحظة أوفلاين');
select academy.save_offline_note('10000000-0000-0000-0000-000000000001', :'lesson_id'::uuid, 'ملاحظة أوفلاين');
select pg_temp.assert_true((select count(*)=1 from academy.offline_notes), 'replay must not duplicate a note');
select set_config('test.offline_lesson', :'lesson_id', false);
do $$ begin
  begin
    perform academy.save_offline_note('10000000-0000-0000-0000-000000000001', current_setting('test.offline_lesson')::uuid, 'different');
    raise exception 'payload collision accepted';
  exception when unique_violation then null; end;
  begin
    update academy.offline_notes set body='overwrite';
    raise exception 'immutable note update accepted';
  exception when insufficient_privilege then null; end;
  begin
    delete from academy.offline_notes;
    raise exception 'note deletion accepted';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
select pg_temp.assert_true((select count(*)=0 from academy.offline_notes), 'other teacher cannot read notes');
do $$ begin
  begin
    perform academy.save_offline_note('10000000-0000-0000-0000-000000000002', current_setting('test.offline_lesson')::uuid, 'unauthorized');
    raise exception 'unenrolled teacher write accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
update academy.teacher_profiles set status='SUSPENDED' where user_id='00000000-0000-0000-0000-000000000002';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
select pg_temp.assert_true((select count(*)=0 from academy.offline_notes), 'suspended teacher cannot read notes');
do $$ begin
  begin
    perform academy.save_offline_note('10000000-0000-0000-0000-000000000003', current_setting('test.offline_lesson')::uuid, 'suspended');
    raise exception 'suspended write accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.assert_true(not has_function_privilege('anon','academy.save_offline_note(uuid,uuid,text)','EXECUTE'), 'anon cannot execute note RPC');
select pg_temp.assert_true((select count(*)=1 from academy.offline_notes), 'failed writes preserve original note');
select 'PASS academy offline notes: replay, collision, ownership, enrollment, suspension, immutability';
