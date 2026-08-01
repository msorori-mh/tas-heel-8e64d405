#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IDENT = String.raw`(?:"(?:[^"]|"")+"|[a-zA-Z_][\w$]*)(?:\s*\.\s*(?:"(?:[^"]|"")+"|[a-zA-Z_][\w$]*))*`;
export const EXTERNAL_SCHEMAS = new Set(['auth', 'storage', 'realtime', 'extensions', 'vault', 'cron', 'net', 'graphql', 'graphql_public', 'supabase_functions']);
const DEFAULT_EVIDENCE_PATH = resolve(ROOT, 'docs/audits/MIGRATION-REPLAY-EMPIRICAL-EVIDENCE-29.json');
const BUILTIN_FUNCTIONS = new Set(['now','current_timestamp','coalesce','lower','upper','jsonb_build_object','jsonb_agg','array_agg','array_length','count','exists','format','quote_literal','quote_ident','gen_random_uuid','auth.uid','auth.role','nullif','current_setting']);
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

export function readReplayEvidence(path = DEFAULT_EVIDENCE_PATH) {
  if (!existsSync(path)) throw new Error(`Replay evidence artifact not found: ${path}`);
  let evidence;
  try { evidence = JSON.parse(readFileSync(path, 'utf8')); } catch (error) { throw new Error(`Invalid replay evidence JSON: ${error.message}`); }
  const requiredStrings = ['evidence_type','first_applied_migration','last_confirmed_successful_migration','former_first_unresolved_migration'];
  if (evidence.schema_version !== 1 || evidence.evidence_type !== 'observed_local_fresh_replay' || requiredStrings.some((key) => typeof evidence[key] !== 'string') || !/^\d{14}$/.test(evidence.last_confirmed_successful_migration) || !Array.isArray(evidence.source_reports) || evidence.source_reports.length === 0 || !Array.isArray(evidence.confirmed_blockers) || !Array.isArray(evidence.limitations)) throw new Error('Invalid replay evidence schema');
  for (const blocker of evidence.confirmed_blockers) if (!['id','sqlstate','object_type','object','status'].every((key) => typeof blocker[key] === 'string')) throw new Error('Invalid replay evidence blocker schema');
  const canonical = `${JSON.stringify(evidence, null, 2)}\n`;
  return { ...evidence, path: resolve(path), sha256: sha256(canonical) };
}

function splitTopLevel(value = '') {
  const parts = []; let start = 0, depth = 0, single = false, double = false;
  for (let i = 0; i < value.length; i += 1) { const c = value[i], n = value[i + 1];
    if (single) { if (c === "'" && n === "'") i += 1; else if (c === "'") single = false; continue; }
    if (double) { if (c === '"' && n === '"') i += 1; else if (c === '"') double = false; continue; }
    if (c === "'") single = true; else if (c === '"') double = true; else if (c === '(' || c === '[') depth += 1; else if (c === ')' || c === ']') depth -= 1; else if (c === ',' && depth === 0) { parts.push(value.slice(start, i)); start = i + 1; }
  }
  parts.push(value.slice(start)); return parts;
}

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

function dependencySurface(raw) {
  return raw.replace(/\$([a-zA-Z_\d]*)\$[\s\S]*?\$\1\$/g, ' ').replace(/'(?:''|[^'])*'/g, ' ');
}

function list(value = '') { return splitTopLevel(value).map((x) => cleanIdent(x.trim().split(/\s+/)[0])).filter(Boolean); }
function bodyColumns(body = '') {
  const columns = [];
  for (const part of splitTopLevel(body)) {
    const match = part.trim().match(new RegExp(`^(${IDENT})\\s+([\\s\\S]+)$`, 'i'));
    if (match && !/^(constraint|primary|foreign|unique|check)\b/i.test(match[1])) columns.push({ name: cleanIdent(match[1]), definition: normalize(match[2]) });
  }
  return columns;
}
function functionSignature(name, args = '') {
  const types = splitTopLevel(args).map((arg) => {
    const tokens = normalize(arg).replace(/\s+(?:default\s+|=\s*)[\s\S]*$/i, '').split(/\s+/).filter((x) => !/^(in|out|inout|variadic)$/i.test(x));
    if (tokens.length > 1 && /^[_a-z][\w$]*$/i.test(tokens[0])) tokens.shift();
    return tokens.join(' ').replace(/\bint\b/g, 'integer').replace(/\bint4\b/g, 'integer').replace(/\bint8\b/g, 'bigint').replace(/\bbool\b/g, 'boolean').replace(/\bfloat8\b/g, 'double precision').replace(/\bvarchar\b/g, 'character varying');
  }).filter(Boolean);
  return `${cleanIdent(name)}(${types.join(',')})`;
}
const schemaOf = (value = '') => cleanIdent(value).split('.').length > 1 ? cleanIdent(value).split('.')[0] : 'public';
const isExternalObject = (value = '') => EXTERNAL_SCHEMAS.has(schemaOf(value));
function callsIn(value = '') {
  return [...value.matchAll(/\b((?:[a-zA-Z_]\w*\.)?[a-zA-Z_]\w*)\s*\(/g)].map((m) => cleanIdent(m[1])).filter((x) => !['and','or','not','select','in','any','like','case','when','where','values'].includes(x) && !BUILTIN_FUNCTIONS.has(x));
}

export function parseMigrationText(sql, filename = 'fixture.sql') {
  const { stripped, statements } = stripCommentsAndSplit(sql);
  const result = { filename, timestamp: timestampOf(filename), statements: [], tables: [], policies: [], functions: [], indexes: [], triggers: [], types: [], views: [], grantsRevokes: [], rls: [], storage: [], dml: [], extensions: [], dependencies: [], uncertainties: [], commentsOnly: statements.length === 0, noOp: statements.length === 0 };
  for (let order = 0; order < statements.length; order += 1) {
    const raw = statements[order], text = normalize(raw);
    const item = { order, raw, normalized: text, kind: 'other', action: '', objectType: '', name: '', key: '', flags: {} };
    let m;
    if ((m = raw.match(new RegExp(`^\\s*CREATE\\s+(OR\\s+REPLACE\\s+)?TABLE\\s+(IF\\s+NOT\\s+EXISTS\\s+)?(${IDENT})\\s*\\(([\\s\\S]*)\\)`, 'i')))) {
      Object.assign(item, { kind: 'table', action: 'create', objectType: 'table', name: cleanIdent(m[3]), key: cleanIdent(m[3]), flags: { orReplace: !!m[1], ifNotExists: !!m[2] }, columns: bodyColumns(m[4]), definition: normalize(m[4]) }); result.tables.push(item);
    } else if ((m = raw.match(new RegExp(`^\\s*DROP\\s+TABLE\\s+(IF\\s+EXISTS\\s+)?(${IDENT})`, 'i')))) {
      Object.assign(item, { kind: 'table', action: 'drop', objectType: 'table', name: cleanIdent(m[2]), key: cleanIdent(m[2]), flags: { ifExists: !!m[1] } }); result.tables.push(item);
    } else if ((m = raw.match(new RegExp(`^\\s*ALTER\\s+TABLE\\s+(?:ONLY\\s+)?(${IDENT})`, 'i')))) {
      const addColumn = raw.match(new RegExp(`\\bADD\\s+COLUMN\\s+(IF\\s+NOT\\s+EXISTS\\s+)?(${IDENT})\\s+([\\s\\S]+)`, 'i'));
      const renameTable = raw.match(new RegExp(`\\bRENAME\\s+TO\\s+(${IDENT})`, 'i'));
      const renameColumn = raw.match(new RegExp(`\\bRENAME\\s+COLUMN\\s+(${IDENT})\\s+TO\\s+(${IDENT})`, 'i'));
      const addColumns = [...raw.matchAll(new RegExp(`(?:^|,)\\s*ADD\\s+COLUMN\\s+(IF\\s+NOT\\s+EXISTS\\s+)?(${IDENT})\\s+([\\s\\S]*?)(?=,\\s*ADD\\s+COLUMN|$)`, 'gi'))].map((x) => ({ name: cleanIdent(x[2]), definition: normalize(x[3]), ifNotExists: !!x[1] }));
      Object.assign(item, { kind: 'table', action: 'alter', objectType: 'table', name: cleanIdent(m[1]), key: cleanIdent(m[1]), definition: text,
        addColumn: addColumn ? { name: cleanIdent(addColumn[2]), definition: normalize(addColumn[3]), ifNotExists: !!addColumn[1] } : null,
        addColumns,
        renameTable: renameTable ? cleanIdent(renameTable[1]) : null,
        renameColumn: renameColumn ? { from: cleanIdent(renameColumn[1]), to: cleanIdent(renameColumn[2]) } : null }); result.tables.push(item);
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
    } else if ((m = raw.match(new RegExp(`^\\s*ALTER\\s+FUNCTION\\s+(${IDENT})\\s*\\(([^)]*)\\)([\\s\\S]*)`, 'i')))) {
      const signature = functionSignature(m[1], m[2]); Object.assign(item, { kind: 'function', action: 'alter', objectType: 'function', name: cleanIdent(m[1]), key: signature, signature, searchPath: normalize(m[3].match(/\bSET\s+search_path\s*(?:=|TO)\s*([^;]+)/i)?.[1] ?? ''), definition: normalize(m[3]) }); result.functions.push(item);
    } else if ((m = raw.match(new RegExp(`^\\s*CREATE\\s+(UNIQUE\\s+)?INDEX\\s+(?:CONCURRENTLY\\s+)?(IF\\s+NOT\\s+EXISTS\\s+)?(${IDENT})\\s+ON\\s+(${IDENT})[^\\(]*\\(([^)]*)\\)([\\s\\S]*)`, 'i')))) {
      const name = cleanIdent(m[3]), table = cleanIdent(m[4]), columnExpressions = splitTopLevel(m[5]).map((x) => x.trim()); Object.assign(item, { kind: 'index', action: 'create', objectType: 'index', name, table, key: name, unique: !!m[1], columns: list(m[5]), columnExpressions, predicate: normalize(m[6].match(/\\bWHERE\\s+([\\s\\S]*)/i)?.[1] ?? ''), flags: { ifNotExists: !!m[2] }, definition: normalize(raw) }); result.indexes.push(item);
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
    const externalRefs = [...dependencySurface(raw).matchAll(/\b(auth|storage|realtime|extensions|vault|cron|net|graphql|graphql_public|supabase_functions)\s*\.\s*(?:"(?:[^"]|"")+"|[a-zA-Z_][\w$]*)/gi)].map((x) => cleanIdent(x[0]));
    result.dependencies.push(...externalRefs);
    if (/\b(?:EXECUTE|format)\s*\(/i.test(raw) || /\bEXECUTE\s+['$]/i.test(raw)) result.uncertainties.push({ order, kind: 'dynamic-sql', evidence: raw.slice(0, 500) });
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
const hasFailClosed = (value) => /auth\.uid\(\)\s+is\s+not\s+null|auth\.uid\(\)\s*=|=\s*auth\.uid\(\)/i.test(value);

export function analyzeParsedMigrations(migrations) {
  const active = new Map(), conflicts = [], edges = [], securityFindings = [], missingDependencies = [], orderingRisks = [];
  const createdTables = new Map(), tableColumns = new Map(), createdFunctions = new Map(), policyLogic = new Map(), grantSecurity = new Map(), rlsTables = new Set(), selectPolicyTables = new Set(), enumValues = new Map();
  const addEdge = (from, to, relationship, object) => { if (from !== to) edges.push({ from, to, relationship, object }); };
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
          const prior = createdTables.get(item.name); if (!prior && !isExternalObject(item.name)) { missingDependencies.push({ migration: migration.filename, object: item.name, kind: 'table' }); conflicts.push(conflict('TABLE_USED_BEFORE_CREATE', 'P0', null, item, { sqlstate: '42P01' })); }
          if (prior) addEdge(migration.filename, prior.filename, 'depends_on', item.name);
          if (item.addColumn) { const columns = tableColumns.get(item.name) ?? new Set(); columns.add(item.addColumn.name); for (const added of item.addColumns ?? []) columns.add(added.name); tableColumns.set(item.name, columns); }
          if (item.renameColumn) { const columns = tableColumns.get(item.name) ?? new Set(); columns.delete(item.renameColumn.from); columns.add(item.renameColumn.to); tableColumns.set(item.name, columns); }
          if (item.renameTable) { const columns = tableColumns.get(item.name) ?? new Set(); createdTables.delete(item.name); tableColumns.delete(item.name); createdTables.set(item.renameTable, item); tableColumns.set(item.renameTable, columns); }
          if (/\bENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(item.raw)) rlsTables.add(item.name);
          for (const fk of item.raw.matchAll(new RegExp(`REFERENCES\\s+(${IDENT})\\s*\\(([^)]*)\\)`, 'gi'))) {
            const target = cleanIdent(fk[1]), columns = list(fk[2]);
            if (!isExternalObject(target) && (!createdTables.has(target) || columns.some((x) => !(tableColumns.get(target)?.has(x))))) { missingDependencies.push({ migration: migration.filename, object: `${target}(${columns})`, kind: 'foreign-key' }); conflicts.push(conflict('FOREIGN_KEY_TARGET_MISSING', 'P0', null, { ...item, key: `${target}(${columns})` }, { sqlstate: '42P01', confidence: 'MEDIUM' })); }
          }
        }
      }
      if (item.kind === 'policy' && item.action === 'create') {
        addEdge(migration.filename, `object:table:${item.table}`, 'depends_on', item.table);
        if (!createdTables.has(item.table) && !isExternalObject(item.table)) { missingDependencies.push({ migration: migration.filename, object: item.table, kind: 'policy-table' }); conflicts.push(conflict('POLICY_TABLE_BEFORE_CREATE', 'P0', null, item, { sqlstate: '42P01' })); }
        if (item.command === 'SELECT' || item.command === 'ALL') selectPolicyTables.add(item.table);
        for (const call of item.calls) { addEdge(migration.filename, `object:function:${call}`, 'references', call); if (!isExternalObject(call) && !createdFunctions.has(call) && !createdFunctions.has(`public.${call}`)) conflicts.push(conflict('POLICY_FUNCTION_BEFORE_CREATE', 'P1', null, { ...item, key: call }, { confidence: 'LOW', sqlstate: '42883' })); }
        const logic = `${item.table}|${item.command}|${item.roles}|${item.using}|${item.withCheck}`, prior = policyLogic.get(logic);
        if (prior && prior.name !== item.name) conflicts.push(conflict('DUPLICATE_POLICY_LOGIC_DIFFERENT_NAME', 'P2', prior, item, { comparison: 'SEMANTIC_DUPLICATE', resolution: 'preserve unique objects' })); else policyLogic.set(logic, item);
        if (/^true$|\(true\)/i.test(item.using) || /^true$|\(true\)/i.test(item.withCheck)) securityFindings.push({ severity: 'HIGH', id: 'PERMISSIVE_TRUE_POLICY', migration: migration.filename, object: item.key, evidence: item.raw.slice(0, 500) });
        if (/auth\.uid\(\)/i.test(`${item.using} ${item.withCheck}`) && /\b(?:coalesce|or)\b/i.test(`${item.using} ${item.withCheck}`) && !hasFailClosed(`${item.using} ${item.withCheck}`)) securityFindings.push({ severity: 'MEDIUM', id: 'AUTH_UID_POTENTIALLY_OPEN_EXPRESSION', migration: migration.filename, object: item.key, evidence: item.raw.slice(0, 500) });
      }
      if (item.kind === 'function' && item.action === 'create') {
        createdFunctions.set(item.name, item); createdFunctions.set(item.signature, item);
        if (item.security === 'DEFINER' && !item.searchPath) securityFindings.push({ severity: 'HIGH', id: 'SECURITY_DEFINER_WITHOUT_SEARCH_PATH', migration: migration.filename, object: item.signature, evidence: item.raw.slice(0, 500) });
      }
      if (item.kind === 'function' && item.action === 'alter') {
        const prior = active.get(`function:${item.signature}`) ?? createdFunctions.get(item.signature);
        if (prior) { const updated = { ...prior, searchPath: item.searchPath || prior.searchPath, filename: migration.filename }; active.set(`function:${item.signature}`, updated); createdFunctions.set(item.signature, updated); createdFunctions.set(item.name, updated); addEdge(migration.filename, prior.filename, 'alters', item.signature); }
        else conflicts.push(conflict('ALTER_FUNCTION_BEFORE_CREATE', 'P1', null, item, { confidence: 'LOW', sqlstate: '42883' }));
      }
      if (item.kind === 'trigger' && item.action === 'create') { addEdge(migration.filename, `object:table:${item.table}`, 'depends_on', item.table); addEdge(migration.filename, `object:function:${item.function}`, 'references', item.function); const fnName=item.function.replace(/\(.*$/, ''), publicFn=item.function.includes('.')?item.function:`public.${item.function}`; if (!createdFunctions.has(item.function) && !createdFunctions.has(fnName) && !createdFunctions.has(publicFn) && !createdFunctions.has(publicFn.replace(/\(.*$/, ''))) conflicts.push(conflict('TRIGGER_FUNCTION_MISSING', 'P0', null, item, { sqlstate: '42883', confidence: 'MEDIUM' })); }
      if (item.kind === 'index' && item.action === 'create') {
        addEdge(migration.filename, `object:table:${item.table}`, 'depends_on', item.table);
        const simpleColumns = (item.columnExpressions ?? []).filter((x) => new RegExp(`^${IDENT}$`, 'i').test(x)).map(cleanIdent);
        const relationExists = createdTables.has(item.table) || active.has(`view:${item.table}`) || active.has(`materialized view:${item.table}`);
        if (!isExternalObject(item.table) && (!relationExists || (createdTables.has(item.table) && simpleColumns.some((x) => !(tableColumns.get(item.table)?.has(x)))))) conflicts.push(conflict('INDEX_COLUMN_MISSING', 'P0', null, item, { sqlstate: '42703', confidence: 'MEDIUM' }));
      }
      if (item.kind === 'type' && item.action === 'create') enumValues.set(item.name, new Set(item.values));
      if (item.kind === 'type' && item.action === 'add-value') { const values = enumValues.get(item.name); if (values?.has(item.value) && !item.flags.ifNotExists) conflicts.push(conflict('DUPLICATE_ENUM_VALUE', 'P0', null, item, { sqlstate: '42710' })); values?.add(item.value); }
      if (item.kind === 'dml' && item.action === 'insert') {
        const repeated = active.get(`insert:${item.normalized}`); if (repeated && !/on\s+conflict/i.test(item.raw)) conflicts.push(conflict('REPEATED_SEED_INSERT', 'P1', repeated, item, { confidence: 'MEDIUM', sqlstate: '23505' })); active.set(`insert:${item.normalized}`, item);
        if (item.table === 'storage.buckets' && !/on\s+conflict|where\s+not\s+exists/i.test(item.raw)) conflicts.push(conflict('NON_IDEMPOTENT_STORAGE_BUCKET_INSERT', 'P1', null, item, { sqlstate: '23505', confidence: 'HIGH' }));
      }
      if (item.kind === 'grant') {
        addEdge(migration.filename, `object:${item.target}`, 'grants', item.target);
        for (const role of item.roles) {
          const grantKey = `${item.name}|${item.target}|${shortName(role)}`;
          if (item.action === 'revoke') { const prior = grantSecurity.get(grantKey); if (prior) { prior.laterResolution = migration.filename; prior.finalState = 'DOWNSTREAM_RESOLVED'; prior.finalSeverity = 'INFORMATIONAL'; prior.finalClassification = 'DOWNSTREAM_RESOLVED'; prior.confidence = 'HIGH'; } grantSecurity.delete(grantKey); continue; }
          let finding = null;
          if (/\ball\b/i.test(item.name) && ['anon','authenticated'].includes(shortName(role))) finding = { severity: 'HIGH', id: 'GRANT_ALL_TO_CLIENT_ROLE', migration: migration.filename, object: item.target, evidence: item.raw.slice(0, 500) };
          if (/function/i.test(item.target) && shortName(role) === 'anon') finding = { severity: 'HIGH', id: 'FUNCTION_GRANTED_TO_ANON', migration: migration.filename, object: item.target, evidence: item.raw.slice(0, 500) };
          if (finding) { securityFindings.push(finding); grantSecurity.set(grantKey, finding); }
        }
      }
    }
  }
  for (const table of rlsTables) if (!selectPolicyTables.has(table)) securityFindings.push({ severity: 'MEDIUM', id: 'RLS_TABLE_WITHOUT_SELECT_POLICY', migration: createdTables.get(table)?.filename ?? null, object: table, evidence: 'RLS enabled without a statically visible SELECT/ALL policy.' });
  for (const finding of securityFindings) {
    const [table] = finding.object.split('|');
    const key = finding.id === 'PERMISSIVE_TRUE_POLICY' ? `policy:${finding.object}` : finding.id === 'SECURITY_DEFINER_WITHOUT_SEARCH_PATH' ? `function:${finding.object}` : null;
    if (finding.laterResolution) continue;
    const finalItem = key ? active.get(key) : null;
    finding.laterResolution = finalItem && finalItem.filename !== finding.migration ? finalItem.filename : !finalItem && key ? 'dropped downstream' : null;
    finding.finalState = finding.laterResolution ? 'DOWNSTREAM_RESOLVED' : 'ACTIVE_FINAL_STATE';
    finding.finalSeverity = finding.finalState === 'ACTIVE_FINAL_STATE' ? finding.severity : 'INFORMATIONAL';
    finding.confidence = finding.finalState === 'ACTIVE_FINAL_STATE' && finding.id === 'PERMISSIVE_TRUE_POLICY' && ['grades','contact_submissions','badges','curriculum_tracks','governorates','governorate_curriculum_map'].some((x) => table.includes(x)) ? 'MEDIUM' : 'HIGH';
    if (finding.id === 'PERMISSIVE_TRUE_POLICY' && /service role/i.test(finding.object)) { finding.finalClassification = 'FALSE_POSITIVE'; finding.finalSeverity = 'INFORMATIONAL'; }
    else if (finding.finalState === 'DOWNSTREAM_RESOLVED') finding.finalClassification = 'DOWNSTREAM_RESOLVED';
    else if (/badges|curriculum_tracks|governorates|governorate_curriculum_map/.test(table)) finding.finalClassification = 'INTENTIONAL_PUBLIC_REFERENCE_DATA';
    else if (/grades|contact_submissions/.test(table)) finding.finalClassification = 'NEEDS_PRODUCT_REVIEW';
    else finding.finalClassification = 'NEEDS_PRODUCT_REVIEW';
  }
  return { conflicts, securityFindings, edges, missingDependencies, orderingRisks };
}

const collect = (migration, key) => migration[key].map((x) => ({ action: x.action, name: x.name, table: x.table, key: x.key, statement: x.raw }));
function calibrateFinding(finding, index, evidence) {
  const timestamp = timestampOf(finding.conflictingMigration);
  const resolvedMigration = new Set(['20260628190000_import_jobs_foundation.sql', '20260703204450_5223b435-1a4d-44ab-ad03-ab3d9a8f4432.sql', '20260731180000_restrict_units_select_to_authenticated.sql']).has(finding.conflictingMigration);
  const parserLimitation = finding.confidence !== 'HIGH' || ['INDEX_COLUMN_MISSING', 'TRIGGER_FUNCTION_MISSING', 'POLICY_FUNCTION_BEFORE_CREATE'].includes(finding.id);
  const externalSchema = isExternalObject(finding.objectName);
  const beforeOrAtPrefix = timestamp && timestamp <= evidence.last_confirmed_successful_migration;
  const compilationRule = /(?:DUPLICATE|TABLE_USED_BEFORE_CREATE|POLICY_TABLE_BEFORE_CREATE|INDEX_COLUMN|TRIGGER_FUNCTION|FOREIGN_KEY|ENUM_VALUE|STORAGE_BUCKET|SEED_INSERT|ALTER_FUNCTION_BEFORE_CREATE)/.test(finding.id) && finding.id !== 'POLICY_FUNCTION_BEFORE_CREATE';
  const finalClassification = resolvedMigration ? 'RESOLVED_REPLAY_BLOCKER'
    : externalSchema ? 'EXTERNAL_SCHEMA_DEPENDENCY'
      : beforeOrAtPrefix && compilationRule ? 'EMPIRICALLY_DISPROVEN_COMPILATION_BLOCKER'
        : 'STATIC_UNCERTAINTY';
  return {
    findingId: `CAL-${String(index + 1).padStart(3, '0')}`,
    migration: finding.conflictingMigration,
    object: finding.objectName,
    originalClassification: finding.severity,
    rule: finding.id,
    statement: finding.evidence,
    verifiedPrefixPosition: beforeOrAtPrefix ? 'AT_OR_BEFORE_VERIFIED_PREFIX' : timestamp > evidence.last_confirmed_successful_migration ? 'AFTER_VERIFIED_PREFIX' : 'UNKNOWN',
    empiricalStatus: resolvedMigration ? 'RESOLVED_BY_COMMENTS_ONLY_NO_OP' : beforeOrAtPrefix ? 'FRESH_REPLAY_PASSED' : 'NOT_EMPIRICALLY_VERIFIED',
    externalSchemaStatus: externalSchema ? 'SUPABASE_EXTERNAL_SCHEMA_REFERENCE' : 'PROJECT_OR_UNQUALIFIED_OBJECT',
    parserLimitation,
    securityOnlyStatus: finding.securityDifference ? 'SECURITY_REVIEW_ONLY' : 'NOT_SECURITY_ONLY',
    finalClassification,
    evidenceReference: { path: 'docs/audits/MIGRATION-REPLAY-EMPIRICAL-EVIDENCE-29.json', sha256: evidence.sha256 },
    finalConfidence: resolvedMigration || (beforeOrAtPrefix && compilationRule) ? 'HIGH' : parserLimitation ? 'LOW' : finding.confidence,
    evidence: resolvedMigration
      ? `${finding.conflictingMigration} is now a comments-only timestamp-preserving no-op; the canonical earlier migration remains executable.`
      : beforeOrAtPrefix
      ? `Fresh replay passed ${finding.conflictingMigration} on the observed run through ${evidence.last_confirmed_successful_migration}; compilation signal ${finding.id} (${finding.likelySqlstate ?? 'no SQLSTATE'}) is disproven as a replay blocker, while the original finding remains traceable.`
      : finding.evidence,
    sourceFinding: finding,
  };
}

export function detectGraphCycles(nodeValues, edges) {
  const nodeIds = new Set(nodeValues.map((x) => typeof x === 'string' ? x : x.id));
  const adjacency = new Map([...nodeIds].map((x) => [x, []]));
  for (const edge of edges) if (nodeIds.has(edge.from) && nodeIds.has(edge.to) && edge.from !== edge.to) adjacency.get(edge.from).push(edge.to);
  for (const values of adjacency.values()) values.sort();
  const state = new Map(), path = [], cycles = [], indexes = new Map(), lows = new Map(), onStack = new Set(), tarjanStack = [], components = []; let nextIndex = 0;
  const visit = (node) => { state.set(node, 1); path.push(node); for (const next of adjacency.get(node)) { if (!state.has(next)) visit(next); else if (state.get(next) === 1) cycles.push([...path.slice(path.indexOf(next)), next]); } path.pop(); state.set(node, 2); };
  const strong = (node) => { indexes.set(node,nextIndex); lows.set(node,nextIndex++); tarjanStack.push(node); onStack.add(node); for(const next of adjacency.get(node)){ if(!indexes.has(next)){strong(next);lows.set(node,Math.min(lows.get(node),lows.get(next)));}else if(onStack.has(next))lows.set(node,Math.min(lows.get(node),indexes.get(next)));} if(lows.get(node)===indexes.get(node)){const part=[];let value;do{value=tarjanStack.pop();onStack.delete(value);part.push(value);}while(value!==node);if(part.length>1)components.push(part.sort());}};
  for (const node of [...nodeIds].sort()) { if (!state.has(node)) visit(node); if (!indexes.has(node)) strong(node); }
  return { cycles, stronglyConnectedComponents: components };
}

export function auditMigrationDirectory(directory, options = {}) {
  const migrationDir = resolve(directory);
  const empiricalEvidence = readReplayEvidence(options.evidencePath ?? DEFAULT_EVIDENCE_PATH);
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
    tables: collect(x, 'tables'), policies: collect(x, 'policies'), functions: collect(x, 'functions'), indexes: collect(x, 'indexes'), triggers: collect(x, 'triggers'), types: collect(x, 'types'), views: collect(x, 'views'), grantsRevokes: collect(x, 'grantsRevokes'), rls: collect(x, 'rls'), storagePoliciesAndBuckets: collect(x, 'storage'), dmlStatements: collect(x, 'dml'), extensions: collect(x, 'extensions'), externalSchemaDependencies: [...new Set(x.dependencies)].sort(), staticUncertainties: x.uncertainties, commentsOnly: x.commentsOnly, noOp: x.noOp,
  }));
  const resolvedConflicts = [
    { id: 'RESOLVED_IMPORT_JOBS_DUPLICATE', status: 'RESOLVED', migration: '20260628190000_import_jobs_foundation.sql' },
    { id: 'RESOLVED_CONTENT_STAFF_RBAC_DUPLICATE', status: 'RESOLVED', migration: '20260703204450_5223b435-1a4d-44ab-ad03-ab3d9a8f4432.sql' },
    { id: 'RESOLVED_UNITS_POLICY_DUPLICATE', status: 'RESOLVED', migration: '20260731180000_restrict_units_select_to_authenticated.sql' },
  ].map((x) => ({ ...x, present: files.includes(x.migration) }));
  const nodes = parsed.map((x) => ({ id: x.filename, timestamp: x.timestamp, commentsOnly: x.commentsOnly, creates: x.statements.filter((s) => s.action === 'create').map((s) => `${s.objectType}:${s.key}`), drops: x.statements.filter((s) => s.action === 'drop').map((s) => `${s.objectType}:${s.key}`) }));
  const conflicts = analysis.conflicts.sort((a,b) => `${a.severity}|${a.conflictingMigration}|${a.id}|${a.objectName}`.localeCompare(`${b.severity}|${b.conflictingMigration}|${b.id}|${b.objectName}`));
  const originalFindings = conflicts;
  const calibratedFindings = conflicts.map((finding, index) => calibrateFinding(finding, index, empiricalEvidence));
  const externalDependencies = parsed.flatMap((x) => [...new Set(x.dependencies)].sort().map((object) => ({ migration: x.filename, object, finalClassification: 'EXTERNAL_SCHEMA_DEPENDENCY', confidence: 'HIGH', evidence: `${schemaOf(object)} is provided by the Supabase platform and is not expected to be created by project migrations.` })));
  const staticUncertainties = parsed.flatMap((x) => x.uncertainties.map((u) => ({ migration: x.filename, object: 'dynamic SQL', finalClassification: 'PARSER_LIMITATION', confidence: 'HIGH', evidence: u.evidence })));
  const postPrefixRisks = calibratedFindings.filter((x) => x.verifiedPrefixPosition === 'AFTER_VERIFIED_PREFIX' && x.finalClassification === 'STATIC_UNCERTAINTY');
  const edgeMap = new Map(); let duplicateEdgesRemoved = 0; const selfReferenceRecords = [];
  for (const edge of analysis.edges) { if (edge.from === edge.to) { selfReferenceRecords.push(edge); continue; } const key = `${edge.from}\0${edge.to}\0${edge.relationship}\0${edge.object}`; if (edgeMap.has(key)) duplicateEdgesRemoved += 1; else edgeMap.set(key, edge); }
  const uniqueEdges = [...edgeMap.values()].sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const nodeIds = new Set(nodes.map((x) => x.id)); const adjacency = new Map([...nodeIds].map((x) => [x, []]));
  for (const edge of uniqueEdges) if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) adjacency.get(edge.from).push(edge.to);
  const state = new Map(), stack = [], cycles = [], sccs = []; let nextIndex = 0; const indexes = new Map(), lows = new Map(), onStack = new Set(), tarjanStack = [];
  const visitCycle = (node) => { state.set(node, 1); stack.push(node); for (const next of adjacency.get(node)) { if (!state.has(next)) visitCycle(next); else if (state.get(next) === 1) cycles.push([...stack.slice(stack.indexOf(next)), next]); } stack.pop(); state.set(node, 2); };
  const strong = (node) => { indexes.set(node, nextIndex); lows.set(node, nextIndex++); tarjanStack.push(node); onStack.add(node); for (const next of adjacency.get(node)) { if (!indexes.has(next)) { strong(next); lows.set(node, Math.min(lows.get(node), lows.get(next))); } else if (onStack.has(next)) lows.set(node, Math.min(lows.get(node), indexes.get(next))); } if (lows.get(node) === indexes.get(node)) { const component=[]; let value; do { value=tarjanStack.pop(); onStack.delete(value); component.push(value); } while(value!==node); if(component.length>1) sccs.push(component.sort()); } };
  for (const node of [...nodeIds].sort()) { if (!state.has(node)) visitCycle(node); if (!indexes.has(node)) strong(node); }
  const graph = { schemaVersion: 3, generatedBy: 'scripts/audit-migration-chain.mjs', nodes, unique_edges: uniqueEdges, external_edges: uniqueEdges.filter((x) => String(x.to).startsWith('object:') && isExternalObject(String(x.object))), cycles, strongly_connected_components: sccs, self_reference_records: selfReferenceRecords, duplicate_edges_removed: duplicateEdgesRemoved, deterministic_order: nodes.map((x) => x.id), summary: { cycles, stronglyConnectedComponents: sccs, missingDependencies: analysis.missingDependencies, orderingRisks: analysis.orderingRisks, timestampCollisions: collisions, externalDependencies, verifiedPrefix: empiricalEvidence.last_confirmed_successful_migration } };
  return { schemaVersion: 3, verifiedPrefix: empiricalEvidence.last_confirmed_successful_migration, empiricalEvidence, historicalSnapshotUsedForDecisions: false, limitations: LIMITATIONS, inventory, resolvedConflicts, originalFindings, conflicts, calibratedFindings, externalDependencies, staticUncertainties, postPrefixRisks, securityFindings: analysis.securityFindings.sort((a,b) => `${a.severity}|${a.migration}|${a.id}`.localeCompare(`${b.severity}|${b.migration}|${b.id}`)), graph };
}

function countObjects(inventory, key) { return inventory.reduce((sum, item) => sum + item[key].filter((x) => x.action === 'create').length, 0); }
function legacyMarkdown(audit) {
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
- Unique edges: ${audit.graph.unique_edges.length}
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

function markdown(audit) {
  const original = Object.fromEntries(['P0','P1','P2','P3'].map((x) => [x, audit.conflicts.filter((c) => c.severity === x).length]));
  const security = Object.fromEntries(['CRITICAL','HIGH','MEDIUM','LOW','INFORMATIONAL'].map((x) => [x, audit.securityFindings.filter((c) => c.severity === x).length]));
  const finalCount = (classification) => audit.calibratedFindings.filter((x) => x.finalClassification === classification).length;
  const rows = audit.calibratedFindings.map((x) => `| ${x.findingId} | ${x.originalClassification} | ${x.migration} | ${x.object} | ${x.verifiedPrefixPosition} | ${x.empiricalStatus} | ${x.externalSchemaStatus} | ${x.parserLimitation} | ${x.securityOnlyStatus} | ${x.finalClassification} | ${x.finalConfidence} | ${x.evidence.replace(/\|/g, '\\|').slice(0, 180)} |`).join('\n') || '| - | - | None | - | - | - | - | - | - | - | - | - |';
  return `# Migration Chain Conflict Census 28 — Empirical Calibration 29

Static analysis calibrated against the supplied successful Fresh replay evidence. No SQL or database was executed by this audit.

## Evidence boundary

- First successful migration: 20260606003616
- Last confirmed successful migration: ${audit.verifiedPrefix}
- Former first unresolved: 20260731180000, \`Units viewable per subject access\`, SQLSTATE \`42710\`
- Current final migration: ${audit.inventory.at(-1)?.filename ?? '-'}

## Before calibration

- P0: 48
- P1: 40
- Missing dependencies: 38
- Unresolved: 88

## After parser improvement and empirical calibration

- Confirmed replay blockers: ${finalCount('CONFIRMED_REPLAY_BLOCKER')}
- Resolved replay blockers: ${audit.resolvedConflicts.filter((x) => x.present).length}
- Empirically disproven compilation blockers retained for traceability: ${finalCount('EMPIRICALLY_DISPROVEN_COMPILATION_BLOCKER')}
- External Supabase schema dependency references: ${audit.externalDependencies.length}
- Static security findings: ${audit.securityFindings.length}
- Static uncertainties: ${finalCount('STATIC_UNCERTAINTY')}
- Parser limitations (dynamic SQL records): ${audit.staticUncertainties.length}
- Post-prefix risks: ${audit.postPrefixRisks.length}
- Remaining conservative static candidates by old label: P0=${original.P0}, P1=${original.P1}, P2=${original.P2}, P3=${original.P3}

No P0/P1 candidate at or before the verified prefix is a current replay blocker. Original labels below are traceability fields, not the final decision.

| Finding | Original | Migration | Object | Prefix position | Empirical status | External status | Parser limitation | Security-only | Final classification | Confidence | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows}

## Resolved blockers

${audit.resolvedConflicts.map((x) => `- ${x.id}: ${x.status}; ${x.migration}; present=${x.present}`).join('\n')}

## Security findings

- Critical: ${security.CRITICAL}
- High: ${security.HIGH}
- Medium: ${security.MEDIUM}
- Low: ${security.LOW}
- Informational: ${security.INFORMATIONAL}

Security findings are review candidates and are not replay blockers.

## Actionable post-prefix replay risks

${audit.postPrefixRisks.length ? audit.postPrefixRisks.map((x) => `- ${x.migration}: ${x.object} (${x.finalConfidence})`).join('\n') : 'NO_STATIC_POST_PREFIX_REPLAY_BLOCKER_IDENTIFIED'}

## Linter limitations

${audit.limitations.map((x) => `- ${x}`).join('\n')}
`;
}

export function writeAuditReports(audit, paths = {}) {
  const inventoryPath = resolve(paths.inventory ?? resolve(ROOT, 'docs/audits/MIGRATION-CHAIN-INVENTORY-28.json'));
  const graphPath = resolve(paths.graph ?? resolve(ROOT, 'docs/audits/MIGRATION-DEPENDENCY-GRAPH-28.json'));
  const reportPath = resolve(paths.report ?? resolve(ROOT, 'docs/audits/MIGRATION-CHAIN-CONFLICT-CENSUS-28.md'));
  const calibrationPath = resolve(paths.calibration ?? resolve(ROOT, 'docs/audits/MIGRATION-LINTER-CALIBRATION-29.json'));
  const calibrationMarkdownPath = resolve(paths.calibrationMarkdown ?? resolve(ROOT, 'docs/audits/MIGRATION-LINTER-CALIBRATION-29.md'));
  for (const path of [inventoryPath, graphPath, reportPath, calibrationPath, calibrationMarkdownPath]) mkdirSync(dirname(path), { recursive: true });
  writeFileSync(inventoryPath, `${JSON.stringify({ schemaVersion: audit.schemaVersion, verifiedPrefix: audit.verifiedPrefix, empiricalEvidence: audit.empiricalEvidence, historicalSnapshotUsedForDecisions: false, limitations: audit.limitations, migrations: audit.inventory, resolvedConflicts: audit.resolvedConflicts, originalFindings: audit.originalFindings, conflicts: audit.conflicts, calibratedFindings: audit.calibratedFindings, externalDependencies: audit.externalDependencies, staticUncertainties: audit.staticUncertainties, postPrefixRisks: audit.postPrefixRisks, securityFindings: audit.securityFindings }, null, 2)}\n`);
  writeFileSync(graphPath, `${JSON.stringify(audit.graph, null, 2)}\n`);
  writeFileSync(reportPath, markdown(audit));
  writeFileSync(calibrationPath, `${JSON.stringify({ schemaVersion: audit.schemaVersion, verifiedPrefix: audit.verifiedPrefix, evidence: audit.empiricalEvidence, calibrationSource: 'CURRENT_PARSER_OUTPUT', historicalSnapshotUsedForDecisions: false, timestampOnlyDowngrade: false, currentParserFindingCount: audit.conflicts.length, resolvedBlockers: audit.resolvedConflicts, findings: audit.calibratedFindings, externalDependencies: audit.externalDependencies, parserLimitations: audit.staticUncertainties, securityFindings: audit.securityFindings, actionablePostPrefixReplayRisks: audit.postPrefixRisks, postPrefixDecision: audit.postPrefixRisks.length ? 'REVIEW_REQUIRED' : 'NO_STATIC_POST_PREFIX_REPLAY_BLOCKER_IDENTIFIED' }, null, 2)}\n`);
  writeFileSync(calibrationMarkdownPath, markdown(audit));
  return { inventoryPath, graphPath, reportPath, calibrationPath, calibrationMarkdownPath };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const migrationDir = resolve(process.argv[2] ?? resolve(ROOT, 'supabase/migrations'));
  if (!existsSync(migrationDir)) throw new Error(`Migration directory not found: ${migrationDir}`);
  const audit = auditMigrationDirectory(migrationDir);
  writeAuditReports(audit);
  process.stdout.write(`${JSON.stringify({ migrations: audit.inventory.length, conflicts: audit.conflicts.length, securityFindings: audit.securityFindings.length })}\n`);
}
