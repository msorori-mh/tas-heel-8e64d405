import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? walk(path)
      : /\.(?:test|spec)\.(?:[cm]?js|tsx?)$/.test(entry.name)
        ? [path]
        : [];
  });
}
const files = ["tests/student", "tests/student-audit", "tests/security", "tests/mobile"].flatMap(
  walk,
);
const vitest = files.filter((path) => /from\s+["']vitest["']/.test(readFileSync(path, "utf8")));
const node = files.filter((path) => !vitest.includes(path));
console.log(
  `Student/security/mobile inventory: ${vitest.length} Vitest files; ${node.length} Node files. No exclusions.`,
);
let failed = false;
for (const args of [
  ["node_modules/vitest/vitest.mjs", "run", "--maxWorkers=2", ...vitest],
  ["--import", "tsx", "--test", ...node],
]) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
