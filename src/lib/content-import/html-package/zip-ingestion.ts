import JSZip from "jszip";
import { PACKAGE_LIMITS } from "./types.ts";
import type { PackageFileItem, SecurityFinding } from "./types.ts";
import { ValidationCodes } from "./validation-codes.ts";
import { computeSha256 } from "./content-hash.ts";
import { validateFileMimeAndBytes } from "./mime-validator.ts";
import { normalizeUrlString } from "./url-normalizer.ts";

export interface ZipIngestionResult {
  isValid: boolean;
  findings: SecurityFinding[];
  packageMap: Record<string, PackageFileItem[]>;
}

/**
 * Parses real master ZIP archive buffer, extracting resources and applying full runtime security limits.
 * Employs fail-closed pre-materialization validation on Central Directory metadata before decompressing contents.
 */
export async function parseMasterZipBuffer(
  zipBuffer: Uint8Array | Buffer,
): Promise<ZipIngestionResult> {
  const findings: SecurityFinding[] = [];
  const packageMap: Record<string, PackageFileItem[]> = {};

  if (!zipBuffer || zipBuffer.length === 0) {
    return {
      isValid: false,
      findings: [
        {
          code: ValidationCodes.ZIP_INGESTION_FAILED,
          severity: "error",
          message: "ملف ZIP فارغ أو غير موجود.",
        },
      ],
      packageMap: {},
    };
  }

  // 1. Reject Master ZIP bytes when exceeding limit before JSZip
  if (zipBuffer.length > PACKAGE_LIMITS.MAX_MASTER_ZIP_SIZE_BYTES) {
    findings.push({
      code: ValidationCodes.PACKAGE_EXCEEDS_MAX_SIZE,
      severity: "error",
      message: `حجم ملف ZIP الكلي (${Math.round(zipBuffer.length / 1024 / 1024)}MB) يتجاوز الحد الأقصى المسموح به (${PACKAGE_LIMITS.MAX_MASTER_ZIP_SIZE_BYTES / 1024 / 1024}MB).`,
    });
    return { isValid: false, findings, packageMap: {} };
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBuffer);
  } catch (err: any) {
    return {
      isValid: false,
      findings: [
        {
          code: ValidationCodes.ZIP_INGESTION_FAILED,
          severity: "error",
          message: `فشل قراءة وفك ضغط ملف ZIP: ${err.message}`,
        },
      ],
      packageMap: {},
    };
  }

  const entries = Object.entries(zip.files);

  // Check total entries count
  if (entries.length > 500) {
    findings.push({
      code: ValidationCodes.EXCEEDS_MAX_FILES,
      severity: "error",
      message: `عدد عناصر ملف ZIP (${entries.length}) يتجاوز الحد الأقصى الكلي (500 ملف).`,
    });
    return { isValid: false, findings, packageMap: {} };
  }

  const seenPathsLower = new Map<string, string>();
  const resourceUncompressedSizes = new Map<string, number>();

  // =========================================================================
  // PRE-MATERIALIZATION CHECKS (Central Directory Metadata inspection)
  // MUST pass all checks BEFORE any zipObj.async("uint8array") call!
  // =========================================================================
  for (const [entryPath, zipObj] of entries) {
    // 1. Null bytes check
    if (entryPath.includes("\0")) {
      findings.push({
        code: ValidationCodes.PATH_TRAVERSAL_DETECTED,
        severity: "error",
        file: entryPath,
        message: "تم كشف بايت صفري في مسار الملف داخل ZIP.",
      });
      continue;
    }

    // 2. URL Normalization check
    const normUrl = normalizeUrlString(entryPath);
    if (!normUrl.isValid) {
      findings.push({
        code: ValidationCodes.PATH_TRAVERSAL_DETECTED,
        severity: "error",
        file: entryPath,
        message: "تم كشف مسار غير صالح أو ترميز مضلل داخل ZIP.",
      });
      continue;
    }

    // 3. Path Traversal & Absolute Path checks
    if (
      entryPath.includes("..") ||
      entryPath.startsWith("/") ||
      entryPath.startsWith("\\") ||
      /^[a-z]:[/\\]/i.test(entryPath) ||
      entryPath.startsWith("\\\\")
    ) {
      findings.push({
        code: ValidationCodes.PATH_TRAVERSAL_DETECTED,
        severity: "error",
        file: entryPath,
        message: `تم اكتشاف محاولة اجتياز مسارات غير مصرح بها: ${entryPath}`,
      });
      continue;
    }

    // 4. Directory Depth check
    const depth = entryPath.split(/[/\\]/).filter(Boolean).length;
    if (depth > PACKAGE_LIMITS.MAX_FOLDER_DEPTH) {
      findings.push({
        code: ValidationCodes.EXCEEDS_MAX_DEPTH,
        severity: "error",
        file: entryPath,
        message: `عمق المسار (${depth}) يتجاوز الحد الأقصى المسموح به (${PACKAGE_LIMITS.MAX_FOLDER_DEPTH}).`,
      });
    }

    // 5. Symlink check
    const unixPermissions = zipObj.unixPermissions;
    if (typeof unixPermissions === "number" && (unixPermissions & 0o170000) === 0o120000) {
      findings.push({
        code: ValidationCodes.SYMLINK_DETECTED,
        severity: "error",
        file: entryPath,
        message: `تم كشف رابط رمزي (Symlink) محظور داخل ملفات ZIP: ${entryPath}`,
      });
    }

    // 6. Case-insensitive collision & duplicates
    const normalizedPath = entryPath.replace(/\\/g, "/").toLowerCase();
    if (seenPathsLower.has(normalizedPath)) {
      const existing = seenPathsLower.get(normalizedPath)!;
      if (existing !== entryPath) {
        findings.push({
          code: ValidationCodes.CASE_INSENSITIVE_PATH_COLLISION,
          severity: "error",
          file: entryPath,
          message: `تعارض مسارات بغض النظر عن حالة الأحرف: ${entryPath} مع ${existing}`,
        });
      } else {
        findings.push({
          code: ValidationCodes.DUPLICATE_PATH_DETECTED,
          severity: "error",
          file: entryPath,
          message: `مسار مكرر داخل الحزمة: ${entryPath}`,
        });
      }
    } else {
      seenPathsLower.set(normalizedPath, entryPath);
    }

    if (zipObj.dir) continue;

    // 7. Nested archives check
    const extMatch = entryPath.match(/\.([a-z0-9]+)$/i);
    const ext = extMatch ? extMatch[1].toLowerCase() : "";
    if (["zip", "tar", "gz", "7z", "rar"].includes(ext)) {
      findings.push({
        code: ValidationCodes.NESTED_ARCHIVE_NOT_ALLOWED,
        severity: "error",
        file: entryPath,
        message: `ممنوع تضمين أراشيف مضغوطة متداخلة (.${ext}) داخل الحزمة.`,
      });
    }

    // 8. Metadata inspection (uncompressed & compressed size)
    const rawData = (zipObj as any)._data;
    const uncompressedSize = rawData?.uncompressedSize;
    const compressedSize = rawData?.compressedSize;

    if (
      typeof uncompressedSize !== "number" ||
      !Number.isFinite(uncompressedSize) ||
      uncompressedSize < 0
    ) {
      findings.push({
        code: ValidationCodes.ZIP_INGESTION_FAILED,
        severity: "error",
        file: entryPath,
        message: `عنصر ZIP يفتقر إلى بيانات الحجم الموثوقة (Unreliable metadata): ${entryPath}`,
      });
      continue;
    }

    if (uncompressedSize > PACKAGE_LIMITS.MAX_SINGLE_FILE_BYTES) {
      findings.push({
        code: ValidationCodes.EXCEEDS_SINGLE_FILE_LIMIT,
        severity: "error",
        file: entryPath,
        message: `حجم الملف التقديري (${Math.round(uncompressedSize / 1024 / 1024)}MB) يتجاوز الحد الأقصى (10MB).`,
      });
    }

    if (typeof compressedSize === "number" && compressedSize > 0) {
      const expansionRatio = uncompressedSize / Math.max(1, compressedSize);
      if (expansionRatio > PACKAGE_LIMITS.MAX_UNCOMPRESSED_RATIO) {
        findings.push({
          code: ValidationCodes.ZIP_BOMB_RATIO_EXCEEDED,
          severity: "error",
          file: entryPath,
          message: `تم كشف نسبة فك ضغط مشبوهة (${Math.round(expansionRatio)}x) تشير إلى Zip Bomb.`,
        });
      }
    }

    // Accumulate size per resource code
    const pathParts = entryPath.split(/[/\\]/).filter(Boolean);
    if (pathParts.length >= 2) {
      const resCode = pathParts[0];
      const prevSize = resourceUncompressedSizes.get(resCode) || 0;
      const newTotal = prevSize + uncompressedSize;
      resourceUncompressedSizes.set(resCode, newTotal);

      if (newTotal > PACKAGE_LIMITS.MAX_RESOURCE_UNCOMPRESSED_BYTES) {
        findings.push({
          code: ValidationCodes.UNCOMPRESSED_EXCEEDS_MAX_SIZE,
          severity: "error",
          message: `حجم المحتوى التقديري للمورد ${resCode} يتجاوز الحد الأقصى (${PACKAGE_LIMITS.MAX_RESOURCE_UNCOMPRESSED_BYTES / 1024 / 1024}MB).`,
        });
      }
    }
  }

  // If any errors detected during pre-materialization, REJECT IMMEDIATELY fail-closed!
  if (findings.some((f) => f.severity === "error")) {
    return { isValid: false, findings, packageMap: {} };
  }

  // =========================================================================
  // MATERIALIZATION PHASE (Extract files one by one & verify actual sizes)
  // =========================================================================
  for (const [entryPath, zipObj] of entries) {
    if (zipObj.dir) continue;

    let buffer: Uint8Array;
    try {
      buffer = await zipObj.async("uint8array");
    } catch (err: any) {
      findings.push({
        code: ValidationCodes.ZIP_INGESTION_FAILED,
        severity: "error",
        file: entryPath,
        message: `فشل فك ضغط الملف ${entryPath}: ${err.message}`,
      });
      return { isValid: false, findings, packageMap: {} };
    }

    // Verify actual extracted length
    if (buffer.length > PACKAGE_LIMITS.MAX_SINGLE_FILE_BYTES) {
      findings.push({
        code: ValidationCodes.EXCEEDS_SINGLE_FILE_LIMIT,
        severity: "error",
        file: entryPath,
        message: `حجم الملف الفعلي بعد الفك (${Math.round(buffer.length / 1024 / 1024)}MB) يتجاوز الحد الأقصى (10MB).`,
      });
      return { isValid: false, findings, packageMap: {} };
    }

    // MIME and magic bytes validation
    const mimeResult = validateFileMimeAndBytes(entryPath, buffer);
    if (!mimeResult.isValid && mimeResult.finding) {
      findings.push(mimeResult.finding);
    }

    const sha256 = await computeSha256(buffer);

    const pathParts = entryPath.split(/[/\\]/).filter(Boolean);
    if (pathParts.length >= 2) {
      const resourceCode = pathParts[0];
      const relativePath = pathParts.slice(1).join("/");

      if (!packageMap[resourceCode]) {
        packageMap[resourceCode] = [];
      }

      packageMap[resourceCode].push({
        path: relativePath,
        size: buffer.length,
        isDir: false,
        contentSha256: sha256,
        buffer,
      });
    }
  }

  // Validate per-resource post-extraction limits
  for (const [resourceCode, files] of Object.entries(packageMap)) {
    if (files.length > PACKAGE_LIMITS.MAX_FILES_PER_RESOURCE) {
      findings.push({
        code: ValidationCodes.EXCEEDS_MAX_FILES,
        severity: "error",
        message: `عدد الملفات في المورد ${resourceCode} (${files.length}) يتجاوز الحد الأقصى المسموح به (${PACKAGE_LIMITS.MAX_FILES_PER_RESOURCE}).`,
      });
    }

    const totalSize = files.reduce((acc, f) => acc + f.size, 0);
    if (totalSize > PACKAGE_LIMITS.MAX_RESOURCE_UNCOMPRESSED_BYTES) {
      findings.push({
        code: ValidationCodes.UNCOMPRESSED_EXCEEDS_MAX_SIZE,
        severity: "error",
        message: `حجم المحتوى المفكوك للمورد ${resourceCode} (${Math.round(totalSize / 1024 / 1024)}MB) يتجاوز الحد الأقصى (${PACKAGE_LIMITS.MAX_RESOURCE_UNCOMPRESSED_BYTES / 1024 / 1024}MB).`,
      });
    }
  }

  return {
    isValid: findings.filter((f) => f.severity === "error").length === 0,
    findings,
    packageMap,
  };
}
