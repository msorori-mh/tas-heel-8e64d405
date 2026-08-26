import { PACKAGE_LIMITS } from "./types.ts";
import type { PackageFileItem, SecurityFinding } from "./types.ts";
import { ValidationCodes } from "./validation-codes.ts";
import { normalizeUrlString } from "./url-normalizer.ts";

const FORBIDDEN_EXTENSIONS = new Set([
  "exe",
  "dll",
  "bat",
  "cmd",
  "ps1",
  "sh",
  "bash",
  "vbs",
  "msi",
  "com",
  "scr",
  "pif",
  "application",
  "gadget",
  "wsf",
  "wsh",
  "jar",
  "py",
  "php",
  "pl",
  "rb",
  "asp",
  "aspx",
  "jsp",
  "zip",
  "tar",
  "gz",
  "7z",
  "rar",
]);

/**
 * Preflight check of package file tree against limits, extensions, path traversal, collisions, and zip bomb indicators.
 */
export function validatePackagePreflight(
  files: PackageFileItem[],
  totalCompressedSizeBytes?: number,
): {
  isValid: boolean;
  findings: SecurityFinding[];
  totalUncompressedSize: number;
} {
  const findings: SecurityFinding[] = [];
  let totalUncompressedSize = 0;

  if (files.length > PACKAGE_LIMITS.MAX_FILES_PER_RESOURCE) {
    findings.push({
      code: ValidationCodes.EXCEEDS_MAX_FILES,
      severity: "error",
      message: `عدد الملفات في المورد (${files.length}) يتجاوز الحد الأقصى المسموح به (${PACKAGE_LIMITS.MAX_FILES_PER_RESOURCE}).`,
    });
  }

  const seenPathsLower = new Map<string, string>();

  for (const file of files) {
    const rawPath = file.path;
    const norm = normalizeUrlString(rawPath);

    const checkPath = norm.normalized || rawPath;

    // Check path traversal and leading slash
    if (
      !norm.isValid ||
      checkPath.includes("..") ||
      checkPath.startsWith("/") ||
      checkPath.startsWith("\\") ||
      checkPath.includes(":\\") ||
      checkPath.includes(":/")
    ) {
      findings.push({
        code: ValidationCodes.PATH_TRAVERSAL_DETECTED,
        severity: "error",
        file: rawPath,
        message: `تم اكتشاف محاولة اجتياز مسارات غير مصرح بها (Path traversal): ${rawPath}`,
      });
    }

    // Check folder depth
    const depth = checkPath.split(/[/\\]/).filter(Boolean).length;
    if (depth > PACKAGE_LIMITS.MAX_FOLDER_DEPTH) {
      findings.push({
        code: ValidationCodes.EXCEEDS_MAX_DEPTH,
        severity: "error",
        file: rawPath,
        message: `عمق المسار (${depth}) يتجاوز الحد الأقصى المسموح به (${PACKAGE_LIMITS.MAX_FOLDER_DEPTH}).`,
      });
    }

    // Case-insensitive path collision check
    const normalizedPath = checkPath.replace(/\\/g, "/").toLowerCase();
    if (seenPathsLower.has(normalizedPath)) {
      const existing = seenPathsLower.get(normalizedPath)!;
      if (existing !== rawPath) {
        findings.push({
          code: ValidationCodes.CASE_INSENSITIVE_PATH_COLLISION,
          severity: "error",
          file: rawPath,
          message: `تعارض مسارات بغض النظر عن حالة الأحرف: ${rawPath} مع ${existing}`,
        });
      } else {
        findings.push({
          code: ValidationCodes.DUPLICATE_PATH_DETECTED,
          severity: "error",
          file: rawPath,
          message: `مسار مكرر داخل الحزمة: ${rawPath}`,
        });
      }
    } else {
      seenPathsLower.set(normalizedPath, rawPath);
    }

    if (file.isDir) continue;

    totalUncompressedSize += file.size;

    // File extension checks
    const extMatch = checkPath.match(/\.([a-z0-9]+)$/i);
    const ext = extMatch ? extMatch[1].toLowerCase() : "";

    if (FORBIDDEN_EXTENSIONS.has(ext)) {
      findings.push({
        code: ValidationCodes.FORBIDDEN_FILE_EXTENSION,
        severity: "error",
        file: rawPath,
        message: `امتداد ملف محظور امنياً: .${ext}`,
      });
    }

    if (ext === "wasm") {
      findings.push({
        code: ValidationCodes.WASM_NOT_ALLOWED_IN_MVP,
        severity: "error",
        file: rawPath,
        message: "استخدام WebAssembly (WASM) غير مسموح به في المرحلة الأولى MVP.",
      });
    }

    // Single file limits
    if (ext === "html" || ext === "htm") {
      if (file.size > PACKAGE_LIMITS.MAX_SINGLE_HTML_FILE_BYTES) {
        findings.push({
          code: ValidationCodes.EXCEEDS_SINGLE_FILE_LIMIT,
          severity: "error",
          file: rawPath,
          message: `حجم ملف HTML (${Math.round(file.size / 1024 / 1024)}MB) يتجاوز الحد الأقصى (10MB).`,
        });
      }
    } else if (ext === "js" || ext === "mjs" || ext === "cjs") {
      if (file.size > PACKAGE_LIMITS.MAX_SINGLE_JS_FILE_BYTES) {
        findings.push({
          code: ValidationCodes.EXCEEDS_SINGLE_FILE_LIMIT,
          severity: "error",
          file: rawPath,
          message: `حجم ملف JavaScript (${Math.round(file.size / 1024 / 1024)}MB) يتجاوز الحد الأقصى (10MB).`,
        });
      }
    } else if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext)) {
      if (file.size > PACKAGE_LIMITS.MAX_SINGLE_IMAGE_FILE_BYTES) {
        findings.push({
          code: ValidationCodes.EXCEEDS_SINGLE_FILE_LIMIT,
          severity: "error",
          file: rawPath,
          message: `حجم ملف الصورة (${Math.round(file.size / 1024 / 1024)}MB) يتجاوز الحد الأقصى (10MB).`,
        });
      }
    } else if (["mp4", "webm", "mkv", "avi", "mov"].includes(ext)) {
      findings.push({
        code: ValidationCodes.FORBIDDEN_EMBEDDED_VIDEO,
        severity: "error",
        file: rawPath,
        message:
          "تضمين ملفات الفيديو مباشرة داخل حزمة HTML غير مسموح؛ استخدم نوع المورد video المستقل.",
      });
    }
  }

  // Uncompressed total limit check
  if (totalUncompressedSize > PACKAGE_LIMITS.MAX_RESOURCE_UNCOMPRESSED_BYTES) {
    findings.push({
      code: ValidationCodes.UNCOMPRESSED_EXCEEDS_MAX_SIZE,
      severity: "error",
      message: `حجم المحتوى المفكوك (${Math.round(totalUncompressedSize / 1024 / 1024)}MB) يتجاوز الحد الأقصى المسموح به (${PACKAGE_LIMITS.MAX_RESOURCE_UNCOMPRESSED_BYTES / 1024 / 1024}MB).`,
    });
  }

  // ZIP bomb expansion ratio check
  if (totalCompressedSizeBytes && totalCompressedSizeBytes > 0) {
    const ratio = totalUncompressedSize / totalCompressedSizeBytes;
    if (ratio > PACKAGE_LIMITS.MAX_UNCOMPRESSED_RATIO) {
      findings.push({
        code: ValidationCodes.ZIP_BOMB_RATIO_EXCEEDED,
        severity: "error",
        message: `نسبة فك الضغط عالية جداً (${Math.round(ratio)}x)، يُشتبه في وجود ZIP bomb.`,
      });
    }
  }

  return {
    isValid: findings.filter((f) => f.severity === "error").length === 0,
    findings,
    totalUncompressedSize,
  };
}
