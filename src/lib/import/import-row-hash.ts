/**
 * IMPORT_STAGING_AND_EXECUTION_IMPLEMENTATION_03 — canonical normalization,
 * natural keys and row hashes used by staging and by idempotency.
 *
 * Pure module — no DB access. Client and server safe.
 */

import { IMPORT_ENTITY_CONTRACTS, ROW_HASH_FIELDS } from "./import-contract.ts";
import { sha256HexBytes } from "./subject-slug.ts";
import type { ContentImportTemplateKey } from "../content-import/content-import-templates.ts";

/** Field separator inside canonical strings. Unit separator can never appear in cell text. */
export const CANONICAL_FIELD_SEPARATOR = "\u001f";

const ARABIC_INDIC_DIGITS = /[\u0660-\u0669\u06f0-\u06f9]/g;

/** Fold Arabic-Indic digits to ASCII so 1 and ١ never look like different content. */
export function foldDigits(value: string): string {
  return value.replace(ARABIC_INDIC_DIGITS, (d) => {
    const code = d.codePointAt(0)!;
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

/** Canonical cell normalization: NFC, trim, whitespace collapse, digit folding. */
export function normalizeCell(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  return foldDigits(value.normalize("NFC").trim().replace(/\s+/g, " "));
}

/** Canonical code normalization — must match public.normalize_content_code(). */
export function normalizeContentCode(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed.toLowerCase();
}

/** Canonical natural key for a row, built from the contract's natural key fields. */
export function buildNaturalKey(
  templateKey: ContentImportTemplateKey,
  row: Record<string, string>,
): string {
  const fields = IMPORT_ENTITY_CONTRACTS[templateKey].naturalKey;
  return fields.map((f) => normalizeContentCode(normalizeCell(row[f]))).join(CANONICAL_FIELD_SEPARATOR);
}

/**
 * Canonical row hash over ROW_HASH_FIELDS in contract order, after normalization.
 * Operator-only and workflow columns are excluded by the contract, so reordering
 * or annotating a row never looks like a content change.
 */
export function computeRowHash(
  templateKey: ContentImportTemplateKey,
  row: Record<string, string>,
): string {
  const fields = ROW_HASH_FIELDS[templateKey];
  const canonical = fields
    .map((f) => `${f}=${normalizeCell(row[f])}`)
    .join(CANONICAL_FIELD_SEPARATOR);
  return sha256HexBytes(new TextEncoder().encode(canonical));
}

/** Payload persisted to staging: only contract fields, never the raw file. */
export function buildStagingPayload(
  templateKey: ContentImportTemplateKey,
  row: Record<string, string>,
): Record<string, string> {
  const contract = IMPORT_ENTITY_CONTRACTS[templateKey];
  const fields = new Set<string>([
    ...ROW_HASH_FIELDS[templateKey],
    ...contract.naturalKey,
  ]);
  const payload: Record<string, string> = {};
  for (const field of fields) {
    const value = normalizeCell(row[field]);
    if (value !== "") payload[field] = value;
  }
  return payload;
}

/** In-batch duplicate detection — a job may never carry the same entity twice. */
export class DuplicateNaturalKeyError extends Error {
  constructor(
    readonly templateKey: string,
    readonly naturalKey: string,
    readonly rowNumber: number,
  ) {
    super(`DUPLICATE_NATURAL_KEY: ${templateKey} row ${rowNumber}`);
    this.name = "DuplicateNaturalKeyError";
  }
}

export function assertNoDuplicateNaturalKeys(
  rows: ReadonlyArray<{ naturalKey: string; rowNumber: number }>,
  templateKey: string,
): void {
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.naturalKey)) {
      throw new DuplicateNaturalKeyError(templateKey, row.naturalKey, row.rowNumber);
    }
    seen.add(row.naturalKey);
  }
}
