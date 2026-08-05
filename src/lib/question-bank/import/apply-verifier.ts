import crypto from "node:crypto";
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
  actor_id: string;
  scope: string;
  issued_at: number;
  expires_at: number;
  jti: string;
};

export type PreviewTokenBindingContext = {
  snapshot_id?: string;
  snapshot_version?: number | string;
  content_hash?: string;
  actor_id?: string;
  scope?: string;
  now?: number;
};

const SERVER_SECRET = process.env.QB_PREVIEW_TOKEN_SECRET || crypto.randomBytes(32).toString("hex");

function canonicalizePayload(env: PreviewTokenEnvelope): string {
  const canonicalObj = {
    actor_id: String(env.actor_id ?? ""),
    content_hash: String(env.content_hash ?? ""),
    expires_at: Number(env.expires_at),
    issued_at: Number(env.issued_at),
    jti: String(env.jti ?? env.token_id ?? ""),
    scope: String(env.scope ?? ""),
    snapshot_id: String(env.snapshot_id ?? ""),
    snapshot_version: String(env.snapshot_version ?? ""),
    token_id: String(env.token_id ?? ""),
  };
  return JSON.stringify(canonicalObj);
}

function signPayload(payloadB64Url: string): string {
  return crypto.createHmac("sha256", SERVER_SECRET).update(payloadB64Url).digest("base64url");
}

export function mintPreviewToken(envelope: PreviewTokenEnvelope): string {
  const payloadJson = canonicalizePayload(envelope);
  const payloadB64Url = Buffer.from(payloadJson, "utf8").toString("base64url");
  const signature = signPayload(payloadB64Url);
  return `tok_v1_${payloadB64Url}.${signature}`;
}

export function parseAndVerifyPreviewToken(tokenStr: unknown): PreviewTokenEnvelope | null {
  if (typeof tokenStr !== "string" || !tokenStr.startsWith("tok_v1_")) {
    return null;
  }
  const raw = tokenStr.slice("tok_v1_".length);
  const dotIdx = raw.indexOf(".");
  if (dotIdx === -1) return null;

  const payloadB64Url = raw.slice(0, dotIdx);
  const sigB64Url = raw.slice(dotIdx + 1);

  if (!payloadB64Url || !sigB64Url) return null;

  const expectedSig = signPayload(payloadB64Url);
  const bufActual = Buffer.from(sigB64Url);
  const bufExpected = Buffer.from(expectedSig);

  if (bufActual.length !== bufExpected.length) return null;
  if (!crypto.timingSafeEqual(bufActual, bufExpected)) return null;

  try {
    const jsonStr = Buffer.from(payloadB64Url, "base64url").toString("utf8");
    const parsed = JSON.parse(jsonStr);
    if (parsed && typeof parsed === "object") {
      return parsed as PreviewTokenEnvelope;
    }
  } catch {}

  return null;
}

export function validatePreviewToken(
  token: unknown,
  context?: PreviewTokenBindingContext,
): ApplyValidationResult {
  const env = parseAndVerifyPreviewToken(token);

  if (!env) {
    return {
      ok: false,
      issues: [issue(QB_IMPORT_CODES.PREVIEW_TOKEN_INVALID, { file: "apply-token", stage: "IDEMPOTENCY", source_subsystem: "apply-verifier" })],
    };
  }

  if (!env.token_id || typeof env.token_id !== "string" || !env.token_id.trim()) {
    return {
      ok: false,
      issues: [issue(QB_IMPORT_CODES.PREVIEW_TOKEN_INVALID, { file: "apply-token", stage: "IDEMPOTENCY", source_subsystem: "apply-verifier" })],
    };
  }

  const now = context?.now ?? Date.now();

  if (typeof env.issued_at !== "number" || isNaN(env.issued_at) || env.issued_at > now + 5000) {
    return {
      ok: false,
      issues: [issue(QB_IMPORT_CODES.PREVIEW_TOKEN_INVALID, { file: "apply-token", stage: "IDEMPOTENCY", source_subsystem: "apply-verifier" })],
    };
  }

  if (typeof env.expires_at !== "number" || isNaN(env.expires_at) || env.expires_at <= env.issued_at || env.expires_at < now) {
    return {
      ok: false,
      issues: [issue(QB_IMPORT_CODES.PREVIEW_TOKEN_INVALID, { file: "apply-token", stage: "IDEMPOTENCY", source_subsystem: "apply-verifier" })],
    };
  }

  if (context?.snapshot_id !== undefined && env.snapshot_id !== context.snapshot_id) {
    return {
      ok: false,
      issues: [issue(QB_IMPORT_CODES.PREVIEW_TOKEN_INVALID, { file: "apply-token", stage: "IDEMPOTENCY", source_subsystem: "apply-verifier" })],
    };
  }

  if (context?.snapshot_version !== undefined && String(env.snapshot_version) !== String(context.snapshot_version)) {
    return {
      ok: false,
      issues: [issue(QB_IMPORT_CODES.PREVIEW_TOKEN_INVALID, { file: "apply-token", stage: "IDEMPOTENCY", source_subsystem: "apply-verifier" })],
    };
  }

  if (context?.content_hash !== undefined && env.content_hash !== context.content_hash) {
    return {
      ok: false,
      issues: [issue(QB_IMPORT_CODES.PREVIEW_TOKEN_INVALID, { file: "apply-token", stage: "IDEMPOTENCY", source_subsystem: "apply-verifier" })],
    };
  }

  if (context?.actor_id !== undefined && env.actor_id !== context.actor_id) {
    return {
      ok: false,
      issues: [issue(QB_IMPORT_CODES.PREVIEW_TOKEN_INVALID, { file: "apply-token", stage: "IDEMPOTENCY", source_subsystem: "apply-verifier" })],
    };
  }

  if (context?.scope !== undefined && env.scope !== context.scope) {
    return {
      ok: false,
      issues: [issue(QB_IMPORT_CODES.PREVIEW_TOKEN_INVALID, { file: "apply-token", stage: "IDEMPOTENCY", source_subsystem: "apply-verifier" })],
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
      issues: [issue(QB_IMPORT_CODES.STALE_VALIDATION, { file: "stale-check", stage: "IDEMPOTENCY", source_subsystem: "apply-verifier" })],
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
      issues: [issue(QB_IMPORT_CODES.CONTENT_HASH_MISMATCH, { file: "content-hash", stage: "IDEMPOTENCY", source_subsystem: "apply-verifier" })],
    };
  }
  return { ok: true, issues: [] };
}

export function validateAtomicApplyPlan(plan: unknown, rows: unknown[]): ApplyValidationResult {
  if (!plan || typeof plan !== "object" || !Array.isArray(rows) || rows.length === 0) {
    return {
      ok: false,
      issues: [issue(QB_IMPORT_CODES.ATOMIC_APPLY_FAILED, { file: "atomic-plan", stage: "IDEMPOTENCY", source_subsystem: "apply-verifier" })],
    };
  }
  const p = plan as Record<string, unknown>;
  if (p.invalidVariant || p.rollbackAll || p.simulateFailure) {
    return {
      ok: false,
      issues: [issue(QB_IMPORT_CODES.ATOMIC_APPLY_FAILED, { file: "atomic-plan", stage: "IDEMPOTENCY", source_subsystem: "apply-verifier" })],
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
      issues: [issue(QB_IMPORT_CODES.CONTENT_HASH_MISMATCH, { file: "toctou-check", stage: "IDEMPOTENCY", source_subsystem: "apply-verifier" })],
    };
  }
  return { ok: true, issues: [] };
}
