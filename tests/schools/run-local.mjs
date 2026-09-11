import { readFile } from "node:fs/promises";
// Temporary local engine only. CI also replays these SQL files on PostgreSQL 17.
const { PGlite } = await import(process.env.SCHOOL_PGLITE_MODULE);
const db = new PGlite();
try {
  for (const file of [
    "tests/schools/fixture.sql",
    "supabase/migrations/20260911171430_school_directory_review.sql",
    // Replay in migration order: the new teacher wrapper must survive fresh installs.
    "supabase/migrations/20260916010000_academy_teacher_profile_save_rpc.sql",
    "tests/schools/directory.sql",
  ]) {
    await db.exec(await readFile(file, "utf8"));
    console.log(`PASS ${file}`);
  }
  console.log((await db.query("select count(*) as passed_checks from school_test.checks")).rows);
} catch (error) {
  console.error(
    JSON.stringify(
      {
        message: error.message,
        code: error.code,
        detail: error.detail,
        where: error.where,
        position: error.position,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await db.close();
}
