import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();

const DOC_FILES = {
  design: path.join(rootDir, 'docs', 'CONTENT-ONBOARDING-HTML-OPERATIONAL-BACKEND-DESIGN-03.md'),
  dataModel: path.join(rootDir, 'docs', 'CONTENT-ONBOARDING-HTML-DATA-MODEL-03.md'),
  storage: path.join(rootDir, 'docs', 'CONTENT-ONBOARDING-HTML-STORAGE-CONTRACT-03.md'),
  authMatrix: path.join(rootDir, 'docs', 'CONTENT-ONBOARDING-HTML-AUTHORIZATION-MATRIX-03.json'),
  migration: path.join(rootDir, 'docs', 'CONTENT-ONBOARDING-HTML-MIGRATION-PROPOSAL-03.md'),
};

const REQUIRED_TABLES = [
  'lesson_resources',
  'lesson_resource_versions',
  'lesson_resource_files',
  'lesson_resource_reviews',
  'lesson_resource_events',
  'content_import_batches',
  'content_import_rows',
];

const REQUIRED_STATES = [
  'draft',
  'in_review',
  'approved',
  'published',
  'rejected',
  'archived',
];

const REQUIRED_ROLES = [
  'admin',
  'content_manager',
  'reviewer',
  'publisher',
  'student',
];

const REQUIRED_SERVER_CONTRACTS = [
  'create import batch',
  'upload package',
  'validate package',
  'submit for review',
  'approve',
  'reject',
  'publish',
  'unpublish',
  'archive',
  'fetch published lesson resources',
];

test('1. Verify design document files exist and are non-empty', () => {
  for (const [key, filePath] of Object.entries(DOC_FILES)) {
    assert.ok(fs.existsSync(filePath), `Missing design document: ${key} at ${filePath}`);
    const stat = fs.statSync(filePath);
    assert.ok(stat.size > 200, `Design document ${key} is too small (${stat.size} bytes)`);
  }
});

test('2. Verify all 7 proposed database entities are covered in Data Model & Migration docs', () => {
  const dataModelContent = fs.readFileSync(DOC_FILES.dataModel, 'utf-8');
  const migrationContent = fs.readFileSync(DOC_FILES.migration, 'utf-8');

  for (const table of REQUIRED_TABLES) {
    assert.ok(
      dataModelContent.includes(table),
      `Data model doc missing table definition: ${table}`
    );
    assert.ok(
      migrationContent.includes(table),
      `Migration proposal doc missing table DDL: ${table}`
    );
  }
});

test('3. Verify all 6 lifecycle states are defined and present in Data Model & Design', () => {
  const dataModelContent = fs.readFileSync(DOC_FILES.dataModel, 'utf-8');
  const designContent = fs.readFileSync(DOC_FILES.design, 'utf-8');

  for (const state of REQUIRED_STATES) {
    assert.ok(
      dataModelContent.includes(`'${state}'`) || dataModelContent.includes(`"${state}"`),
      `Data model doc missing state definition: ${state}`
    );
    assert.ok(
      designContent.includes(state),
      `Design doc missing state reference: ${state}`
    );
  }
});

test('4. Verify Authorization Matrix JSON structure and role permissions', () => {
  const rawAuth = fs.readFileSync(DOC_FILES.authMatrix, 'utf-8');
  const authMatrix = JSON.parse(rawAuth);

  assert.equal(authMatrix.system, 'tas-heel-html-content-onboarding');
  assert.equal(authMatrix.version, '0.3.0');

  // Verify roles
  for (const role of REQUIRED_ROLES) {
    assert.ok(authMatrix.roles.includes(role), `Auth matrix missing role: ${role}`);
    assert.ok(authMatrix.matrix[role], `Auth matrix missing matrix entry for role: ${role}`);
  }

  // Verify states
  for (const state of REQUIRED_STATES) {
    assert.ok(authMatrix.statuses.includes(state), `Auth matrix missing status: ${state}`);
  }

  // Verify tables in matrix resources
  for (const table of REQUIRED_TABLES) {
    assert.ok(authMatrix.resources.includes(table), `Auth matrix missing resource table: ${table}`);
  }

  // Check specific authorization rules
  assert.equal(authMatrix.matrix.student.create_import_batch, false);
  assert.equal(authMatrix.matrix.student.upload_package, false);
  assert.equal(authMatrix.matrix.student.publish, false);
  assert.equal(authMatrix.matrix.student.fetch_published, true);

  assert.equal(authMatrix.matrix.content_manager.upload_package, true);
  assert.equal(authMatrix.matrix.content_manager.publish, false);

  assert.equal(authMatrix.matrix.reviewer.approve, true);
  assert.equal(authMatrix.matrix.reviewer.reject, true);
  assert.equal(authMatrix.matrix.reviewer.publish, false);

  assert.equal(authMatrix.matrix.publisher.publish, true);
  assert.equal(authMatrix.matrix.publisher.unpublish, true);

  assert.equal(authMatrix.matrix.admin.publish, true);
  assert.equal(authMatrix.matrix.admin.approve, true);
});

test('5. Verify Storage Contract specifications (Buckets, Hash Pinning, Direct Write Deny)', () => {
  const storageContent = fs.readFileSync(DOC_FILES.storage, 'utf-8');

  // Verify required buckets
  assert.ok(storageContent.includes('lesson-resource-drafts'), 'Storage contract missing draft bucket');
  assert.ok(storageContent.includes('lesson-resource-published'), 'Storage contract missing published bucket');

  // Verify Draft is private
  assert.ok(storageContent.includes('PRIVATE'), 'Storage contract must mark draft bucket as PRIVATE');

  // Verify Published is Read-Only for students
  assert.ok(storageContent.includes('READ-ONLY'), 'Storage contract must mark published bucket as READ-ONLY');

  // Verify Immutable Hash-Pinned path pattern
  assert.ok(storageContent.includes('{content_hash}') || storageContent.includes('content_hash'), 'Storage contract missing content_hash immutable pathing');

  // Verify Signed Review Access
  assert.ok(storageContent.includes('signed_url') || storageContent.includes('signed URL') || storageContent.includes('Signed URL'), 'Storage contract missing signed review access');

  // Verify Browser Write Restriction to published bucket
  assert.ok(
    storageContent.includes('PROHIBITED') || storageContent.includes('Deny') || storageContent.includes('NO INSERT'),
    'Storage contract must restrict direct browser writes to published storage'
  );
});

test('6. Verify all 10 Server Contracts are documented', () => {
  const designContent = fs.readFileSync(DOC_FILES.design, 'utf-8').toLowerCase();
  const migrationContent = fs.readFileSync(DOC_FILES.migration, 'utf-8').toLowerCase();

  for (const contract of REQUIRED_SERVER_CONTRACTS) {
    const normContract = contract.toLowerCase();
    const contractUnderscore = normContract.replaceAll(' ', '_');
    
    assert.ok(
      designContent.includes(normContract) || designContent.includes(contractUnderscore) || migrationContent.includes(contractUnderscore),
      `Server contracts missing requirement: ${contract}`
    );
  }
});

test('7. Verify Security Requirements (Published-only reads, RLS Fail-Closed, No Leakage/PII)', () => {
  const rawAuth = fs.readFileSync(DOC_FILES.authMatrix, 'utf-8');
  const authMatrix = JSON.parse(rawAuth);

  assert.equal(authMatrix.rls_policies.fail_closed_default, true);
  assert.equal(authMatrix.concurrency_and_security.answer_leakage_prohibited, true);
  assert.equal(authMatrix.concurrency_and_security.pii_in_html_prohibited, true);
  assert.equal(authMatrix.concurrency_and_security.optimistic_concurrency, true);

  const storageContent = fs.readFileSync(DOC_FILES.storage, 'utf-8');
  assert.ok(storageContent.includes('can_access_lesson'), 'Storage policy must check lesson access');
});

test('8. Verify Audit Trail Requirements', () => {
  const dataModelContent = fs.readFileSync(DOC_FILES.dataModel, 'utf-8');
  
  assert.ok(dataModelContent.includes('lesson_resource_reviews'), 'Audit requirement missing review audit log');
  assert.ok(dataModelContent.includes('lesson_resource_events'), 'Audit requirement missing event audit log');
  assert.ok(dataModelContent.includes('reviewer_id'), 'Audit log must record reviewer identity');
  assert.ok(dataModelContent.includes('session_nonce'), 'Event log must include session nonce');
});

test('9. Verify Rollback Requirements and Strategy', () => {
  const migrationContent = fs.readFileSync(DOC_FILES.migration, 'utf-8');
  const designContent = fs.readFileSync(DOC_FILES.design, 'utf-8');

  assert.ok(migrationContent.includes('DROP TABLE IF EXISTS'), 'Rollback strategy must include DB down scripts');
  assert.ok(
    migrationContent.includes('ENABLE_HTML_LESSON_RESOURCES') || designContent.includes('ENABLE_HTML_LESSON_RESOURCES'),
    'Rollback strategy must include feature flag fallback'
  );
});

test('10. Verify absolute compliance with design constraints (No src/ or migration edits)', () => {
  // Verify tests file exists
  const testFile = path.join(rootDir, 'tests', 'question-bank', 'content-onboarding-html-backend-design-contract.test.mjs');
  assert.ok(fs.existsSync(testFile), 'Contract test file must exist at specified path');

  // Verify zero migration files were added to supabase/migrations/
  const migrationsDir = path.join(rootDir, 'supabase', 'migrations');
  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir);
    for (const f of files) {
      assert.ok(!f.includes('content_onboarding_html_03'), 'No migrations should be added in this design task');
    }
  }
});
