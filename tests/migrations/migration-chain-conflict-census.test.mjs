import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  auditMigrationDirectory,
  detectGraphCycles,
  parseMigrationText,
  readReplayEvidence,
  stripCommentsAndSplit,
  writeAuditReports,
} from '../../scripts/audit-migration-chain.mjs';

const root = resolve(import.meta.dirname, '../..');
const migrations = resolve(root, 'supabase/migrations');
const fixtures = resolve(root, 'tests/fixtures/migration-audit');
const sqlFiles = (dir) => readdirSync(dir).filter((x) => x.endsWith('.sql')).sort();
const directoryHash = (dir) => createHash('sha256').update(sqlFiles(dir).map((name) => `${name}\0${readFileSync(join(dir, name))}`).join('\0')).digest('hex');

test('linter runs successfully and does not mutate production migrations', () => {
  const before = directoryHash(migrations);
  const output = execFileSync(process.execPath, ['scripts/audit-migration-chain.mjs'], { cwd: root, encoding: 'utf8' });
  assert.match(output, /"migrations":\d+/);
  assert.equal(directoryHash(migrations), before);
});

test('inventory includes every migration in timestamp order with valid schema', () => {
  const audit = auditMigrationDirectory(migrations, { skipGit: true });
  assert.equal(audit.schemaVersion, 3);
  assert.deepEqual(audit.inventory.map((x) => x.filename), sqlFiles(migrations));
  assert.deepEqual(audit.inventory.map((x) => x.timestamp), [...audit.inventory.map((x) => x.timestamp)].sort());
  for (const item of audit.inventory) {
    assert.match(item.sha256, /^[a-f\d]{64}$/);
    assert.equal(typeof item.lineCount, 'number');
    assert.ok(Array.isArray(item.policies));
  }
});

test('known reconciliations remain resolved classifications', () => {
  const audit = auditMigrationDirectory(migrations, { skipGit: true });
  assert.deepEqual(audit.resolvedConflicts.map((x) => [x.id, x.status, x.present]), [
    ['RESOLVED_IMPORT_JOBS_DUPLICATE', 'RESOLVED', true],
    ['RESOLVED_CONTENT_STAFF_RBAC_DUPLICATE', 'RESOLVED', true],
    ['RESOLVED_UNITS_POLICY_DUPLICATE', 'RESOLVED', true],
  ]);
  assert.ok(!audit.conflicts.some((x) => x.id.startsWith('RESOLVED_')));
});

test('policy keys include table and function keys include signature', () => {
  const parsed = parseMigrationText(readFileSync(join(fixtures, '20260101000000_base.sql'), 'utf8'));
  assert.equal(parsed.policies[0].key, 'App.Items|read own');
  assert.equal(parsed.functions[0].key, 'App.owns_item(uuid)');
  assert.equal(parsed.functions[0].flags.orReplace, true);
});

test('comments-only SQL has no executable statement', () => {
  const parsed = parseMigrationText(readFileSync(join(fixtures, '20260103000000_comments.sql'), 'utf8'));
  assert.equal(parsed.commentsOnly, true);
  assert.equal(parsed.statements.length, 0);
});

test('DROP before CREATE, IF EXISTS, and IF NOT EXISTS are recognized', () => {
  const parsed = parseMigrationText(readFileSync(join(fixtures, '20260102000000_drop_create.sql'), 'utf8'));
  assert.equal(parsed.policies[0].action, 'drop');
  assert.equal(parsed.policies[0].flags.ifExists, true);
  assert.equal(parsed.policies[1].action, 'create');
  assert.equal(parsed.indexes[0].flags.ifNotExists, true);
  const audit = auditMigrationDirectory(fixtures, { skipGit: true });
  assert.ok(!audit.conflicts.some((x) => x.id === 'DUPLICATE_CREATE_POLICY' && x.conflictingMigration === '20260102000000_drop_create.sql'));
});

test('CRLF and LF produce the same semantic result', () => {
  const lf = readFileSync(join(fixtures, '20260101000000_base.sql'), 'utf8').replace(/\r\n/g, '\n');
  const crlf = lf.replace(/\n/g, '\r\n');
  const compact = (x) => x.statements.map(({ raw: _raw, ...rest }) => rest);
  assert.deepEqual(compact(parseMigrationText(lf)), compact(parseMigrationText(crlf)));
});

test('quoted identifiers and multiline policies/functions are preserved', () => {
  const parsed = parseMigrationText(readFileSync(join(fixtures, '20260101000000_base.sql'), 'utf8'));
  assert.equal(parsed.tables[0].name, 'App.Items');
  assert.equal(parsed.policies[0].table, 'App.Items');
  assert.match(parsed.policies[0].using, /auth\.uid/);
  assert.match(parsed.functions[0].body, /select auth\.uid/);
  assert.equal(stripCommentsAndSplit("SELECT '--not comment'; -- comment\nSELECT 2;").statements.length, 2);
});

test('multiline tables, ALTER columns, quoted indexes, overloads, and dynamic SQL are calibrated', () => {
  const parsed = parseMigrationText(readFileSync(join(fixtures, '20260105000000_parser_calibration.sql'), 'utf8'), '20260105000000_parser_calibration.sql');
  assert.equal(parsed.tables[0].name, 'Odd Schema.Multi Line');
  assert.equal(parsed.tables[1].addColumn.name, 'Indexed Column');
  assert.deepEqual(parsed.tables[2].renameColumn, { from: 'Indexed Column', to: 'Renamed Column' });
  assert.equal(parsed.indexes[0].table, 'Odd Schema.Multi Line');
  assert.deepEqual(parsed.functions.map((x) => x.signature), ['public.overloaded(uuid,boolean)', 'public.overloaded(text)']);
  assert.equal(parsed.tables.some((x) => x.name === 'public.not_real'), false);
  assert.equal(parsed.uncertainties.length, 1);
});

test('Supabase-owned schemas are external dependencies, not missing relations', () => {
  const audit = auditMigrationDirectory(migrations, { skipGit: true });
  assert.ok(audit.externalDependencies.some((x) => x.object === 'storage.objects'));
  assert.ok(audit.externalDependencies.some((x) => x.object === 'auth.users'));
  assert.ok(!audit.graph.summary.missingDependencies.some((x) => /^(auth|storage)\./.test(x.object)));
});

test('empirical evidence only disproves compilation findings and current parser is the source', () => {
  const audit = auditMigrationDirectory(migrations, { skipGit: true });
  const prefixCandidates = audit.calibratedFindings.filter((x) => x.verifiedPrefixPosition === 'AT_OR_BEFORE_VERIFIED_PREFIX');
  assert.ok(prefixCandidates.every((x) => x.finalClassification !== 'CONFIRMED_REPLAY_BLOCKER'));
  assert.equal(audit.originalFindings, audit.conflicts);
  assert.equal(audit.historicalSnapshotUsedForDecisions, false);
  assert.equal(audit.empiricalEvidence.last_confirmed_successful_migration, audit.verifiedPrefix);
});

test('evidence artifact is required, schema-validated, hashed, and read rather than hard-coded', () => {
  const dir = mkdtempSync(join(tmpdir(), 'migration-evidence-'));
  try {
    assert.throws(() => readReplayEvidence(join(dir, 'missing.json')), /not found/);
    const invalid = join(dir, 'invalid.json'); writeFileSync(invalid, '{"schema_version":1}\n');
    assert.throws(() => readReplayEvidence(invalid), /schema/);
    const source = JSON.parse(readFileSync(resolve(root, 'docs/audits/MIGRATION-REPLAY-EMPIRICAL-EVIDENCE-29.json'), 'utf8'));
    source.last_confirmed_successful_migration = '20260101000000'; const custom = join(dir, 'custom.json'); writeFileSync(custom, `${JSON.stringify(source, null, 2)}\n`);
    const audit = auditMigrationDirectory(fixtures, { skipGit: true, evidencePath: custom });
    assert.equal(audit.verifiedPrefix, '20260101000000'); assert.match(audit.empiricalEvidence.sha256, /^[a-f\d]{64}$/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('security findings survive replay evidence while compilation findings can be disproven', () => {
  const dir = mkdtempSync(join(tmpdir(), 'migration-overlay-'));
  try {
    writeFileSync(join(dir, '20260101000000_overlay.sql'), 'CREATE TABLE public.t(id uuid); CREATE INDEX bad ON public.t(missing); CREATE POLICY "public read" ON public.t FOR SELECT TO public USING (true);');
    const audit = auditMigrationDirectory(dir, { skipGit: true });
    assert.ok(audit.securityFindings.some((x) => x.finalState === 'ACTIVE_FINAL_STATE' && x.finalSeverity === 'HIGH'));
    assert.ok(audit.calibratedFindings.some((x) => x.finalClassification === 'EMPIRICALLY_DISPROVEN_COMPILATION_BLOCKER' && x.sourceFinding && x.evidenceReference));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('graph edges are unique, non-self-referential, and cycles/SCCs are calculated', () => {
  const audit = auditMigrationDirectory(migrations, { skipGit: true });
  const keys = audit.graph.unique_edges.map((x) => `${x.from}|${x.to}|${x.relationship}|${x.object}`);
  assert.equal(new Set(keys).size, keys.length); assert.ok(audit.graph.unique_edges.every((x) => x.from !== x.to));
  const calculated = detectGraphCycles(['a','b','c'], [{from:'a',to:'b'},{from:'b',to:'c'},{from:'c',to:'a'},{from:'a',to:'a'}]);
  assert.ok(calculated.cycles.length > 0); assert.deepEqual(calculated.stronglyConnectedComponents, [['a','b','c']]);
});

test('built-ins are excluded but unknown public functions remain uncertainty', () => {
  const dir = mkdtempSync(join(tmpdir(), 'migration-functions-'));
  try {
    writeFileSync(join(dir, '20260101000000_calls.sql'), 'CREATE TABLE public.t(id uuid); CREATE POLICY "p" ON public.t USING (now() IS NOT NULL AND public.unknown_project_fn(id));');
    const audit = auditMigrationDirectory(dir, { skipGit: true });
    assert.ok(!audit.conflicts.some((x) => x.objectName === 'now'));
    assert.ok(audit.calibratedFindings.some((x) => x.object === 'public.unknown_project_fn' && x.finalClassification === 'STATIC_UNCERTAINTY'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('nested defaults, composite indexes, trigger identity, and ALTER FUNCTION are tracked', () => {
  const sql = `CREATE TABLE public.t (id uuid, payload jsonb DEFAULT jsonb_build_object('a', ARRAY[1,2]), generated text GENERATED ALWAYS AS ((payload->>'a')) STORED);\nCREATE FUNCTION public.touch(value text DEFAULT concat('a', ',')) RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN RETURN NEW; END $$;\nALTER FUNCTION public.touch(text) SET search_path = public, pg_temp;\nCREATE INDEX public.idx_t ON public.t (id, ((payload->>'a'))) WHERE payload IS NOT NULL;\nCREATE TRIGGER trg BEFORE UPDATE ON public.t FOR EACH ROW EXECUTE FUNCTION public.touch();`;
  const parsed = parseMigrationText(sql, '20260101000000_advanced.sql');
  assert.deepEqual(parsed.tables[0].columns.map((x) => x.name), ['id','payload','generated']);
  assert.equal(parsed.indexes[0].table, 'public.t'); assert.equal(parsed.triggers[0].key, 'public.t|trg');
  assert.equal(parsed.functions[1].action, 'alter'); assert.equal(parsed.functions[1].searchPath, 'public, pg_temp');
});

test('comments, literals, and dollar-quoted function bodies create no external DDL dependencies', () => {
  const parsed = parseMigrationText(`-- auth.users\nCREATE FUNCTION public.f() RETURNS text LANGUAGE plpgsql AS $$ BEGIN RAISE NOTICE 'storage.objects'; RETURN 'auth.users'; END $$; SELECT 'auth.users';`);
  assert.deepEqual(parsed.dependencies, []);
});

test('auth.uid equality is implicitly fail-closed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'migration-security-'));
  try { writeFileSync(join(dir, '20260101000000_policy.sql'), 'CREATE TABLE public.t(user_id uuid); ALTER TABLE public.t ENABLE ROW LEVEL SECURITY; CREATE POLICY "own" ON public.t FOR SELECT TO authenticated USING (auth.uid() = user_id);'); const audit=auditMigrationDirectory(dir,{skipGit:true}); assert.ok(!audit.securityFindings.some((x)=>x.id.includes('AUTH_UID'))); }
  finally { rmSync(dir,{recursive:true,force:true}); }
});

test('downstream policy drops, ALTER FUNCTION search_path, and grant revokes resolve historical highs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'migration-lifecycle-'));
  try {
    writeFileSync(join(dir, '20260101000000_create.sql'), `CREATE TABLE public.t(id uuid); CREATE POLICY "open" ON public.t FOR SELECT USING (true); CREATE FUNCTION public.f() RETURNS integer LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$; GRANT EXECUTE ON FUNCTION public.f() TO anon;`);
    writeFileSync(join(dir, '20260102000000_resolve.sql'), `DROP POLICY "open" ON public.t; ALTER FUNCTION public.f() SET search_path = public, pg_temp; REVOKE EXECUTE ON FUNCTION public.f() FROM anon;`);
    const audit = auditMigrationDirectory(dir, { skipGit: true });
    for (const id of ['PERMISSIVE_TRUE_POLICY','SECURITY_DEFINER_WITHOUT_SEARCH_PATH','FUNCTION_GRANTED_TO_ANON']) assert.equal(audit.securityFindings.find((x) => x.id === id)?.finalState, 'DOWNSTREAM_RESOLVED');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('semantic duplicate policy under another name is detected', () => {
  const audit = auditMigrationDirectory(fixtures, { skipGit: true });
  const finding = audit.conflicts.find((x) => x.id === 'DUPLICATE_POLICY_LOGIC_DIFFERENT_NAME');
  assert.equal(finding?.semanticComparison, 'SEMANTIC_DUPLICATE');
  assert.equal(finding?.objectType, 'policy');
});

test('JSON and Markdown reports are deterministic', () => {
  const audit = auditMigrationDirectory(fixtures, { skipGit: true });
  const first = mkdtempSync(join(tmpdir(), 'migration-audit-a-'));
  const second = mkdtempSync(join(tmpdir(), 'migration-audit-b-'));
  try {
    const paths = (dir) => ({ inventory: join(dir, 'inventory.json'), graph: join(dir, 'graph.json'), report: join(dir, 'report.md'), calibration: join(dir, 'calibration.json') });
    writeAuditReports(audit, paths(first)); writeAuditReports(audit, paths(second));
    for (const name of ['inventory.json', 'graph.json', 'report.md', 'calibration.json']) assert.equal(readFileSync(join(first, name), 'utf8'), readFileSync(join(second, name), 'utf8'));
    const inventory = JSON.parse(readFileSync(join(first, 'inventory.json'), 'utf8'));
    const graph = JSON.parse(readFileSync(join(first, 'graph.json'), 'utf8'));
    assert.equal(inventory.schemaVersion, 3); assert.ok(Array.isArray(inventory.migrations));
    assert.equal(graph.schemaVersion, 3); assert.ok(Array.isArray(graph.nodes)); assert.ok(Array.isArray(graph.unique_edges));
  } finally { rmSync(first, { recursive: true, force: true }); rmSync(second, { recursive: true, force: true }); }
});
