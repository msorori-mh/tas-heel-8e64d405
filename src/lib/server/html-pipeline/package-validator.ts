import {
  parseMasterZipBuffer,
  computePackageDeterministicHash,
  validateFileMimeAndBytes,
  scanCodeSecurity,
  ValidationCodes,
  type SecurityFinding,
  type ValidationCode,
} from "@/lib/content-import/html-package";
import type { StorageClientAdapter } from "./storage-adapter";
import type { ServerPackageValidationResult } from "./types";

export const ANSWER_LEAKAGE_CODE: ValidationCode = "ANSWER_LEAKAGE_DETECTED" as ValidationCode;
export const PII_LEAKAGE_CODE: ValidationCode = "PII_LEAKAGE_DETECTED" as ValidationCode;
export const PACKAGE_EMPTY_CODE: ValidationCode = "PACKAGE_EMPTY" as ValidationCode;
export const MISSING_ENTRY_FILE_CODE: ValidationCode = "MISSING_ENTRY_FILE" as ValidationCode;

const PII_PATTERNS: readonly RegExp[] = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/i, // Email
  /\b(?:\+?967|0)?[71737770][0-9]{8}\b/i, // Yemeni Phone number
  /\b\d{3}-\d{2}-\d{4}\b/i, // SSN pattern
];

const LEAKAGE_PATTERNS: readonly RegExp[] = [
  /data-answer\s*=/i,
  /correct-answer\s*=/i,
  /class=["'][^"']*\b(answer-key|solution-text|teacher-note|explanation-hidden)\b[^"']*["']/i,
  /id=["'][^"']*\b(answer-key|solution-text|teacher-note)\b[^"']*["']/i,
];

const MAX_PACKAGE_BYTES = 52428800; // 50MB

export async function validateServerHtmlPackage(
  zipBuffer: Uint8Array,
  packagePath = "package",
): Promise<ServerPackageValidationResult> {
  const findings: SecurityFinding[] = [];
  const scannerVersion = "v1-trusted-server-pipeline";

  const parseRes = await parseMasterZipBuffer(zipBuffer);
  if (!parseRes.isValid) {
    return {
      isValid: false,
      packageHash: "",
      scannerVersion,
      findings: parseRes.findings,
      files: [],
      entryFile: "index.html",
    };
  }

  const packageFiles =
    parseRes.packageMap[packagePath] ||
    Object.values(parseRes.packageMap)[0] ||
    [];

  if (packageFiles.length === 0) {
    return {
      isValid: false,
      packageHash: "",
      scannerVersion,
      findings: [
        {
          code: PACKAGE_EMPTY_CODE,
          severity: "error",
          message: `لم يتم العثور على أي ملفات داخل الحزمة ${packagePath}`,
        },
      ],
      files: [],
      entryFile: "index.html",
    };
  }

  let totalSizeBytes = 0;
  const processedFiles: ServerPackageValidationResult["files"] = [];
  let entryFileFound = false;
  let entryFileName = "index.html";

  for (const file of packageFiles) {
    totalSizeBytes += file.size;

    if (totalSizeBytes > MAX_PACKAGE_BYTES) {
      findings.push({
        code: ValidationCodes.PACKAGE_EXCEEDS_MAX_SIZE,
        severity: "error",
        message: "حجم الحزمة الإجمالي يتجاوز الحد المسموح 50MB",
      });
      break;
    }

    if (file.path.includes("..") || file.path.startsWith("/") || file.path.includes("\\")) {
      findings.push({
        code: ValidationCodes.PATH_TRAVERSAL_DETECTED,
        severity: "error",
        message: `مسار ملف غير آمن (Path Traversal): ${file.path}`,
      });
    }

    const fileBytes = file.buffer || new Uint8Array(0);
    const mimeRes = validateFileMimeAndBytes(file.path, fileBytes);
    if (!mimeRes.isValid && mimeRes.finding) {
      findings.push(mimeRes.finding);
    }

    const isEntry = file.path === "index.html" || file.path.endsWith("/index.html");
    if (isEntry) {
      entryFileFound = true;
      entryFileName = file.path;
    }

    if (
      file.path.endsWith(".html") ||
      file.path.endsWith(".htm") ||
      file.path.endsWith(".js")
    ) {
      const textContent = new TextDecoder().decode(fileBytes);

      if (file.path.endsWith(".html") || file.path.endsWith(".htm")) {
        const htmlFindings = scanCodeSecurity(textContent, file.path);
        for (const f of htmlFindings) {
          findings.push(f);
        }
      }

      for (const pattern of PII_PATTERNS) {
        if (pattern.test(textContent)) {
          findings.push({
            code: PII_LEAKAGE_CODE,
            severity: "error",
            message: `تم اكتشاف تسريب بيانات شخصية (PII) داخل الملف ${file.path}`,
          });
        }
      }

      for (const pattern of LEAKAGE_PATTERNS) {
        if (pattern.test(textContent)) {
          findings.push({
            code: ANSWER_LEAKAGE_CODE,
            severity: "error",
            message: `تم اكتشاف تسريب الإجابة النموذجية أو الشرح داخل الملف ${file.path}`,
          });
        }
      }
    }

    processedFiles.push({
      filePath: file.path,
      fileSizeBytes: file.size,
      mimeType: file.mimeType || "application/octet-stream",
      sha256Hash: file.contentSha256,
      isEntryPoint: isEntry,
    });
  }

  if (!entryFileFound) {
    findings.push({
      code: MISSING_ENTRY_FILE_CODE,
      severity: "error",
      message: "الملف الرئيسي index.html غير موجود بالحزمة",
    });
  }

  const packageHash = await computePackageDeterministicHash(packageFiles);
  const hasBlockingErrors = findings.some((f) => f.severity === "error");

  return {
    isValid: !hasBlockingErrors,
    packageHash,
    scannerVersion,
    findings,
    files: processedFiles,
    entryFile: entryFileName,
  };
}

export async function downloadAndValidateStoredZipWorkflow(
  stagingPath: string,
  storageAdapter: StorageClientAdapter,
): Promise<ServerPackageValidationResult> {
  const { data: zipBytes, error } = await storageAdapter.download(
    "lesson-resource-drafts",
    stagingPath,
  );
  if (error || !zipBytes || zipBytes.byteLength === 0) {
    return {
      isValid: false,
      packageHash: "",
      scannerVersion: "v1-trusted-server-pipeline",
      findings: [
        {
          code: ValidationCodes.ZIP_INGESTION_FAILED,
          severity: "error",
          message: `فشل تنزيل ملف ZIP من مسار Staging: ${error?.message || "الملف فارغ أو غير موجود"}`,
        },
      ],
      files: [],
      entryFile: "index.html",
    };
  }

  return validateServerHtmlPackage(zipBytes);
}
