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
    assert.ok(matrix.cases.length >= 26, `expected at least 26 cases, got ${matrix.cases.length}`);
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

  it('should verify unique IDs across all test cases', async () => {
    const raw = await fs.readFile(matrixPath, 'utf8');
    const matrix = JSON.parse(raw);
    const seen = new Set();
    for (const c of matrix.cases) {
      assert.ok(!seen.has(c.id), `Duplicate case ID detected: ${c.id}`);
      seen.add(c.id);
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

  it('should enforce executable cleanup schema and reject N/A or vague cleanup text', async () => {
    const raw = await fs.readFile(matrixPath, 'utf8');
    const matrix = JSON.parse(raw);

    for (const c of matrix.cases) {
      if (c.cleanup_required === false) {
        assert.equal(
          c.cleanup_steps.length,
          0,
          `Case ${c.id} with cleanup_required=false must have empty cleanup_steps array`
        );
      } else {
        assert.ok(
          c.cleanup_steps.length > 0,
          `Case ${c.id} with cleanup_required=true must define at least one cleanup step`
        );
        for (const step of c.cleanup_steps) {
          assert.ok(
            typeof step === 'string' && step.trim().length > 0,
            `Case ${c.id} has invalid cleanup step`
          );
          assert.notEqual(step.trim().toUpperCase(), 'N/A', `Case ${c.id} contains N/A cleanup step`);
          assert.notEqual(step.trim(), 'Revert state transition', `Case ${c.id} contains non-measurable cleanup step`);
          assert.notEqual(step.trim(), 'Re-align version state', `Case ${c.id} contains non-measurable cleanup step`);
        }
      }
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
