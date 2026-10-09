import postgres from "postgres";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const PROJECTS = new Set(["yjpirilbpqxtmnayruht", "zbdhxyuulyovihjgeqbn"]);
export function validateConnection(value, project) {
  if (!PROJECTS.has(project)) throw new Error("Unknown migration project");
  const url = new URL(value);
  const direct = url.hostname === `db.${project}.supabase.co` && url.username === "postgres";
  const pooled =
    /(^|\.)pooler\.supabase\.com$/.test(url.hostname) &&
    decodeURIComponent(url.username) === `postgres.${project}`;
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    (!direct && !pooled) ||
    url.pathname !== "/postgres" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Connection does not match the selected project");
  }
  return value;
}

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function collectInventory(connection, project) {
  validateConnection(connection, project);
  const sql = postgres(connection, {
    max: 1,
    connect_timeout: 20,
    prepare: false,
    ssl: {
      rejectUnauthorized: true,
      ...(process.env.PGSSLROOTCERT ? { ca: readFileSync(process.env.PGSSLROOTCERT, "utf8") } : {}),
    },
    onnotice: () => {},
  });
  try {
    return await readInventory(sql, project);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Exported for disposable-database integration tests. The CLI always validates its project.
export async function readInventory(sql, project) {
  return await sql.begin("isolation level repeatable read read only", async (tx) => {
    await tx`SET LOCAL statement_timeout = '30s'`;
    await tx`SET LOCAL lock_timeout = '3s'`;
    const [snapshot] =
      await tx`select current_timestamp::text as at, pg_current_snapshot()::text as snapshot`;
    const relations = await tx`select schemaname, tablename from pg_catalog.pg_tables
        where schemaname in ('public','academy','school_private','lesson_question_private','auth','storage')
        order by schemaname, tablename`;
    const tables = [];
    for (const row of relations) {
      const [count] =
        await tx`select count(*)::text as rows from ${tx(row.schemaname)}.${tx(row.tablename)}`;
      tables.push({ schema: row.schemaname, table: row.tablename, rows: count.rows });
    }
    const columns =
      await tx`select table_schema,table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default
        from information_schema.columns where table_schema in ('public','academy','school_private','lesson_question_private')
        order by table_schema,table_name,ordinal_position`;
    const functions =
      await tx`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args,
        pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname in ('public','academy','school_private','lesson_question_private') and p.prokind in ('f','p')
        order by n.nspname,p.proname,args`;
    const policies =
      await tx`select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
        from pg_policies where schemaname in ('public','academy','school_private','lesson_question_private','storage')
        order by schemaname,tablename,policyname`;
    const rls =
      await tx`select n.nspname as schema,c.relname as table,c.relrowsecurity as enabled,c.relforcerowsecurity as forced
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname in ('public','academy','school_private','lesson_question_private','storage') and c.relkind in ('r','p')
        order by n.nspname,c.relname`;
    const buckets =
      await tx`select id,public,file_size_limit,allowed_mime_types from storage.buckets order by id`;
    const ownership = await tx`select o.bucket_id,count(*)::text as objects,
        count(*) filter(where o.owner_id is null or o.owner_id='')::text as without_owner,
        count(*) filter(where o.owner_id is not null and o.owner_id<>'' and u.id is null)::text as missing_owner_accounts
        from storage.objects o left join auth.users u on u.id::text=o.owner_id
        group by o.bucket_id order by o.bucket_id`;
    const [ledger] =
      await tx`select to_regclass('supabase_migrations.schema_migrations') is not null as present`;
    const migrations = ledger.present
      ? await tx`select version from supabase_migrations.schema_migrations order by version`
      : null;
    return {
      schema: 1,
      status: "READ_ONLY_INVENTORY_NOT_PARITY_PROOF",
      project,
      snapshot,
      tables,
      schemaHashes: {
        columns: hash(columns),
        functions: hash(functions),
        policies: hash(policies),
      },
      rls,
      buckets,
      ownership,
      migrations,
      limits: [
        "No row contents or file bytes compared",
        "Counts do not prove parity",
        "Source and target snapshots are not simultaneous",
        "No ownership or data changes performed",
      ],
    };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [project, output] = process.argv.slice(2);
  if (!project || !output || !process.env.DATABASE_URL) {
    console.error(
      "Usage: DATABASE_URL=<private connection> node scripts/independent/collect-inventory.mjs <project-ref> <output.json>",
    );
    process.exitCode = 2;
  } else {
    try {
      const result = await collectInventory(process.env.DATABASE_URL, project);
      writeFileSync(output, JSON.stringify(result, null, 2) + "\n", { flag: "wx", mode: 0o600 });
      console.log("READ_ONLY_INVENTORY_READY", project, result.tables.length);
    } catch (error) {
      // Never print a URL, credentials, query parameters, or server error detail.
      console.error(
        "INVENTORY_STOPPED",
        /^[A-Z0-9]{5}$/.test(error?.code ?? "") ? error.code : "CHECK_ACCESS_OR_CONFIGURATION",
      );
      process.exitCode = 1;
    }
  }
}
