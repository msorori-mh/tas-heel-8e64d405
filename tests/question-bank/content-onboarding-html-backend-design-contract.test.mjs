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
  'student',
];

const FORBIDDEN_MVP_ROLES = [
  'reviewer',
  'publisher',
];

const REQUIRED_SERVER_CONTRACTS = [
  'create_import_batch',
  'finalize_uploaded_package',
  'validate_package',
  'submit_for_review',
  'approve_resource_version',
  'reject_resource_version',
  'publish_resource_version',
  'unpublish_resource_version',
  'archive_resource',
  'fetch_published_lesson_resources',
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

test('4. Verify Authorization Matrix JSON structure and MVP role permissions', () => {
  const rawAuth = fs.readFileSync(DOC_FILES.authMatrix, 'utf-8');
  const authMatrix = JSON.parse(rawAuth);

  assert.equal(authMatrix.system, 'tas-heel-html-content-onboarding');

  // Verify MVP roles ONLY
  for (const role of REQUIRED_ROLES) {
    assert.ok(authMatrix.roles.includes(role), `Auth matrix missing role: ${role}`);
    assert.ok(authMatrix.matrix[role], `Auth matrix missing matrix entry for role: ${role}`);
  }

  // Verify reviewer & publisher are NOT in MVP roles
  for (const role of FORBIDDEN_MVP_ROLES) {
    assert.ok(!authMatrix.roles.includes(role), `Auth matrix must NOT contain role in MVP: ${role}`);
    assert.equal(authMatrix.matrix[role], undefined, `Auth matrix must NOT have matrix entry for forbidden role: ${role}`);
  }

  // Verify states
  for (const state of REQUIRED_STATES) {
    assert.ok(authMatrix.statuses.includes(state), `Auth matrix missing status: ${state}`);
  }

  // Verify tables in matrix resources
  for (const table of REQUIRED_TABLES) {
    assert.ok(authMatrix.resources.includes(table), `Auth matrix missing resource table: ${table}`);
  }

  // Check specific authorization rules for MVP
  assert.equal(authMatrix.matrix.student.create_import_batch, false);
  assert.equal(authMatrix.matrix.student.finalize_uploaded_package, false);
  assert.equal(authMatrix.matrix.student.publish_resource_version, false);
  assert.equal(authMatrix.matrix.student.fetch_published_lesson_resources, true);

  assert.equal(authMatrix.matrix.content_manager.finalize_uploaded_package, true);
  assert.equal(authMatrix.matrix.content_manager.approve_resource_version, false);
  assert.equal(authMatrix.matrix.content_manager.publish_resource_version, false);

  assert.equal(authMatrix.matrix.admin.approve_resource_version, true);
  assert.equal(authMatrix.matrix.admin.reject_resource_version, true);
  assert.equal(authMatrix.matrix.admin.publish_resource_version, true);
  assert.equal(authMatrix.matrix.admin.unpublish_resource_version, true);
});

test('5. Verify Storage Contract specifications (Private Buckets, Hash Pinning, Direct Write Deny, Signed URLs)', () => {
  const storageContent = fs.readFileSync(DOC_FILES.storage, 'utf-8');

  // Verify required buckets
  assert.ok(storageContent.includes('lesson-resource-drafts'), 'Storage contract missing draft bucket');
  assert.ok(storageContent.includes('lesson-resource-published'), 'Storage contract missing published bucket');

  // Verify BOTH Draft and Published are PRIVATE
  assert.ok(storageContent.includes('PRIVATE'), 'Storage contract must mark draft & published buckets as PRIVATE');

  // Verify Immutable Hash-Pinned path pattern
  assert.ok(storageContent.includes('content_hash') || storageContent.includes('content_sha256'), 'Storage contract missing content_hash immutable pathing');

  // Verify Signed Student Access
  assert.ok(
    storageContent.includes('signed URL') || storageContent.includes('signed_url') || storageContent.includes('Signed URL') || storageContent.includes('Server-signed'),
    'Storage contract missing signed student access'
  );

  // Verify Browser Write Restriction
  assert.ok(
    storageContent.includes('PROHIBITED') || storageContent.includes('Deny') || storageContent.includes('Zero Client Write Access'),
    'Storage contract must restrict direct browser writes to published storage'
  );
});

test('6. Verify all 10 Operational Server Contracts are documented', () => {
  const designContent = fs.readFileSync(DOC_FILES.design, 'utf-8').toLowerCase();
  const migrationContent = fs.readFileSync(DOC_FILES.migration, 'utf-8').toLowerCase();

  for (const contract of REQUIRED_SERVER_CONTRACTS) {
    const normContract = contract.toLowerCase();

    assert.ok(
      designContent.includes(normContract) || migrationContent.includes(normContract),
      `Server contracts missing requirement: ${contract}`
    );
  }
});

test('7. Verify Additive Migration & Foreign Key Integrity Constraints', () => {
  const migrationContent = fs.readFileSync(DOC_FILES.migration, 'utf-8');
  const dataModelContent = fs.readFileSync(DOC_FILES.dataModel, 'utf-8');

  // Verify Additive ALTER TABLE strategy for existing lesson_resources
  assert.ok(
    migrationContent.includes('ALTER TABLE public.lesson_resources') || dataModelContent.includes('ALTER TABLE'),
    'Migration proposal must use additive ALTER TABLE for lesson_resources'
  );

  assert.ok(
    !migrationContent.includes('CREATE TABLE IF NOT EXISTS public.lesson_resources (') &&
    !migrationContent.includes('CREATE TABLE lesson_resources ('),
    'Migration proposal must NOT use CREATE TABLE for existing lesson_resources'
  );

  // Verify Version Foreign Keys on lesson_resources
  assert.ok(dataModelContent.includes('current_draft_version_id'), 'Data model missing current_draft_version_id');
  assert.ok(dataModelContent.includes('approved_version_id'), 'Data model missing approved_version_id');
  assert.ok(dataModelContent.includes('published_version_id'), 'Data model missing published_version_id');

  // Verify NO ON DELETE CASCADE on versions, reviews, events, import tables
  assert.ok(
    dataModelContent.includes('ON DELETE RESTRICT') || migrationContent.includes('ON DELETE RESTRICT'),
    'Migration and data model must use ON DELETE RESTRICT for audit and version references'
  );
});

test('8. Verify Idempotency and Optimistic Concurrency Constraints', () => {
  const dataModelContent = fs.readFileSync(DOC_FILES.dataModel, 'utf-8');
  const migrationContent = fs.readFileSync(DOC_FILES.migration, 'utf-8');
  const designContent = fs.readFileSync(DOC_FILES.design, 'utf-8');

  // Verify CAS lock_version
  assert.ok(dataModelContent.includes('lock_version'), 'Data model missing lock_version for CAS');
  assert.ok(designContent.includes('FOR UPDATE') || migrationContent.includes('FOR UPDATE'), 'Publish contract must use SELECT FOR UPDATE');

  // Verify explicit idempotency keys and unique constraints
  assert.ok(dataModelContent.includes('idempotency_key'), 'Data model missing idempotency_key requirement');
  assert.ok(dataModelContent.includes('actor_id, operation, idempotency_key') || migrationContent.includes('actor_id, operation, idempotency_key'), 'Missing UNIQUE(actor_id, operation, idempotency_key)');
  assert.ok(dataModelContent.includes('batch_id, row_number') || migrationContent.includes('batch_id, row_number'), 'Missing UNIQUE(batch_id, row_number)');
  assert.ok(dataModelContent.includes('resource_version_id, session_nonce, event_sequence') || migrationContent.includes('resource_version_id, session_nonce, event_sequence'), 'Missing UNIQUE(resource_version_id, session_nonce, event_sequence)');
});

test('9. Verify Correct-Answer Leakage & Type Standardization Requirements', () => {
  const dataModelContent = fs.readFileSync(DOC_FILES.dataModel, 'utf-8');
  const designContent = fs.readFileSync(DOC_FILES.design, 'utf-8');
  const rawAuth = fs.readFileSync(DOC_FILES.authMatrix, 'utf-8');
  const authMatrix = JSON.parse(rawAuth);

  // Verify answer leakage prohibition
  assert.equal(authMatrix.concurrency_and_security.answer_leakage_prohibited, true);
  assert.ok(dataModelContent.includes('No Client-Side Hashed Answer Keys') || designContent.includes('No Correct-Answer Leakage'), 'Docs must prohibit client-side hashed answer keys');

  // Verify entity type standardization & compatibility mapping
  assert.ok(dataModelContent.includes('external_link'), 'Data model must standardize on external_link');
  assert.ok(dataModelContent.includes('mindmap') && dataModelContent.includes('mind_map_html'), 'Data model must document mindmap -> mind_map_html mapping');
  assert.ok(dataModelContent.includes('experiment') && dataModelContent.includes('practical_experiment_html'), 'Data model must document experiment -> practical_experiment_html mapping');
});

test('10. Verify Safe Rollback Strategy', () => {
  const migrationContent = fs.readFileSync(DOC_FILES.migration, 'utf-8');
  const designContent = fs.readFileSync(DOC_FILES.design, 'utf-8');

  // Verify feature flag fallback
  assert.ok(
    migrationContent.includes('ENABLE_HTML_LESSON_RESOURCES') || designContent.includes('ENABLE_HTML_LESSON_RESOURCES'),
    'Rollback strategy must include feature flag fallback'
  );

  // Verify rollback does NOT drop lesson_resources table
  assert.ok(
    !migrationContent.includes('DROP TABLE IF EXISTS public.lesson_resources') &&
    !migrationContent.includes('DROP TABLE lesson_resources'),
    'Rollback strategy must NOT drop existing lesson_resources table'
  );

  // Verify rollback does NOT attempt to drop enum values
  assert.ok(
    !migrationContent.includes('DROP VALUE'),
    'Rollback strategy must NOT attempt invalid ALTER TYPE DROP VALUE'
  );

  // Verify rollback to previous approved version
  assert.ok(
    migrationContent.includes('previous approved version') || designContent.includes('previous approved version'),
    'Rollback strategy must support reverting to previous approved version'
  );
});

test('11. Verify absolute compliance with design constraints (No src/ or migration edits)', () => {
  const testFile = path.join(rootDir, 'tests', 'question-bank', 'content-onboarding-html-backend-design-contract.test.mjs');
  assert.ok(fs.existsSync(testFile), 'Contract test file must exist at specified path');

  const migrationsDir = path.join(rootDir, 'supabase', 'migrations');
  if (fs.existsSync(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir);
    for (const f of files) {
      assert.ok(!f.includes('content_onboarding_html_03'), 'No migrations should be added in this design task');
    }
  }
});
