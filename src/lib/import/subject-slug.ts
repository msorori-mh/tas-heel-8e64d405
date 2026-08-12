/**
 * IMPORT_EXECUTION_READINESS_SECURITY_AND_SQL_REVIEW_02B — GAP-07 slug contract.
 *
 * Contract (no "impossible collision" claim is made anywhere):
 *
 *   deterministic slug
 *   + UNIQUE (subjects.slug)          ← last line of defence in the database
 *   + explicit collision detection    ← planSubjectSlugs()
 *   + fail closed on collision        ← SlugCollisionError / SLUG_COLLISION
 *
 * The hashed branch uses SHA-256 truncated to 128 bits (32 hex chars), never 64.
 * A single canonical input normalization feeds both the synchronous (pure JS) and
 * the asynchronous (Web Crypto) derivations, and their parity is enforced by tests.
 *
 * Pure module — no DB access, no writes. Client and server safe.
 */

export const SUBJECT_SLUG_CONTRACT_VERSION = "SUBJECT-SLUG-02B" as const;

/** Hash suffix length in hex chars. 32 hex = 128 bits. Never reduce this. */
export const SUBJECT_SLUG_DIGEST_HEX_LENGTH = 32;

/** Reserved separator between the readable stem and the digest. */
export const SUBJECT_SLUG_SEPARATOR = "--";

/** Database constraint relied upon as the final guard. */
export const SUBJECT_SLUG_UNIQUE_CONSTRAINT = "subjects_slug_key";

/* ------------------------------------------------------------------ */
/* Canonical input normalization (shared by every derivation path)     */
/* ------------------------------------------------------------------ */

/**
 * The exact bytes that get hashed. Both the sync and async paths MUST call this
 * first, so browser and server can never disagree about a slug.
 */
export function canonicalSubjectCodeInput(subjectCode: string): string {
  return subjectCode.normalize("NFC").trim().replace(/\s+/g, " ");
}

/** UTF-8 bytes of the canonical input — the hash pre-image. */
export function subjectCodeDigestBytes(subjectCode: string): Uint8Array {
  return new TextEncoder().encode(canonicalSubjectCodeInput(subjectCode));
}

/* ------------------------------------------------------------------ */
/* SHA-256 (pure, dependency-free, deterministic)                      */
/* ------------------------------------------------------------------ */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

/** SHA-256 over raw bytes, lowercase hex. Identical output to Web Crypto / node crypto. */
export function sha256HexBytes(bytes: Uint8Array): string {
  const length = bytes.length;
  const bitLength = length * 8;
  const withPadding = Math.ceil((length + 9) / 64) * 64;
  const buffer = new Uint8Array(withPadding);
  buffer.set(bytes);
  buffer[length] = 0x80;
  const view = new DataView(buffer.buffer);
  view.setUint32(withPadding - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(withPadding - 4, bitLength >>> 0, false);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);

  for (let offset = 0; offset < withPadding; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const a = w[i - 15]!;
      const b = w[i - 2]!;
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, hh] = [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!];

    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
    h[5] = (h[5]! + f) >>> 0;
    h[6] = (h[6]! + g) >>> 0;
    h[7] = (h[7]! + hh) >>> 0;
  }

  let out = "";
  for (let i = 0; i < 8; i += 1) out += h[i]!.toString(16).padStart(8, "0");
  return out;
}

/** Synchronous digest used by deriveSubjectSlug. */
export function subjectCodeDigest(subjectCode: string): string {
  return sha256HexBytes(subjectCodeDigestBytes(subjectCode)).slice(0, SUBJECT_SLUG_DIGEST_HEX_LENGTH);
}

/**
 * Async digest through Web Crypto (browser / worker). Present so runtimes that
 * prefer the platform primitive stay byte-identical with the sync path; parity is
 * asserted in tests. Falls back to the pure implementation when subtle is absent.
 */
export async function subjectCodeDigestAsync(subjectCode: string): Promise<string> {
  const bytes = subjectCodeDigestBytes(subjectCode);
  const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (!subtle) return subjectCodeDigest(subjectCode);
  const buf = await subtle.digest("SHA-256", bytes as unknown as ArrayBufferView<ArrayBuffer>);
  let hex = "";
  for (const byte of new Uint8Array(buf)) hex += byte.toString(16).padStart(2, "0");
  return hex.slice(0, SUBJECT_SLUG_DIGEST_HEX_LENGTH);
}

/* ------------------------------------------------------------------ */
/* Slug derivation                                                     */
/* ------------------------------------------------------------------ */

/**
 * A subject_code that is already a valid, unambiguous slug maps to itself.
 * The reserved separator "--" forces the hashed branch, so the two branches are
 * disjoint by construction and can never overlap.
 */
export function isSlugSafeSubjectCode(code: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(code) && !code.includes(SUBJECT_SLUG_SEPARATOR);
}

export type SubjectSlugDigestFn = (subjectCode: string) => string;

/**
 * GAP-07: derive subjects.slug from subject_code deterministically.
 *
 * The derivation is designed to make accidental collisions astronomically unlikely
 * (128-bit digest), NOT to make them impossible. Collisions are still detected
 * explicitly by planSubjectSlugs() and rejected by UNIQUE (subjects.slug).
 *
 * `digest` is injectable so tests can force a collision and prove fail-closed
 * behaviour without searching for a real SHA-256 collision.
 */
export function deriveSubjectSlug(
  subjectCode: string,
  digest: SubjectSlugDigestFn = subjectCodeDigest,
): string {
  const raw = canonicalSubjectCodeInput(subjectCode);
  if (raw.length === 0) throw new Error("subject_code is required to derive subjects.slug");
  if (isSlugSafeSubjectCode(raw)) return raw;

  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const stem = normalized.length > 0 ? normalized : "subject";
  return `${stem}${SUBJECT_SLUG_SEPARATOR}${digest(raw)}`;
}

/* ------------------------------------------------------------------ */
/* Collision detection — fail closed                                   */
/* ------------------------------------------------------------------ */

export class SlugCollisionError extends Error {
  readonly code = "SLUG_COLLISION" as const;
  readonly slug: string;
  readonly conflictingCodes: readonly string[];

  constructor(slug: string, conflictingCodes: readonly string[]) {
    super(
      `SLUG_COLLISION: subject slug "${slug}" is derived by more than one subject_code (${conflictingCodes.join(", ")})`,
    );
    this.name = "SlugCollisionError";
    this.slug = slug;
    this.conflictingCodes = conflictingCodes;
  }
}

export interface SubjectSlugPlanOptions {
  /** Existing subjects.slug → subject_code, so an in-DB clash is caught before write. */
  existingSlugs?: ReadonlyMap<string, string>;
  digest?: SubjectSlugDigestFn;
}

/**
 * Derive slugs for a batch of subject codes.
 *
 * Fail closed: on ANY collision — inside the batch or against an existing subject
 * owned by a different code — this throws and the caller performs ZERO writes.
 * There is no automatic suffix, no retry, no guessing.
 */
export function planSubjectSlugs(
  subjectCodes: readonly string[],
  options: SubjectSlugPlanOptions = {},
): Map<string, string> {
  const digest = options.digest ?? subjectCodeDigest;
  const existing = options.existingSlugs;
  const bySlug = new Map<string, string>();
  const plan = new Map<string, string>();

  for (const rawCode of subjectCodes) {
    const code = canonicalSubjectCodeInput(rawCode);
    if (plan.has(code)) continue;
    const slug = deriveSubjectSlug(code, digest);

    const owner = bySlug.get(slug);
    if (owner !== undefined && owner !== code) throw new SlugCollisionError(slug, [owner, code]);

    const existingOwner = existing?.get(slug);
    if (existingOwner !== undefined && canonicalSubjectCodeInput(existingOwner) !== code) {
      throw new SlugCollisionError(slug, [existingOwner, code]);
    }

    bySlug.set(slug, code);
    plan.set(code, slug);
  }

  return plan;
}
