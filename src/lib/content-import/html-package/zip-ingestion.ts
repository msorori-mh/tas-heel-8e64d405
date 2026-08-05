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
 */
export async function parseMasterZipBuffer(
  zipBuffer: Uint8Array | Buffer
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

  // Master ZIP size check
  if (zipBuffer.length > PACKAGE_LIMITS.MAX_MASTER_ZIP_SIZE_BYTES) {
    findings.push({
      code: ValidationCodes.UNCOMPRESSED_EXCEEDS_MAX_SIZE,
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

  const seenPathsLower = new Map<string, string>();

  // Process each entry in zip
  for (const [entryPath, zipObj] of Object.entries(zip.files)) {
    // 1. Check for null bytes in path
    if (entryPath.includes("\0")) {
      findings.push({
        code: ValidationCodes.PATH_TRAVERSAL_DETECTED,
        severity: "error",
        file: entryPath,
        message: "تم كشف بايت صفري في مسار الملف داخل ZIP.",
      });
      continue;
    }

    // 2. Check percent-encoded traversal
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

    // 3. Path Traversal, absolute path, UNC, drive letter checks
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

    // 4. Symlink detection via Unix permissions / external attributes
    // Unix symlink mode is 0120000 (0o120000 = 40960 decimal shift 16 = 0xA000)
    const unixPermissions = zipObj.unixPermissions;
    if (typeof unixPermissions === "number" && (unixPermissions & 0o170000) === 0o120000) {
      findings.push({
        code: ValidationCodes.SYMLINK_DETECTED,
        severity: "error",
        file: entryPath,
        message: `تم كشف رابط رمزي (Symlink) محظور داخل ملفات ZIP: ${entryPath}`,
      });
      continue;
    }

    // 5. Case-insensitive path collision & duplicate check
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

    // Check nested archive extensions
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

    // Extract file bytes
    const buffer = await zipObj.async("uint8array");

    // Single file limit check
    if (buffer.length > PACKAGE_LIMITS.MAX_SINGLE_FILE_BYTES) {
      findings.push({
        code: ValidationCodes.EXCEEDS_SINGLE_FILE_LIMIT,
        severity: "error",
        file: entryPath,
        message: `حجم الملف (${Math.round(buffer.length / 1024 / 1024)}MB) يتجاوز الحد الأقصى (10MB).`,
      });
    }

    // MIME and magic bytes validation
    const mimeResult = validateFileMimeAndBytes(entryPath, buffer);
    if (!mimeResult.isValid && mimeResult.finding) {
      findings.push(mimeResult.finding);
    }

    const sha256 = await computeSha256(buffer);

    // Group files by top-level folder (resource_code)
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

  // Validate limits per resource package
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
