import { issue, type QbImportIssue } from "./errors.ts";
import { QB_IMPORT_CODES } from "./validation-codes.ts";

export type ApplyValidationResult = {
  ok: boolean;
  issues: QbImportIssue[];
};

export type PreviewTokenEnvelope = {
  token_id: string;
  snapshot_id: string;
  snapshot_version: number | string;
  content_hash: string;
  issued_at: number;
  expires_at: number;
  actor_id?: string;
  scope?: string;
};

export type PreviewTokenBindingContext = {
  snapshot_id?: string;
  snapshot_version?: number | string;
  content_hash?: string;
  actor_id?: string;
  scope?: string;
  now?: number;
};

export function mintPreviewToken(envelope: PreviewTokenEnvelope): string {
  return `tok_v1_${Buffer.from(JSON.stringify(envelope)).toString("base64url")}`;
}

export function parsePreviewToken(token: unknown): PreviewTokenEnvelope | null {
  if (!token) return null;
  if (typeof token === "object") return token as PreviewTokenEnvelope;
  if (typeof token !== "string") return null;

  if (token.startsWith("tok_v1_")) {
    const payloadStr = token.slice("tok_v1_".length);
    try {
      const jsonStr = Buffer.from(payloadStr, "base64url").toString("utf8");
      const parsed = JSON.parse(jsonStr);
      if (parsed && typeof parsed === "object") return parsed as PreviewTokenEnvelope;
    } catch {}
    return null;
  }

  try {
    const parsed = JSON.parse(token);
    if (parsed && typeof parsed === "object") return parsed as PreviewTokenEnvelope;
  } catch {}

  return null;
}

export function validatePreviewToken(
  token: unknown,
  context?: PreviewTokenBindingContext,
): ApplyValidationResult {
  const env = parsePreviewToken(token);

  if (!env || typeof env !== "object") {
    return {
      ok: false,
      issues: [issue(QB_IMPORT_CODES.PREVIEW_TOKEN_INVALID, { file: "apply-token" })],
    };
  }

  if (!env.token_id || typeof env.token_id !== "string" || !env.token_id.trim()) {
    return {
      ok: false,
      issues: [issue(QB_IMPORT_CODES.PREVIEW_TOKEN_INVALID, { file: "apply-token" })],
    };
  }

  const now = context?.now ?? Date.now();

  if (typeof env.issued_at !== "number" || isNaN(env.issued_at) || env.issued_at > now + 5000) {
    return {
      ok: false,
      issues: [issue(QB_IMPORT_CODES.PREVIEW_TOKEN_INVALID, { file: "apply-token" })],
    };
  }

  if (typeof env.expires_at !== "number" || isNaN(env.expires_at) || env.expires_at < now) {
    return {
      ok: false,
      issues: [issue(QB_IMPORT_CODES.PREVIEW_TOKEN_INVALID, { file: "apply-token" })],
    };
  }

  if (context?.snapshot_id !== undefined && env.snapshot_id !== context.snapshot_id) {
    return {
      ok: false,
      issues: [issue(QB_IMPORT_CODES.PREVIEW_TOKEN_INVALID, { file: "apply-token" })],
    };
  }

  if (context?.snapshot_version !== undefined && env.snapshot_version !== context.snapshot_version) {
    return {
      ok: false,
      issues: [issue(QB_IMPORT_CODES.PREVIEW_TOKEN_INVALID, { file: "apply-token" })],
    };
  }

  if (context?.content_hash !== undefined && env.content_hash !== context.content_hash) {
    return {
      ok: false,
      issues: [issue(QB_IMPORT_CODES.PREVIEW_TOKEN_INVALID, { file: "apply-token" })],
    };
  }

  if (context?.actor_id !== undefined && env.actor_id !== undefined && env.actor_id !== context.actor_id) {
    return {
      ok: false,
      issues: [issue(QB_IMPORT_CODES.PREVIEW_TOKEN_INVALID, { file: "apply-token" })],
    };
  }

  if (context?.scope !== undefined && env.scope !== undefined && env.scope !== context.scope) {
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
