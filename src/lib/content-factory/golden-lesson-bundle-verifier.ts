import { createHash } from "node:crypto";

import JSZip from "jszip";

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
import { parseGoldenLessonManifest, previewGoldenLessonStaging } from "./golden-lesson-staging.ts";


export const GOLDEN_BUNDLE_LIMITS = {
  maxCompressedBytes: 50 * 1024 * 1024,
  maxUncompressedBytes: 50 * 1024 * 1024,
  maxEntryBytes: 5 * 1024 * 1024,
  maxEntries: 32,
  maxCompressionRatio: 100,
} as const;

export interface VerifiedGoldenLessonBundle {
  manifest: GoldenLessonPackage;
  manifestSha256: string;
  bundleSha256: string;
  fileCount: number;
  compressedBytes: number;
  uncompressedBytes: number;
  files: VerifiedGoldenLessonFile[];
  assets: GoldenLessonAsset[];
}


export interface VerifiedGoldenLessonFile {
  path: string;
  sha256: string;
  bytes: Uint8Array;
}

interface CentralEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
}

function fail(code: string): never {
  throw new Error(code);
}

function u16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function u32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0;
}

function safeLeafName(name: string): boolean {
  return name.length > 0 && name.length <= 255 && name !== "." && name !== ".." &&
    !/[\\/\u0000-\u001f]/u.test(name) && name.normalize("NFC") === name;
}

function scanCentralDirectory(bytes: Uint8Array): CentralEntry[] {
  if (bytes.byteLength > GOLDEN_BUNDLE_LIMITS.maxCompressedBytes) fail("BUNDLE_COMPRESSED_LIMIT");
  if (bytes.byteLength < 22) fail("ZIP_EOCD_MISSING");
  const minimum = Math.max(0, bytes.byteLength - 65_557);
  let eocd = -1;
  for (let offset = bytes.byteLength - 22; offset >= minimum; offset -= 1) {
    if (u32(bytes, offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) fail("ZIP_EOCD_MISSING");
  if (u16(bytes, eocd + 4) !== 0 || u16(bytes, eocd + 6) !== 0) fail("ZIP_MULTIDISK_FORBIDDEN");
  const count = u16(bytes, eocd + 10);
  if (count === 0xffff || u32(bytes, eocd + 12) === 0xffffffff || u32(bytes, eocd + 16) === 0xffffffff) fail("ZIP64_FORBIDDEN");
  if (count === 0 || count > GOLDEN_BUNDLE_LIMITS.maxEntries) fail("ZIP_ENTRY_COUNT_INVALID");
  const directorySize = u32(bytes, eocd + 12);
  const directoryOffset = u32(bytes, eocd + 16);
  if (directoryOffset + directorySize > eocd) fail("ZIP_DIRECTORY_BOUNDS");

  const decoder = new TextDecoder("utf-8", { fatal: true });
  const entries: CentralEntry[] = [];
  const normalized = new Set<string>();
  let offset = directoryOffset;
  for (let index = 0; index < count; index += 1) {
    if (u32(bytes, offset) !== 0x02014b50) fail("ZIP_CENTRAL_HEADER_INVALID");
    const flags = u16(bytes, offset + 8);
    const method = u16(bytes, offset + 10);
    const compressedSize = u32(bytes, offset + 20);
    const uncompressedSize = u32(bytes, offset + 24);
    const nameLength = u16(bytes, offset + 28);
    const extraLength = u16(bytes, offset + 30);
    const commentLength = u16(bytes, offset + 32);
    const externalAttributes = u32(bytes, offset + 38);
    if ((flags & 0x1) !== 0) fail("ZIP_ENCRYPTED_FORBIDDEN");
    if (method !== 0 && method !== 8) fail("ZIP_COMPRESSION_UNSUPPORTED");
    const nameStart = offset + 46;
    const next = nameStart + nameLength + extraLength + commentLength;
    if (nameLength === 0 || next > directoryOffset + directorySize) fail("ZIP_ENTRY_BOUNDS");
    const nameBytes = bytes.subarray(nameStart, nameStart + nameLength);
    if ((flags & 0x800) === 0 && nameBytes.some((byte) => byte > 0x7f)) fail("ZIP_FILENAME_ENCODING_AMBIGUOUS");
    let name: string;
    try { name = decoder.decode(nameBytes); }
    catch { fail("ZIP_FILENAME_UTF8_INVALID"); }
    if (!safeLeafName(name)) fail("ZIP_PATH_UNSAFE");
    const key = name.normalize("NFKC").toLocaleLowerCase("en-US");
    if (normalized.has(key)) fail("ZIP_PATH_DUPLICATE");
    normalized.add(key);
    const unixMode = (externalAttributes >>> 16) & 0xf000;
    if (unixMode === 0xa000) fail("ZIP_SYMLINK_FORBIDDEN");
    if (uncompressedSize > GOLDEN_BUNDLE_LIMITS.maxEntryBytes) fail("ZIP_ENTRY_SIZE_LIMIT");
    if (compressedSize === 0 ? uncompressedSize > 0 : uncompressedSize / compressedSize > GOLDEN_BUNDLE_LIMITS.maxCompressionRatio) {
      fail("ZIP_COMPRESSION_RATIO_LIMIT");
    }
    entries.push({ name, compressedSize, uncompressedSize });
    offset = next;
  }
  if (offset !== directoryOffset + directorySize) fail("ZIP_DIRECTORY_TRAILING_DATA");
  const total = entries.reduce((sum, entry) => sum + entry.uncompressedSize, 0);
  if (total > GOLDEN_BUNDLE_LIMITS.maxUncompressedBytes) fail("ZIP_UNCOMPRESSED_LIMIT");
  return entries;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function verifyGoldenLessonBundle(input: Uint8Array): Promise<VerifiedGoldenLessonBundle> {
  const entries = scanCentralDirectory(input);
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(input, { checkCRC32: true, createFolders: false }); }
  catch { fail("ZIP_CRC_OR_STRUCTURE_INVALID"); }
  const manifestEntry = zip.file("manifest.json");
  if (!manifestEntry) fail("MANIFEST_MISSING");
  const manifestBytes = await manifestEntry.async("uint8array");
  let manifest: GoldenLessonPackage;
  try { manifest = parseGoldenLessonManifest(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes)) as GoldenLessonPackage; }
  catch { fail("MANIFEST_INVALID"); }
  if (!previewGoldenLessonStaging(manifest).valid) fail("MANIFEST_SERVER_VALIDATION_FAILED");

  const expectedHashes = new Map<string, string>();
  for (const artifact of manifest.artifacts) {
    if (artifact.sourcePath && artifact.sha256) expectedHashes.set(artifact.sourcePath, artifact.sha256);
    if (artifact.provenancePath && artifact.provenanceSha256) expectedHashes.set(artifact.provenancePath, artifact.provenanceSha256);
  }
  // CF11: declared supplemental assets participate in file-set equality and hash pinning.
  const assets: GoldenLessonAsset[] = Array.isArray(manifest.assets) ? manifest.assets : [];
  for (const asset of assets) expectedHashes.set(asset.path, asset.sha256);
  if (manifest.security.answersCompanionPath && manifest.security.answersCompanionSha256) {
    expectedHashes.set(manifest.security.answersCompanionPath, manifest.security.answersCompanionSha256);
  }
  const expectedNames = new Set(["manifest.json", ...expectedHashes.keys()]);
  if (entries.length !== expectedNames.size || entries.some((entry) => !expectedNames.has(entry.name))) fail("ZIP_FILE_SET_MISMATCH");
  const files: VerifiedGoldenLessonFile[] = [];
  const bytesByPath = new Map<string, Uint8Array>();
  for (const [name, expected] of expectedHashes) {
    const entry = zip.file(name);
    if (!entry) fail("ZIP_EXPECTED_FILE_MISSING");
    const bytes = await entry.async("uint8array");
    if (sha256(bytes) !== expected) fail("ZIP_FILE_HASH_MISMATCH");
    bytesByPath.set(name, bytes);
    files.push({ path: name, sha256: expected, bytes });
  }

  // The manifest, extension and SHA are not enough: validate the actual bytes
  // against the contract of the capability they claim to represent.
  for (const artifact of manifest.artifacts) {
    if (!artifact.sourcePath) continue;
    const bytes = bytesByPath.get(artifact.sourcePath);
    if (!bytes) fail("ZIP_EXPECTED_FILE_MISSING");
    const validation = validateGoldenLessonArtifactBytes(
      artifact.capability,
      artifact.sourcePath,
      bytes,
    );
    if (!validation.valid) fail(validation.findings[0]?.code ?? "ARTIFACT_CONTENT_INVALID");
  }
  const artifactInputs: Partial<Record<GoldenCapability, { fileName: string; bytes: Uint8Array }>> = {};
  for (const artifact of manifest.artifacts) {
    if (!artifact.sourcePath) continue;
    const bytes = bytesByPath.get(artifact.sourcePath);
    if (bytes) artifactInputs[artifact.capability] = { fileName: artifact.sourcePath, bytes };
  }
  const companionPath = manifest.security.answersCompanionPath;
  const companionBytes = companionPath ? bytesByPath.get(companionPath) : undefined;
  const answerCoverage = validateGoldenLessonAnswerCoverage(
    artifactInputs,
    companionPath && companionBytes ? { fileName: companionPath, bytes: companionBytes } : null,
  );
  if (!answerCoverage.valid) fail(answerCoverage.findings[0]?.code ?? "ANSWER_COMPANION_INVALID");

  // CF11 asset byte validation: exact declared size, MIME allowlist and real container magic.
  for (const asset of assets) {
    const bytes = bytesByPath.get(asset.path);
    if (!bytes) fail("ASSET_BYTES_MISSING");
    if (bytes.byteLength !== asset.bytes) fail("ASSET_SIZE_MISMATCH");
    if (bytes.byteLength < GOLDEN_ASSET_MIN_BYTES || bytes.byteLength > GOLDEN_ASSET_MAX_BYTES) {
      fail("ASSET_SIZE_OUT_OF_RANGE");
    }
    if (!isAllowedAssetMime(asset.mimeType)) fail("ASSET_MIME_FORBIDDEN");
    if (!assetMagicMatches(asset.mimeType, bytes)) fail("ASSET_MAGIC_MISMATCH");
  }

  // CF11: no HTML body may reference anything that is not a declared leaf asset.
  const declaredLeaves = new Set(assets.map((asset) => asset.path));
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (const artifact of manifest.artifacts) {
    if (!artifact.sourcePath || !artifact.sourcePath.toLowerCase().endsWith(".html")) continue;
    const bytes = bytesByPath.get(artifact.sourcePath);
    if (!bytes) fail("ZIP_EXPECTED_FILE_MISSING");
    let html: string;
    try { html = decoder.decode(bytes); }
    catch { fail("HTML_UTF8_INVALID"); }
    const findings = scanHtmlAssetReferences(artifact.sourcePath, html, declaredLeaves);
    if (findings.length > 0) fail(findings[0]!.code);
  }

  return {
    manifest,
    manifestSha256: sha256(manifestBytes),
    bundleSha256: sha256(input),
    fileCount: entries.length,
    compressedBytes: input.byteLength,
    uncompressedBytes: entries.reduce((sum, entry) => sum + entry.uncompressedSize, 0),
    files,
    assets,
  };
}
