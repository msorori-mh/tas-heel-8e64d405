import { createHash } from "node:crypto";
/** Stable Unicode code-point ordering, independent of process locale. */
export function compareCodePoints(a: string, b: string): number {
  const aa = Array.from(a);
  const bb = Array.from(b);
  const length = Math.min(aa.length, bb.length);
  for (let index = 0; index < length; index += 1) {
    const difference = aa[index]!.codePointAt(0)! - bb[index]!.codePointAt(0)!;
    if (difference) return difference;
  }
  return aa.length - bb.length;
}
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort(compareCodePoints).map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
};
export const CANONICAL_JSON_VERSION = "qb02-jcs-v1" as const;
export function canonicalJson(value: unknown): string { return canonical({ canonical_version: CANONICAL_JSON_VERSION, payload: value }); }
export function canonicalHash(value: unknown): string { return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex"); }
