/**
 * DIAGNOSTICS-CENTER-01 — pure, privacy-first sanitizing + fingerprinting.
 *
 * Nothing in this module may emit secrets, tokens, authorization headers,
 * passwords, raw OAuth URLs, e-mail addresses, phone numbers or full names.
 * Every value is redacted first and then hard-truncated.
 */

export const DIAGNOSTIC_SEVERITIES = ["info", "warning", "error", "fatal"] as const;
export type DiagnosticSeverity = (typeof DIAGNOSTIC_SEVERITIES)[number];

export const DIAGNOSTIC_SOURCES = ["client", "server", "google_play", "crashlytics"] as const;
export type DiagnosticSource = (typeof DIAGNOSTIC_SOURCES)[number];

export const DIAGNOSTIC_ISSUE_STATUSES = [
  "new",
  "investigating",
  "resolved",
  "ignored",
] as const;
export type DiagnosticIssueStatus = (typeof DIAGNOSTIC_ISSUE_STATUSES)[number];

export const DIAGNOSTIC_WINDOWS = ["24h", "7d", "30d"] as const;
export type DiagnosticWindow = (typeof DIAGNOSTIC_WINDOWS)[number];

export const LIMITS = {
  message: 500,
  stack: 4000,
  route: 200,
  action: 120,
  eventType: 64,
  version: 64,
  platform: 32,
  osVersion: 64,
  deviceModel: 96,
  networkType: 32,
  sessionId: 64,
  metadataKeys: 12,
  metadataValue: 200,
} as const;

const REDACTED = "[REDACTED]";

/** Ordered redactions; each pattern targets one leak class. */
const REDACTIONS: Array<[RegExp, string]> = [
  // JWTs and bearer/authorization values.
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, REDACTED],
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 " + REDACTED],
  [/\b(authorization|apikey|api[_-]?key|x-[a-z0-9-]*token)\b\s*[:=]\s*\S+/gi, "$1=" + REDACTED],
  // Named secret-ish query/body parameters.
  [
    /\b(access_token|refresh_token|id_token|provider_token|code_verifier|code_challenge|client_secret|password|passwd|secret|token|code|state|nonce|session|signature|sig|sb_secret[a-z_]*)\b\s*[:=]\s*[^\s&"'`,;)]+/gi,
    "$1=" + REDACTED,
  ],
  // Supabase publishable/secret style keys.
  [/\bsb_(?:secret|publishable)_[A-Za-z0-9._-]+/g, REDACTED],
  // E-mail addresses and phone numbers.
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[EMAIL]"],
  [/(?:\+|00)\d[\d\s-]{7,}\d/g, "[PHONE]"],
];

/** Strip any query string / fragment from URLs inside free text. */
function stripUrlPayloads(input: string): string {
  return input.replace(/(https?:\/\/[^\s"'`)]+)/gi, (full) => {
    try {
      const url = new URL(full);
      return `${url.origin}${url.pathname}`;
    } catch {
      return full.split(/[?#]/)[0] ?? full;
    }
  });
}

export function sanitizeText(input: unknown, maxLength: number): string {
  if (input === null || input === undefined) return "";
  let text = typeof input === "string" ? input : String(input);
  text = stripUrlPayloads(text);
  for (const [pattern, replacement] of REDACTIONS) text = text.replace(pattern, replacement);
  text = text.replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/** Stack frames keep file/line only; query strings and secrets are removed. */
export function sanitizeStack(input: unknown): string {
  if (typeof input !== "string" || !input) return "";
  let text = stripUrlPayloads(input);
  for (const [pattern, replacement] of REDACTIONS) text = text.replace(pattern, replacement);
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 30);
  const joined = lines.join("\n");
  return joined.length > LIMITS.stack ? `${joined.slice(0, LIMITS.stack - 1)}…` : joined;
}

/** Routes never carry identifiers: UUIDs and numeric ids become placeholders. */
export function sanitizeRoute(input: unknown): string {
  if (typeof input !== "string" || !input) return "";
  const path = input.split(/[?#]/)[0] ?? "";
  const normalized = path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
    .replace(/\/\d{2,}(?=\/|$)/g, "/:id");
  return sanitizeText(normalized, LIMITS.route);
}

const SAFE_SCALAR = (value: unknown): value is string | number | boolean =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean";

const FORBIDDEN_METADATA_KEY =
  /(token|secret|password|passwd|auth|apikey|api_key|code|state|nonce|email|phone|mobile|full_name|name|address|url|href)/i;

/** Only short technical scalars survive; suspicious keys are dropped entirely. */
export function sanitizeMetadata(input: unknown): Record<string, string | number | boolean> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, string | number | boolean> = {};
  let count = 0;
  for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
    if (count >= LIMITS.metadataKeys) break;
    const key = rawKey.slice(0, 40);
    if (FORBIDDEN_METADATA_KEY.test(key)) continue;
    if (!SAFE_SCALAR(rawValue)) continue;
    out[key] =
      typeof rawValue === "string" ? sanitizeText(rawValue, LIMITS.metadataValue) : rawValue;
    count += 1;
  }
  return out;
}

/** Deterministic, non-cryptographic 64-bit-ish hash (stable across platforms). */
function hash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0xc2b2ae35;
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 2246822519) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).slice(0, 16);
}

/** Group similar failures: variable parts of the message are normalized away. */
export function computeFingerprint(params: {
  source: string;
  eventType: string;
  message: string;
  route?: string;
  topFrame?: string;
}): string {
  const normalizedMessage = params.message
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/\b\d+\b/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  const topFrame = (params.topFrame ?? "").split("\n")[0]?.slice(0, 160) ?? "";
  return hash(
    [params.source, params.eventType, normalizedMessage, params.route ?? "", topFrame].join("|"),
  );
}

export type SanitizedDiagnosticEvent = {
  source: DiagnosticSource;
  event_type: string;
  severity: DiagnosticSeverity;
  fingerprint: string;
  message: string;
  stack: string | null;
  route: string | null;
  action: string | null;
  app_version: string | null;
  app_build: string | null;
  platform: string | null;
  os_version: string | null;
  device_model: string | null;
  network_type: string | null;
  online: boolean | null;
  session_id: string | null;
  metadata: Record<string, string | number | boolean>;
};

export type DiagnosticInput = {
  source?: DiagnosticSource;
  eventType: string;
  severity?: DiagnosticSeverity;
  message?: unknown;
  error?: unknown;
  stack?: unknown;
  route?: string | null;
  action?: string | null;
  metadata?: unknown;
  context?: {
    appVersion?: string | null;
    appBuild?: string | null;
    platform?: string | null;
    osVersion?: string | null;
    deviceModel?: string | null;
    networkType?: string | null;
    online?: boolean | null;
    sessionId?: string | null;
  };
};

function nullable(value: string): string | null {
  return value ? value : null;
}

/** Pure: turns anything callers pass into a storable, redacted event row. */
export function buildDiagnosticEvent(input: DiagnosticInput): SanitizedDiagnosticEvent {
  const error = input.error;
  const rawMessage =
    input.message ??
    (error instanceof Error ? `${error.name}: ${error.message}` : error ? String(error) : "");
  const rawStack = input.stack ?? (error instanceof Error ? error.stack : undefined);

  const source: DiagnosticSource = DIAGNOSTIC_SOURCES.includes(input.source as DiagnosticSource)
    ? (input.source as DiagnosticSource)
    : "client";
  const severity: DiagnosticSeverity = DIAGNOSTIC_SEVERITIES.includes(
    input.severity as DiagnosticSeverity,
  )
    ? (input.severity as DiagnosticSeverity)
    : "error";

  const eventType = sanitizeText(input.eventType, LIMITS.eventType) || "unknown";
  const message = sanitizeText(rawMessage, LIMITS.message) || "unknown_error";
  const stack = sanitizeStack(rawStack);
  const route = sanitizeRoute(input.route ?? "");
  const ctx = input.context ?? {};

  return {
    source,
    event_type: eventType,
    severity,
    fingerprint: computeFingerprint({
      source,
      eventType,
      message,
      route,
      topFrame: stack,
    }),
    message,
    stack: nullable(stack),
    route: nullable(route),
    action: nullable(sanitizeText(input.action ?? "", LIMITS.action)),
    app_version: nullable(sanitizeText(ctx.appVersion ?? "", LIMITS.version)),
    app_build: nullable(sanitizeText(ctx.appBuild ?? "", LIMITS.version)),
    platform: nullable(sanitizeText(ctx.platform ?? "", LIMITS.platform)),
    os_version: nullable(sanitizeText(ctx.osVersion ?? "", LIMITS.osVersion)),
    device_model: nullable(sanitizeText(ctx.deviceModel ?? "", LIMITS.deviceModel)),
    network_type: nullable(sanitizeText(ctx.networkType ?? "", LIMITS.networkType)),
    online: typeof ctx.online === "boolean" ? ctx.online : null,
    session_id: nullable(sanitizeText(ctx.sessionId ?? "", LIMITS.sessionId)),
    metadata: sanitizeMetadata(input.metadata),
  };
}

/** Simple per-fingerprint rate limiting so one loop cannot flood the table. */
export type RateLimitEntry = { first: number; count: number };

export function shouldSendEvent(
  seen: Map<string, RateLimitEntry>,
  fingerprint: string,
  now: number,
  windowMs = 60_000,
  maxPerWindow = 3,
): boolean {
  for (const [key, entry] of seen) {
    if (now - entry.first > windowMs * 10) seen.delete(key);
  }
  const entry = seen.get(fingerprint);
  if (!entry || now - entry.first > windowMs) {
    seen.set(fingerprint, { first: now, count: 1 });
    return true;
  }
  entry.count += 1;
  return entry.count <= maxPerWindow;
}
