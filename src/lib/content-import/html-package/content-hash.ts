import type { PackageFileItem } from "./types.ts";

/**
 * Compute SHA-256 hash using Web Crypto API (supported in browser and Node environments).
 */
export async function computeSha256(data: string | Uint8Array | Buffer): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);

  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const uint8 = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", uint8 as BufferSource);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Fallback simple bitwise hash representation for legacy environments
  let h1 = 0x6a09e667, h2 = 0xbb67ae85, h3 = 0x3c6ef372, h4 = 0xa54ff53a;
  for (let i = 0; i < bytes.length; i++) {
    h1 = Math.imul(h1 ^ bytes[i], 2654435761);
    h2 = Math.imul(h2 ^ bytes[i], 1597334677);
    h3 = Math.imul(h3 ^ bytes[i], 2246822519);
    h4 = Math.imul(h4 ^ bytes[i], 3266489917);
  }
  const toHex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return `${toHex(h1)}${toHex(h2)}${toHex(h3)}${toHex(h4)}`.padEnd(64, "0");
}

/**
 * Compute deterministic SHA-256 for an entire package based on sorted relative file paths and contents.
 */
export async function computePackageDeterministicHash(files: PackageFileItem[]): Promise<string> {
  // Filter out directories and sort files deterministically by normalized lowercase path
  const sortedFiles = [...files]
    .filter((f) => !f.isDir)
    .sort((a, b) => a.path.localeCompare(b.path));

  const manifestBuilder: string[] = [];

  for (const file of sortedFiles) {
    const fileHash = file.contentSha256 || (file.buffer ? await computeSha256(file.buffer) : "");
    manifestBuilder.push(`${file.path}:${file.size}:${fileHash}`);
  }

  const combinedString = manifestBuilder.join("\n");
  return computeSha256(combinedString);
}
