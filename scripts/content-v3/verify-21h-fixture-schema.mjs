import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const migrationRoot = path.join(root, "supabase", "migrations");
const fixturePath = path.join(here, "pg17-21h-canonical-fixture.sql");
const tables = ["lessons", "questions", "lesson_assessments", "practice_attempts", "practice_attempt_questions"];

function collectColumns(sql, table) {
  const create = new RegExp(
    `CREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+public\\.${table}\\s*\\(([\\s\\S]*?)\\n\\);`,
    "i",
  ).exec(sql);
  if (!create) throw new Error(`canonical CREATE TABLE not found: ${table}`);
  const columns = new Set();
  const definitions = [];
  let depth = 0;
  let current = "";
  for (const character of create[1]) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      definitions.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  definitions.push(current);
  for (const definition of definitions) {
    const match = /^\s*([a-z_][a-z0-9_]*)\s+/i.exec(definition);
    if (match && !new Set(["primary", "unique", "check", "constraint", "foreign"]).has(match[1].toLowerCase())) {
      columns.add(match[1].toLowerCase());
    }
  }
  const addColumn = new RegExp(
    `ALTER\\s+TABLE\\s+public\\.${table}\\s+ADD\\s+COLUMN(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+([a-z_][a-z0-9_]*)`,
    "ig",
  );
  for (const match of sql.matchAll(addColumn)) columns.add(match[1].toLowerCase());
  return columns;
}

const canonicalSql = fs
  .readdirSync(migrationRoot)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => fs.readFileSync(path.join(migrationRoot, name), "utf8"))
  .join("\n");
const fixtureSql = fs.readFileSync(fixturePath, "utf8");

const canonical = new Map(tables.map((table) => [table, collectColumns(canonicalSql, table)]));
const fixture = new Map(tables.map((table) => [table, collectColumns(fixtureSql, table)]));

for (const table of tables) {
  const extras = [...fixture.get(table)].filter((column) => !canonical.get(table).has(column));
  if (extras.length) throw new Error(`FIXTURE_SCHEMA_MATCH=FAIL table=${table} extra_columns=${extras.join(",")}`);
}

if (fixture.get("practice_attempts").has("lesson_id")) {
  throw new Error("FIXTURE_SCHEMA_MATCH=FAIL practice_attempts.lesson_id is not canonical");
}
if (canonical.get("practice_attempts").has("lesson_id")) {
  throw new Error("CANONICAL_SCHEMA_MATCH=FAIL practice_attempts.lesson_id unexpectedly exists");
}

for (const table of tables) {
  console.log(`${table.toUpperCase()}_COLUMNS=${[...canonical.get(table)].sort().join(",")}`);
}
console.log("LESSON_ID_PRESENT=NO");
console.log("FIXTURE_SCHEMA_MATCH=PASS");
