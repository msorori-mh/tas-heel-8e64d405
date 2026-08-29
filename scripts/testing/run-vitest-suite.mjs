import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative } from "node:path";

const roots = ["src", "tests"];
const excluded = new Set([
  // Historical 14C package whose pending migration was retired.
  "tests/import/ministerial-admin-import-14c.test.ts",
  // Superseded global-delete guard; scoped component deletion is legitimate.
  "tests/import/no-direct-curriculum-delete.test.ts",
]);

function walk(directory, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path, files);
    else if (/\.(?:test|spec)\.(?:[cm]?js|tsx?)$/.test(entry.name)) files.push(path);
  }
  return files;
}

const discovered = roots
  .flatMap((root) => walk(root))
  .map((path) => relative(process.cwd(), path).replaceAll("\\", "/"));
const vitestFiles = discovered.filter((path) => {
  if (excluded.has(path)) return false;
  return /from\s+["']vitest["']/.test(readFileSync(path, "utf8"));
});

if (vitestFiles.length === 0) {
  console.error("No maintained Vitest files were discovered.");
  process.exit(1);
}

console.log(
  `Vitest inventory: ${vitestFiles.length} maintained, ${excluded.size} documented exclusions.`,
);
const result = spawnSync(
  process.execPath,
  [
    "node_modules/vitest/vitest.mjs",
    "run",
    "--config",
    "vitest.config.ts",
    "--maxWorkers=1",
    ...vitestFiles,
  ],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
