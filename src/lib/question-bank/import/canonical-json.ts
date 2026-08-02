import { createHash } from "node:crypto";
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
};
export const CANONICAL_JSON_VERSION = "qb02-jcs-v1" as const;
export function canonicalJson(value: unknown): string { return canonical({ canonical_version: CANONICAL_JSON_VERSION, payload: value }); }
export function canonicalHash(value: unknown): string { return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex"); }
