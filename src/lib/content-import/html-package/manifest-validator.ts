import type {
  InteractiveResourceManifest,
  InteractiveLessonResourceImportRow,
  SecurityFinding,
} from "./types.ts";
import { HTML_RESOURCE_TYPES } from "./types.ts";
import { ValidationCodes } from "./validation-codes.ts";

/**
 * Validate manifest.json object against schema and Excel row cross-check.
 */
export function validateManifest(
  rawManifest: unknown,
  expectedResourceCode?: string,
  excelRow?: InteractiveLessonResourceImportRow,
): {
  isValid: boolean;
  manifest?: InteractiveResourceManifest;
  findings: SecurityFinding[];
} {
  const findings: SecurityFinding[] = [];

  if (!rawManifest || typeof rawManifest !== "object" || Array.isArray(rawManifest)) {
    findings.push({
      code: ValidationCodes.INVALID_MANIFEST_JSON,
      severity: "error",
      file: "manifest.json",
      message: "ملف manifest.json غير صالح أو ليس كائناً مجرداً.",
    });
    return { isValid: false, findings };
  }

  const obj = rawManifest as Record<string, unknown>;

  const resourceCode = typeof obj.resource_code === "string" ? obj.resource_code.trim() : "";
  const entryFile = typeof obj.entry_file === "string" ? obj.entry_file.trim() : "index.html";
  const version = typeof obj.version === "number" && obj.version > 0 ? obj.version : 1;
  const resourceType = typeof obj.resource_type === "string" ? obj.resource_type.trim() : "";
  const offlineEnabled = Boolean(obj.offline_enabled);
  const requiredFiles = Array.isArray(obj.required_files)
    ? obj.required_files.filter((f): f is string => typeof f === "string")
    : [];
  const contentSha256 = typeof obj.content_sha256 === "string" ? obj.content_sha256.trim() : "";

  if (!resourceCode) {
    findings.push({
      code: ValidationCodes.INVALID_MANIFEST_JSON,
      severity: "error",
      file: "manifest.json",
      message: "حقل resource_code في manifest.json مفقود أو فارغ.",
    });
  }

  if (expectedResourceCode && resourceCode && resourceCode !== expectedResourceCode) {
    findings.push({
      code: ValidationCodes.RESOURCE_CODE_MISMATCH,
      severity: "error",
      file: "manifest.json",
      message: `resource_code في manifest.json (${resourceCode}) لا يطابق اسم المجلد أو كود Excel (${expectedResourceCode}).`,
    });
  }

  if (!HTML_RESOURCE_TYPES.includes(resourceType as (typeof HTML_RESOURCE_TYPES)[number])) {
    findings.push({
      code: ValidationCodes.INVALID_RESOURCE_TYPE,
      severity: "error",
      file: "manifest.json",
      message: `resource_type في manifest.json غير مدعوم: ${resourceType}`,
    });
  }

  if (excelRow) {
    if (excelRow.resource_code && resourceCode && excelRow.resource_code !== resourceCode) {
      findings.push({
        code: ValidationCodes.RESOURCE_CODE_MISMATCH,
        severity: "error",
        file: "manifest.json",
        message: `resource_code في manifest.json (${resourceCode}) لا يطابق صف Excel (${excelRow.resource_code}).`,
      });
    }

    if (excelRow.resource_type && resourceType && excelRow.resource_type !== resourceType) {
      findings.push({
        code: ValidationCodes.INVALID_RESOURCE_TYPE,
        severity: "error",
        file: "manifest.json",
        message: `resource_type في manifest.json (${resourceType}) لا يطابق صف Excel (${excelRow.resource_type}).`,
      });
    }

    if (excelRow.version !== undefined && excelRow.version !== version) {
      findings.push({
        code: ValidationCodes.RESOURCE_CODE_MISMATCH,
        severity: "error",
        file: "manifest.json",
        message: `الإصدار version في manifest.json (${version}) لا يطابق إصدار Excel (${excelRow.version}).`,
      });
    }
  }

  const manifest: InteractiveResourceManifest = {
    resource_code: resourceCode,
    entry_file: entryFile,
    version,
    resource_type: resourceType as InteractiveResourceManifest["resource_type"],
    offline_enabled: offlineEnabled,
    required_files: requiredFiles,
    content_sha256: contentSha256,
  };

  return {
    isValid: findings.filter((f) => f.severity === "error").length === 0,
    manifest,
    findings,
  };
}
