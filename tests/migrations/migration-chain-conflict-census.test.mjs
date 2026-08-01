import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  auditMigrationDirectory,
  parseMigrationText,
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
  assert.equal(audit.schemaVersion, 2);
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

test('verified-prefix candidates are never emitted as confirmed replay blockers', () => {
  const audit = auditMigrationDirectory(migrations, { skipGit: true });
  const prefixCandidates = audit.calibratedFindings.filter((x) => x.verifiedPrefixPosition === 'AT_OR_BEFORE_VERIFIED_PREFIX');
  assert.ok(prefixCandidates.length > 0);
  assert.ok(prefixCandidates.every((x) => ['EMPIRICALLY_DISPROVEN_BLOCKER', 'RESOLVED_REPLAY_BLOCKER'].includes(x.finalClassification)));
  assert.equal(audit.calibratedFindings.length, 88);
  assert.equal(audit.postPrefixRisks.length, 0);
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
    assert.equal(inventory.schemaVersion, 2); assert.ok(Array.isArray(inventory.migrations));
    assert.equal(graph.schemaVersion, 2); assert.ok(Array.isArray(graph.nodes)); assert.ok(Array.isArray(graph.edges));
  } finally { rmSync(first, { recursive: true, force: true }); rmSync(second, { recursive: true, force: true }); }
});
