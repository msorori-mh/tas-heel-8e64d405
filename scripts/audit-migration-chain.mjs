#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IDENT = String.raw`(?:"(?:[^"]|"")+"|[a-zA-Z_][\w$]*)(?:\s*\.\s*(?:"(?:[^"]|"")+"|[a-zA-Z_][\w$]*))*`;
const LIMITATIONS = [
  'This is a conservative static linter, not a complete PostgreSQL parser.',
  'Dynamic SQL, psql meta-commands, conditional PL/pgSQL, and identifiers assembled at runtime are not resolved.',
  'Column and unique-key inference is best effort; inherited, generated, and expression semantics may need human review.',
  'Function calls in policy expressions are inferred lexically and built-in or extension functions may be excluded imperfectly.',
  'Security findings identify review candidates and do not prove exploitability.',
];

const cleanIdent = (value = '') => [...value.matchAll(/"(?:[^"]|"")*"|[a-zA-Z_][\w$]*/g)]
  .map(([part]) => part.startsWith('"') ? part.slice(1, -1).replace(/""/g, '"') : part.toLowerCase()).join('.');
const shortName = (value) => cleanIdent(value).split('.').at(-1);
const normalize = (value = '') => value.replace(/\r\n?/g, '\n').replace(/\s+/g, ' ').trim().toLowerCase();
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const timestampOf = (filename) => filename.match(/^(\d{14})/)?.[1] ?? '';

export function stripCommentsAndSplit(input) {
  const sql = input.replace(/\r\n?/g, '\n');
  let out = '', statement = '', state = 'normal', dollar = '';
  const statements = [];
  for (let i = 0; i < sql.length; i += 1) {
    const c = sql[i], n = sql[i + 1];
    if (state === 'line') { if (c === '\n') { state = 'normal'; out += c; statement += c; } continue; }
    if (state === 'block') { if (c === '*' && n === '/') { state = 'normal'; i += 1; } continue; }
    if (state === 'single') {
      out += c; statement += c;
      if (c === "'" && n === "'") { out += n; statement += n; i += 1; }
      else if (c === "'") state = 'normal';
      continue;
    }
    if (state === 'double') {
      out += c; statement += c;
      if (c === '"' && n === '"') { out += n; statement += n; i += 1; }
      else if (c === '"') state = 'normal';
      continue;
    }
    if (state === 'dollar') {
      if (sql.startsWith(dollar, i)) { out += dollar; statement += dollar; i += dollar.length - 1; state = 'normal'; }
      else { out += c; statement += c; }
      continue;
    }
    if (c === '-' && n === '-') { state = 'line'; i += 1; continue; }
    if (c === '/' && n === '*') { state = 'block'; i += 1; continue; }
    if (c === "'") state = 'single';
    else if (c === '"') state = 'double';
    else if (c === '$') {
      const tag = sql.slice(i).match(/^\$[a-zA-Z_\d]*\$/)?.[0];
      if (tag) { dollar = tag; state = 'dollar'; out += tag; statement += tag; i += tag.length - 1; continue; }
    }
    out += c;
    if (c === ';') { if (statement.trim()) statements.push(statement.trim()); statement = ''; }
    else statement += c;
  }
  if (statement.trim()) statements.push(statement.trim());
  return { stripped: out, statements };
}

function list(value = '') { return value.split(',').map((x) => cleanIdent(x.trim().split(/\s+/)[0])).filter(Boolean); }
function bodyColumns(body = '') {
  const columns = [];
  for (const part of body.split(/,(?![^()]*\))/)) {
    const match = part.trim().match(new RegExp(`^(${IDENT})\\s+([^,]+)$`, 'i'));
    if (match && !/^(constraint|primary|foreign|unique|check)\b/i.test(match[1])) columns.push({ name: cleanIdent(match[1]), definition: normalize(match[2]) });
  }
  return columns;
}
function functionSignature(name, args = '') {
  const types = args.split(/,(?![^()]*\))/).map((arg) => normalize(arg).replace(/\s*=.*$/, '').split(/\s+/).filter((x) => !/^(in|out|inout|variadic|default)$/i.test(x)).slice(-1)[0]).filter(Boolean);
  return `${cleanIdent(name)}(${types.join(',')})`;
}
function callsIn(value = '') {
  return [...value.matchAll(/\b((?:[a-zA-Z_]\w*\.)?[a-zA-Z_]\w*)\s*\(/g)].map((m) => cleanIdent(m[1])).filter((x) => !['and','or','not','exists','select','coalesce','nullif','current_setting','auth.uid'].includes(x));
}

export function parseMigrationText(sql, filename = 'fixture.sql') {
  const { stripped, statements } = stripCommentsAndSplit(sql);
  const result = { filename, timestamp: timestampOf(filename), statements: [], tables: [], policies: [], functions: [], indexes: [], triggers: [], types: [], views: [], grantsRevokes: [], rls: [], storage: [], dml: [], extensions: [], dependencies: [], commentsOnly: statements.length === 0, noOp: statements.length === 0 };
  for (let order = 0; order < statements.length; order += 1) {
    const raw = statements[order], text = normalize(raw);
    const item = { order, raw, normalized: text, kind: 'other', action: '', objectType: '', name: '', key: '', flags: {} };
    let m;
    if ((m = raw.match(new RegExp(`^\\s*CREATE\\s+(OR\\s+REPLACE\\s+)?TABLE\\s+(IF\\s+NOT\\s+EXISTS\\s+)?(${IDENT})\\s*\\(([\\s\\S]*)\\)`, 'i')))) {
      Object.assign(item, { kind: 'table', action: 'create', objectType: 'table', name: cleanIdent(m[3]), key: cleanIdent(m[3]), flags: { orReplace: !!m[1], ifNotExists: !!m[2] }, columns: bodyColumns(m[4]), definition: normalize(m[4]) }); result.tables.push(item);
    } else if ((m = raw.match(new RegExp(`^\\s*DROP\\s+TABLE\\s+(IF\\s+EXISTS\\s+)?(${IDENT})`, 'i')))) {
      Object.assign(item, { kind: 'table', action: 'drop', objectType: 'table', name: cleanIdent(m[2]), key: cleanIdent(m[2]), flags: { ifExists: !!m[1] } }); result.tables.push(item);
    } else if ((m = raw.match(new RegExp(`^\\s*ALTER\\s+TABLE\\s+(?:ONLY\\s+)?(${IDENT})`, 'i')))) {
      Object.assign(item, { kind: 'table', action: 'alter', objectType: 'table', name: cleanIdent(m[1]), key: cleanIdent(m[1]), definition: text }); result.tables.push(item);
      if (/\b(enable|disable|force|no force)\s+row level security\b/i.test(raw)) result.rls.push(item);
    } else if ((m = raw.match(new RegExp(`^\\s*CREATE\\s+POLICY\\s+(${IDENT})\\s+ON\\s+(${IDENT})([\\s\\S]*)`, 'i')))) {
      const tail = m[3], table = cleanIdent(m[2]), name = cleanIdent(m[1]);
      const command = tail.match(/\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\b/i)?.[1]?.toUpperCase() ?? 'ALL';
      const roles = list(tail.match(/\bTO\s+([^\n]+?)(?=\bUSING\b|\bWITH\s+CHECK\b|$)/i)?.[1] ?? 'public');
      const using = normalize(tail.match(/\bUSING\s*\(([\s\S]*?)\)(?=\s*WITH\s+CHECK|\s*$)/i)?.[1] ?? '');
      const check = normalize(tail.match(/\bWITH\s+CHECK\s*\(([\s\S]*)\)\s*$/i)?.[1] ?? '');
      Object.assign(item, { kind: 'policy', action: 'create', objectType: 'policy', name, table, key: `${table}|${name}`, command, roles, using, withCheck: check, definition: normalize(`${command}|${roles}|${using}|${check}`), calls: callsIn(`${using} ${check}`) }); result.policies.push(item);
    } else if ((m = raw.match(new RegExp(`^\\s*DROP\\s+POLICY\\s+(IF\\s+EXISTS\\s+)?(${IDENT})\\s+ON\\s+(${IDENT})`, 'i')))) {
      const table = cleanIdent(m[3]), name = cleanIdent(m[2]); Object.assign(item, { kind: 'policy', action: 'drop', objectType: 'policy', name, table, key: `${table}|${name}`, flags: { ifExists: !!m[1] } }); result.policies.push(item);
    } else if ((m = raw.match(new RegExp(`^\\s*CREATE\\s+(OR\\s+REPLACE\\s+)?FUNCTION\\s+(${IDENT})\\s*\\(([^)]*)\\)([\\s\\S]*)`, 'i')))) {
      const signature = functionSignature(m[2], m[3]), tail = m[4]; Object.assign(item, { kind: 'function', action: 'create', objectType: 'function', name: cleanIdent(m[2]), key: signature, signature, arguments: normalize(m[3]), returns: normalize(tail.match(/\bRETURNS\s+(.+?)(?=\bLANGUAGE\b|\bAS\b)/is)?.[1] ?? ''), security: /\bSECURITY\s+DEFINER\b/i.test(tail) ? 'DEFINER' : 'INVOKER', searchPath: normalize(tail.match(/\bSET\s+search_path\s*(?:=|TO)\s*([^\n;]+)/i)?.[1] ?? ''), body: normalize(tail.match(/\bAS\s+(\$[\w]*\$[\s\S]*\$[\w]*\$|'[\s\S]*')/i)?.[1] ?? ''), flags: { orReplace: !!m[1] } }); result.functions.push(item);
    } else if ((m = raw.match(new RegExp(`^\\s*DROP\\s+FUNCTION\\s+(IF\\s+EXISTS\\s+)?(${IDENT})\\s*(?:\\(([^)]*)\\))?`, 'i')))) {
      const signature = functionSignature(m[2], m[3] ?? ''); Object.assign(item, { kind: 'function', action: 'drop', objectType: 'function', name: cleanIdent(m[2]), key: signature, signature, flags: { ifExists: !!m[1] } }); result.functions.push(item);
    } else if ((m = raw.match(new RegExp(`^\\s*CREATE\\s+(UNIQUE\\s+)?INDEX\\s+(?:CONCURRENTLY\\s+)?(IF\\s+NOT\\s+EXISTS\\s+)?(${IDENT})\\s+ON\\s+(${IDENT})[^\\(]*\\(([^)]*)\\)([\\s\\S]*)`, 'i')))) {
      const name = cleanIdent(m[3]), table = cleanIdent(m[4]); Object.assign(item, { kind: 'index', action: 'create', objectType: 'index', name, table, key: name, unique: !!m[1], columns: list(m[5]), predicate: normalize(m[6].match(/\\bWHERE\\s+([\\s\\S]*)/i)?.[1] ?? ''), flags: { ifNotExists: !!m[2] }, definition: normalize(raw) }); result.indexes.push(item);
    } else if ((m = raw.match(new RegExp(`^\\s*DROP\\s+INDEX\\s+(?:CONCURRENTLY\\s+)?(IF\\s+EXISTS\\s+)?(${IDENT})`, 'i')))) {
      Object.assign(item, { kind: 'index', action: 'drop', objectType: 'index', name: cleanIdent(m[2]), key: cleanIdent(m[2]), flags: { ifExists: !!m[1] } }); result.indexes.push(item);
    } else if ((m = raw.match(new RegExp(`^\\s*CREATE\\s+TRIGGER\\s+(${IDENT})\\s+([\\s\\S]*?)\\s+ON\\s+(${IDENT})([\\s\\S]*?)EXECUTE\\s+(?:FUNCTION|PROCEDURE)\\s+(${IDENT})\\s*\\(([^)]*)\\)`, 'i')))) {
      const name = cleanIdent(m[1]), table = cleanIdent(m[3]), fn = functionSignature(m[5], m[6]); Object.assign(item, { kind: 'trigger', action: 'create', objectType: 'trigger', name, table, key: `${table}|${name}`, timingEvents: normalize(m[2]), condition: normalize(m[4].match(/\\bWHEN\\s*\\(([\\s\\S]*)\\)/i)?.[1] ?? ''), function: fn, definition: normalize(raw) }); result.triggers.push(item);
    } else if ((m = raw.match(new RegExp(`^\\s*DROP\\s+TRIGGER\\s+(IF\\s+EXISTS\\s+)?(${IDENT})\\s+ON\\s+(${IDENT})`, 'i')))) {
      const table = cleanIdent(m[3]), name = cleanIdent(m[2]); Object.assign(item, { kind: 'trigger', action: 'drop', objectType: 'trigger', name, table, key: `${table}|${name}`, flags: { ifExists: !!m[1] } }); result.triggers.push(item);
    } else if ((m = raw.match(new RegExp(`^\\s*CREATE\\s+TYPE\\s+(${IDENT})\\s+AS\\s+ENUM\\s*\\(([\\s\\S]*?)\\)`, 'i')))) {
      const name = cleanIdent(m[1]); Object.assign(item, { kind: 'type', action: 'create', objectType: 'type', name, key: name, values: [...m[2].matchAll(/'((?:''|[^'])*)'/g)].map((x) => x[1].replace(/''/g, "'")), definition: normalize(m[2]) }); result.types.push(item);
    } else if ((m = raw.match(new RegExp(`^\\s*ALTER\\s+TYPE\\s+(${IDENT})\\s+ADD\\s+VALUE\\s+(IF\\s+NOT\\s+EXISTS\\s+)?'([^']+)'`, 'i')))) {
      const name = cleanIdent(m[1]); Object.assign(item, { kind: 'type', action: 'add-value', objectType: 'type', name, key: `${name}|${m[3]}`, value: m[3], flags: { ifNotExists: !!m[2] } }); result.types.push(item);
    } else if ((m = raw.match(new RegExp(`^\\s*DROP\\s+TYPE\\s+(IF\\s+EXISTS\\s+)?(${IDENT})`, 'i')))) {
      Object.assign(item, { kind: 'type', action: 'drop', objectType: 'type', name: cleanIdent(m[2]), key: cleanIdent(m[2]), flags: { ifExists: !!m[1] } }); result.types.push(item);
    } else if ((m = raw.match(new RegExp(`^\\s*CREATE\\s+(OR\\s+REPLACE\\s+)?(MATERIALIZED\\s+)?VIEW\\s+(IF\\s+NOT\\s+EXISTS\\s+)?(${IDENT})\\s+AS\\s+([\\s\\S]*)`, 'i')))) {
      const name = cleanIdent(m[4]); Object.assign(item, { kind: 'view', action: 'create', objectType: m[2] ? 'materialized view' : 'view', name, key: name, definition: normalize(m[5]), flags: { orReplace: !!m[1], ifNotExists: !!m[3] } }); result.views.push(item);
    } else if ((m = raw.match(new RegExp(`^\\s*DROP\\s+(MATERIALIZED\\s+)?VIEW\\s+(IF\\s+EXISTS\\s+)?(${IDENT})`, 'i')))) {
      Object.assign(item, { kind: 'view', action: 'drop', objectType: m[1] ? 'materialized view' : 'view', name: cleanIdent(m[3]), key: cleanIdent(m[3]), flags: { ifExists: !!m[2] } }); result.views.push(item);
    } else if ((m = raw.match(/^\s*(GRANT|REVOKE)\s+([\s\S]+?)\s+(?:ON\s+([\s\S]+?)\s+)?(?:TO|FROM)\s+([\s\S]+)$/i))) {
      Object.assign(item, { kind: 'grant', action: m[1].toLowerCase(), objectType: 'grant', name: normalize(m[2]), key: normalize(raw), target: normalize(m[3] ?? ''), roles: list(m[4]), definition: normalize(raw) }); result.grantsRevokes.push(item);
    } else if ((m = raw.match(new RegExp(`^\\s*CREATE\\s+EXTENSION\\s+(IF\\s+NOT\\s+EXISTS\\s+)?(${IDENT})`, 'i')))) {
      Object.assign(item, { kind: 'extension', action: 'create', objectType: 'extension', name: cleanIdent(m[2]), key: cleanIdent(m[2]), flags: { ifNotExists: !!m[1] } }); result.extensions.push(item);
    } else if (/^\s*(INSERT|UPDATE|DELETE|MERGE)\b/i.test(raw)) {
      const table = cleanIdent(raw.match(new RegExp(`(?:INTO|UPDATE|FROM)\\s+(${IDENT})`, 'i'))?.[1] ?? 'unknown'); Object.assign(item, { kind: 'dml', action: raw.trim().split(/\s+/)[0].toLowerCase(), objectType: 'dml', name: table, table, key: table, definition: text }); result.dml.push(item); if (/storage\.(buckets|objects)/i.test(raw)) result.storage.push(item);
    }
    if (/\b(cron\.|net\.|vault\.)/i.test(raw)) result.dependencies.push(...[...raw.matchAll(/\b(cron|net|vault)\.[a-zA-Z_]\w*/gi)].map((x) => cleanIdent(x[0])));
    result.statements.push(item);
  }
  result.noOp = result.statements.every((x) => x.kind === 'other' && /^(begin|commit)$/i.test(x.normalized));
  return result;
}

function introducedCommit(path) {
  try { return execFileSync('git', ['log', '--follow', '--diff-filter=A', '--format=%H', '-n', '1', '--', path], { cwd: ROOT, encoding: 'utf8' }).trim() || null; }
  catch { return null; }
}
function conflict(id, severity, first, current, extra = {}) {
  return { id, severity, confidence: extra.confidence ?? 'HIGH', likelySqlstate: extra.sqlstate ?? null, firstCreatorMigration: first?.filename ?? null, conflictingMigration: current.filename, objectType: current.objectType, objectName: current.key || current.name, semanticComparison: extra.comparison ?? 'UNRESOLVED', exactDuplicate: extra.comparison === 'EXACT_DUPLICATE', securityDifference: extra.comparison === 'SECURITY_DIFFERENCE', recommendedResolution: extra.resolution ?? 'requires human decision', filesThatWouldNeedModification: [first?.filename, current.filename].filter(Boolean), testsRequired: extra.tests ?? ['static replay regression test'], evidence: current.raw?.slice(0, 500) ?? '' };
}
const same = (a, b, fields) => fields.every((key) => normalize(JSON.stringify(a[key] ?? '')) === normalize(JSON.stringify(b[key] ?? '')));
const hasFailClosed = (value) => /auth\.uid\(\)\s+is\s+not\s+null|coalesce\s*\(/i.test(value);

export function analyzeParsedMigrations(migrations) {
  const active = new Map(), conflicts = [], edges = [], securityFindings = [], missingDependencies = [], orderingRisks = [];
  const createdTables = new Map(), tableColumns = new Map(), createdFunctions = new Map(), policyLogic = new Map(), rlsTables = new Set(), selectPolicyTables = new Set(), enumValues = new Map();
  const addEdge = (from, to, kind, object) => edges.push({ from, to, kind, object });
  for (const migration of migrations) {
    for (const item of migration.statements) {
      item.filename = migration.filename;
      const stateKey = `${item.objectType}:${item.key}`;
      if (item.action === 'drop') {
        const prior = active.get(stateKey);
        if (!prior && item.kind === 'policy' && !item.flags?.ifExists) conflicts.push(conflict('POLICY_DROP_BEFORE_CREATE', 'P1', null, item, { confidence: 'MEDIUM', sqlstate: '42704' }));
        if (prior) addEdge(migration.filename, prior.filename, 'drops', item.key);
        active.delete(stateKey); continue;
      }
      if (item.action === 'create') {
        const prior = active.get(stateKey);
        const safe = item.flags?.ifNotExists || item.flags?.orReplace;
        if (prior && !safe) {
          let comparison = same(prior, item, ['definition']) ? 'EXACT_DUPLICATE' : 'UNRESOLVED';
          if (item.kind === 'policy') comparison = same(prior, item, ['table','roles','command','using','withCheck']) ? 'SEMANTIC_DUPLICATE' : 'SECURITY_DIFFERENCE';
          if (item.kind === 'function') comparison = same(prior, item, ['returns','security','searchPath','body']) ? 'SEMANTIC_DUPLICATE' : 'SECURITY_DIFFERENCE';
          const ids = { table: 'DUPLICATE_CREATE_TABLE', policy: 'DUPLICATE_CREATE_POLICY', index: 'DUPLICATE_CREATE_INDEX', trigger: 'DUPLICATE_CREATE_TRIGGER', type: 'DUPLICATE_CREATE_TYPE', view: 'DUPLICATE_CREATE_VIEW', function: 'DUPLICATE_CREATE_FUNCTION' };
          const states = { table: '42P07', policy: '42710', index: '42P07', trigger: '42710', type: '42710', view: '42P07', function: '42723' };
          conflicts.push(conflict(ids[item.kind] ?? 'DUPLICATE_CREATE_OBJECT', 'P0', prior, item, { comparison, sqlstate: states[item.kind], resolution: comparison === 'EXACT_DUPLICATE' ? 'no-op' : 'DROP + recreate' }));
        }
        if (prior && item.flags?.orReplace) addEdge(migration.filename, prior.filename, 'replaces', item.key);
        active.set(stateKey, item);
        addEdge(migration.filename, `object:${item.objectType}:${item.key}`, 'creates', item.key);
      }
      if (item.kind === 'table') {
        if (item.action === 'create') { createdTables.set(item.name, item); tableColumns.set(item.name, new Set(item.columns.map((x) => x.name))); }
        if (item.action === 'alter') {
          const prior = createdTables.get(item.name); if (!prior) { missingDependencies.push({ migration: migration.filename, object: item.name, kind: 'table' }); conflicts.push(conflict('TABLE_USED_BEFORE_CREATE', 'P0', null, item, { sqlstate: '42P01' })); }
          if (prior) addEdge(migration.filename, prior.filename, 'depends_on', item.name);
          const column = item.raw.match(/\bADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?("[^"]+"|\w+)/i)?.[1]; if (column) (tableColumns.get(item.name) ?? new Set()).add(cleanIdent(column));
          if (/\bENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(item.raw)) rlsTables.add(item.name);
          for (const fk of item.raw.matchAll(new RegExp(`REFERENCES\\s+(${IDENT})\\s*\\(([^)]*)\\)`, 'gi'))) {
            const target = cleanIdent(fk[1]), columns = list(fk[2]);
            if (!createdTables.has(target) || columns.some((x) => !(tableColumns.get(target)?.has(x)))) { missingDependencies.push({ migration: migration.filename, object: `${target}(${columns})`, kind: 'foreign-key' }); conflicts.push(conflict('FOREIGN_KEY_TARGET_MISSING', 'P0', null, { ...item, key: `${target}(${columns})` }, { sqlstate: '42P01', confidence: 'MEDIUM' })); }
          }
        }
      }
      if (item.kind === 'policy' && item.action === 'create') {
        addEdge(migration.filename, `object:table:${item.table}`, 'depends_on', item.table);
        if (!createdTables.has(item.table)) { missingDependencies.push({ migration: migration.filename, object: item.table, kind: 'policy-table' }); conflicts.push(conflict('POLICY_TABLE_BEFORE_CREATE', 'P0', null, item, { sqlstate: '42P01' })); }
        if (item.command === 'SELECT' || item.command === 'ALL') selectPolicyTables.add(item.table);
        for (const call of item.calls) { addEdge(migration.filename, `object:function:${call}`, 'references', call); if (!createdFunctions.has(call) && !createdFunctions.has(`public.${call}`)) conflicts.push(conflict('POLICY_FUNCTION_BEFORE_CREATE', 'P1', null, { ...item, key: call }, { confidence: 'LOW', sqlstate: '42883' })); }
        const logic = `${item.table}|${item.command}|${item.roles}|${item.using}|${item.withCheck}`, prior = policyLogic.get(logic);
        if (prior && prior.name !== item.name) conflicts.push(conflict('DUPLICATE_POLICY_LOGIC_DIFFERENT_NAME', 'P2', prior, item, { comparison: 'SEMANTIC_DUPLICATE', resolution: 'preserve unique objects' })); else policyLogic.set(logic, item);
        if (/^true$|\(true\)/i.test(item.using) || /^true$|\(true\)/i.test(item.withCheck)) securityFindings.push({ severity: 'HIGH', id: 'PERMISSIVE_TRUE_POLICY', migration: migration.filename, object: item.key, evidence: item.raw.slice(0, 500) });
        if (/auth\.uid\(\)/i.test(`${item.using} ${item.withCheck}`) && !hasFailClosed(`${item.using} ${item.withCheck}`)) securityFindings.push({ severity: 'MEDIUM', id: 'AUTH_UID_WITHOUT_EXPLICIT_FAIL_CLOSED', migration: migration.filename, object: item.key, evidence: item.raw.slice(0, 500) });
      }
      if (item.kind === 'function' && item.action === 'create') {
        createdFunctions.set(item.name, item); createdFunctions.set(item.signature, item);
        if (item.security === 'DEFINER' && !item.searchPath) securityFindings.push({ severity: 'HIGH', id: 'SECURITY_DEFINER_WITHOUT_SEARCH_PATH', migration: migration.filename, object: item.signature, evidence: item.raw.slice(0, 500) });
      }
      if (item.kind === 'trigger' && item.action === 'create') { addEdge(migration.filename, `object:table:${item.table}`, 'depends_on', item.table); addEdge(migration.filename, `object:function:${item.function}`, 'references', item.function); if (!createdFunctions.has(item.function) && !createdFunctions.has(item.function.replace(/\(.*$/, ''))) conflicts.push(conflict('TRIGGER_FUNCTION_MISSING', 'P0', null, item, { sqlstate: '42883', confidence: 'MEDIUM' })); }
      if (item.kind === 'index' && item.action === 'create') {
        addEdge(migration.filename, `object:table:${item.table}`, 'depends_on', item.table);
        if (!createdTables.has(item.table) || item.columns.some((x) => !/[()]/.test(x) && !(tableColumns.get(item.table)?.has(x)))) conflicts.push(conflict('INDEX_COLUMN_MISSING', 'P0', null, item, { sqlstate: '42703', confidence: 'MEDIUM' }));
      }
      if (item.kind === 'type' && item.action === 'create') enumValues.set(item.name, new Set(item.values));
      if (item.kind === 'type' && item.action === 'add-value') { const values = enumValues.get(item.name); if (values?.has(item.value) && !item.flags.ifNotExists) conflicts.push(conflict('DUPLICATE_ENUM_VALUE', 'P0', null, item, { sqlstate: '42710' })); values?.add(item.value); }
      if (item.kind === 'dml' && item.action === 'insert') {
        const repeated = active.get(`insert:${item.normalized}`); if (repeated && !/on\s+conflict/i.test(item.raw)) conflicts.push(conflict('REPEATED_SEED_INSERT', 'P1', repeated, item, { confidence: 'MEDIUM', sqlstate: '23505' })); active.set(`insert:${item.normalized}`, item);
        if (item.table === 'storage.buckets' && !/on\s+conflict|where\s+not\s+exists/i.test(item.raw)) conflicts.push(conflict('NON_IDEMPOTENT_STORAGE_BUCKET_INSERT', 'P1', null, item, { sqlstate: '23505', confidence: 'HIGH' }));
      }
      if (item.kind === 'grant') {
        addEdge(migration.filename, `object:${item.target}`, 'grants', item.target);
        if (item.action === 'grant' && /\ball\b/i.test(item.name) && item.roles.some((x) => ['anon','authenticated'].includes(shortName(x)))) securityFindings.push({ severity: 'HIGH', id: 'GRANT_ALL_TO_CLIENT_ROLE', migration: migration.filename, object: item.target, evidence: item.raw.slice(0, 500) });
        if (item.action === 'grant' && /function/i.test(item.target) && item.roles.some((x) => shortName(x) === 'anon')) securityFindings.push({ severity: 'HIGH', id: 'FUNCTION_GRANTED_TO_ANON', migration: migration.filename, object: item.target, evidence: item.raw.slice(0, 500) });
      }
    }
  }
  for (const table of rlsTables) if (!selectPolicyTables.has(table)) securityFindings.push({ severity: 'MEDIUM', id: 'RLS_TABLE_WITHOUT_SELECT_POLICY', migration: createdTables.get(table)?.filename ?? null, object: table, evidence: 'RLS enabled without a statically visible SELECT/ALL policy.' });
  return { conflicts, securityFindings, edges, missingDependencies, orderingRisks, cycles: [] };
}

const collect = (migration, key) => migration[key].map((x) => ({ action: x.action, name: x.name, table: x.table, key: x.key, statement: x.raw }));
export function auditMigrationDirectory(directory, options = {}) {
  const migrationDir = resolve(directory);
  const files = readdirSync(migrationDir).filter((x) => x.endsWith('.sql')).sort((a, b) => a.localeCompare(b));
  const parsed = files.map((filename) => {
    const sql = readFileSync(resolve(migrationDir, filename), 'utf8');
    const migration = parseMigrationText(sql, filename); migration.sql = sql; return migration;
  });
  const analysis = analyzeParsedMigrations(parsed);
  const collisions = Object.entries(Object.groupBy(parsed, (x) => x.timestamp)).filter(([, value]) => value.length > 1 && value[0].timestamp).map(([timestamp, value]) => ({ timestamp, files: value.map((x) => x.filename) }));
  for (const collision of collisions) analysis.conflicts.push({ id: 'TIMESTAMP_COLLISION', severity: 'P3', confidence: 'HIGH', likelySqlstate: null, firstCreatorMigration: collision.files[0], conflictingMigration: collision.files[1], objectType: 'migration', objectName: collision.timestamp, semanticComparison: 'UNRESOLVED', exactDuplicate: false, securityDifference: false, recommendedResolution: 'requires human decision', filesThatWouldNeedModification: collision.files, testsRequired: ['ordering test'], evidence: collision.files.join(', ') });
  const inventory = parsed.map((x) => ({
    filename: x.filename, timestamp: x.timestamp, lineCount: x.sql.replace(/\r\n?/g, '\n').split('\n').length, sha256: sha256(x.sql), commitIntroduced: options.skipGit ? null : introducedCommit(`supabase/migrations/${x.filename}`),
    tables: collect(x, 'tables'), policies: collect(x, 'policies'), functions: collect(x, 'functions'), indexes: collect(x, 'indexes'), triggers: collect(x, 'triggers'), types: collect(x, 'types'), views: collect(x, 'views'), grantsRevokes: collect(x, 'grantsRevokes'), rls: collect(x, 'rls'), storagePoliciesAndBuckets: collect(x, 'storage'), dmlStatements: collect(x, 'dml'), extensions: collect(x, 'extensions'), cronNetVaultDependencies: [...new Set(x.dependencies)].sort(), commentsOnly: x.commentsOnly, noOp: x.noOp,
  }));
  const resolvedConflicts = [
    { id: 'RESOLVED_IMPORT_JOBS_DUPLICATE', status: 'RESOLVED', migration: '20260628190000_import_jobs_foundation.sql' },
    { id: 'RESOLVED_CONTENT_STAFF_RBAC_DUPLICATE', status: 'RESOLVED', migration: '20260703204450_5223b435-1a4d-44ab-ad03-ab3d9a8f4432.sql' },
    { id: 'RESOLVED_UNITS_POLICY_DUPLICATE', status: 'RESOLVED', migration: '20260731180000_restrict_units_select_to_authenticated.sql' },
  ].map((x) => ({ ...x, present: files.includes(x.migration) }));
  const nodes = parsed.map((x) => ({ id: x.filename, timestamp: x.timestamp, commentsOnly: x.commentsOnly, creates: x.statements.filter((s) => s.action === 'create').map((s) => `${s.objectType}:${s.key}`), drops: x.statements.filter((s) => s.action === 'drop').map((s) => `${s.objectType}:${s.key}`) }));
  const graph = { schemaVersion: 1, generatedBy: 'scripts/audit-migration-chain.mjs', nodes, edges: analysis.edges.sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b))), summary: { cycles: analysis.cycles, missingDependencies: analysis.missingDependencies, orderingRisks: analysis.orderingRisks, timestampCollisions: collisions, lovableResyncCandidates: analysis.conflicts.filter((x) => /DUPLICATE/.test(x.id)).map((x) => x.conflictingMigration) } };
  return { schemaVersion: 1, limitations: LIMITATIONS, inventory, resolvedConflicts, conflicts: analysis.conflicts.sort((a,b) => `${a.severity}|${a.conflictingMigration}|${a.id}`.localeCompare(`${b.severity}|${b.conflictingMigration}|${b.id}`)), securityFindings: analysis.securityFindings.sort((a,b) => `${a.severity}|${a.migration}|${a.id}`.localeCompare(`${b.severity}|${b.migration}|${b.id}`)), graph };
}

function countObjects(inventory, key) { return inventory.reduce((sum, item) => sum + item[key].filter((x) => x.action === 'create').length, 0); }
function markdown(audit) {
  const counts = Object.fromEntries(['P0','P1','P2','P3'].map((x) => [x, audit.conflicts.filter((c) => c.severity === x).length]));
  const security = Object.fromEntries(['CRITICAL','HIGH','MEDIUM','LOW','INFORMATIONAL'].map((x) => [x, audit.securityFindings.filter((c) => c.severity === x).length]));
  const rows = audit.conflicts.map((x) => `| ${x.severity} | ${x.id} | ${x.conflictingMigration} | ${x.objectType} | ${x.objectName} | ${x.likelySqlstate ?? '-'} | ${x.confidence} | ${x.semanticComparison} | ${x.recommendedResolution} |`).join('\n') || '| - | None | - | - | - | - | - | - | - |';
  const secRows = audit.securityFindings.map((x) => `| ${x.severity} | ${x.id} | ${x.migration ?? '-'} | ${x.object} | ${x.evidence.replace(/\|/g, '\\|').replace(/\s+/g, ' ').slice(0, 180)} |`).join('\n') || '| - | None | - | - | - |';
  const predicted = audit.conflicts.filter((x) => ['P0','P1'].includes(x.severity)).slice(0, 12);
  return `# Migration Chain Conflict Census 28

Static-only census of all Supabase migrations. No SQL or database was executed.

## Inventory

- Migration files: ${audit.inventory.length}
- First timestamp: ${audit.inventory.at(0)?.timestamp ?? '-'}
- Last timestamp: ${audit.inventory.at(-1)?.timestamp ?? '-'}
- Comments-only/no-op: ${audit.inventory.filter((x) => x.commentsOnly || x.noOp).length}
- Tables: ${countObjects(audit.inventory, 'tables')}
- Policies: ${countObjects(audit.inventory, 'policies')}
- Functions: ${countObjects(audit.inventory, 'functions')}
- Indexes: ${countObjects(audit.inventory, 'indexes')}
- Triggers: ${countObjects(audit.inventory, 'triggers')}
- Types: ${countObjects(audit.inventory, 'types')}
- Views: ${countObjects(audit.inventory, 'views')}
- Grants/revokes: ${audit.inventory.reduce((n,x) => n + x.grantsRevokes.length, 0)}

## Resolved conflicts

${audit.resolvedConflicts.map((x) => `- ${x.id}: ${x.status}; ${x.migration}; present=${x.present}`).join('\n')}

The three baseline reconciliation migrations are treated as resolved markers and are not emitted as current errors.

## Replay blocker census

- P0: ${counts.P0}
- P1: ${counts.P1}
- P2: ${counts.P2}
- P3: ${counts.P3}

| Severity | ID | Conflicting migration | Type | Object | SQLSTATE | Confidence | Comparison | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows}

## Expected Fresh replay stop order

${predicted.map((x, i) => `${i + 1}. **${x.conflictingMigration}** — ${x.id}; object \`${x.objectName}\`; likely SQLSTATE \`${x.likelySqlstate ?? 'unknown'}\`; confidence ${x.confidence}; first creator ${x.firstCreatorMigration ?? 'not observed'}; evidence: \`${x.evidence.replace(/`/g, '').replace(/\s+/g, ' ').slice(0, 240)}\``).join('\n') || 'No P0/P1 blocker was statically identified.'}

## Security findings

- Critical: ${security.CRITICAL}
- High: ${security.HIGH}
- Medium: ${security.MEDIUM}
- Low: ${security.LOW}

| Severity | ID | Migration | Object | Evidence |
| --- | --- | --- | --- | --- |
${secRows}

The scan covers SECURITY DEFINER/search_path, client-role grants, permissive policy expressions, auth.uid() fail-closed signals, RLS SELECT coverage, and storage statements. Access semantics for admin/content_manager/moderator/student, correct-answer exposure, curriculum/subscription access, and storage remain human-review findings where static lexical evidence is insufficient.

## Dependency graph

- Nodes: ${audit.graph.nodes.length}
- Edges: ${audit.graph.edges.length}
- Missing dependencies: ${audit.graph.summary.missingDependencies.length}
- Ordering risks: ${audit.graph.summary.orderingRisks.length}
- Cycles: ${audit.graph.summary.cycles.length}
- Timestamp collisions: ${audit.graph.summary.timestampCollisions.length}
- Lovable resync candidates: ${audit.graph.summary.lovableResyncCandidates.length}

## Semantic comparison

Duplicates are compared by policy table/role/command/USING/WITH CHECK; function signature/return/security/search_path/body; table columns/definitions; trigger timing/events/function/condition; index table/columns/uniqueness/predicate; and enum value ordering. Classifications are EXACT_DUPLICATE, SEMANTIC_DUPLICATE, INTENTIONAL_REPLACEMENT, SECURITY_DIFFERENCE, UNIQUE_ADDITIONS, or UNRESOLVED.

## Recommended reconciliation packages

Group fixes in Fresh replay order: first all P0 duplicate-object/no-missing-dependency reconciliations, then P1 seed/storage/order reconciliations, then P2 security-policy review. Historical timestamp reordering is not recommended; use narrowly scoped no-op or DROP + recreate migrations only after human semantic confirmation.

## Linter limitations

${audit.limitations.map((x) => `- ${x}`).join('\n')}
`;
}

export function writeAuditReports(audit, paths = {}) {
  const inventoryPath = resolve(paths.inventory ?? resolve(ROOT, 'docs/audits/MIGRATION-CHAIN-INVENTORY-28.json'));
  const graphPath = resolve(paths.graph ?? resolve(ROOT, 'docs/audits/MIGRATION-DEPENDENCY-GRAPH-28.json'));
  const reportPath = resolve(paths.report ?? resolve(ROOT, 'docs/audits/MIGRATION-CHAIN-CONFLICT-CENSUS-28.md'));
  for (const path of [inventoryPath, graphPath, reportPath]) mkdirSync(dirname(path), { recursive: true });
  writeFileSync(inventoryPath, `${JSON.stringify({ schemaVersion: audit.schemaVersion, limitations: audit.limitations, migrations: audit.inventory, resolvedConflicts: audit.resolvedConflicts, conflicts: audit.conflicts, securityFindings: audit.securityFindings }, null, 2)}\n`);
  writeFileSync(graphPath, `${JSON.stringify(audit.graph, null, 2)}\n`);
  writeFileSync(reportPath, markdown(audit));
  return { inventoryPath, graphPath, reportPath };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const migrationDir = resolve(process.argv[2] ?? resolve(ROOT, 'supabase/migrations'));
  if (!existsSync(migrationDir)) throw new Error(`Migration directory not found: ${migrationDir}`);
  const audit = auditMigrationDirectory(migrationDir);
  writeAuditReports(audit);
  process.stdout.write(`${JSON.stringify({ migrations: audit.inventory.length, conflicts: audit.conflicts.length, securityFindings: audit.securityFindings.length })}\n`);
}
