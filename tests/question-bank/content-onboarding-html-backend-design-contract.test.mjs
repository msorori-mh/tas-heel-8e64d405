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

  // Verify Composite Same-Resource Foreign Keys on lesson_resources
  assert.ok(dataModelContent.includes('current_draft_version_id'), 'Data model missing current_draft_version_id');
  assert.ok(dataModelContent.includes('approved_version_id'), 'Data model missing approved_version_id');
  assert.ok(dataModelContent.includes('published_version_id'), 'Data model missing published_version_id');

  // Must use composite FKs (pointer, id) -> (id, resource_id) to prevent cross-resource version linking
  assert.ok(
    migrationContent.includes('FOREIGN KEY (current_draft_version_id, id) REFERENCES public.lesson_resource_versions(id, resource_id)') ||
    migrationContent.includes('FOREIGN KEY (current_draft_version_id, id) REFERENCES'),
    'Migration proposal must use composite FK (current_draft_version_id, id) to enforce same-resource integrity'
  );
  assert.ok(
    migrationContent.includes('FOREIGN KEY (approved_version_id, id) REFERENCES') ||
    migrationContent.includes('approved_version_id, id'),
    'Migration proposal must use composite FK (approved_version_id, id)'
  );
  assert.ok(
    migrationContent.includes('FOREIGN KEY (published_version_id, id) REFERENCES') ||
    migrationContent.includes('published_version_id, id'),
    'Migration proposal must use composite FK (published_version_id, id)'
  );

  // Verify uq_resource_version_id_resource UNIQUE(id, resource_id) on lesson_resource_versions
  assert.ok(
    migrationContent.includes('uq_resource_version_id_resource') || dataModelContent.includes('UNIQUE(id, resource_id)'),
    'Must define composite UNIQUE(id, resource_id) on lesson_resource_versions'
  );

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

  // Verify answer leakage and explanation leakage prohibition
  assert.equal(authMatrix.concurrency_and_security.answer_leakage_prohibited, true);
  assert.equal(authMatrix.concurrency_and_security.explanation_leakage_prohibited, true);

  // Verify forbidden answer and explanation fields list
  const FORBIDDEN_FIELDS = [
    'correct_index',
    'correct_answer',
    'answer_key',
    'hashed_answer',
    'explanation',
    'answer_explanation',
    'correct_explanation',
    'solution_key'
  ];

  for (const field of FORBIDDEN_FIELDS) {
    assert.ok(
      authMatrix.concurrency_and_security.forbidden_answer_and_explanation_fields.includes(field),
      `Auth matrix missing forbidden field: ${field}`
    );
    assert.ok(
      dataModelContent.includes(field) || designContent.includes(field),
      `Docs missing security scanner forbidden field: ${field}`
    );
  }

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
    migrationContent.toLowerCase().includes('previous approved version') || designContent.toLowerCase().includes('previous approved version'),
    'Rollback strategy must support reverting to previous approved version'
  );
});

test('12. Verify Baseline Columns Reconciliation (title/description canonical, no title_ar/description_ar migration)', () => {
  const migrationContent = fs.readFileSync(DOC_FILES.migration, 'utf-8');
  const dataModelContent = fs.readFileSync(DOC_FILES.dataModel, 'utf-8');

  // Verify ADD COLUMN in migration proposal does NOT introduce title_ar or description_ar
  assert.ok(!migrationContent.includes('ADD COLUMN IF NOT EXISTS title_ar'), 'Migration proposal must NOT add title_ar column');
  assert.ok(!migrationContent.includes('ADD COLUMN IF NOT EXISTS description_ar'), 'Migration proposal must NOT add description_ar column');

  // Verify Data Model uses canonical title and description columns
  assert.ok(dataModelContent.includes('`title`'), 'Data model must specify canonical `title` column');
  assert.ok(dataModelContent.includes('`description`'), 'Data model must specify canonical `description` column');
  assert.ok(dataModelContent.includes('`url`'), 'Data model must preserve legacy `url` column');
});

test('13. Verify Student Identity Representation (Not an app_role value)', () => {
  const dataModelContent = fs.readFileSync(DOC_FILES.dataModel, 'utf-8');
  const designContent = fs.readFileSync(DOC_FILES.design, 'utf-8');

  // Verify student is documented as authenticated non-staff user, NOT app_role value
  assert.ok(dataModelContent.includes('`student` is **NOT** a new value in `app_role`'), 'Data model must clarify student is not an app_role value');
  assert.ok(designContent.includes('`student` is NOT an `app_role` enum value'), 'Design doc must clarify student is not an app_role value');
});

test('14. Verify RLS Policies Use Legal Explicit Joins without fake lesson_id columns', () => {
  const dataModelContent = fs.readFileSync(DOC_FILES.dataModel, 'utf-8');
  const rawAuth = fs.readFileSync(DOC_FILES.authMatrix, 'utf-8');
  const authMatrix = JSON.parse(rawAuth);

  // Verify child tables use explicit JOIN syntax or EXISTS subquery referencing parent lesson_resources
  assert.ok(dataModelContent.includes('JOIN public.lesson_resources') || dataModelContent.includes('FROM public.lesson_resources lr'), 'Data model RLS policies must use explicit JOIN or subquery to lesson_resources');

  const versionRule = authMatrix.rls_policies.table_rules.lesson_resource_versions.student_read;
  const fileRule = authMatrix.rls_policies.table_rules.lesson_resource_files.student_read;
  const eventRule = authMatrix.rls_policies.table_rules.lesson_resource_events.student_insert;

  assert.ok(!versionRule.startsWith('lesson_id ='), 'lesson_resource_versions RLS must NOT reference non-existent lesson_id column directly');
  assert.ok(!fileRule.startsWith('lesson_id ='), 'lesson_resource_files RLS must NOT reference non-existent lesson_id column directly');
  assert.ok(eventRule.includes('EXISTS (SELECT 1 FROM public.lesson_resources'), 'lesson_resource_events RLS must join through lesson_resources');
});

test('15. Verify Audit Preservation & Absolute Prohibition of Audit DROP CASCADE', () => {
  const migrationContent = fs.readFileSync(DOC_FILES.migration, 'utf-8');
  const dataModelContent = fs.readFileSync(DOC_FILES.dataModel, 'utf-8');

  // Down script in migration proposal must NOT contain DROP TABLE ... CASCADE for audit tables
  assert.ok(!migrationContent.includes('DROP TABLE IF EXISTS public.lesson_resource_reviews CASCADE'), 'Down script must NOT drop lesson_resource_reviews');
  assert.ok(!migrationContent.includes('DROP TABLE IF EXISTS public.lesson_resource_events CASCADE'), 'Down script must NOT drop lesson_resource_events');
  assert.ok(!migrationContent.includes('DROP TABLE IF EXISTS public.idempotency_ledger CASCADE'), 'Down script must NOT drop idempotency_ledger');
  assert.ok(!migrationContent.includes('DROP TABLE IF EXISTS public.storage_operations CASCADE'), 'Down script must NOT drop storage_operations');

  // Data model must specify audit preservation without CASCADE
  assert.ok(dataModelContent.includes('Audit Preservation Contract') || dataModelContent.includes('Audit Immutability Contract'), 'Data model must specify Audit Preservation Contract');

  // Verify Layer A: REVOKE UPDATE, DELETE ON audit tables FROM authenticated, anon
  assert.ok(migrationContent.includes('REVOKE UPDATE, DELETE ON public.lesson_resource_reviews FROM authenticated, anon;'), 'Migration must revoke UPDATE/DELETE on reviews');
  assert.ok(migrationContent.includes('REVOKE UPDATE, DELETE ON public.lesson_resource_events FROM authenticated, anon;'), 'Migration must revoke UPDATE/DELETE on events');
  assert.ok(migrationContent.includes('REVOKE UPDATE, DELETE ON public.idempotency_ledger FROM authenticated, anon;'), 'Migration must revoke UPDATE/DELETE on idempotency ledger');
  assert.ok(migrationContent.includes('REVOKE UPDATE, DELETE ON public.storage_operations FROM authenticated, anon;'), 'Migration must revoke UPDATE/DELETE on storage_operations');

  // Verify Layer B: Immutable audit trigger functions exist
  assert.ok(migrationContent.includes('fn_ensure_immutable_audit_record'), 'Migration must define fn_ensure_immutable_audit_record');
  assert.ok(migrationContent.includes('fn_enforce_storage_operation_transition') || migrationContent.includes('fn_ensure_immutable_storage_operation'), 'Migration must define storage operation trigger');
});

test('16. Verify Published Immutability Trigger and Policy Contracts', () => {
  const dataModelContent = fs.readFileSync(DOC_FILES.dataModel, 'utf-8');
  const migrationContent = fs.readFileSync(DOC_FILES.migration, 'utf-8');

  // Verify independent trigger functions for versions and files
  assert.ok(migrationContent.includes('fn_ensure_immutable_resource_version'), 'Migration proposal must define version immutability trigger function');
  assert.ok(migrationContent.includes('fn_ensure_immutable_resource_file'), 'Migration proposal must define file immutability trigger function');

  // Extract function body for fn_ensure_immutable_resource_version
  const versionTriggerStart = migrationContent.indexOf('fn_ensure_immutable_resource_version');
  const versionTriggerBody = migrationContent.slice(versionTriggerStart, versionTriggerStart + 1200);

  // Version trigger must return OLD on DELETE, return NEW on UPDATE, and raise exception on protected states
  assert.ok(versionTriggerBody.includes("IF TG_OP = 'DELETE' THEN"), 'Version trigger must check TG_OP = DELETE');
  assert.ok(versionTriggerBody.includes('RETURN OLD;'), 'Version trigger must RETURN OLD on DELETE');
  assert.ok(versionTriggerBody.includes('RETURN NEW;'), 'Version trigger must RETURN NEW on UPDATE');
  assert.ok(versionTriggerBody.includes('RAISE EXCEPTION'), 'Version trigger must raise exception for protected states');
  assert.ok(versionTriggerBody.includes('lr.id = OLD.resource_id'), 'Version immutability trigger must join parent using OLD.resource_id');

  // Extract function body for fn_ensure_immutable_resource_file
  const fileTriggerStart = migrationContent.indexOf('fn_ensure_immutable_resource_file');
  const fileTriggerBody = migrationContent.slice(fileTriggerStart, fileTriggerStart + 1200);

  // File trigger must use ONLY OLD.version_id from files table and NO invalid column references
  assert.ok(fileTriggerBody.includes('lrv.id = OLD.version_id'), 'File immutability trigger must match lrv.id = OLD.version_id');
  assert.ok(fileTriggerBody.includes('JOIN public.lesson_resources lr ON lr.id = lrv.resource_id'), 'File immutability trigger must use explicit JOIN to lesson_resources');
  assert.ok(!fileTriggerBody.includes('OLD.status'), 'File trigger MUST NOT reference non-existent OLD.status column on files table');
  assert.ok(!fileTriggerBody.includes('OLD.resource_id'), 'File trigger MUST NOT reference non-existent OLD.resource_id column on files table');
  assert.ok(!fileTriggerBody.includes('OLD.published_version_id'), 'File trigger MUST NOT reference non-existent OLD.published_version_id column on files table');
  assert.ok(!fileTriggerBody.includes('OLD.version_number'), 'File trigger MUST NOT reference non-existent OLD.version_number column on files table');
  assert.ok(fileTriggerBody.includes("IF TG_OP = 'DELETE' THEN"), 'File trigger must check TG_OP = DELETE');
  assert.ok(fileTriggerBody.includes('RETURN OLD;'), 'File trigger must RETURN OLD on DELETE');

  assert.ok(dataModelContent.includes('Published Immutability Contract'), 'Data model must define Published Immutability Contract');
  assert.ok(dataModelContent.includes('REVOKE UPDATE, DELETE ON public.lesson_resource_versions'), 'Data model must revoke UPDATE/DELETE on versions from authenticated');
  assert.ok(dataModelContent.includes('REVOKE UPDATE, DELETE ON public.lesson_resource_files'), 'Data model must revoke UPDATE/DELETE on files from authenticated');
});

test('17. Verify Storage Operation Ledger & 8 Saga States', () => {
  const dataModelContent = fs.readFileSync(DOC_FILES.dataModel, 'utf-8');
  const migrationContent = fs.readFileSync(DOC_FILES.migration, 'utf-8');
  const rawAuth = fs.readFileSync(DOC_FILES.authMatrix, 'utf-8');
  const authMatrix = JSON.parse(rawAuth);

  // Verify storage_operations entity definition
  assert.ok(dataModelContent.includes('`storage_operations`'), 'Data model must define storage_operations table');
  assert.ok(migrationContent.includes('public.storage_operations'), 'Migration proposal must include storage_operations DDL');
  assert.ok(authMatrix.resources.includes('storage_operations'), 'Auth matrix resources must include storage_operations');

  // Verify all 8 storage operation states
  const REQUIRED_STORAGE_STATES = ['pending', 'uploaded', 'verified', 'promoted', 'cleanup_pending', 'cleaned', 'failed', 'compensated'];
  for (const state of REQUIRED_STORAGE_STATES) {
    assert.ok(dataModelContent.includes(`'${state}'`), `Data model missing storage operation state: ${state}`);
  }
});

test('18. Verify 3-Phase Saga Transactions & Rollback RPC Specification', () => {
  const dataModelContent = fs.readFileSync(DOC_FILES.dataModel, 'utf-8');
  const migrationContent = fs.readFileSync(DOC_FILES.migration, 'utf-8');
  const designContent = fs.readFileSync(DOC_FILES.design, 'utf-8');

  // Verify Publish Saga Phases A, B, C
  assert.ok(dataModelContent.includes('Phase A: DB Transaction 1') || designContent.includes('Phase A: DB lock'), 'Docs must define Publish Phase A');
  assert.ok(dataModelContent.includes('Phase B: Storage Copy') || designContent.includes('Phase B: storage copy'), 'Docs must define Publish Phase B');
  assert.ok(dataModelContent.includes('Phase C: DB Transaction 2') || designContent.includes('Phase C: DB publish commit'), 'Docs must define Publish Phase C');

  // Verify rollback_published_resource_version RPC
  assert.ok(migrationContent.includes('rollback_published_resource_version'), 'Migration proposal must define rollback_published_resource_version RPC');
  assert.ok(dataModelContent.includes('rollback_published_resource_version'), 'Data model must define rollback_published_resource_version RPC');
  assert.ok(designContent.includes('rollback_published_resource_version'), 'Design doc must list rollback_published_resource_version RPC');
});

test('19. Verify absolute compliance with design constraints (No src/ or migration edits)', () => {
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

test('20. Verify Canonical Constraints, NOT VALID / VALIDATE & Teardown Consistency', () => {
  const migrationContent = fs.readFileSync(DOC_FILES.migration, 'utf-8');
  const dataModelContent = fs.readFileSync(DOC_FILES.dataModel, 'utf-8');

  const CANONICAL_CONSTRAINTS = [
    'uq_resource_version_id_resource',
    'fk_lesson_resources_current_draft_same_resource',
    'fk_lesson_resources_approved_same_resource',
    'fk_lesson_resources_published_same_resource',
  ];

  // All canonical constraint names must exist in migration proposal and data model
  for (const constraint of CANONICAL_CONSTRAINTS) {
    assert.ok(migrationContent.includes(constraint), `Migration proposal missing canonical constraint: ${constraint}`);
    assert.ok(dataModelContent.includes(constraint), `Data model missing canonical constraint: ${constraint}`);
  }

  // Verify ADD CONSTRAINT ... NOT VALID pattern in migration proposal
  for (const fkConstraint of [
    'fk_lesson_resources_current_draft_same_resource',
    'fk_lesson_resources_approved_same_resource',
    'fk_lesson_resources_published_same_resource',
  ]) {
    assert.ok(
      migrationContent.includes(`ADD CONSTRAINT ${fkConstraint}`) && migrationContent.includes('NOT VALID'),
      `Constraint ${fkConstraint} must be added with NOT VALID`
    );
    assert.ok(
      migrationContent.includes(`VALIDATE CONSTRAINT ${fkConstraint}`),
      `Constraint ${fkConstraint} must have corresponding VALIDATE CONSTRAINT statement`
    );
  }

  // Verify Teardown section uses exact canonical names and does NOT drop audit tables or use DROP CASCADE
  const teardownStart = migrationContent.indexOf('Non-production Development Teardown');
  assert.ok(teardownStart > -1, 'Migration proposal must contain Non-production Development Teardown section');
  const teardownBody = migrationContent.slice(teardownStart);
  assert.ok(teardownBody.includes('fk_lesson_resources_current_draft_same_resource'), 'Teardown must drop fk_lesson_resources_current_draft_same_resource');
  assert.ok(teardownBody.includes('fk_lesson_resources_approved_same_resource'), 'Teardown must drop fk_lesson_resources_approved_same_resource');
  assert.ok(teardownBody.includes('fk_lesson_resources_published_same_resource'), 'Teardown must drop fk_lesson_resources_published_same_resource');
  assert.ok(!teardownBody.includes('DROP TABLE'), 'Teardown must NOT drop tables');
  assert.ok(!teardownBody.includes('CASCADE'), 'Teardown must NOT use CASCADE');
});

test('21. Verify Machine-Readable Leakage Vectors & 3 Explanation Leakage Security Scanner Contracts', () => {
  const dataModelContent = fs.readFileSync(DOC_FILES.dataModel, 'utf-8');
  const designContent = fs.readFileSync(DOC_FILES.design, 'utf-8');
  const storageContent = fs.readFileSync(DOC_FILES.storage, 'utf-8');
  const migrationContent = fs.readFileSync(DOC_FILES.migration, 'utf-8');

  // Verify machine-readable vectors JSON file exists and is valid JSON
  const vectorsPath = path.join(rootDir, 'docs', 'CONTENT-ONBOARDING-HTML-LEAKAGE-VECTORS-03.json');
  assert.ok(fs.existsSync(vectorsPath), 'Leakage vectors JSON file must exist at docs/CONTENT-ONBOARDING-HTML-LEAKAGE-VECTORS-03.json');
  const vectorsData = JSON.parse(fs.readFileSync(vectorsPath, 'utf-8'));

  assert.equal(vectorsData.document_id, 'CONTENT-ONBOARDING-HTML-LEAKAGE-VECTORS-03');
  assert.ok(Array.isArray(vectorsData.negative_test_vectors), 'Must contain negative_test_vectors array');
  assert.ok(Array.isArray(vectorsData.allowed_test_vectors), 'Must contain allowed_test_vectors array');

  // Check required negative vector cases: HTML, JSON, JS, manifest, local asset with explanation
  const requiredTargets = ['HTML', 'JSON', 'JavaScript', 'manifest', 'asset'];
  for (const target of requiredTargets) {
    const found = vectorsData.negative_test_vectors.some((v) =>
      v.name.toLowerCase().includes(target.toLowerCase()) || v.target_file.toLowerCase().includes(target.toLowerCase())
    );
    assert.ok(found, `Negative test vectors missing target type: ${target}`);
  }

  // All negative vectors must have expected_classification = REJECT
  for (const vec of vectorsData.negative_test_vectors) {
    assert.equal(vec.expected_classification, 'REJECT', `Vector ${vec.id} must be classified as REJECT`);
  }

  // Allowed vectors must include lesson summary and post-reveal API explanation classified as ACCEPT
  for (const vec of vectorsData.allowed_test_vectors) {
    assert.equal(vec.expected_classification, 'ACCEPT', `Allowed vector ${vec.id} must be classified as ACCEPT`);
  }

  // Test 1: Explanation inside zip package file (HTML, JSON, JS, manifest, inline scripts, local assets) -> REJECT
  assert.ok(
    designContent.includes('explanation') && (designContent.includes('REJECT') || designContent.includes('forbidden')),
    'Security scanner contract must reject explanation in packages'
  );

  // Test 2: Explanation inside JSON asset -> REJECT
  assert.ok(
    dataModelContent.includes('JSON attributes') || storageContent.includes('JSON'),
    'Security scanner contract must reject explanation in JSON assets'
  );

  // Test 3: Student iframe payload excludes explanation & post-reveal explanation served via Server/Application path outside package
  assert.ok(
    dataModelContent.includes('Student Iframe Payload') || dataModelContent.includes('Post-Reveal Explanation Path') || designContent.includes('Student iframe payload'),
    'Data model or design doc must specify student iframe payload explanation exclusion and post-reveal server path'
  );
  assert.ok(
    migrationContent.includes('post-reveal educational explanations are retrieved strictly via server/application paths') || dataModelContent.includes('served exclusively via secure Server/Application API endpoints'),
    'Migration proposal or data model must mandate post-reveal explanations served outside package'
  );
});

// ============================================================================
// Analytical Helper Functions for SQL Block Extraction
// ============================================================================
function extractTypeEnumBlock(sqlContent, enumName) {
  const regex = new RegExp(`CREATE\\s+TYPE\\s+public\\.${enumName}\\s+AS\\s+ENUM\\s*\\(([^)]+)\\)`, 'i');
  const match = sqlContent.match(regex);
  if (!match) return [];
  return match[1]
    .split(',')
    .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function extractFunctionBody(sqlContent, functionName) {
  const regex = new RegExp(`CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${functionName}\\s*\\([^)]*\\)[\\s\\S]*?LANGUAGE\\s+plpgsql;`, 'i');
  const match = sqlContent.match(regex);
  return match ? match[0] : '';
}

function extractTriggerBindings(sqlContent) {
  const regex = /CREATE\s+TRIGGER\s+(\w+)\s+(BEFORE|AFTER|INSTEAD\s+OF)\s+([\w\s]+?)\s+ON\s+public\.(\w+)\s+FOR\s+EACH\s+ROW\s+EXECUTE\s+FUNCTION\s+public\.(\w+)\s*\(\);/gi;
  const matches = [];
  let m;
  while ((m = regex.exec(sqlContent)) !== null) {
    matches.push({
      name: m[1],
      timing: m[2],
      events: m[3].trim(),
      table: m[4],
      functionName: m[5],
    });
  }
  return matches;
}

function extractConstraintBlocks(sqlContent) {
  const regex = /(?:CONSTRAINT\s+(\w+)|ADD\s+CONSTRAINT\s+(\w+))[\s\S]*?(?:;\n|\n\n|\))/gi;
  const matches = [];
  let m;
  while ((m = regex.exec(sqlContent)) !== null) {
    const name = m[1] || m[2];
    if (name) {
      matches.push({ name, statement: m[0] });
    }
  }
  return matches;
}

function extractValidateBlocks(sqlContent) {
  const regex = /ALTER\s+TABLE\s+public\.\w+\s+VALIDATE\s+CONSTRAINT\s+(\w+);/gi;
  const matches = [];
  let m;
  while ((m = regex.exec(sqlContent)) !== null) {
    matches.push({ constraintName: m[1], statement: m[0] });
  }
  return matches;
}

function extractTeardownBlock(sqlContent) {
  const start = sqlContent.indexOf('Non-production Development Teardown');
  if (start === -1) return '';
  return sqlContent.slice(start);
}

function parseTriggerTransitionMap(functionBody) {
  const caseMatch = functionBody.match(/CASE\s+OLD\.status([\s\S]*?)END\s+CASE;/i);
  if (!caseMatch) throw new Error('Could not find CASE OLD.status block in function body');

  const caseBody = caseMatch[1];
  const whenRegex = /WHEN\s+'(\w+)'\s+THEN([\s\S]*?)(?=WHEN|ELSE|END\s+CASE)/gi;

  const transitionMap = {};
  let match;

  while ((match = whenRegex.exec(caseBody)) !== null) {
    const fromStatus = match[1];
    const armBody = match[2].trim();

    if (armBody.includes('RAISE EXCEPTION')) {
      const notInMatch = armBody.match(/IF\s+NEW\.status\s+NOT\s+IN\s*\(([^)]+)\)/i);
      const notEqualMatch = armBody.match(/IF\s+NEW\.status\s+<>\s*'(\w+)'/i);

      if (notInMatch) {
        const allowed = notInMatch[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
        transitionMap[fromStatus] = allowed;
      } else if (notEqualMatch) {
        transitionMap[fromStatus] = [notEqualMatch[1]];
      } else {
        transitionMap[fromStatus] = [];
      }
    } else {
      transitionMap[fromStatus] = [];
    }
  }

  return transitionMap;
}

test('22. Analytical Verification of storage_operation_status Enum, Machine-Readable Matrix & fn_enforce_storage_operation_transition Trigger', () => {
  const migrationContent = fs.readFileSync(DOC_FILES.migration, 'utf-8');

  // 1. Read machine-readable transitions JSON
  const transitionsJsonPath = path.join(rootDir, 'docs', 'CONTENT-ONBOARDING-HTML-STORAGE-TRANSITIONS-03.json');
  assert.ok(fs.existsSync(transitionsJsonPath), 'STORAGE-TRANSITIONS-03.json must exist');
  const transitionsData = JSON.parse(fs.readFileSync(transitionsJsonPath, 'utf-8'));
  const jsonTransitions = transitionsData.transitions;
  const jsonTerminalStates = transitionsData.terminal_states;

  // 2. Extract and verify enum values
  const enumValues = extractTypeEnumBlock(migrationContent, 'storage_operation_status');
  const EXPECTED_STORAGE_STATES = ['pending', 'uploaded', 'verified', 'promoted', 'cleanup_pending', 'cleaned', 'failed', 'compensated'];
  assert.deepEqual(enumValues, EXPECTED_STORAGE_STATES, 'storage_operation_status enum values must strictly match the 8 legal states');
  assert.ok(!enumValues.includes('completed'), 'status "completed" MUST NOT exist in storage_operation_status enum');

  // 3. Extract function body for fn_enforce_storage_operation_transition
  const functionBody = extractFunctionBody(migrationContent, 'fn_enforce_storage_operation_transition');
  assert.ok(functionBody.length > 0, 'Migration proposal must define fn_enforce_storage_operation_transition() function body');
  assert.ok(!functionBody.includes("'completed'"), 'fn_enforce_storage_operation_transition MUST NOT reference status "completed"');

  // 4. Verify DELETE is denied first
  const deleteCheckIdx = functionBody.indexOf("IF TG_OP = 'DELETE'");
  assert.ok(deleteCheckIdx > -1, 'Trigger must check TG_OP = DELETE');

  // 5. Verify immutable identity fields check (including parent_operation_id and retry_number)
  const identityCheckIdx = functionBody.indexOf('STORAGE_OPERATION_IDENTITY_IMMUTABLE');
  assert.ok(identityCheckIdx > -1, 'Trigger must enforce STORAGE_OPERATION_IDENTITY_IMMUTABLE');
  assert.ok(deleteCheckIdx < identityCheckIdx, 'DELETE check must come before identity fields check');

  const identityFields = ['id', 'parent_operation_id', 'retry_number', 'batch_id', 'resource_version_id', 'operation_type', 'source_path', 'target_path', 'expected_hash', 'idempotency_key', 'created_at'];
  for (const field of identityFields) {
    assert.ok(functionBody.includes(field), `Trigger function body must enforce immutability for identity field: ${field}`);
  }

  // 6. Verify attempt_count non-decreasing check
  assert.ok(functionBody.includes('NEW.attempt_count < OLD.attempt_count'), 'Trigger must prohibit decreasing attempt_count');

  // 7. Verify NO pre-guard blocking UPDATE on failed before CASE OLD.status
  const caseIdx = functionBody.indexOf('CASE OLD.status');
  assert.ok(caseIdx > identityCheckIdx, 'CASE OLD.status must come after identity check');

  const preGuardBeforeCase = functionBody.slice(0, caseIdx);
  assert.ok(
    !preGuardBeforeCase.includes("OLD.status IN ('cleaned', 'failed', 'compensated')") &&
    !preGuardBeforeCase.includes("OLD.status = 'failed'"),
    'Trigger MUST NOT contain a pre-guard blocking UPDATE on failed before CASE OLD.status evaluation'
  );

  // 8. Build actual transition map from trigger function body using SQL AST / arm parser
  const actualTransitionMap = parseTriggerTransitionMap(functionBody);

  // 9. Compare actual transition map literally with STORAGE-TRANSITIONS-03.json
  assert.deepEqual(
    actualTransitionMap,
    jsonTransitions,
    'Trigger function transition map must match STORAGE-TRANSITIONS-03.json literally'
  );

  // 10. Verify all statuses in trigger exist in enum
  for (const status of Object.keys(actualTransitionMap)) {
    assert.ok(enumValues.includes(status), `Status '${status}' in trigger transition map must exist in storage_operation_status enum`);
  }

  // 11. Verify terminal_states have ZERO outbound transitions
  for (const termState of jsonTerminalStates) {
    assert.deepEqual(actualTransitionMap[termState], [], `Terminal state '${termState}' must have zero outbound transitions`);
  }

  // 12. Verify failed -> compensated is reachable and legal
  assert.deepEqual(actualTransitionMap['failed'], ['compensated'], 'failed state MUST permit transition strictly to compensated');

  // 13. Verify illegal transitions from failed are rejected
  assert.ok(!actualTransitionMap['failed'].includes('cleaned'), 'failed -> cleaned MUST be disallowed');
  assert.ok(!actualTransitionMap['failed'].includes('uploaded'), 'failed -> uploaded MUST be disallowed');
  assert.ok(!actualTransitionMap['failed'].includes('failed'), 'failed -> failed MUST be disallowed');

  // 14. Verify Retry row contract & constraints in migration proposal
  assert.ok(migrationContent.includes('CHECK (retry_number >= 0)'), 'Table DDL must enforce CHECK (retry_number >= 0)');
  assert.ok(migrationContent.includes('check_storage_operation_retry_identity') || migrationContent.includes('parent_operation_id IS NULL AND retry_number = 0'), 'Table DDL must enforce root vs retry identity check');

  // 15. Verify trigger binding to storage_operations table
  const triggers = extractTriggerBindings(migrationContent);
  const storageTrigger = triggers.find(t => t.table === 'storage_operations' && t.functionName === 'fn_enforce_storage_operation_transition');
  assert.ok(storageTrigger, 'Trigger trg_enforce_storage_operation_transition must be bound to storage_operations table');
  assert.equal(storageTrigger.table, 'storage_operations');
});

test('23. Analytical Verification of 4 Canonical Constraint Names in DDL Creation, Validation, and Development Teardown', () => {
  const migrationContent = fs.readFileSync(DOC_FILES.migration, 'utf-8');

  const CANONICAL_CONSTRAINTS = [
    'uq_resource_version_id_resource',
    'fk_lesson_resources_current_draft_same_resource',
    'fk_lesson_resources_approved_same_resource',
    'fk_lesson_resources_published_same_resource',
  ];

  // 1. Extract FK constraint creation blocks individually and check NOT VALID inside each block
  const FK_CONSTRAINTS = [
    'fk_lesson_resources_current_draft_same_resource',
    'fk_lesson_resources_approved_same_resource',
    'fk_lesson_resources_published_same_resource',
  ];

  for (const fkName of FK_CONSTRAINTS) {
    const startIdx = migrationContent.indexOf(`ADD CONSTRAINT ${fkName}`);
    assert.ok(startIdx > -1, `Must find ADD CONSTRAINT statement for ${fkName}`);

    const endSemicolon = migrationContent.indexOf(';', startIdx);
    const nextAdd = migrationContent.indexOf('ADD CONSTRAINT', startIdx + 1);
    const blockEnd = (nextAdd > -1 && nextAdd < endSemicolon) ? nextAdd : (endSemicolon > -1 ? endSemicolon : startIdx + 300);
    const blockText = migrationContent.slice(startIdx, blockEnd);

    assert.ok(
      blockText.includes('NOT VALID'),
      `Constraint block for ${fkName} must explicitly contain NOT VALID within its own block`
    );

    const validateRegex = new RegExp(`ALTER\\s+TABLE\\s+public\\.lesson_resources\\s+VALIDATE\\s+CONSTRAINT\\s+${fkName};`, 'i');
    assert.ok(
      validateRegex.test(migrationContent),
      `Must contain explicit VALIDATE CONSTRAINT statement for ${fkName}`
    );
  }

  // 2. Verify uq_resource_version_id_resource constraint in DDL
  assert.ok(migrationContent.includes('uq_resource_version_id_resource'), 'uq_resource_version_id_resource must exist in DDL');

  // 3. Extract Development Teardown block specifically
  const teardownBlock = extractTeardownBlock(migrationContent);
  assert.ok(teardownBlock.length > 0, 'Development teardown block must exist');

  for (const name of CANONICAL_CONSTRAINTS) {
    assert.ok(
      teardownBlock.includes(name),
      `Development teardown block must explicitly reference canonical constraint: ${name}`
    );
  }

  // 4. Verify Production rollback section does NOT drop any tables or use CASCADE
  assert.ok(!migrationContent.includes('DROP TABLE IF EXISTS public.lesson_resources'), 'Production rollback must not drop lesson_resources');
  assert.ok(!migrationContent.includes('DROP TABLE IF EXISTS public.storage_operations'), 'Production rollback must not drop storage_operations');
});

test('24. Analytical Verification of Machine-Readable Leakage Vectors & Allowed Semantics', () => {
  const vectorsPath = path.join(rootDir, 'docs', 'CONTENT-ONBOARDING-HTML-LEAKAGE-VECTORS-03.json');
  assert.ok(fs.existsSync(vectorsPath), 'Leakage vectors JSON file must exist');
  const vectorsData = JSON.parse(fs.readFileSync(vectorsPath, 'utf-8'));

  // Negative Vectors semantic analysis
  const negativeCases = vectorsData.negative_test_vectors;
  assert.equal(negativeCases.length, 5, 'Must contain exactly 5 negative test vectors');

  const requiredNegativeTypes = ['HTML', 'JSON', 'JavaScript', 'manifest', 'local_asset'];
  for (const reqType of requiredNegativeTypes) {
    const found = negativeCases.some(v =>
      (v.file_type && v.file_type.toLowerCase() === reqType.toLowerCase()) ||
      (v.media_type && v.media_type.toLowerCase().includes(reqType.toLowerCase())) ||
      (v.target_file && v.target_file.toLowerCase().includes(reqType.toLowerCase()))
    );
    assert.ok(found, `Negative test vectors must cover type: ${reqType}`);
  }

  for (const vec of negativeCases) {
    assert.ok(vec.vector_id || vec.id, 'Vector must have ID');
    assert.ok(vec.file_type || vec.media_type || vec.target_file, 'Vector must have file_type/target_file');
    assert.ok(vec.forbidden_field, `Vector ${vec.id || vec.vector_id} must define explicit forbidden_field`);
    assert.equal(vec.classification || vec.expected_classification, 'REJECT', `Vector ${vec.id || vec.vector_id} must be classified as REJECT`);

    const payload = vec.payload || vec.sample_content || '';
    assert.ok(payload.includes(vec.forbidden_field), `Vector ${vec.id || vec.vector_id} payload must actually contain forbidden field '${vec.forbidden_field}'`);
  }

  // Allowed Vectors semantic analysis with explicit metadata checks
  const allowedCases = vectorsData.allowed_test_vectors;
  assert.equal(allowedCases.length, 2, 'Must contain exactly 2 allowed test vectors');

  // 1. lesson_summary ACCEPT vector metadata checks
  const summaryVec = allowedCases.find(v => v.file_type === 'lesson_summary');
  assert.ok(summaryVec, 'Allowed vectors must include lesson_summary');
  assert.equal(summaryVec.classification, 'ACCEPT');
  assert.equal(summaryVec.expected_classification, 'ACCEPT');
  assert.equal(summaryVec.location, 'package_allowed_content');
  assert.equal(summaryVec.no_answer_mapping, true);

  const forbiddenFields = vectorsData.forbidden_fields || [];
  for (const forbidden of forbiddenFields) {
    assert.ok(
      !summaryVec.payload.includes(forbidden),
      `lesson_summary payload must NOT contain forbidden field: ${forbidden}`
    );
  }

  // 2. post_reveal_server_response ACCEPT vector metadata checks
  const apiVec = allowedCases.find(v => v.file_type === 'post_reveal_server_response');
  assert.ok(apiVec, 'Allowed vectors must include post_reveal_server_response');
  assert.equal(apiVec.classification, 'ACCEPT');
  assert.equal(apiVec.expected_classification, 'ACCEPT');
  assert.equal(apiVec.location, 'outside_package');
  assert.equal(apiVec.reveal_required, true);
});
