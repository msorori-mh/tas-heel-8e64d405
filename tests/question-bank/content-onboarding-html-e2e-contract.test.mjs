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

  it('should verify schema completeness for all 11 required fields in every case', async () => {
    const raw = await fs.readFile(matrixPath, 'utf8');
    const matrix = JSON.parse(raw);
    const requiredFields = [
      'id',
      'category',
      'actor',
      'preconditions',
      'input',
      'steps',
      'expected_result',
      'security_invariant',
      'evidence_required',
      'cleanup',
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

  it('should cover all critical categories', async () => {
    const raw = await fs.readFile(matrixPath, 'utf8');
    const matrix = JSON.parse(raw);
    const requiredCategories = [
      'packaging',
      'security',
      'content_type',
      'workflow',
      'rbac',
      'versioning',
      'visibility',
      'tamper_protection',
      'runtime_isolation',
      'resilience',
      'audit_cleanup'
    ];

    const presentCategories = new Set(matrix.cases.map(c => c.category));
    for (const cat of requiredCategories) {
      assert.ok(presentCategories.has(cat), `Required category missing from matrix: ${cat}`);
    }
  });

  it('should cover all required roles', async () => {
    const raw = await fs.readFile(matrixPath, 'utf8');
    const matrix = JSON.parse(raw);
    const requiredRoles = [
      'content_manager',
      'reviewer',
      'publisher',
      'student',
      'system'
    ];

    const presentRoles = new Set(matrix.cases.map(c => c.actor));
    for (const role of requiredRoles) {
      assert.ok(presentRoles.has(role), `Required role missing from matrix: ${role}`);
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

  it('should enforce evidence_required and cleanup defined for every case', async () => {
    const raw = await fs.readFile(matrixPath, 'utf8');
    const matrix = JSON.parse(raw);
    for (const c of matrix.cases) {
      assert.ok(
        c.evidence_required && String(c.evidence_required).trim().length > 0,
        `Case ${c.id} must define evidence_required`
      );
      assert.ok(
        c.cleanup && String(c.cleanup).trim().length > 0,
        `Case ${c.id} must define cleanup`
      );
    }
  });

  it('should contain both positive acceptance and negative rejection cases', async () => {
    const raw = await fs.readFile(matrixPath, 'utf8');
    const matrix = JSON.parse(raw);

    const positiveCases = matrix.cases.filter(
      c => c.expected_result.toLowerCase().includes('accepted') ||
           c.expected_result.toLowerCase().includes('ingested') ||
           c.expected_result.toLowerCase().includes('validated') ||
           c.expected_result.toLowerCase().includes('is returned') ||
           c.expected_result.toLowerCase().includes('succeeds') ||
           c.expected_result.toLowerCase().includes('transitions') ||
           c.expected_result.toLowerCase().includes('creates') ||
           c.expected_result.toLowerCase().includes('restored') ||
           c.expected_result.toLowerCase().includes('completes') ||
           c.expected_result.toLowerCase().includes('produces') ||
           c.expected_result.toLowerCase().includes('removed')
    );

    const negativeCases = matrix.cases.filter(
      c => c.expected_result.toLowerCase().includes('rejected') ||
           c.expected_result.toLowerCase().includes('not returned') ||
           c.expected_result.toLowerCase().includes('denied') ||
           c.expected_result.toLowerCase().includes('forbidden') ||
           c.expected_result.toLowerCase().includes('hidden') ||
           c.expected_result.toLowerCase().includes('fails') ||
           c.expected_result.toLowerCase().includes('revoked') ||
           c.expected_result.toLowerCase().includes('aborted') ||
           c.expected_result.toLowerCase().includes('disabled')
    );

    assert.ok(positiveCases.length >= 5, `Expected at least 5 positive cases, got ${positiveCases.length}`);
    assert.ok(negativeCases.length >= 5, `Expected at least 5 negative cases, got ${negativeCases.length}`);
  });

  it('should enforce published-only student visibility invariant', async () => {
    const raw = await fs.readFile(matrixPath, 'utf8');
    const matrix = JSON.parse(raw);

    const studentVisibilityCases = matrix.cases.filter(
      c => c.category === 'visibility' && c.actor === 'student'
    );

    assert.ok(studentVisibilityCases.length >= 4, 'Expected visibility cases for DRAFT, IN_REVIEW, APPROVED, and PUBLISHED');

    const draftCase = studentVisibilityCases.find(c => c.id === 'HTML_E2E_007');
    const reviewCase = studentVisibilityCases.find(c => c.id === 'HTML_E2E_008');
    const approvedCase = studentVisibilityCases.find(c => c.id === 'HTML_E2E_009');
    const publishedCase = studentVisibilityCases.find(c => c.id === 'HTML_E2E_010');

    assert.ok(draftCase && draftCase.expected_result.includes('NOT returned'), 'Draft case must hide content from student');
    assert.ok(reviewCase && (reviewCase.expected_result.includes('Forbidden') || reviewCase.expected_result.includes('inaccessible')), 'In-review case must deny student access');
    assert.ok(approvedCase && approvedCase.expected_result.includes('remains hidden'), 'Approved case must hide content until published');
    assert.ok(publishedCase && publishedCase.expected_result.includes('IS returned'), 'Published case must return content to student');
  });

  it('should verify Arabic Runbook document exists and contains required sections', async () => {
    const content = await fs.readFile(runbookPath, 'utf8');
    assert.ok(content.includes('CONTENT_ONBOARDING_HTML_E2E_CONTRACT_04'), 'Runbook missing contract name');
    assert.ok(content.includes('msorori-mh/tas-heel-8e64d405'), 'Runbook missing repo name');
    assert.ok(content.includes('test/content-onboarding-html-e2e-contract-04'), 'Runbook missing branch name');
    assert.ok(content.includes('HTML_E2E_001'), 'Runbook missing test cases summary table');
    assert.ok(content.includes('HTML_E2E_026'), 'Runbook missing final test cases');
  });
});
