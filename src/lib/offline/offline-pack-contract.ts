/**
 * OFFLINE-01 — versioned, content-addressed curriculum pack contract.
 *
 * A manifest contains stable identifiers only. Signed URLs, auth material and
 * absolute filesystem paths are deliberately absent so the persisted copy is
 * safe to keep on the device and remains useful after temporary URLs expire.
 */

import { z } from "zod";

export const OFFLINE_PACK_SCHEMA_VERSION = 1 as const;
export const OFFLINE_PACK_MAX_ARTIFACTS = 2_000;
export const OFFLINE_PACK_MAX_ARTIFACT_BYTES = 100 * 1024 * 1024;

const id = z.string().trim().min(1).max(160);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const privateRelativePath = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .refine((value) => !value.startsWith("/"), "OFFLINE_PATH_ABSOLUTE")
  .refine((value) => !/(?:^|\/)\.\.(?:\/|$)/.test(value), "OFFLINE_PATH_TRAVERSAL")
  .refine((value) => !/^[a-z]+:\/\//i.test(value), "OFFLINE_PATH_URL");

export const offlinePackArtifactSchema = z
  .object({
    artifactId: id,
    kind: z.enum([
      "lesson-html",
      "lesson-pdf",
      "textbook-pdf",
      "quick-review",
      "self-test",
      "assessment",
      "asset",
    ]),
    resourceId: id,
    lessonId: id.nullable(),
    lessonTitle: z.string().trim().min(1).max(240).optional(),
    title: z.string().trim().min(1).max(240),
    relativePath: privateRelativePath,
    contentType: z.string().trim().min(1).max(120),
    byteSize: z.number().int().positive().max(OFFLINE_PACK_MAX_ARTIFACT_BYTES),
    sha256,
    sortOrder: z.number().int().min(0).max(100_000),
  })
  .strict();

export const offlinePackManifestSchema = z
  .object({
    schemaVersion: z.literal(OFFLINE_PACK_SCHEMA_VERSION),
    packId: id,
    revision: z.number().int().positive(),
    generatedAt: z.string().datetime({ offset: true }),
    scope: z
      .object({
        gradeId: id,
        curriculumTrackId: id.nullable(),
        semester: z.union([z.literal(1), z.literal(2)]).nullable(),
        subjectId: id.nullable(),
        subjectTitle: z.string().trim().min(1).max(240).optional(),
      })
      .strict(),
    artifacts: z.array(offlinePackArtifactSchema).min(1).max(OFFLINE_PACK_MAX_ARTIFACTS),
  })
  .strict()
  .superRefine((manifest, context) => {
    const artifactIds = new Set<string>();
    const relativePaths = new Set<string>();
    for (let index = 0; index < manifest.artifacts.length; index += 1) {
      const artifact = manifest.artifacts[index];
      if (artifactIds.has(artifact.artifactId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["artifacts", index, "artifactId"],
          message: "OFFLINE_ARTIFACT_ID_DUPLICATE",
        });
      }
      if (relativePaths.has(artifact.relativePath)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["artifacts", index, "relativePath"],
          message: "OFFLINE_ARTIFACT_PATH_DUPLICATE",
        });
      }
      artifactIds.add(artifact.artifactId);
      relativePaths.add(artifact.relativePath);
    }
  });

export type OfflinePackArtifact = z.infer<typeof offlinePackArtifactSchema>;
export type OfflinePackManifest = z.infer<typeof offlinePackManifestSchema>;

export function parseOfflinePackManifest(input: unknown): OfflinePackManifest {
  return offlinePackManifestSchema.parse(input);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("OFFLINE_CANONICAL_NUMBER_INVALID");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  throw new Error("OFFLINE_CANONICAL_VALUE_INVALID");
}

export function canonicalizeOfflinePackManifest(input: unknown): string {
  return canonicalJson(parseOfflinePackManifest(input));
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (typeof globalThis.crypto?.subtle?.digest !== "function") {
    throw new Error("OFFLINE_SHA256_UNAVAILABLE");
  }
  const copy = Uint8Array.from(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function digestOfflinePackManifest(input: unknown): Promise<string> {
  return sha256Hex(new TextEncoder().encode(canonicalizeOfflinePackManifest(input)));
}

export async function verifyOfflineArtifact(
  bytes: Uint8Array,
  artifact: OfflinePackArtifact,
): Promise<void> {
  if (bytes.byteLength !== artifact.byteSize) throw new Error("OFFLINE_ARTIFACT_SIZE_MISMATCH");
  if ((await sha256Hex(bytes)) !== artifact.sha256) {
    throw new Error("OFFLINE_ARTIFACT_HASH_MISMATCH");
  }
}
