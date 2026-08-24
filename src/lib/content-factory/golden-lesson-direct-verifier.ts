import { createHash } from "node:crypto";

import {
  assetMagicMatches,
  isAllowedAssetMime,
  scanHtmlAssetReferences,
  GOLDEN_ASSET_MAX_BYTES,
  GOLDEN_ASSET_MIN_BYTES,
  type GoldenLessonAsset,
} from "./golden-lesson-assets.ts";
import type { GoldenCapability, GoldenLessonPackage } from "./golden-lesson-contract.ts";
import {
  validateGoldenLessonAnswerCoverage,
  validateGoldenLessonArtifactBytes,
} from "./golden-lesson-file-contract.ts";
import { previewGoldenLessonStaging } from "./golden-lesson-staging.ts";

export const GOLDEN_DIRECT_LIMITS = {
  maxFiles: 31,
  maxFileBytes: 5 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
} as const;

export interface GoldenLessonDirectFileDeclaration {
  path: string;
  sha256: string;
}

export interface GoldenLessonDirectInputFile extends GoldenLessonDirectFileDeclaration {
  bytes: Uint8Array;
}

export interface VerifiedGoldenLessonDirectIntake {
  manifest: GoldenLessonPackage;
  manifestSha256: string;
  intakeSha256: string;
  fileCount: number;
  totalBytes: number;
  files: GoldenLessonDirectInputFile[];
  assets: GoldenLessonAsset[];
}

function fail(code: string): never {
  throw new Error(code);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Digest used by the direct-intake RPC and the package preflight. */
export function computeGoldenLessonManifestSha256(manifest: GoldenLessonPackage): string {
  return sha256(new TextEncoder().encode(JSON.stringify(manifest)));
}

function safeLeafName(name: string): boolean {
  return name.length > 0 && name.length <= 255 && name !== "." && name !== ".." &&
    !/[\\/\u0000-\u001f]/u.test(name) && name.normalize("NFC") === name;
}

export function planGoldenLessonDirectFiles(
  manifest: GoldenLessonPackage,
): GoldenLessonDirectFileDeclaration[] {
  if (!previewGoldenLessonStaging(manifest).valid) fail("MANIFEST_SERVER_VALIDATION_FAILED");

  const declarations: GoldenLessonDirectFileDeclaration[] = [];
  for (const artifact of manifest.artifacts) {
    if (artifact.sourcePath && artifact.sha256) declarations.push({ path: artifact.sourcePath, sha256: artifact.sha256 });
    if (artifact.provenancePath && artifact.provenanceSha256) {
      declarations.push({ path: artifact.provenancePath, sha256: artifact.provenanceSha256 });
    }
  }
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  for (const asset of assets) declarations.push({ path: asset.path, sha256: asset.sha256 });
  if (manifest.security.answersCompanionPath && manifest.security.answersCompanionSha256) {
    declarations.push({
      path: manifest.security.answersCompanionPath,
      sha256: manifest.security.answersCompanionSha256,
    });
  }
  if (declarations.length === 0 || declarations.length > GOLDEN_DIRECT_LIMITS.maxFiles) {
    fail("DIRECT_FILE_COUNT_INVALID");
  }

  const normalized = new Set<string>();
  for (const declaration of declarations) {
    if (!safeLeafName(declaration.path)) fail("DIRECT_PATH_UNSAFE");
    if (!/^[a-f0-9]{64}$/.test(declaration.sha256)) fail("DIRECT_SHA256_INVALID");
    const key = declaration.path.normalize("NFKC").toLocaleLowerCase("en-US");
    if (normalized.has(key)) fail("DIRECT_PATH_DUPLICATE");
    normalized.add(key);
  }
  return declarations;
}

export function verifyGoldenLessonDirectIntake(
  manifest: GoldenLessonPackage,
  inputFiles: GoldenLessonDirectInputFile[],
): VerifiedGoldenLessonDirectIntake {
  const declarations = planGoldenLessonDirectFiles(manifest);
  if (inputFiles.length !== declarations.length) fail("DIRECT_FILE_SET_MISMATCH");

  const declared = new Map(declarations.map((item) => [item.path, item.sha256]));
  const files = new Map<string, GoldenLessonDirectInputFile>();
  let totalBytes = 0;
  for (const file of inputFiles) {
    if (!declared.has(file.path) || files.has(file.path)) fail("DIRECT_FILE_SET_MISMATCH");
    if (file.bytes.byteLength === 0 || file.bytes.byteLength > GOLDEN_DIRECT_LIMITS.maxFileBytes) {
      fail("DIRECT_FILE_SIZE_LIMIT");
    }
    totalBytes += file.bytes.byteLength;
    if (totalBytes > GOLDEN_DIRECT_LIMITS.maxTotalBytes) fail("DIRECT_TOTAL_SIZE_LIMIT");
    const expected = declared.get(file.path)!;
    if (file.sha256 !== expected || sha256(file.bytes) !== expected) fail("DIRECT_FILE_HASH_MISMATCH");
    files.set(file.path, file);
  }
  if (files.size !== declared.size) fail("DIRECT_FILE_SET_MISMATCH");

  for (const artifact of manifest.artifacts) {
    if (!artifact.sourcePath) continue;
    const file = files.get(artifact.sourcePath);
    if (!file) fail("DIRECT_EXPECTED_FILE_MISSING");
    const validation = validateGoldenLessonArtifactBytes(artifact.capability, artifact.sourcePath, file.bytes);
    if (!validation.valid) fail(validation.findings[0]?.code ?? "ARTIFACT_CONTENT_INVALID");
  }

  const artifactInputs: Partial<Record<GoldenCapability, { fileName: string; bytes: Uint8Array }>> = {};
  for (const artifact of manifest.artifacts) {
    if (!artifact.sourcePath) continue;
    const file = files.get(artifact.sourcePath);
    if (file) artifactInputs[artifact.capability] = { fileName: artifact.sourcePath, bytes: file.bytes };
  }
  const companionPath = manifest.security.answersCompanionPath;
  const companion = companionPath ? files.get(companionPath) : undefined;
  const answerCoverage = validateGoldenLessonAnswerCoverage(
    artifactInputs,
    companionPath && companion ? { fileName: companionPath, bytes: companion.bytes } : null,
  );
  if (!answerCoverage.valid) fail(answerCoverage.findings[0]?.code ?? "ANSWER_COMPANION_INVALID");

  const assets: GoldenLessonAsset[] = Array.isArray(manifest.assets) ? manifest.assets : [];
  for (const asset of assets) {
    const file = files.get(asset.path);
    if (!file) fail("ASSET_BYTES_MISSING");
    if (file.bytes.byteLength !== asset.bytes) fail("ASSET_SIZE_MISMATCH");
    if (file.bytes.byteLength < GOLDEN_ASSET_MIN_BYTES || file.bytes.byteLength > GOLDEN_ASSET_MAX_BYTES) {
      fail("ASSET_SIZE_OUT_OF_RANGE");
    }
    if (!isAllowedAssetMime(asset.mimeType)) fail("ASSET_MIME_FORBIDDEN");
    if (!assetMagicMatches(asset.mimeType, file.bytes)) fail("ASSET_MAGIC_MISMATCH");
  }

  const declaredLeaves = new Set(assets.map((asset) => asset.path));
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (const artifact of manifest.artifacts) {
    if (!artifact.sourcePath || !artifact.sourcePath.toLowerCase().endsWith(".html")) continue;
    const file = files.get(artifact.sourcePath);
    if (!file) fail("DIRECT_EXPECTED_FILE_MISSING");
    let html: string;
    try { html = decoder.decode(file.bytes); }
    catch { fail("HTML_UTF8_INVALID"); }
    const findings = scanHtmlAssetReferences(artifact.sourcePath, html, declaredLeaves);
    if (findings.length > 0) fail(findings[0]!.code);
  }

  const manifestSha256 = computeGoldenLessonManifestSha256(manifest);
  return {
    manifest,
    manifestSha256,
    intakeSha256: computeGoldenLessonIntakeSha256(manifestSha256, inputFiles),
    fileCount: inputFiles.length,
    totalBytes,
    files: inputFiles,
    assets,
  };
}

/**
 * Deterministic intake identity: manifest digest + the sorted (path, sha256) file set.
 * Exported so server-side re-verification can anchor on the attested manifest digest
 * instead of re-serializing a manifest that round-tripped through jsonb (key order
 * is not preserved by Postgres, which would otherwise produce a false mismatch).
 */
export function computeGoldenLessonIntakeSha256(
  manifestSha256: string,
  inputFiles: GoldenLessonDirectFileDeclaration[],
): string {
  const intakeHash = createHash("sha256").update(manifestSha256);
  for (const file of [...inputFiles].sort((left, right) => left.path.localeCompare(right.path, "en"))) {
    intakeHash.update("\0").update(file.path).update("\0").update(file.sha256);
  }
  return intakeHash.digest("hex");
}

