#!/usr/bin/env node
/**
 * MIGRATION_DELIVERY_01 — which repository migrations has production never run?
 *
 * There is no automated migration deployment in this repository: no workflow in
 * .github/workflows contains a deploy step, and migrations reach the database only
 * when a human replays them through Lovable. The result is silent, unbounded drift —
 * at the time this was written, 56 of 194 migration files had never been applied,
 * including the database half of a merged pull request.
 *
 * This script does not fix that. It makes it visible and turns "apply the backlog"
 * into a mechanical, ordered list instead of an archaeology exercise.
 *
 * USAGE
 *   1. Ask the database for what it has actually run:
 *
 *        SELECT string_agg(version, ',' ORDER BY version)
 *        FROM supabase_migrations.schema_migrations;
 *
 *   2. Feed that list in, either way:
 *
 *        node scripts/migrations/unapplied-report.mjs --applied "20260606003615,20260606003841,..."
 *        node scripts/migrations/unapplied-report.mjs --applied-file applied.txt
 *
 * EXIT CODES
 *   0  nothing outstanding
 *   1  at least one migration has never been applied
 *   2  bad usage
 *
 * The exit code makes this usable as a release gate later, once someone decides the
 * backlog is expected to stay empty.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const MIGRATION_DIRS = ["supabase/migrations", "supabase/migrations-pending"];

/** Lovable records some migrations a second or two off the filename timestamp. */
const CLOCK_SKEW_SECONDS = 3;

/**
 * Pure planner, exported for tests: which repository migrations are missing from the
 * applied set, and which only *look* missing because of the recording skew above.
 */
/**
 * A version is YYYYMMDDHHMMSS, so "one second earlier" is not "one less". Subtracting
 * numerically works inside a minute and breaks across every boundary — 20260101000000
 * minus one is not 20260100595959. Compare real instants instead.
 */
function toEpochSeconds(version) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(version);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) / 1000;
}

export function planUnapplied(repoFiles, appliedVersions) {
  const applied = new Set(appliedVersions);
  const appliedByInstant = new Map();
  for (const version of applied) {
    const seconds = toEpochSeconds(version);
    if (seconds !== null) appliedByInstant.set(seconds, version);
  }
  const nearby = (version) => {
    const seconds = toEpochSeconds(version);
    if (seconds === null) return null;
    for (let delta = -CLOCK_SKEW_SECONDS; delta <= CLOCK_SKEW_SECONDS; delta += 1) {
      const hit = appliedByInstant.get(seconds + delta);
      if (hit) return hit;
    }
    return null;
  };

  const outstanding = [];
  const skewed = [];
  for (const file of repoFiles) {
    if (applied.has(file.version)) continue;
    const match = nearby(file.version);
    if (match) skewed.push({ ...file, appliedAs: match });
    else outstanding.push(file);
  }
  outstanding.sort((a, b) => a.version.localeCompare(b.version));
  return { outstanding, skewed };
}

export function readRepoMigrations(root = process.cwd()) {
  const files = [];
  for (const dir of MIGRATION_DIRS) {
    const absolute = join(root, dir);
    if (!existsSync(absolute)) continue;
    for (const name of readdirSync(absolute)) {
      if (!name.endsWith(".sql")) continue;
      files.push({ dir, file: name, version: name.slice(0, 14), path: `${dir}/${name}` });
    }
  }
  return files;
}

function parseArgs(argv) {
  const args = { applied: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--applied") args.applied = argv[++i];
    else if (argv[i] === "--applied-file") args.applied = readFileSync(argv[++i], "utf8");
  }
  return args;
}

function main() {
  const { applied } = parseArgs(process.argv.slice(2));
  if (!applied) {
    console.error("usage: unapplied-report.mjs --applied <csv> | --applied-file <path>");
    console.error("       get the list from supabase_migrations.schema_migrations (see header)");
    process.exit(2);
  }

  const appliedVersions = applied
    .split(/[\s,]+/)
    .map((v) => v.trim())
    .filter(Boolean);
  const repoFiles = readRepoMigrations();
  const { outstanding, skewed } = planUnapplied(repoFiles, appliedVersions);

  console.log(`repository migrations .... ${repoFiles.length}`);
  console.log(`recorded as applied ...... ${appliedVersions.length}`);
  console.log(`recorded within ±${CLOCK_SKEW_SECONDS}s ...... ${skewed.length}  (not drift)`);
  console.log(`NEVER APPLIED ............ ${outstanding.length}`);

  if (outstanding.length === 0) {
    console.log("\nNothing outstanding. Production has run every migration in the repository.");
    return 0;
  }

  console.log("\nApply in this order:\n");
  for (const item of outstanding) console.log(`  ${item.path}`);
  console.log(
    "\nA file listed here is code that was reviewed, merged and never reached a database.\n" +
      "Applying it is a production change: read the file first, and apply the oldest first.",
  );
  return 1;
}

// pathToFileURL, not string surgery: a hand-built file:// prefix misses the third slash
// on Windows, and the script then silently does nothing when run directly.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
