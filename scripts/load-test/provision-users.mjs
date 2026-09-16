/** Generate a private staging-only SQL fixture. Never pipe its output into logs. */
import { readFile, writeFile } from "node:fs/promises";
import { STAGING } from "./student-journey.mjs";
const [configPath, outputPath] = process.argv.slice(2);
if (!configPath || !outputPath)
  throw Error("Usage: provision-users.mjs private-config private-output.sql");
const c = JSON.parse(await readFile(configPath));
if (
  c.project !== STAGING ||
  !/^[a-z0-9]{8,32}$/.test(c.run) ||
  !Number.isInteger(c.count) ||
  c.count < 1 ||
  c.count > 10000
)
  throw Error("INVALID_STAGING_FIXTURE");
for (const id of [c.grade, c.track]) if (!/^[a-f0-9-]{36}$/.test(id)) throw Error("INVALID_SCOPE");
if (typeof c.password !== "string" || c.password.length < 32)
  throw Error("STRONG_TEST_PASSWORD_REQUIRED");
const literal = (s) => "'" + s.replaceAll("'", "''") + "'";
const sql = `-- Execute ONLY on project ${STAGING}. This file contains a TEST_ONLY secret.
BEGIN;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM auth.users WHERE raw_app_meta_data->>'capacity_run'=${literal(c.run)}) THEN RAISE EXCEPTION 'RUN_ALREADY_EXISTS'; END IF; END $$;
WITH password AS MATERIALIZED (SELECT extensions.crypt(${literal(c.password)},extensions.gen_salt('bf')) hash),
seed AS (SELECT gen_random_uuid() id,${literal(c.run)}||'.'||i||'@load.test.invalid' email FROM generate_series(1,${c.count}) i),
users AS (INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change,email_change_token_current,reauthentication_token,is_sso_user,is_anonymous)
SELECT '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',email,hash,now(),jsonb_build_object('provider','email','providers',jsonb_build_array('email'),'test_only',true,'capacity_run',${literal(c.run)}),jsonb_build_object('full_name','TEST_ONLY CAPACITY'),now(),now(),'','','','','','',false,false FROM seed CROSS JOIN password RETURNING id,email)
INSERT INTO auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at) SELECT id::text,id,jsonb_build_object('sub',id::text,'email',email,'email_verified',true),'email',now(),now() FROM users;
UPDATE public.profiles p SET grade_uuid='${c.grade}',grade_id='${c.grade}',curriculum_track_id='${c.track}' FROM auth.users u WHERE p.user_id=u.id AND u.raw_app_meta_data->>'capacity_run'=${literal(c.run)};
COMMIT;
SELECT id,email FROM auth.users WHERE raw_app_meta_data->>'capacity_run'=${literal(c.run)} ORDER BY email;
`;
await writeFile(outputPath, sql, { mode: 0o600, flag: "wx" });
console.log("Private staging fixture written; no SQL or credentials printed.");
