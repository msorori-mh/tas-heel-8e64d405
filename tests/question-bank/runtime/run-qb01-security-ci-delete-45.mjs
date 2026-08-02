#!/usr/bin/env node
/**
 * Local-only runner for QB01 security/CI/delete dynamic SQL harness.
 * Refuses non-local DATABASE_URL / Supabase DB hosts.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..", "..");
const sqlPath = join(__dirname, "qb01-security-ci-delete-45.sql");

function assertLocalHost(urlOrHost) {
  const raw = String(urlOrHost || "");
  const hostMatch = raw.match(/@([^:/]+)/) || raw.match(/^([^:/]+)/);
  const host = (hostMatch?.[1] || raw).toLowerCase();
  const allowed = new Set(["127.0.0.1", "localhost", "::1"]);
  if (!allowed.has(host)) {
    console.error(`REFUSED: non-local database host "${host}"`);
    process.exit(2);
  }
}

function supabaseStatusDbUrl() {
  const out = spawnSync("npx", ["supabase", "status", "-o", "env"], {
    cwd: root,
    encoding: "utf8",
    shell: true,
  });
  if (out.status !== 0) {
    console.error(out.stderr || out.stdout || "supabase status failed");
    process.exit(1);
  }
  const m = out.stdout.match(/^DB_URL=(.+)$/m);
  if (!m) {
    console.error("DB_URL not found in supabase status");
    process.exit(1);
  }
  return m[1].trim().replace(/^"|"$/g, "");
}

function projectRefLinked() {
  return existsSync(join(root, "supabase", ".temp", "project-ref"));
}

if (projectRefLinked()) {
  console.error("REFUSED: supabase/.temp/project-ref present (remote link)");
  process.exit(2);
}

const dbUrl = process.env.QB01_LOCAL_DB_URL || supabaseStatusDbUrl();
assertLocalHost(dbUrl);

const container =
  process.env.QB01_LOCAL_DB_CONTAINER ||
  (() => {
    const ps = spawnSync(
      "docker",
      ["ps", "--format", "{{.Names}}", "--filter", "name=supabase_db_"],
      { encoding: "utf8", shell: true },
    );
    const name = (ps.stdout || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean);
    return name;
  })();

if (!container) {
  console.error("No local supabase_db container found");
  process.exit(1);
}

if (!existsSync(sqlPath)) {
  console.error(`missing harness: ${sqlPath}`);
  process.exit(1);
}

const sql = readFileSync(sqlPath, "utf8");
const run = spawnSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], {
  input: sql,
  encoding: "utf8",
  shell: true,
  maxBuffer: 10 * 1024 * 1024,
});

process.stdout.write(run.stdout || "");
process.stderr.write(run.stderr || "");

if (run.status !== 0) {
  process.exit(run.status ?? 1);
}

if (!/FAIL\s+\|\s+\d+/i.test(run.stdout || "") && /PASS\s+\|\s+\d+/i.test(run.stdout || "")) {
  const failLine = (run.stdout || "").match(/^\s*FAIL\s+\|\s+(\d+)/m);
  if (failLine && Number(failLine[1]) > 0) {
    console.error("Dynamic harness reported FAIL rows");
    process.exit(1);
  }
}

const grouped = [...(run.stdout || "").matchAll(/^\s*(PASS|FAIL)\s+\|\s+(\d+)\s*$/gm)];
let pass = 0;
let fail = 0;
for (const m of grouped) {
  if (m[1] === "PASS") pass = Number(m[2]);
  if (m[1] === "FAIL") fail = Number(m[2]);
}
if (fail > 0 || pass === 0) {
  console.error(`Dynamic harness incomplete: PASS=${pass} FAIL=${fail}`);
  process.exit(1);
}

console.log(`OK: qb01-security-ci-delete-45 dynamic harness PASS=${pass}`);
