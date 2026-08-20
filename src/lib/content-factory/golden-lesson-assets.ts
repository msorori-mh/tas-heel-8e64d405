/**
 * CF11 — supplemental static assets for Golden Lesson packages.
 *
 * A Golden Lesson HTML body may only reference binary figures that the manifest DECLARES.
 * Every declaration is leaf-only (no folders, no traversal), MIME-allowlisted, size-capped and
 * pinned to an exact SHA-256. The verifier enforces byte-for-byte equality AND ZIP file-set
 * equality, so an undeclared file in the ZIP and an undeclared reference in the HTML are both
 * hard failures.
 *
 * Explicitly forbidden, by construction:
 *   * SVG (script-capable), and any MIME outside the raster allowlist below.
 *   * `data:` / base64 payloads inline in HTML.
 *   * absolute, protocol-relative or nested paths (`/x`, `//x`, `http(s)://x`, `a/b.png`, `../x`).
 *
 * This module is pure. It performs no IO, no database access and no network access.
 */

import type { GoldenCapability } from "./golden-lesson-contract.ts";

export const GOLDEN_ASSET_MAX_BYTES = 2 * 1024 * 1024;
export const GOLDEN_ASSET_MIN_BYTES = 64;

/** Raster-only allowlist. Each MIME pins its permitted leaf extensions and magic-byte prefix. */
export const GOLDEN_ASSET_MIME_ALLOWLIST = {
  "image/png": {
    extensions: [".png"],
    magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  "image/jpeg": {
    extensions: [".jpg", ".jpeg"],
    magic: [0xff, 0xd8, 0xff],
  },
  "image/webp": {
    // RIFF....WEBP — bytes 8..11 are checked separately.
    extensions: [".webp"],
    magic: [0x52, 0x49, 0x46, 0x46],
  },
} as const;

export type GoldenAssetMime = keyof typeof GOLDEN_ASSET_MIME_ALLOWLIST;

export const GOLDEN_ASSET_CODE = /^[A-Z0-9][A-Z0-9-]{2,63}$/;
export const GOLDEN_ASSET_LEAF = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SHA256 = /^[a-f0-9]{64}$/;

export interface GoldenLessonAsset {
  assetCode: string;
  path: string;
  mimeType: string;
  sha256: string;
  bytes: number;
  referencedBy: GoldenCapability[];
  altTextAr: string;
}

export interface GoldenAssetFinding {
  code: string;
  field: string;
  messageAr: string;
}

export function isAllowedAssetMime(mime: string): mime is GoldenAssetMime {
  return Object.prototype.hasOwnProperty.call(GOLDEN_ASSET_MIME_ALLOWLIST, mime);
}

export function assetLeafExtension(leaf: string): string {
  const dot = leaf.lastIndexOf(".");
  return dot <= 0 ? "" : leaf.slice(dot).toLowerCase();
}

/** Leaf-only, lowercase, no folders, no traversal, no control characters, single extension dot. */
export function isSafeAssetLeaf(leaf: string): boolean {
  if (!leaf || leaf.length > 64) return false;
  if (leaf !== leaf.normalize("NFC")) return false;
  if (leaf.includes("/") || leaf.includes("\\")) return false;
  if (leaf === "." || leaf === ".." || leaf.includes("..")) return false;
  return GOLDEN_ASSET_LEAF.test(leaf);
}

/** Byte-level sniff. The declared MIME must match the real container, not just the extension. */
export function assetMagicMatches(mime: string, bytes: Uint8Array): boolean {
  if (!isAllowedAssetMime(mime)) return false;
  const spec = GOLDEN_ASSET_MIME_ALLOWLIST[mime];
  if (bytes.byteLength < spec.magic.length) return false;
  for (let index = 0; index < spec.magic.length; index += 1) {
    if (bytes[index] !== spec.magic[index]) return false;
  }
  if (mime === "image/webp") {
    if (bytes.byteLength < 12) return false;
    const tag = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
    if (tag !== "WEBP") return false;
  }
  return true;
}

/** Declaration-level validation. Byte validation happens in the bundle verifier. */
export function validateGoldenLessonAssets(
  assets: readonly GoldenLessonAsset[],
  capabilityHasSource: (capability: GoldenCapability) => boolean,
): GoldenAssetFinding[] {
  const findings: GoldenAssetFinding[] = [];
  const push = (code: string, field: string, messageAr: string) => findings.push({ code, field, messageAr });

  const seenCodes = new Set<string>();
  const seenPaths = new Set<string>();

  for (const asset of assets) {
    const field = `assets.${asset?.assetCode ?? "?"}`;
    if (!asset || typeof asset !== "object") {
      push("ASSET_SHAPE_INVALID", "assets", "بنية الأصل الثابت غير صالحة.");
      continue;
    }
    if (typeof asset.assetCode !== "string" || !GOLDEN_ASSET_CODE.test(asset.assetCode)) {
      push("ASSET_CODE_INVALID", `${field}.assetCode`, "رمز الأصل الثابت يجب أن يكون ثابتًا بأحرف لاتينية كبيرة.");
    } else if (seenCodes.has(asset.assetCode)) {
      push("ASSET_CODE_DUPLICATE", `${field}.assetCode`, "رمز الأصل الثابت مكرر داخل الحزمة.");
    } else {
      seenCodes.add(asset.assetCode);
    }

    if (typeof asset.path !== "string" || !isSafeAssetLeaf(asset.path)) {
      push("ASSET_PATH_UNSAFE", `${field}.path`, "مسار الأصل يجب أن يكون اسم ملف مفردًا دون مجلدات أو محارف تحكم.");
    } else if (seenPaths.has(asset.path)) {
      push("ASSET_PATH_DUPLICATE", `${field}.path`, "لا يجوز أن يشترك أصلان في اسم الملف نفسه.");
    } else {
      seenPaths.add(asset.path);
    }

    if (typeof asset.mimeType !== "string" || !isAllowedAssetMime(asset.mimeType)) {
      push("ASSET_MIME_FORBIDDEN", `${field}.mimeType`, "نوع الأصل غير مسموح؛ الصور النقطية فقط (PNG/JPEG/WEBP) ولا يُسمح بـ SVG.");
    } else if (typeof asset.path === "string" &&
               !(GOLDEN_ASSET_MIME_ALLOWLIST[asset.mimeType].extensions as readonly string[])
                 .includes(assetLeafExtension(asset.path))) {
      push("ASSET_EXTENSION_MISMATCH", `${field}.path`, "امتداد الملف لا يطابق نوع المحتوى المعلن.");
    }

    if (typeof asset.sha256 !== "string" || !SHA256.test(asset.sha256)) {
      push("ASSET_HASH_INVALID", `${field}.sha256`, "بصمة SHA-256 للأصل مفقودة أو غير صالحة.");
    }

    if (!Number.isSafeInteger(asset.bytes) || asset.bytes < GOLDEN_ASSET_MIN_BYTES ||
        asset.bytes > GOLDEN_ASSET_MAX_BYTES) {
      push("ASSET_SIZE_OUT_OF_RANGE", `${field}.bytes`, "حجم الأصل خارج الحدود المسموحة.");
    }

    if (!Array.isArray(asset.referencedBy) || asset.referencedBy.length === 0) {
      push("ASSET_REFERENCE_MISSING", `${field}.referencedBy`, "يجب ربط الأصل بقدرة واحدة على الأقل تستخدمه.");
    } else {
      for (const capability of asset.referencedBy) {
        if (!capabilityHasSource(capability)) {
          push("ASSET_REFERENCE_CAPABILITY_INVALID", `${field}.referencedBy`,
            "الأصل مرتبط بقدرة غير موجودة أو بلا ملف محتوى.");
        }
      }
    }

    if (typeof asset.altTextAr !== "string" || asset.altTextAr.trim().length < 3) {
      push("ASSET_ALT_TEXT_MISSING", `${field}.altTextAr`, "النص البديل العربي مطلوب لكل أصل مصور.");
    }
  }

  return findings;
}

const SRC_ATTRIBUTE = /(?:\bsrc|\bsrcset|\bposter|\bdata-src)\s*=\s*"([^"]*)"/gi;
const CSS_URL = /url\(\s*['"]?([^)'"]+)['"]?\s*\)/gi;

/**
 * Every external byte reference inside a package HTML body must be a DECLARED leaf asset.
 * Returns findings; an empty array means the body is clean.
 */
export function scanHtmlAssetReferences(
  sourcePath: string,
  html: string,
  declaredLeaves: ReadonlySet<string>,
): GoldenAssetFinding[] {
  const findings: GoldenAssetFinding[] = [];
  const push = (code: string, messageAr: string) => findings.push({ code, field: sourcePath, messageAr });

  const references: string[] = [];
  for (const match of html.matchAll(SRC_ATTRIBUTE)) references.push(match[1] ?? "");
  for (const match of html.matchAll(CSS_URL)) references.push(match[1] ?? "");

  for (const raw of references) {
    const value = raw.trim();
    if (value.length === 0) {
      push("HTML_REFERENCE_EMPTY", "مرجع ملف فارغ داخل HTML.");
      continue;
    }
    if (/^data:/i.test(value)) {
      push("HTML_REFERENCE_DATA_URI_FORBIDDEN", "ممنوع تضمين الصور كـ base64 داخل HTML.");
      continue;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//")) {
      push("HTML_REFERENCE_EXTERNAL_FORBIDDEN", "ممنوع أي مرجع شبكي خارجي داخل HTML.");
      continue;
    }
    if (value.includes("/") || value.includes("\\")) {
      push("HTML_REFERENCE_PATH_FORBIDDEN", "المراجع يجب أن تكون أسماء ملفات مفردة دون مجلدات.");
      continue;
    }
    if (!declaredLeaves.has(value)) {
      push("HTML_REFERENCE_UNDECLARED", "مرجع ملف غير معلن في قائمة الأصول الثابتة.");
    }
  }

  return findings;
}
