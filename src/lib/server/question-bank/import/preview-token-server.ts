import crypto from "node:crypto";
import { issue, type QbImportIssue } from "../../../question-bank/import/errors.ts";
import { QB_IMPORT_CODES } from "../../../question-bank/import/validation-codes.ts";

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
  snapshot_id: string;
  snapshot_version: number | string;
  content_hash: string;
  actor_id: string;
  scope: string;
  now?: number;
};

/**
 * Interface for Replay Store verification.
 *
 * Production Note:
 * Distributed production deployments MUST use a shared atomic store implementation
 * (e.g., Redis SET NX or Database uniqueness constraint / RPC).
 * Such binding is outside the scope of PR #56.
 * Until a production distributed store dependency is provided, production token apply
 * remains fail-closed and will reject tokens if no store is supplied.
 */
export interface PreviewTokenReplayStore {
  consumeOnce(jti: string, expiresAt: number): Promise<boolean>;
}

function getSecret(secretOverride?: string): string {
  const secret = secretOverride || process.env.QB_PREVIEW_TOKEN_SECRET;
  if (!secret || !secret.trim()) {
    throw new Error("Configuration Error: QB_PREVIEW_TOKEN_SECRET environment variable is missing or empty.");
  }
  return secret;
}

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

function signPayload(payloadB64Url: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payloadB64Url).digest("base64url");
}

export function mintPreviewToken(envelope: PreviewTokenEnvelope, opts?: { secret?: string }): string {
  const secret = getSecret(opts?.secret);
  const payloadJson = canonicalizePayload(envelope);
  const payloadB64Url = Buffer.from(payloadJson, "utf8").toString("base64url");
  const signature = signPayload(payloadB64Url, secret);
  return `tok_v1_${payloadB64Url}.${signature}`;
}

export function parseAndVerifyPreviewToken(tokenStr: unknown, opts?: { secret?: string }): PreviewTokenEnvelope | null {
  if (typeof tokenStr !== "string" || !tokenStr.startsWith("tok_v1_")) {
    return null;
  }
  const raw = tokenStr.slice("tok_v1_".length);
  const dotIdx = raw.indexOf(".");
  if (dotIdx === -1) return null;

  const payloadB64Url = raw.slice(0, dotIdx);
  const sigB64Url = raw.slice(dotIdx + 1);

  if (!payloadB64Url || !sigB64Url) return null;

  let secret: string;
  try {
    secret = getSecret(opts?.secret);
  } catch {
    return null;
  }

  const expectedSig = signPayload(payloadB64Url, secret);
  const bufActual = Buffer.from(sigB64Url);
  const bufExpected = Buffer.from(expectedSig);

  if (bufActual.length !== bufExpected.length) return null;
  if (!crypto.timingSafeEqual(bufActual, bufExpected)) return null;

  try {
    const jsonStr = Buffer.from(payloadB64Url, "base64url").toString("utf8");
    const parsed = JSON.parse(jsonStr);
    if (parsed && typeof parsed === "object") {
      const p = parsed as Record<string, unknown>;
      if (
        typeof p.token_id === "string" && p.token_id.trim() &&
        typeof p.snapshot_id === "string" && p.snapshot_id.trim() &&
        (typeof p.snapshot_version === "number" || typeof p.snapshot_version === "string") &&
        typeof p.content_hash === "string" && p.content_hash.trim() &&
        typeof p.actor_id === "string" && p.actor_id.trim() &&
        typeof p.scope === "string" && p.scope.trim() &&
        typeof p.issued_at === "number" && !isNaN(p.issued_at) &&
        typeof p.expires_at === "number" && !isNaN(p.expires_at) &&
        typeof p.jti === "string" && p.jti.trim()
      ) {
        return parsed as PreviewTokenEnvelope;
      }
    }
  } catch {}

  return null;
}

export const DEFAULT_PREVIEW_TOKEN_REPLAY_TIMEOUT_MS = 2000;

async function consumeReplayOnceWithTimeout(
  store: PreviewTokenReplayStore,
  jti: string,
  expiresAt: number,
  timeoutMs: number = DEFAULT_PREVIEW_TOKEN_REPLAY_TIMEOUT_MS,
): Promise<boolean> {
  let timerId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      reject(new Error("Replay store operation timed out"));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([
      store.consumeOnce(jti, expiresAt),
      timeoutPromise,
    ]);

    if (typeof result !== "boolean") {
      throw new Error("Malformed store result: expected boolean");
    }

    return result;
  } finally {
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
  }
}

export async function validatePreviewToken(
  token: unknown,
  context?: PreviewTokenBindingContext,
  opts?: { secret?: string; replayStore?: PreviewTokenReplayStore; timeoutMs?: number },
): Promise<ApplyValidationResult> {
  const invalidIssue = {
    ok: false,
    issues: [issue(QB_IMPORT_CODES.PREVIEW_TOKEN_INVALID, { file: "apply-token", stage: "IDEMPOTENCY", source_subsystem: "apply-verifier" })],
  };

  const env = parseAndVerifyPreviewToken(token, { secret: opts?.secret });
  if (!env) {
    return invalidIssue;
  }

  const now = context?.now ?? Date.now();

  if (env.issued_at > now + 5000) {
    return invalidIssue;
  }

  if (env.expires_at <= env.issued_at || env.expires_at < now) {
    return invalidIssue;
  }

  // Mandatory Binding Context: context and all its fields must be explicitly provided and match envelope
  if (!context ||
      context.snapshot_id === undefined ||
      context.snapshot_version === undefined ||
      context.content_hash === undefined ||
      context.actor_id === undefined ||
      context.scope === undefined
  ) {
    return invalidIssue;
  }

  if (env.snapshot_id !== context.snapshot_id) return invalidIssue;
  if (String(env.snapshot_version) !== String(context.snapshot_version)) return invalidIssue;
  if (env.content_hash !== context.content_hash) return invalidIssue;
  if (env.actor_id !== context.actor_id) return invalidIssue;
  if (env.scope !== context.scope) return invalidIssue;

  // Replay store MUST be explicitly provided from trusted server composition. Missing store fails closed.
  if (!opts?.replayStore) {
    return invalidIssue;
  }

  let consumed = false;
  try {
    consumed = await consumeReplayOnceWithTimeout(
      opts.replayStore,
      env.jti,
      env.expires_at,
      opts.timeoutMs ?? DEFAULT_PREVIEW_TOKEN_REPLAY_TIMEOUT_MS,
    );
  } catch {
    return invalidIssue;
  }

  if (consumed !== true) {
    return invalidIssue;
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
