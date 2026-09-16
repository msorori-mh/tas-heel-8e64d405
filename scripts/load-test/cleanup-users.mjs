/** Generate a transaction from a frozen TEST_ONLY manifest; never discover deletion targets at execution. */
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { STAGING } from "./student-journey.mjs";

export function cleanupSql(manifest) {
  const { project, run, users, expectedCount } = manifest;
  if (project !== STAGING || !/^[a-z0-9]{8,32}$/.test(run ?? ""))
    throw Error("STAGING_MANIFEST_REQUIRED");
  if (
    !Array.isArray(users) ||
    !Number.isInteger(expectedCount) ||
    expectedCount < 1 ||
    expectedCount > 10000 ||
    users.length !== expectedCount
  )
    throw Error("MANIFEST_COUNT_MISMATCH");
  const ids = new Set();
  for (const user of users) {
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(user.id ?? "") ||
      !new RegExp(`^${run}\\.[1-9][0-9]*@load\\.test\\.invalid$`).test(user.email ?? "") ||
      ids.has(user.id)
    )
      throw Error("INVALID_MANIFEST_IDENTITY");
    ids.add(user.id);
  }
  return `-- Run ONLY on ${STAGING}, AFTER its capacity runner has stopped.
BEGIN;
CREATE TEMP TABLE capacity_cleanup_ids(id uuid PRIMARY KEY,email text UNIQUE) ON COMMIT DROP;
INSERT INTO capacity_cleanup_ids VALUES
${users.map((u) => `('${u.id}','${u.email}')`).join(",\n")};
DO $$ BEGIN
  IF (SELECT count(*) FROM auth.users WHERE raw_app_meta_data->>'capacity_run'='${run}') <> ${expectedCount}
     OR (SELECT count(*) FROM auth.users u JOIN capacity_cleanup_ids t ON t.id=u.id AND t.email=u.email
         WHERE u.raw_app_meta_data->>'capacity_run'='${run}' AND u.raw_app_meta_data->>'test_only'='true') <> ${expectedCount}
  THEN RAISE EXCEPTION 'CLEANUP_SCOPE_CHANGED'; END IF;
END $$;
CREATE TEMP TABLE capacity_retained_users ON COMMIT DROP AS
SELECT id,md5(to_jsonb(u)::text) fingerprint FROM auth.users u
WHERE NOT EXISTS(SELECT 1 FROM capacity_cleanup_ids t WHERE t.id=u.id);
DELETE FROM auth.sessions s USING capacity_cleanup_ids t WHERE s.user_id=t.id;
DELETE FROM auth.users u USING capacity_cleanup_ids t WHERE u.id=t.id AND u.email=t.email
  AND u.raw_app_meta_data->>'capacity_run'='${run}' AND u.raw_app_meta_data->>'test_only'='true';
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM auth.users u JOIN capacity_cleanup_ids t ON u.id=t.id)
     OR EXISTS(SELECT 1 FROM auth.sessions s JOIN capacity_cleanup_ids t ON s.user_id=t.id)
     OR EXISTS(SELECT 1 FROM public.profiles p JOIN capacity_cleanup_ids t ON p.user_id=t.id)
     OR EXISTS(SELECT 1 FROM public.user_progress p JOIN capacity_cleanup_ids t ON p.user_id=t.id)
     OR EXISTS(SELECT 1 FROM public.exam_sessions e JOIN capacity_cleanup_ids t ON e.user_id=t.id)
     OR EXISTS(SELECT 1 FROM public.offline_learning_mutations m JOIN capacity_cleanup_ids t ON m.user_id=t.id)
  THEN RAISE EXCEPTION 'CLEANUP_INCOMPLETE'; END IF;
  IF EXISTS(SELECT 1 FROM capacity_retained_users r LEFT JOIN auth.users u ON u.id=r.id
            WHERE u.id IS NULL OR md5(to_jsonb(u)::text) <> r.fingerprint)
  THEN RAISE EXCEPTION 'RETAINED_USER_CHANGED'; END IF;
END $$;
SELECT ${expectedCount} AS test_users_removed,(SELECT count(*) FROM capacity_retained_users) AS retained_users_verified;
COMMIT;
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [manifestPath, outputPath] = process.argv.slice(2);
  if (!manifestPath || !outputPath)
    throw Error("Usage: cleanup-users.mjs private-manifest private-output.sql");
  await writeFile(outputPath, cleanupSql(JSON.parse(await readFile(manifestPath))), {
    mode: 0o600,
    flag: "wx",
  });
  console.log("Scoped cleanup transaction written; identities not printed.");
}
