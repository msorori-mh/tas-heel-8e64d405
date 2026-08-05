import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('CONTENT_ONBOARDING_HTML_E2E_CONTRACT_04 Contract Tests', () => {
  const matrixPath = path.resolve(process.cwd(), 'docs/CONTENT-ONBOARDING-HTML-E2E-MATRIX-04.json');
  const runbookPath = path.resolve(process.cwd(), 'docs/CONTENT-ONBOARDING-HTML-E2E-RUNBOOK-AR-04.md');

  it('should load matrix JSON file and parse successfully', async () => {
    const raw = await fs.readFile(matrixPath, 'utf8');
    const matrix = JSON.parse(raw);
    assert.equal(matrix.contract_name, 'CONTENT_ONBOARDING_HTML_E2E_CONTRACT_04');
    assert.ok(Array.isArray(matrix.cases), 'cases must be an array');
    assert.ok(matrix.cases.length >= 38, `expected at least 38 cases, got ${matrix.cases.length}`);
    assert.equal(matrix.cases.length, 38, `expected exactly 38 cases, got ${matrix.cases.length}`);
  });

  it('should verify schema completeness for all required fields in every case', async () => {
    const raw = await fs.readFile(matrixPath, 'utf8');
    const matrix = JSON.parse(raw);
    const requiredFields = [
      'id',
      'category',
      'actor',
      'resource_type',
      'lifecycle_state',
      'implementation_status',
      'requires_operational_backend',
      'preconditions',
      'input',
      'steps',
      'expected_result',
      'security_invariant',
      'evidence_required',
      'cleanup_required',
      'cleanup_steps',
      'blocking'
    ];

    for (const c of matrix.cases) {
      for (const field of requiredFields) {
        assert.ok(
          c[field] !== undefined && c[field] !== null && c[field] !== '',
          `Case ${c.id || 'UNKNOWN'} is missing or has empty required field: ${field}`
        );
      }
      assert.equal(typeof c.blocking, 'boolean', `Case ${c.id} field 'blocking' must be boolean`);
      assert.equal(typeof c.cleanup_required, 'boolean', `Case ${c.id} field 'cleanup_required' must be boolean`);
      assert.ok(Array.isArray(c.cleanup_steps), `Case ${c.id} field 'cleanup_steps' must be an array`);
    }
  });

  it('should verify unique IDs across all test cases and match total cases', async () => {
    const raw = await fs.readFile(matrixPath, 'utf8');
    const matrix = JSON.parse(raw);
    const seen = new Set();
    const expectedIDs = Array.from({ length: 38 }, (_, i) => `HTML_E2E_${String(i + 1).padStart(3, '0')}`);

    for (const c of matrix.cases) {
      assert.ok(!seen.has(c.id), `Duplicate case ID detected: ${c.id}`);
      seen.add(c.id);
    }
    assert.equal(seen.size, matrix.cases.length, 'Total unique IDs must equal total cases count');
    assert.equal(seen.size, 38, 'Total unique IDs must equal 38');
    for (const id of expectedIDs) {
      assert.ok(seen.has(id), `Required case ID missing: ${id}`);
    }
  });

  it('should enforce canonical resource types and reject non-canonical types', async () => {
    const raw = await fs.readFile(matrixPath, 'utf8');
    const matrix = JSON.parse(raw);
    const canonicalResourceTypes = new Set([
      'mind_map_html',
      'practical_experiment_html',
      'summary_html',
      'image',
      'pdf',
      'video',
      'external_link'
    ]);

    const forbiddenTypes = ['HTML_INTERACTIVE', 'HTML_MINDMAP', 'HTML_EXPERIMENT'];

    for (const c of matrix.cases) {
      assert.ok(
        canonicalResourceTypes.has(c.resource_type),
        `Case ${c.id} has invalid resource_type: "${c.resource_type}"`
      );
      for (const forbidden of forbiddenTypes) {
        assert.notEqual(
          c.resource_type,
          forbidden,
          `Case ${c.id} uses forbidden legacy resource type: ${forbidden}`
        );
      }
    }
  });

  it('should enforce canonical lifecycle states and reject deprecated states', async () => {
    const raw = await fs.readFile(matrixPath, 'utf8');
    const matrix = JSON.parse(raw);
    const canonicalStates = new Set([
      'draft',
      'in_review',
      'approved',
      'published',
      'rejected',
      'archived'
    ]);

    const forbiddenStates = ['DRAFT_VERIFIED', 'UNPUBLISHED', 'SUPERSEDED_ROLLED_BACK'];

    for (const c of matrix.cases) {
      assert.ok(
        canonicalStates.has(c.lifecycle_state),
        `Case ${c.id} has invalid lifecycle_state: "${c.lifecycle_state}"`
      );
      for (const forbidden of forbiddenStates) {
        assert.notEqual(
          c.lifecycle_state,
          forbidden,
          `Case ${c.id} uses forbidden state: ${forbidden}`
        );
      }
    }
  });

  it('should enforce canonical roles and reject removed roles', async () => {
    const raw = await fs.readFile(matrixPath, 'utf8');
    const matrix = JSON.parse(raw);
    const canonicalRoles = new Set([
      'admin',
      'content_manager',
      'student',
      'system',
      'unauthenticated'
    ]);

    const removedRoles = ['reviewer', 'publisher'];

    for (const c of matrix.cases) {
      assert.ok(
        canonicalRoles.has(c.actor),
        `Case ${c.id} has non-canonical actor: "${c.actor}"`
      );
      for (const removed of removedRoles) {
        assert.notEqual(
          c.actor,
          removed,
          `Case ${c.id} uses removed role: ${removed}`
        );
      }
    }
  });

  it('should enforce future_contract truth on all cases', async () => {
    const raw = await fs.readFile(matrixPath, 'utf8');
    const matrix = JSON.parse(raw);

    for (const c of matrix.cases) {
      assert.equal(
        c.implementation_status,
        'future_contract',
        `Case ${c.id} must specify implementation_status: "future_contract"`
      );
      assert.equal(
        c.requires_operational_backend,
        true,
        `Case ${c.id} must specify requires_operational_backend: true`
      );
    }
  });

  it('should enforce structured measurable cleanup schema and reject string/vague cleanup text', async () => {
    const raw = await fs.readFile(matrixPath, 'utf8');
    const matrix = JSON.parse(raw);

    const genericPhrases = [
      'preserve evidence',
      'cleanup test data',
      'revert state',
      'restore state',
      'verify cleanup'
    ];

    const requiredSelectorTokens = ['batch_code', 'resource_code', 'version_id', 'event_id', 'token_id'];

    const validateCaseCleanup = (c) => {
      if (c.cleanup_required === false) {
        assert.equal(
          c.cleanup_steps.length,
          0,
          `Case ${c.id} with cleanup_required=false must have empty cleanup_steps array`
        );
      } else {
        assert.ok(
          c.cleanup_steps.length >= 1,
          `Case ${c.id} with cleanup_required=true must define at least one cleanup step`
        );
        for (const step of c.cleanup_steps) {
          assert.equal(
            typeof step,
            'object',
            `Case ${c.id} cleanup step must be a structured Object, not ${typeof step}`
          );
          assert.ok(step !== null && !Array.isArray(step), `Case ${c.id} cleanup step must be a valid object`);

          const requiredStepFields = ['action', 'target', 'selector', 'expected_postcondition', 'evidence_required'];
          for (const field of requiredStepFields) {
            assert.ok(
              typeof step[field] === 'string' && step[field].trim().length > 0,
              `Case ${c.id} cleanup step field '${field}' must be a non-empty string`
            );
          }

          // Target check
          assert.ok(step.target.trim().length > 0, `Case ${c.id} cleanup step target must not be empty`);

          // Selector check
          const selectorUpper = step.selector.trim().toUpperCase();
          assert.notEqual(selectorUpper, 'N/A', `Case ${c.id} cleanup step selector cannot be N/A`);
          assert.notEqual(selectorUpper, 'GENERIC', `Case ${c.id} cleanup step selector cannot be generic`);

          const hasValidToken = requiredSelectorTokens.some(t => step.selector.includes(t));
          assert.ok(
            hasValidToken,
            `Case ${c.id} cleanup step selector "${step.selector}" must contain one of: ${requiredSelectorTokens.join(', ')}`
          );

          // Expected postcondition check
          assert.ok(
            step.expected_postcondition.trim().length > 0,
            `Case ${c.id} cleanup step expected_postcondition must be non-empty`
          );

          // Evidence required check
          assert.ok(
            step.evidence_required.trim().length > 0,
            `Case ${c.id} cleanup step evidence_required must be non-empty`
          );

          // Generic phrases check
          for (const phrase of genericPhrases) {
            assert.notEqual(
              step.action.toLowerCase().trim(),
              phrase.toLowerCase(),
              `Case ${c.id} cleanup step action cannot be generic phrase "${phrase}"`
            );
          }

          // Audit evidence protection check
          if (step.target.includes('audit') || step.target.includes('event')) {
            assert.notEqual(
              step.action.toLowerCase(),
              'delete',
              `Case ${c.id} cleanup step must not delete audit evidence`
            );
            assert.notEqual(
              step.action.toLowerCase(),
              'purge',
              `Case ${c.id} cleanup step must not purge audit evidence`
            );
          }
        }
      }
    };

    for (const c of matrix.cases) {
      validateCaseCleanup(c);
    }
  });

  it('should reject invalid cleanup steps in contract validator (negative contract tests)', () => {
    const validateStep = (c) => {
      if (c.cleanup_required === false) {
        assert.equal(c.cleanup_steps.length, 0, 'cleanup_steps must be empty');
      } else {
        assert.ok(c.cleanup_steps.length >= 1, 'must have steps');
        for (const step of c.cleanup_steps) {
          assert.equal(typeof step, 'object', 'must be object');
          assert.ok(step !== null && !Array.isArray(step), 'must be object');
          for (const field of ['action', 'target', 'selector', 'expected_postcondition', 'evidence_required']) {
            assert.ok(typeof step[field] === 'string' && step[field].trim().length > 0, `field '${field}' missing/empty`);
          }
          const sel = step.selector.trim().toUpperCase();
          assert.notEqual(sel, 'N/A', 'selector N/A');
          assert.notEqual(sel, 'GENERIC', 'selector GENERIC');
          const tokens = ['batch_code', 'resource_code', 'version_id', 'event_id', 'token_id'];
          assert.ok(tokens.some(t => step.selector.includes(t)), 'missing identifier token');
          for (const phrase of ['preserve evidence', 'cleanup test data', 'revert state', 'restore state', 'verify cleanup']) {
            assert.notEqual(step.action.toLowerCase().trim(), phrase, 'generic action');
          }
          if (step.target.includes('audit') || step.target.includes('event')) {
            assert.notEqual(step.action.toLowerCase(), 'delete', 'audit delete forbidden');
          }
        }
      }
    };

    // 1. String cleanup step instead of Object
    assert.throws(
      () => validateStep({ cleanup_required: true, cleanup_steps: ['delete test import batch by batch_code'] }),
      /must be object/
    );

    // 2. Empty target
    assert.throws(
      () => validateStep({ cleanup_required: true, cleanup_steps: [{ action: 'delete', target: '', selector: 'batch_code=1', expected_postcondition: 'post', evidence_required: 'ev' }] }),
      /field 'target' missing\/empty/
    );

    // 3. Generic / N/A selector
    assert.throws(
      () => validateStep({ cleanup_required: true, cleanup_steps: [{ action: 'delete', target: 'tbl', selector: 'N/A', expected_postcondition: 'post', evidence_required: 'ev' }] }),
      /selector N\/A/
    );

    // 4. Missing identifier token in selector
    assert.throws(
      () => validateStep({ cleanup_required: true, cleanup_steps: [{ action: 'delete', target: 'tbl', selector: 'some random text', expected_postcondition: 'post', evidence_required: 'ev' }] }),
      /missing identifier token/
    );

    // 5. Non-verifiable / empty expected_postcondition
    assert.throws(
      () => validateStep({ cleanup_required: true, cleanup_steps: [{ action: 'delete', target: 'tbl', selector: 'batch_code=1', expected_postcondition: '', evidence_required: 'ev' }] }),
      /field 'expected_postcondition' missing\/empty/
    );

    // 6. Empty evidence_required
    assert.throws(
      () => validateStep({ cleanup_required: true, cleanup_steps: [{ action: 'delete', target: 'tbl', selector: 'batch_code=1', expected_postcondition: 'post', evidence_required: '' }] }),
      /field 'evidence_required' missing\/empty/
    );

    // 7. Generic phrase action
    assert.throws(
      () => validateStep({ cleanup_required: true, cleanup_steps: [{ action: 'preserve evidence', target: 'tbl', selector: 'batch_code=1', expected_postcondition: 'post', evidence_required: 'ev' }] }),
      /generic action/
    );

    // 8. Audit evidence deletion
    assert.throws(
      () => validateStep({ cleanup_required: true, cleanup_steps: [{ action: 'delete', target: 'audit_log_table', selector: 'event_id=1', expected_postcondition: 'post', evidence_required: 'ev' }] }),
      /audit delete forbidden/
    );
  });

  it('should verify structured audit evidence retention in HTML_E2E_001, HTML_E2E_028, and HTML_E2E_037', async () => {
    const raw = await fs.readFile(matrixPath, 'utf8');
    const matrix = JSON.parse(raw);

    const auditCases = ['HTML_E2E_001', 'HTML_E2E_028', 'HTML_E2E_037'];
    for (const caseId of auditCases) {
      const c = matrix.cases.find(x => x.id === caseId);
      assert.ok(c, `Case ${caseId} must exist`);
      const auditStep = c.cleanup_steps.find(s => s.action === 'verify_audit_record_retained');
      assert.ok(auditStep, `Case ${caseId} must have verify_audit_record_retained cleanup step`);
      assert.equal(auditStep.target, 'lesson_resource_events');
      assert.ok(auditStep.selector.includes('event_id'));
      assert.ok(auditStep.expected_postcondition.includes('payload hash is unchanged'));
      assert.ok(auditStep.evidence_required.includes('payload_sha256'));
    }
  });

  it('should enforce non-empty security invariants starting with SEC- for every case', async () => {
    const raw = await fs.readFile(matrixPath, 'utf8');
    const matrix = JSON.parse(raw);
    for (const c of matrix.cases) {
      assert.ok(
        typeof c.security_invariant === 'string' && c.security_invariant.startsWith('SEC-'),
        `Case ${c.id} security_invariant must start with 'SEC-'. Found: "${c.security_invariant}"`
      );
    }
  });

  it('should cover admin positive and negative operations', async () => {
    const raw = await fs.readFile(matrixPath, 'utf8');
    const matrix = JSON.parse(raw);
    const adminCases = matrix.cases.filter(c => c.actor === 'admin');
    assert.ok(adminCases.length >= 4, 'Expected admin cases for approve, reject, publish, unpublish');

    const approveCase = adminCases.find(c => c.id === 'HTML_E2E_022');
    const rejectCase = adminCases.find(c => c.id === 'HTML_E2E_023');
    const publishCase = adminCases.find(c => c.id === 'HTML_E2E_025');
    const unpublishCase = adminCases.find(c => c.id === 'HTML_E2E_026');

    assert.ok(approveCase, 'Admin approve case (HTML_E2E_022) must exist');
    assert.ok(rejectCase, 'Admin reject case (HTML_E2E_023) must exist');
    assert.ok(publishCase, 'Admin publish case (HTML_E2E_025) must exist');
    assert.ok(unpublishCase, 'Admin unpublish case (HTML_E2E_026) must exist');
  });

  it('should cover unauthenticated negative cases', async () => {
    const raw = await fs.readFile(matrixPath, 'utf8');
    const matrix = JSON.parse(raw);
    const unauthCases = matrix.cases.filter(c => c.actor === 'unauthenticated');
    assert.ok(unauthCases.length >= 3, 'Expected unauthenticated negative cases');

    const adminDenied = unauthCases.find(c => c.id === 'HTML_E2E_011');
    const draftDenied = unauthCases.find(c => c.id === 'HTML_E2E_012');
    const urlDenied = unauthCases.find(c => c.id === 'HTML_E2E_020');

    assert.ok(adminDenied, 'Unauthenticated admin denied case (HTML_E2E_011) must exist');
    assert.ok(draftDenied, 'Unauthenticated draft denied case (HTML_E2E_012) must exist');
    assert.ok(urlDenied, 'Unauthenticated signed URL denied case (HTML_E2E_020) must exist');
  });

  it('should cover student wrong lesson and can_access_lesson denial cases', async () => {
    const raw = await fs.readFile(matrixPath, 'utf8');
    const matrix = JSON.parse(raw);

    const wrongLessonCase = matrix.cases.find(c => c.id === 'HTML_E2E_015');
    const noAccessCase = matrix.cases.find(c => c.id === 'HTML_E2E_016');

    assert.ok(wrongLessonCase, 'Wrong lesson denial case (HTML_E2E_015) must exist');
    assert.ok(noAccessCase, 'can_access_lesson false denial case (HTML_E2E_016) must exist');
    assert.ok(wrongLessonCase.expected_result.toLowerCase().includes('denied'), 'Wrong lesson case must deny access');
    assert.ok(noAccessCase.expected_result.toLowerCase().includes('denied'), 'can_access_lesson false case must deny access');
  });

  it('should cover full authorization negative matrix', async () => {
    const raw = await fs.readFile(matrixPath, 'utf8');
    const matrix = JSON.parse(raw);

    const cmPublishDenied = matrix.cases.find(c => c.id === 'HTML_E2E_017');
    const studentAdminDenied = matrix.cases.find(c => c.id === 'HTML_E2E_013');
    const dbWriteDenied = matrix.cases.find(c => c.id === 'HTML_E2E_018');
    const bucketWriteDenied = matrix.cases.find(c => c.id === 'HTML_E2E_019');

    assert.ok(cmPublishDenied && cmPublishDenied.expected_result.includes('403'), 'Content manager publish denied case must exist');
    assert.ok(studentAdminDenied && studentAdminDenied.expected_result.includes('403'), 'Student admin route denied case must exist');
    assert.ok(dbWriteDenied && dbWriteDenied.expected_result.toLowerCase().includes('denied'), 'Direct DB table write denied case must exist');
    assert.ok(bucketWriteDenied && bucketWriteDenied.expected_result.toLowerCase().includes('denied'), 'Direct storage bucket write denied case must exist');
  });

  it('should cover mandatory security cases', async () => {
    const raw = await fs.readFile(matrixPath, 'utf8');
    const matrix = JSON.parse(raw);

    const zipCase = matrix.cases.find(c => c.id === 'HTML_E2E_003');
    const fsCase = matrix.cases.find(c => c.id === 'HTML_E2E_004');
    const jsCase = matrix.cases.find(c => c.id === 'HTML_E2E_005');
    const cspCase = matrix.cases.find(c => c.id === 'HTML_E2E_006');
    const answerKeyCase = matrix.cases.find(c => c.id === 'HTML_E2E_007');
    const correctIndexCase = matrix.cases.find(c => c.id === 'HTML_E2E_008');
    const explanationCase = matrix.cases.find(c => c.id === 'HTML_E2E_009');
    const piiCase = matrix.cases.find(c => c.id === 'HTML_E2E_010');
    const hashMismatchCase = matrix.cases.find(c => c.id === 'HTML_E2E_033');
    const forgedExperimentCase = matrix.cases.find(c => c.id === 'HTML_E2E_034');
    const staleIframeCase = matrix.cases.find(c => c.id === 'HTML_E2E_035');
    const nativeRuntimeCase = matrix.cases.find(c => c.id === 'HTML_E2E_036');

    assert.ok(zipCase, 'Unsafe ZIP case must exist');
    assert.ok(fsCase, 'Symlink traversal case must exist');
    assert.ok(jsCase, 'External JS case must exist');
    assert.ok(cspCase, 'CSP hash case must exist');
    assert.ok(answerKeyCase, 'Answer key package case must exist');
    assert.ok(correctIndexCase, 'questions.correct_index leakage case must exist');
    assert.ok(explanationCase, 'Explanation reveal case must exist');
    assert.ok(piiCase, 'Student PII case must exist');
    assert.ok(hashMismatchCase, 'Hash mismatch case must exist');
    assert.ok(forgedExperimentCase, 'Forged experiment completion case must exist');
    assert.ok(staleIframeCase, 'Stale iframe postMessage case must exist');
    assert.ok(nativeRuntimeCase, 'Native runtime disabled case must exist');
  });

  it('should verify Arabic Runbook document exists and contains required future contract notice', async () => {
    const content = await fs.readFile(runbookPath, 'utf8');
    assert.ok(content.includes('CONTENT_ONBOARDING_HTML_E2E_CONTRACT_04'), 'Runbook missing contract name');
    assert.ok(content.includes('msorori-mh/tas-heel-8e64d405'), 'Runbook missing repo name');
    assert.ok(content.includes('test/content-onboarding-html-e2e-contract-04'), 'Runbook missing branch name');
    assert.ok(content.includes('هذه المصفوفة عقد قبول مستقبلي، وليست إثباتاً أن Backend مطبقة.'), 'Runbook missing explicit future contract truth statement');
    assert.ok(content.includes('HTML_E2E_001'), 'Runbook missing test cases summary table start');
    assert.ok(content.includes('HTML_E2E_038'), 'Runbook missing test cases summary table end');
  });
});
