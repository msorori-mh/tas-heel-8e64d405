import {
  parseMasterZipBuffer,
  PackageFileItem,
  SecurityFinding,
  computePackageDeterministicHash as computePackageHash,
  buildPackageCsp,
  validateFileMimeAndBytes,
  scanCodeSecurity,
  ValidationCodes,
} from "../../content-import/html-package";

export interface ServerPackageValidationResult {
  isValid: boolean;
  packageHash: string;
  scannerVersion: string;
  findings: SecurityFinding[];
  files: Array<{
    filePath: string;
    fileSizeBytes: number;
    mimeType: string;
    sha256Hash: string;
    isEntryPoint: boolean;
  }>;
  entryFile: string;
}

const PII_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/i, // Email
  /\b(?:\+?967|0)?[71737770][0-9]{8}\b/i, // Yemeni Phone number format
  /\b\d{3}-\d{2}-\d{4}\b/i, // SSN pattern
];

const LEAKAGE_PATTERNS = [
  /data-answer\s*=/i,
  /correct-answer\s*=/i,
  /class=["'][^"']*\b(answer-key|solution-text|teacher-note|explanation-hidden)\b[^"']*["']/i,
  /id=["'][^"']*\b(answer-key|solution-text|teacher-note)\b[^"']*["']/i,
];

export async function validateServerHtmlPackage(
  zipBuffer: Uint8Array,
  packagePath: string = "package"
): Promise<ServerPackageValidationResult> {
  const findings: SecurityFinding[] = [];
  const scannerVersion = "v1-operational-server";

  // 1. Ingest ZIP
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

  const packageFiles = parseRes.packageMap[packagePath] || Object.values(parseRes.packageMap)[0] || [];

  if (packageFiles.length === 0) {
    return {
      isValid: false,
      packageHash: "",
      scannerVersion,
      findings: [
        {
          code: ValidationCodes.PACKAGE_EMPTY,
          severity: "error",
          message: `لم يتم العثور على أي ملفات داخل الحزمة ${packagePath}`,
        },
      ],
      files: [],
      entryFile: "index.html",
    };
  }

  // 2. Structural & Security Analysis per file
  let totalSizeBytes = 0;
  const processedFiles: ServerPackageValidationResult["files"] = [];
  let entryFileFound = false;
  let entryFileName = "index.html";

  for (const file of packageFiles) {
    totalSizeBytes += file.size;

    // Check size limit (max 50MB per package)
    if (totalSizeBytes > 52428800) {
      findings.push({
        code: ValidationCodes.PACKAGE_EXCEEDS_MAX_SIZE,
        severity: "error",
        message: "حجم الحزمة الإجمالي يتجاوز الحد المسموح 50MB",
      });
      break;
    }

    // Traversal or Symlink check
    if (file.path.includes("..") || file.path.startsWith("/") || file.path.includes("\\")) {
      findings.push({
        code: ValidationCodes.PATH_TRAVERSAL_DETECTED,
        severity: "error",
        message: `مسار ملف غير آمن: ${file.path}`,
      });
    }

    // MIME Validation
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

    // Text File inspection (HTML/JS/CSS) for PII and Leakage
    if (file.path.endsWith(".html") || file.path.endsWith(".htm") || file.path.endsWith(".js")) {
      const textContent = new TextDecoder().decode(fileBytes);

      if (file.path.endsWith(".html") || file.path.endsWith(".htm")) {
        const htmlFindings = scanCodeSecurity(textContent, file.path);
        for (const f of htmlFindings) {
          findings.push(f);
        }
      }

      // Check PII leakage
      for (const pattern of PII_PATTERNS) {
        if (pattern.test(textContent)) {
          findings.push({
            code: ValidationCodes.PII_LEAKAGE_DETECTED,
            severity: "error",
            message: `تم اكتشاف بيانات شخصية PII داخل الملف ${file.path}`,
          });
        }
      }

      // Check Answer/Explanation Leakage
      for (const pattern of LEAKAGE_PATTERNS) {
        if (pattern.test(textContent)) {
          findings.push({
            code: ValidationCodes.ANSWER_LEAKAGE_DETECTED,
            severity: "error",
            message: `تم اكتشاف كشف عن الإجابات النموذجية/الشرح المعلم داخل الملف ${file.path}`,
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
      code: ValidationCodes.MISSING_ENTRY_FILE,
      severity: "error",
      message: "الملف الرئيسي index.html غير موجود بالحزمة",
    });
  }

  // Compute Package SHA-256 Hash
  const packageHash = await computePackageHash(packageFiles);

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

import { defaultSupabaseStorageAdapter, StorageClientAdapter } from "./upload-service";

export async function executeServerPackageValidationWorkflow(
  stagingPath: string,
  storageAdapter: StorageClientAdapter = defaultSupabaseStorageAdapter
): Promise<ServerPackageValidationResult> {
  const { data: zipBytes, error } = await storageAdapter.download("lesson-resource-drafts", stagingPath);
  if (error || !zipBytes) {
    return {
      isValid: false,
      packageHash: "",
      scannerVersion: "v1-operational-server",
      findings: [
        {
          code: ValidationCodes.ZIP_INGESTION_FAILED,
          severity: "error",
          message: `فشل تنزيل حزمة ZIP من مسار Staging: ${error?.message || "الملف غير موجود"}`,
        },
      ],
      files: [],
      entryFile: "index.html",
    };
  }

  return validateServerHtmlPackage(zipBytes);
}
