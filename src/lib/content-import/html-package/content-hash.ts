import type { PackageFileItem } from "./types.ts";

/**
 * Helper to get cryptographic SHA-256 bytes in WebCrypto or Node.js.
 * Fail-closed if no secure crypto implementation is present.
 */
export async function computeSha256Bytes(data: string | Uint8Array | Buffer): Promise<Uint8Array> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);

  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const uint8 = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", uint8);
    return new Uint8Array(hashBuffer);
  }

  // Node.js crypto fallback
  try {
    const nodeCrypto = await import("node:crypto");
    const hash = nodeCrypto.createHash("sha256").update(bytes).digest();
    return new Uint8Array(hash);
  } catch {
    // Fail-closed: No fallback non-cryptographic hashing allowed for security boundaries
    throw new Error("FAIL_CLOSED: Cryptographic SHA-256 implementation unavailable in environment.");
  }
}

/**
 * Compute SHA-256 hex string.
 */
export async function computeSha256(data: string | Uint8Array | Buffer): Promise<string> {
  const bytes = await computeSha256Bytes(data);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Compute SHA-256 Base64 string for CSP script hashes (e.g. 'sha256-BASE64...').
 */
export async function computeSha256Base64(data: string | Uint8Array | Buffer): Promise<string> {
  const bytes = await computeSha256Bytes(data);
  // Base64 encoding
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = typeof btoa === "function" ? btoa(binary) : Buffer.from(bytes).toString("base64");
  return `'sha256-${base64}'`;
}

/**
 * Compute deterministic SHA-256 for an entire package based on sorted relative file paths and contents.
 */
export async function computePackageDeterministicHash(files: PackageFileItem[]): Promise<string> {
  // Filter out directories and sort files deterministically by canonical normalized path
  const sortedFiles = [...files]
    .filter((f) => !f.isDir)
    .sort((a, b) => {
      const pathA = a.path.replace(/\\/g, "/").toLowerCase();
      const pathB = b.path.replace(/\\/g, "/").toLowerCase();
      return pathA.localeCompare(pathB);
    });

  const manifestBuilder: string[] = [];

  for (const file of sortedFiles) {
    const normalizedPath = file.path.replace(/\\/g, "/").toLowerCase();
    const fileHash = file.contentSha256 || (file.buffer ? await computeSha256(file.buffer) : "");
    manifestBuilder.push(`${normalizedPath}:${file.size}:${fileHash}`);
  }

  const combinedString = manifestBuilder.join("\n");
  return computeSha256(combinedString);
}
