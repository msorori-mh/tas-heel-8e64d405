import { createHash, createHmac } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { validateConnection } from "./collect-inventory.mjs";

const SOURCE = "zbdhxyuulyovihjgeqbn";
const TARGET = "yjpirilbpqxtmnayruht";
const SCHEMAS = ["public", "academy", "school_private", "lesson_question_private"];
const HEX = /^[a-f0-9]{64}$/;
const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
const hash = (value) => createHash("sha256").update(value).digest("hex");

export function parityKey(value) {
  if (!/^[a-fA-F0-9]{64}$/.test(value ?? ""))
    throw new Error("Use one private random 32-byte hex PARITY_HMAC_KEY for both snapshots");
  return Buffer.from(value, "hex");
}

// Query execution is injected only for disposable DB tests. The CLI pins both endpoints.
export async function readRowManifest(sql, project, key) {
  if (![SOURCE, TARGET].includes(project)) throw new Error("Unknown project");
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("Invalid parity key");
  const mac = (value) => createHmac("sha256", key).update(value).digest("hex");
  return sql.begin("isolation level repeatable read read only", async (tx) => {
    await tx.unsafe("SET LOCAL statement_timeout = '60s'");
    await tx.unsafe("SET LOCAL lock_timeout = '3s'");
    // Fail on an RLS-filtered read instead of comparing only a caller-visible subset.
    await tx.unsafe("SET LOCAL row_security = off");
    await tx.unsafe("SET LOCAL TimeZone = 'UTC'");
    await tx.unsafe("SET LOCAL DateStyle = 'ISO, YMD'");
    await tx.unsafe("SET LOCAL extra_float_digits = 3");
    await tx.unsafe("SET LOCAL bytea_output = 'hex'");
    const [snapshot] = await tx.unsafe(
      "select current_timestamp::text as at, pg_current_snapshot()::text as snapshot, current_setting('server_version_num') as server_version_num",
    );
    const relations = await tx.unsafe(`
      select n.nspname as schema, c.relname as name,
        coalesce((select json_agg(a.attname order by k.ordinality)
          from pg_index i cross join lateral unnest(i.indkey) with ordinality k(attnum, ordinality)
          join pg_attribute a on a.attrelid=c.oid and a.attnum=k.attnum
          where i.indrelid=c.oid and i.indisprimary and k.ordinality <= i.indnkeyatts), '[]'::json) as pk
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where c.relkind in ('r','p') and not c.relispartition and (
        n.nspname in ('public','academy','school_private','lesson_question_private')
        or (n.nspname='auth' and c.relname in ('users','identities')))
      order by n.nspname,c.relname`);
    const tables = [];
    for (const table of relations) {
      const entries = [];
      const qualified = `${quote(table.schema)}.${quote(table.name)}`;
      const pk = typeof table.pk === "string" ? JSON.parse(table.pk) : table.pk;
      if (!pk.length) {
        tables.push({
          schema: table.schema,
          name: table.name,
          pk,
          status: "NO_PRIMARY_KEY",
          entries,
        });
        continue;
      }
      const columns = pk.map((name) => `t.${quote(name)}`).join(",");
      // Cursor bounds memory used by raw rows; only opaque HMACs enter the report.
      for await (const batch of tx
        .unsafe(
          `select jsonb_build_array(${columns})::text as row_key, to_jsonb(t)::text as row_data from ${qualified} t`,
        )
        .cursor(16)) {
        for (const row of batch) {
          const context = JSON.stringify([table.schema, table.name]);
          entries.push([
            mac(context + "\nkey\n" + row.row_key),
            mac(context + "\nrow\n" + row.row_data),
          ]);
        }
      }
      entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      tables.push({ schema: table.schema, name: table.name, pk, status: "HASHED", entries });
    }
    return {
      schema: 1,
      kind: "TAMKEEN_KEYED_ROW_MANIFEST",
      project,
      keyFingerprint: hash(key),
      snapshot,
      tables,
      limits: [
        "Independent read-only snapshots, not a cross-project atomic snapshot or write freeze",
        "Application base tables plus auth.users/auth.identities only; no sessions, storage bytes or platform tables",
        "No schema, sequence, permission, backup restoration, file access or device acceptance proof",
        "No-primary-key tables block comparison; no data or ownership changes performed",
      ],
    };
  });
}

function checkedTables(report, project) {
  if (
    report?.schema !== 1 ||
    report.kind !== "TAMKEEN_KEYED_ROW_MANIFEST" ||
    report.project !== project ||
    !HEX.test(report.keyFingerprint) ||
    !Number.isFinite(Date.parse(report.snapshot?.at)) ||
    !Array.isArray(report.tables)
  )
    throw new Error("Invalid row manifest");
  const tables = new Map();
  for (const table of report.tables) {
    const id = JSON.stringify([table.schema, table.name]);
    if (
      (!SCHEMAS.includes(table.schema) &&
        !(table.schema === "auth" && ["users", "identities"].includes(table.name))) ||
      typeof table.name !== "string" ||
      tables.has(id) ||
      !Array.isArray(table.pk) ||
      table.pk.some((k) => typeof k !== "string") ||
      !Array.isArray(table.entries) ||
      !["HASHED", "NO_PRIMARY_KEY"].includes(table.status) ||
      (table.status === "HASHED" && !table.pk.length) ||
      (table.status === "NO_PRIMARY_KEY" && (table.pk.length || table.entries.length))
    )
      throw new Error("Invalid table manifest");
    const entries = new Map();
    for (const entry of table.entries) {
      if (
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        !entry.every((x) => typeof x === "string" && HEX.test(x)) ||
        entries.has(entry[0])
      )
        throw new Error("Invalid or duplicate row fingerprint");
      entries.set(entry[0], entry[1]);
    }
    tables.set(id, { ...table, entries });
  }
  if (
    !["users", "identities"].every((name) => tables.has(JSON.stringify(["auth", name]))) ||
    !report.tables.some((t) => SCHEMAS.includes(t.schema))
  )
    throw new Error("Missing required comparison scope");
  return tables;
}

export function compareRowManifests(source, target) {
  const left = checkedTables(source, SOURCE),
    right = checkedTables(target, TARGET);
  if (source.keyFingerprint !== target.keyFingerprint) throw new Error("Different parity keys");
  const tables = [];
  for (const id of [...new Set([...left.keys(), ...right.keys()])].sort()) {
    const a = left.get(id),
      b = right.get(id);
    const [schema, name] = JSON.parse(id);
    if (
      !a ||
      !b ||
      a.status !== "HASHED" ||
      b.status !== "HASHED" ||
      JSON.stringify(a.pk) !== JSON.stringify(b.pk)
    ) {
      tables.push({ schema, name, status: "BLOCKED_TABLE_SCOPE_OR_PRIMARY_KEY" });
      continue;
    }
    let missingOnTarget = 0,
      targetOnly = 0,
      changed = 0;
    for (const [key, value] of a.entries) {
      if (!b.entries.has(key)) missingOnTarget++;
      else if (b.entries.get(key) !== value) changed++;
    }
    for (const key of b.entries.keys()) if (!a.entries.has(key)) targetOnly++;
    tables.push({
      schema,
      name,
      sourceRows: a.entries.size,
      targetRows: b.entries.size,
      missingOnTarget,
      targetOnly,
      changed,
      status: missingOnTarget || targetOnly || changed ? "DIFFERENT" : "MATCH",
    });
  }
  return {
    schema: 1,
    status: tables.every((t) => t.status === "MATCH")
      ? "ROWS_MATCH_NOT_CUTOVER_CLEARANCE"
      : "HOLD_ROW_DIFFERENCES_OR_SCOPE",
    sourceSnapshot: source.snapshot,
    targetSnapshot: target.snapshot,
    comparedAt: new Date().toISOString(),
    tables,
    cutoverAllowed: false,
    limits: [
      "No automatic upsert, deletion or ownership reassignment",
      "Requires schema/security/storage checks and reconciliation under controlled write freeze",
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [mode, first, second, output] = process.argv.slice(2);
    let report;
    if (mode === "collect" && first && second && !output) {
      const connection = validateConnection(process.env.DATABASE_URL, first);
      const key = parityKey(process.env.PARITY_HMAC_KEY);
      const sql = postgres(connection, {
        max: 1,
        prepare: false,
        connect_timeout: 20,
        ssl: {
          rejectUnauthorized: true,
          ...(process.env.PGSSLROOTCERT
            ? { ca: readFileSync(process.env.PGSSLROOTCERT, "utf8") }
            : {}),
        },
        onnotice: () => {},
      });
      try {
        report = await readRowManifest(sql, first, key);
      } finally {
        await sql.end({ timeout: 5 });
      }
      writeFileSync(second, JSON.stringify(report) + "\n", { flag: "wx", mode: 0o600 });
      console.log("READ_ONLY_ROW_MANIFEST_READY", first, report.tables.length);
    } else if (mode === "compare" && first && second && output) {
      report = compareRowManifests(
        JSON.parse(readFileSync(first, "utf8")),
        JSON.parse(readFileSync(second, "utf8")),
      );
      writeFileSync(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx", mode: 0o600 });
      console.log(report.status);
      if (report.status !== "ROWS_MATCH_NOT_CUTOVER_CLEARANCE") process.exitCode = 2;
    } else throw new Error("Invalid arguments");
  } catch {
    // Never log row contents, credentials, SQL errors or private connection strings.
    console.error(
      "ROW_PARITY_STOPPED: check arguments, private environment, access and report schema",
    );
    process.exitCode = 1;
  }
}
