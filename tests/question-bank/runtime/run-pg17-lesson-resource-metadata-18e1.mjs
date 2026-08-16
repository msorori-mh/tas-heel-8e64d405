#!/usr/bin/env node
/**
 * PG17 isolated verification for 18E1 metadata contract migration.
 * Spins a disposable local PostgreSQL 17 cluster (no docker, no remote link).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const migration = join(
  root,
  "supabase",
  "migrations-pending",
  "20260820010000_lesson_resource_upload_metadata_keys_18e1.sql",
);
if (!existsSync(migration)) {
  const applied = join(root, "supabase", "migrations", "20260820010000_lesson_resource_upload_metadata_keys_18e1.sql");
  if (!existsSync(applied)) throw new Error("migration file missing");
}
const migPath = existsSync(migration)
  ? migration
  : join(root, "supabase", "migrations", "20260820010000_lesson_resource_upload_metadata_keys_18e1.sql");

const dataDir = mkdtempSync(join(tmpdir(), "pg17-18e1-"));
const sock = mkdtempSync(join(tmpdir(), "pg17-sock-"));
const env = { ...process.env, PGDATA: dataDir, PGHOST: sock, PGPORT: "55432", PGUSER: "postgres", PGDATABASE: "postgres", PGPASSWORD: "" };

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", env, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${r.stderr || r.stdout}`);
  return r.stdout;
}
function psql(sql) {
  return spawnSync("psql", ["-v", "ON_ERROR_STOP=1", "-Atc", sql], { encoding: "utf8", env });
}

let started = false;
const results = [];
try {
  run("initdb", ["-U", "postgres", "--auth=trust"]);
  run("pg_ctl", ["-w", "-o", `-k ${sock} -p 55432 -c listen_addresses=`, "-l", join(dataDir, "log"), "start"]);
  started = true;

  // Minimal schema mirroring the production shape used by the validator.
  const setup = `
    create table lessons (id uuid primary key default gen_random_uuid());
    create table lesson_resources (
      id uuid primary key default gen_random_uuid(),
      lesson_id uuid not null references lessons(id) on delete cascade,
      title text not null,
      resource_type text not null,
      url text not null,
      sort_order int not null default 0,
      is_primary boolean not null default false,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `;
  let r = psql(setup);
  if (r.status !== 0) throw new Error(r.stderr);

  r = spawnSync("psql", ["-v", "ON_ERROR_STOP=1", "-f", migPath], { encoding: "utf8", env });
  if (r.status !== 0) throw new Error("migration failed on PG17: " + r.stderr);

  r = psql(`create trigger trg_validate_lesson_resource_metadata
    before insert or update on lesson_resources
    for each row execute function public.validate_lesson_resource_metadata();`);
  if (r.status !== 0) throw new Error(r.stderr);

  const lesson = psql("insert into lessons default values returning id").stdout.trim();
  const obj = "11111111-1111-4111-8111-111111111111";
  const base = {
    source: "direct_upload",
    bucket: "lesson-pdfs",
    path: `${lesson}/${obj}.pdf`,
    file_name: "lesson.pdf",
    file_size: 12345,
    uploaded_at: new Date().toISOString(),
    version: "abc123def",
  };
  const ins = (meta) =>
    psql(
      `insert into lesson_resources (lesson_id, title, resource_type, url, metadata) values ('${lesson}','t','pdf','lesson-pdfs/x', $j$${JSON.stringify(meta)}$j$::jsonb)`,
    );

  const cases = [
    ["approved 18D metadata", base, "PASS"],
    ["unknown metadata key", { ...base, evil: 1 }, "DENY"],
    ["invalid bucket", { ...base, bucket: "public" }, "DENY"],
    ["invalid path", { ...base, path: "../secret.pdf" }, "DENY"],
    ["path of another lesson", { ...base, path: `${obj}/${obj}.pdf` }, "DENY"],
    ["zero file_size", { ...base, file_size: 0 }, "DENY"],
    ["negative file_size", { ...base, file_size: -5 }, "DENY"],
    ["string file_size", { ...base, file_size: "12345" }, "DENY"],
    ["invalid uploaded_at", { ...base, uploaded_at: "not-a-date" }, "DENY"],
    ["numeric uploaded_at", { ...base, uploaded_at: 1712345 }, "DENY"],
    ["invalid version shape", { ...base, version: "BAD SHAPE!" }, "DENY"],
    ["numeric version", { ...base, version: 42 }, "DENY"],
    ["unknown source", { ...base, source: "google_drive" }, "DENY"],
    ["legacy metadata (no source)", { resource_format: "pdf", notes: "legacy" }, "PASS"],
  ];

  let failures = 0;
  for (const [name, meta, expect] of cases) {
    const res = ins(meta);
    const got = res.status === 0 ? "PASS" : "DENY";
    const ok = got === expect;
    if (!ok) failures++;
    results.push(`${ok ? "OK  " : "FAIL"}  ${name.padEnd(30)} expected=${expect} got=${got}`);
    if (res.status === 0) psql("delete from lesson_resources");
  }
  console.log(results.join("\n"));
  console.log(failures === 0 ? "\nPG17_18E1 = PASS" : `\nPG17_18E1 = FAIL (${failures})`);
  process.exitCode = failures === 0 ? 0 : 1;
} finally {
  if (started) spawnSync("pg_ctl", ["-w", "-m", "immediate", "stop"], { encoding: "utf8", env });
}
