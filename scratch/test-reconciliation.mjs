import { execSync } from "node:child_process";

function getTestNamesFromCommit(commit) {
  const files = [
    "tests/question-bank/import/qb02-authorization-matrix.test.ts",
    "tests/question-bank/import/qb02-binary-security.test.ts",
    "tests/question-bank/import/qb02-failure-coverage.test.ts",
    "tests/question-bank/import/qb02-import-foundation.test.ts",
    "tests/question-bank/import/qb02-locale-determinism.test.ts",
    "tests/question-bank/import/qb02-mutation-suite.test.ts",
    "tests/question-bank/import/qb02-oracle-vectors.test.ts",
    "tests/question-bank/import/qb02-write-adapter.test.ts",
  ];

  const testNames = [];
  for (const f of files) {
    try {
      const content = execSync(`git show ${commit}:${f}`, { encoding: "utf8" });
      const matches = content.matchAll(/test\(\s*(["'`])(.*?)\1/g);
      for (const m of matches) {
        testNames.push(m[2]);
      }
    } catch (e) {
      console.error(`Error reading ${f} from ${commit}:`, e.message);
    }
  }
  return testNames;
}

const prevNames = getTestNamesFromCommit("f97bb41244cdad9f4d8da36480f56861768244cd");
const currNames = getTestNamesFromCommit("a3636dff4f7505074f173669931c648d89f1bf2e");

const prevSet = new Set(prevNames);
const currSet = new Set(currNames);

const removed = prevNames.filter((n) => !currSet.has(n));
const added = currNames.filter((n) => !prevSet.has(n));

console.log(`Previous total: ${prevNames.length}`);
console.log(`Current total: ${currNames.length}`);
console.log(`Removed (${removed.length}):`, removed);
console.log(`Added (${added.length}):`, added);
console.log(`Equation: ${prevNames.length} - ${removed.length} + ${added.length} = ${prevNames.length - removed.length + added.length}`);
