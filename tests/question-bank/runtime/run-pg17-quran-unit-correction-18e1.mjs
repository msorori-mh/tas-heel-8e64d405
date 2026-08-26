#!/usr/bin/env node
/** PG17 isolated rehearsal for the 18E1 Quran unit-model correction. */
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const migPath = join(
  root,
  "supabase",
  "migrations-pending",
  "20260820020000_quran_unit_model_correction_18e1.sql",
);

const dataDir = mkdtempSync(join(tmpdir(), "pg17-18e1u-"));
const sock = mkdtempSync(join(tmpdir(), "pg17-socku-"));
const env = {
  ...process.env,
  PGDATA: dataDir,
  PGHOST: sock,
  PGPORT: "55433",
  PGUSER: "postgres",
  PGDATABASE: "postgres",
  PGPASSWORD: "",
};
const run = (c, a) => {
  const r = spawnSync(c, a, { encoding: "utf8", env });
  if (r.status !== 0) throw new Error(`${c}: ${r.stderr || r.stdout}`);
  return r.stdout;
};
const q = (sql) =>
  spawnSync("psql", ["-v", "ON_ERROR_STOP=1", "-Atc", sql], { encoding: "utf8", env });
const one = (sql) => q(sql).stdout.trim().split("\n")[0].trim();

let started = false;
try {
  run("initdb", ["-U", "postgres", "--auth=trust"]);
  run("pg_ctl", [
    "-w",
    "-o",
    `-k ${sock} -p 55433 -c listen_addresses=`,
    "-l",
    join(dataDir, "log"),
    "start",
  ]);
  started = true;

  const SUBJ = "1234e882-b0b2-499a-bd66-f91f480e1081";
  let r = q(`
    create table subjects (id uuid primary key);
    create table units (id uuid primary key default gen_random_uuid(), subject_id uuid not null references subjects(id), title text not null, sort_order int not null);
    create table lessons (id uuid primary key default gen_random_uuid(), subject_id uuid not null references subjects(id), unit_id uuid references units(id), slug text not null, sort_order int not null);
    create table unit_practice_attempts (id serial primary key, unit_id uuid references units(id));
    create table practice_attempts (id serial primary key, unit_id uuid references units(id));
    create table exam_templates (id serial primary key, unit_id uuid references units(id));
    create table question_targets (id serial primary key, unit_id uuid references units(id));
    insert into subjects values ('${SUBJ}');
    insert into units (subject_id, title, sort_order)
      select '${SUBJ}', 'u'||g, g from generate_series(1,6) g;
    insert into lessons (subject_id, unit_id, slug, sort_order)
      select '${SUBJ}', (select id from units order by sort_order limit 1 offset (g-1)%6), 'lesson-'||g, g
      from generate_series(1,40) g;
  `);
  if (r.status !== 0) throw new Error(r.stderr);

  const slugsBefore = one(
    `select md5(string_agg(slug||':'||sort_order, ',' order by slug)) from lessons`,
  );

  r = spawnSync("psql", ["-v", "ON_ERROR_STOP=1", "-f", migPath], { encoding: "utf8", env });
  const out = [];
  const check = (name, got, want) =>
    out.push(
      `${String(got) === String(want) ? "OK  " : "FAIL"}  ${name.padEnd(34)} got=${got} want=${want}`,
    );

  check("migration applies", r.status, 0);
  if (r.status !== 0) console.error(r.stderr);
  check("QURAN_LESSONS", one("select count(*) from lessons"), 40);
  check("UNIT_ID_NULL", one("select count(*) from lessons where unit_id is null"), 40);
  check("QURAN_UNITS", one("select count(*) from units"), 0);
  check(
    "LESSON_CODES_CHANGED",
    one(
      `select case when md5(string_agg(slug||':'||sort_order, ',' order by slug)) = '${slugsBefore}' then 0 else 1 end from lessons`,
    ),
    0,
  );

  // Guard rehearsal: a dependent row must abort the correction.
  q(
    "insert into units (id, subject_id, title, sort_order) select gen_random_uuid(), '" +
      SUBJ +
      "', 'u'||g, g from generate_series(1,6) g",
  );
  q("update lessons set unit_id = (select id from units order by sort_order limit 1)");
  q("insert into unit_practice_attempts (unit_id) select id from units limit 1");
  const guarded = spawnSync("psql", ["-v", "ON_ERROR_STOP=1", "-f", migPath], {
    encoding: "utf8",
    env,
  });
  check("aborts when dependents exist", guarded.status === 0 ? "applied" : "aborted", "aborted");
  check("no lessons lost after abort", one("select count(*) from lessons"), 40);

  console.log(out.join("\n"));
  const failures = out.filter((l) => l.startsWith("FAIL")).length;
  console.log(
    failures === 0 ? "\nPG17_18E1_UNITS = PASS" : `\nPG17_18E1_UNITS = FAIL (${failures})`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
} finally {
  if (started) spawnSync("pg_ctl", ["-w", "-m", "immediate", "stop"], { encoding: "utf8", env });
}
