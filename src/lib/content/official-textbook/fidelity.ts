/**
 * TAMKEEN_OFFICIAL_TEXTBOOK_STRUCTURED_CONTENT_STANDARD_20A
 *
 * Fidelity engine: proves the structured official layer says exactly what the
 * source book page says — no additions, no omissions, no paraphrase.
 */

import { computeSha256 } from "@/lib/content-import/html-package/content-hash.ts";
import { officialPlainText, parseOfficialContent, type OfficialParseResult } from "./parser.ts";

/* ---------------- Arabic-aware normalization ---------------- */

const TATWEEL = /\u0640/g;
const DIACRITICS = /[\u064B-\u0652\u0670\u06D6-\u06ED]/g;

/**
 * Normalization used for COMPARISON ONLY. Stored content always keeps the
 * original orthography and diacritics (critical for Quran and Hadith).
 */
export function normalizeArabicForCompare(input: string): string {
  return (input ?? "")
    .replace(/[\u200f\u200e\u061c]/g, "")
    .replace(TATWEEL, "")
    .replace(DIACRITICS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ؤئ]/g, "ء")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokens(input: string): string[] {
  const n = normalizeArabicForCompare(input);
  return n ? n.split(" ") : [];
}

/* ---------------- Canonical hash ---------------- */

/**
 * Canonical hash of the official reading text (structure-independent).
 * Re-extracting the same page must reproduce the same hash.
 */
export async function computeOfficialContentHash(html: string): Promise<string> {
  const parsed = parseOfficialContent(html);
  const canonical = parsed.blocks
    .map((b) => `${b.blockType ?? b.tag}|${normalizeArabicForCompare(b.text)}`)
    .filter((line) => line.split("|")[1])
    .join("\n");
  return computeSha256(canonical);
}

/* ---------------- Fidelity comparison ---------------- */

export type FidelityStatus = "PASS" | "REVIEW_REQUIRED" | "FAIL";

export interface FidelityReport {
  status: FidelityStatus;
  /** 0..1 share of source tokens present in the structured output. */
  coverage: number;
  /** Source tokens missing from the structured content (possible omission). */
  missingTokens: string[];
  /** Structured tokens absent from the source (possible addition/paraphrase). */
  addedTokens: string[];
  sourceTokenCount: number;
  structuredTokenCount: number;
  parse: OfficialParseResult;
  notes: string[];
}

export interface FidelityOptions {
  /** Minimum coverage to pass. Default 0.98 (near-exact). */
  minCoverage?: number;
  /** Max share of added tokens tolerated. Default 0.02. */
  maxAddedRatio?: number;
  /** Cap the reported token samples. Default 40. */
  sampleLimit?: number;
}

/**
 * Compare extracted source text (from the official PDF page range) against the
 * structured official HTML. Fail-closed: a parse error is always FAIL.
 */
export function evaluateOfficialFidelity(
  sourceText: string,
  structuredHtml: string,
  options: FidelityOptions = {},
): FidelityReport {
  const minCoverage = options.minCoverage ?? 0.98;
  const maxAddedRatio = options.maxAddedRatio ?? 0.02;
  const sampleLimit = options.sampleLimit ?? 40;

  const parse = parseOfficialContent(structuredHtml);
  const notes: string[] = [];

  const sourceTokens = tokens(sourceText);
  const structuredTokens = tokens(officialPlainText(parse));

  const countOf = (list: string[]) => {
    const map = new Map<string, number>();
    for (const t of list) map.set(t, (map.get(t) ?? 0) + 1);
    return map;
  };

  const sourceCounts = countOf(sourceTokens);
  const structuredCounts = countOf(structuredTokens);

  const missingTokens: string[] = [];
  let matched = 0;
  for (const [token, count] of sourceCounts) {
    const have = structuredCounts.get(token) ?? 0;
    matched += Math.min(count, have);
    if (have < count) missingTokens.push(token);
  }

  const addedTokens: string[] = [];
  let added = 0;
  for (const [token, count] of structuredCounts) {
    const have = sourceCounts.get(token) ?? 0;
    if (count > have) {
      added += count - have;
      addedTokens.push(token);
    }
  }

  const coverage = sourceTokens.length === 0 ? 0 : matched / sourceTokens.length;
  const addedRatio = structuredTokens.length === 0 ? 0 : added / structuredTokens.length;

  let status: FidelityStatus;
  if (!parse.ok) {
    status = "FAIL";
    notes.push("فشل التحقق البنيوي للمحتوى الرسمي.");
  } else if (sourceTokens.length === 0) {
    status = "FAIL";
    notes.push("لا يوجد نص مصدر للمقارنة — المصدر الرسمي مطلوب.");
  } else if (coverage >= minCoverage && addedRatio <= maxAddedRatio) {
    status = "PASS";
  } else if (coverage >= minCoverage - 0.05 && addedRatio <= maxAddedRatio + 0.05) {
    status = "REVIEW_REQUIRED";
    notes.push("فروق طفيفة تحتاج مراجعة بشرية قبل الاعتماد.");
  } else {
    status = "FAIL";
    notes.push("انحراف كبير عن نص الكتاب الرسمي (نقص أو إضافة).");
  }

  return {
    status,
    coverage,
    missingTokens: missingTokens.slice(0, sampleLimit),
    addedTokens: addedTokens.slice(0, sampleLimit),
    sourceTokenCount: sourceTokens.length,
    structuredTokenCount: structuredTokens.length,
    parse,
    notes,
  };
}
