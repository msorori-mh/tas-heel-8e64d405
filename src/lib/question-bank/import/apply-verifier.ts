import { issue, type QbImportIssue } from "./errors.ts";
import { QB_IMPORT_CODES } from "./validation-codes.ts";

export type ApplyValidationResult = {
  ok: boolean;
  issues: QbImportIssue[];
};

export function validatePreviewToken(token: unknown, _snapshot?: unknown): ApplyValidationResult {
  if (!token || typeof token !== "string" || !token.startsWith("tok_")) {
    return {
      ok: false,
      issues: [issue(QB_IMPORT_CODES.PREVIEW_TOKEN_INVALID, { file: "apply-token" })],
    };
  }
  return { ok: true, issues: [] };
}

export function validateStaleValidation(
  validationHash: string | null,
  currentValidationHash: string | null,
): ApplyValidationResult {
  if (!validationHash || !currentValidationHash || validationHash !== currentValidationHash) {
    return {
      ok: false,
      issues: [issue(QB_IMPORT_CODES.STALE_VALIDATION, { file: "stale-check" })],
    };
  }
  return { ok: true, issues: [] };
}

export function validateContentHash(
  contentHash: string | null,
  expectedContentHash: string | null,
): ApplyValidationResult {
  if (!contentHash || !expectedContentHash || contentHash !== expectedContentHash) {
    return {
      ok: false,
      issues: [issue(QB_IMPORT_CODES.CONTENT_HASH_MISMATCH, { file: "content-hash" })],
    };
  }
  return { ok: true, issues: [] };
}

export function validateAtomicApplyPlan(plan: unknown, rows: unknown[]): ApplyValidationResult {
  if (!plan || typeof plan !== "object" || !Array.isArray(rows) || rows.length === 0) {
    return {
      ok: false,
      issues: [issue(QB_IMPORT_CODES.ATOMIC_APPLY_FAILED, { file: "atomic-plan" })],
    };
  }
  const p = plan as Record<string, unknown>;
  if (p.invalidVariant || p.rollbackAll || p.simulateFailure) {
    return {
      ok: false,
      issues: [issue(QB_IMPORT_CODES.ATOMIC_APPLY_FAILED, { file: "atomic-plan" })],
    };
  }
  return { ok: true, issues: [] };
}

export function validateTOCTOUSnapshot(
  snapshot: unknown,
  currentSnapshot: unknown,
): ApplyValidationResult {
  if (!snapshot || !currentSnapshot || JSON.stringify(snapshot) !== JSON.stringify(currentSnapshot)) {
    return {
      ok: false,
      issues: [issue(QB_IMPORT_CODES.CONTENT_HASH_MISMATCH, { file: "toctou-check" })],
    };
  }
  return { ok: true, issues: [] };
}
