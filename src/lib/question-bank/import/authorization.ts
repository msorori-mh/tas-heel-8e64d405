import { QB_IMPORT_CODES } from "./validation-codes.ts";
import { issue, type QbImportIssue } from "./errors.ts";
import { MUTATION_HOOKS } from "./mutation-hooks.ts";

export const QB_IMPORT_CAPABILITY = "question_bank.import" as const;
export const QB_IMPORT_DEFAULT_SCOPE = "tenant:default" as const;

export type ImportAuthorizationContext = {
  authenticated: boolean;
  actorId: string;
  authorized: boolean;
  capability: string;
  scope: string;
  context?: Record<string, unknown> | null;
  expired?: boolean;
  revoked?: boolean;
};

export type AuthorizationResult =
  | { ok: true; actorId: string; capability: string; scope: string }
  | { ok: false; issue: QbImportIssue };

/**
 * Strict fail-closed authorization contract checker for Question Bank import operations.
 * Requires explicit authenticated actor, non-empty actorId, authorized=true,
 * legal capability ("question_bank.import"), matching legal scope, and valid context.
 */
export function validateImportAuthorization(
  auth: unknown,
  expectedScope: string = QB_IMPORT_DEFAULT_SCOPE,
  fileName = "workbook.xlsx",
): AuthorizationResult {
  if (MUTATION_HOOKS.disableAuthorizationGuard) {
    return { ok: true, actorId: "actor-mutation-bypass", capability: QB_IMPORT_CAPABILITY, scope: expectedScope };
  }

  if (auth === undefined || auth === null || auth === false) {
    if (MUTATION_HOOKS.missingAuthorizationAllows) {
      return { ok: true, actorId: "actor-missing-bypass", capability: QB_IMPORT_CAPABILITY, scope: expectedScope };
    }
    return {
      ok: false,
      issue: issue(QB_IMPORT_CODES.AUTH_MISSING, { file: fileName }),
    };
  }

  if (typeof auth !== "object") {
    return {
      ok: false,
      issue: issue(QB_IMPORT_CODES.AUTH_MALFORMED, { file: fileName }),
    };
  }

  const obj = auth as Record<string, unknown>;

  if (obj.authorized === false) {
    return {
      ok: false,
      issue: issue(QB_IMPORT_CODES.UNAUTHORIZED_IMPORT, { file: fileName }),
    };
  }

  const keys = Object.keys(obj);

  // Reject empty objects or simple flags without full schema ({}, { valid: true }, { authorized: true })
  if (
    keys.length === 0 ||
    (keys.length === 1 && (keys[0] === "valid" || keys[0] === "authorized" || keys[0] === "role"))
  ) {
    return {
      ok: false,
      issue: issue(QB_IMPORT_CODES.AUTH_MALFORMED, { file: fileName }),
    };
  }

  if (obj.expired === true || obj.revoked === true) {
    return {
      ok: false,
      issue: issue(QB_IMPORT_CODES.AUTH_EXPIRED, { file: fileName }),
    };
  }

  if (obj.expiresAt !== undefined && obj.expiresAt !== null) {
    const expiresNum =
      typeof obj.expiresAt === "number"
        ? obj.expiresAt
        : typeof obj.expiresAt === "string"
          ? Date.parse(obj.expiresAt)
          : NaN;
    if (Number.isNaN(expiresNum) || Date.now() >= expiresNum) {
      return {
        ok: false,
        issue: issue(QB_IMPORT_CODES.AUTH_EXPIRED, { file: fileName }),
      };
    }
  }

  if (obj.authorized === false) {
    return {
      ok: false,
      issue: issue(QB_IMPORT_CODES.UNAUTHORIZED_IMPORT, { file: fileName }),
    };
  }

  if (obj.authenticated === false) {
    return {
      ok: false,
      issue: issue(QB_IMPORT_CODES.AUTHENTICATION_REQUIRED, { file: fileName }),
    };
  }

  if (obj.authenticated !== true) {
    return {
      ok: false,
      issue: issue(QB_IMPORT_CODES.UNAUTHORIZED_IMPORT, { file: fileName }),
    };
  }

  if (typeof obj.capability !== "string" || obj.capability !== QB_IMPORT_CAPABILITY) {
    return {
      ok: false,
      issue: issue(QB_IMPORT_CODES.CAPABILITY_INVALID, { file: fileName }),
    };
  }

  const actualScope = typeof obj.scope === "string" ? obj.scope : "";
  // Wildcard scope "*" is strictly forbidden
  if (!actualScope || actualScope === "*" || (expectedScope && actualScope !== expectedScope)) {
    return {
      ok: false,
      issue: issue(QB_IMPORT_CODES.SCOPE_MISMATCH, { file: fileName }),
    };
  }

  if (obj.authorized !== true) {
    return {
      ok: false,
      issue: issue(QB_IMPORT_CODES.UNAUTHORIZED_IMPORT, { file: fileName }),
    };
  }

  if (typeof obj.actorId !== "string" || !obj.actorId.trim()) {
    return {
      ok: false,
      issue: issue(QB_IMPORT_CODES.AUTH_MALFORMED, { file: fileName }),
    };
  }

  if (!obj.context || typeof obj.context !== "object" || Array.isArray(obj.context)) {
    return {
      ok: false,
      issue: issue(QB_IMPORT_CODES.AUTH_MALFORMED, { file: fileName }),
    };
  }

  return {
    ok: true,
    actorId: obj.actorId.trim(),
    capability: obj.capability,
    scope: actualScope,
  };
}
