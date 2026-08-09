import { resolvePackageAssets } from "./asset-resolver.ts";
import { computePackageDeterministicHash, computeSha256 } from "./content-hash.ts";
import { buildPackageCsp } from "./csp-builder.ts";
import { parseHtmlContent } from "./html-parser.ts";
import { scanJavaScriptContent } from "./js-scanner.ts";
import { scanCssContent } from "./css-scanner.ts";
import { validateManifest } from "./manifest-validator.ts";
import { validatePackagePreflight } from "./package-preflight.ts";
import type {
  ImportDryRunReport,
  InteractiveLessonResourceImportRow,
  PackageFileItem,
  PackageValidationResult,
  SecurityFinding,
} from "./types.ts";
import { HTML_RESOURCE_TYPES } from "./types.ts";
import { ValidationCodes } from "./validation-codes.ts";

/**
 * Validate a single Excel row for interactive lesson resource import.
 */
export function validateInteractiveResourceRow(
  row: InteractiveLessonResourceImportRow,
  rowNumber: number
): {
  isValid: boolean;
  findings: SecurityFinding[];
} {
  const findings: SecurityFinding[] = [];

  // Required fields check
  if (!row.resource_code || !row.resource_code.trim()) {
    findings.push({
      code: ValidationCodes.MISSING_REQUIRED_FIELD,
      severity: "error",
      message: `الصف ${rowNumber}: حقل resource_code إلزامي.`,
    });
  }

  if (!row.grade_code || !row.grade_code.trim()) {
    findings.push({
      code: ValidationCodes.MISSING_REQUIRED_FIELD,
      severity: "error",
      message: `الصف ${rowNumber}: حقل grade_code إلزامي.`,
    });
  }

  if (!row.subject_code || !row.subject_code.trim()) {
    findings.push({
      code: ValidationCodes.MISSING_REQUIRED_FIELD,
      severity: "error",
      message: `الصف ${rowNumber}: حقل subject_code إلزامي.`,
    });
  }

  if (!row.lesson_code || !row.lesson_code.trim()) {
    findings.push({
      code: ValidationCodes.MISSING_REQUIRED_FIELD,
      severity: "error",
      message: `الصف ${rowNumber}: حقل lesson_code إلزامي.`,
    });
  }

  if (!row.title_ar || !row.title_ar.trim()) {
    findings.push({
      code: ValidationCodes.MISSING_REQUIRED_FIELD,
      severity: "error",
      message: `الصف ${rowNumber}: حقل title_ar إلزامي.`,
    });
  }

  if (!row.package_path || !row.package_path.trim()) {
    findings.push({
      code: ValidationCodes.MISSING_REQUIRED_FIELD,
      severity: "error",
      message: `الصف ${rowNumber}: حقل package_path إلزامي لموارد HTML.`,
    });
  }

  if (!HTML_RESOURCE_TYPES.includes(row.resource_type as typeof HTML_RESOURCE_TYPES[number])) {
    findings.push({
      code: ValidationCodes.INVALID_RESOURCE_TYPE,
      severity: "error",
      message: `الصف ${rowNumber}: resource_type يجب أن يكون mind_map_html أو practical_experiment_html أو summary_html لموارد HTML.`,
    });
  }

  if (row.resource_type === "mind_map_html" && (!row.alt_text_ar || !row.alt_text_ar.trim())) {
    findings.push({
      code: ValidationCodes.ALT_TEXT_REQUIRED_FOR_MIND_MAP,
      severity: "error",
      message: `الصف ${rowNumber}: حقل alt_text_ar إلزامي للخرائط الذهنية لضمان الوصولية.`,
    });
  }

  return {
    isValid: findings.filter((f) => f.severity === "error").length === 0,
    findings,
  };
}

/**
 * Validate a single HTML package file tree.
 */
export async function validateSingleHtmlPackage(
  resourceCode: string,
  files: PackageFileItem[],
  totalCompressedSizeBytes?: number,
  excelRow?: InteractiveLessonResourceImportRow
): Promise<PackageValidationResult> {
  const allFindings: SecurityFinding[] = [];

  // 1. Preflight validation
  const preflight = validatePackagePreflight(files, totalCompressedSizeBytes);
  allFindings.push(...preflight.findings);

  // 2. Locate entry file and manifest.json
  const entryFileName = excelRow?.entry_file || "index.html";
  const entryFile = files.find(
    (f) => !f.isDir && f.path.replace(/\\/g, "/").toLowerCase() === entryFileName.toLowerCase()
  );
  const manifestFile = files.find(
    (f) => !f.isDir && f.path.replace(/\\/g, "/").toLowerCase() === "manifest.json"
  );

  if (!entryFile) {
    allFindings.push({
      code: ValidationCodes.MISSING_INDEX_HTML,
      severity: "error",
      file: entryFileName,
      message: `الملف الرئيسي (${entryFileName}) غير موجود داخل مجلد المورد ${resourceCode}.`,
    });
  }

  let parsedManifest: any = undefined;
  if (!manifestFile) {
    allFindings.push({
      code: ValidationCodes.MISSING_MANIFEST_JSON,
      severity: "error",
      file: "manifest.json",
      message: `ملف manifest.json غير موجود داخل مجلد المورد ${resourceCode}.`,
    });
  } else if (manifestFile.buffer) {
    try {
      const text = new TextDecoder().decode(manifestFile.buffer);
      const json = JSON.parse(text);
      const manifestRes = validateManifest(json, resourceCode, excelRow);
      allFindings.push(...manifestRes.findings);
      parsedManifest = manifestRes.manifest;
    } catch {
      allFindings.push({
        code: ValidationCodes.INVALID_MANIFEST_JSON,
        severity: "error",
        file: "manifest.json",
        message: `ملف manifest.json يحتوي على صيغة JSON غير صالحة.`,
      });
    }
  }

  let scriptHashes: string[] = [];
  let referencedAssets: string[] = [];

  // 3. Scan HTML, JavaScript, and CSS contents
  for (const file of files) {
    if (file.isDir || !file.buffer) continue;

    const pathLower = file.path.replace(/\\/g, "/").toLowerCase();
    const text = new TextDecoder().decode(file.buffer);

    if (pathLower.endsWith(".html") || pathLower.endsWith(".htm")) {
      const htmlScan = await parseHtmlContent(text, file.path);
      allFindings.push(...htmlScan.findings);
      if (pathLower === entryFileName.toLowerCase()) {
        scriptHashes = htmlScan.scriptHashes;
        referencedAssets = htmlScan.referencedAssets;
      }
    } else if (pathLower.endsWith(".js") || pathLower.endsWith(".mjs")) {
      const jsScan = scanJavaScriptContent(text, file.path);
      allFindings.push(...jsScan);
    } else if (pathLower.endsWith(".css")) {
      const cssScan = scanCssContent(text, file.path);
      allFindings.push(...cssScan);
    }
  }

  // 4. Asset resolution check
  if (entryFile) {
    const assetRes = resolvePackageAssets(entryFileName, referencedAssets, files);
    allFindings.push(...assetRes.findings);
  }

  // 5. Build CSP and compute deterministic SHA-256 content hash
  const cspHeader = await buildPackageCsp(scriptHashes, resourceCode, excelRow?.version || 1, "nonce-preflight");
  const contentHash = await computePackageDeterministicHash(files);

  const errorCount = allFindings.filter((f) => f.severity === "error").length;
  const isValid = errorCount === 0;

  const offlineEligible =
    isValid &&
    (excelRow?.offline_enabled ?? parsedManifest?.offline_enabled ?? true);

  return {
    resourceCode,
    isValid,
    entryFile: entryFileName,
    manifest: parsedManifest,
    contentHash,
    totalSizeCompressed: totalCompressedSizeBytes || 0,
    totalSizeUncompressed: preflight.totalUncompressedSize,
    fileCount: files.length,
    cspHeader,
    findings: allFindings,
    offlineEligible,
  };
}

/**
 * Execute complete Dry-Run validation for Excel rows and packages map.
 */
export async function runInteractiveResourceImportDryRun(
  excelRows: InteractiveLessonResourceImportRow[],
  packageFilesMap: Record<string, PackageFileItem[]>
): Promise<ImportDryRunReport> {
  const reportRows: ImportDryRunReport["rows"] = [];
  const packageResults: Record<string, PackageValidationResult> = {};
  const globalFindings: SecurityFinding[] = [];

  const seenResourceCodes = new Map<string, number>();

  for (let i = 0; i < excelRows.length; i++) {
    const row = excelRows[i];
    const rowNum = i + 2; // header line offset

    const rowVal = validateInteractiveResourceRow(row, rowNum);
    const rowFindings = [...rowVal.findings];

    if (row.resource_code) {
      if (seenResourceCodes.has(row.resource_code)) {
        rowFindings.push({
          code: ValidationCodes.DUPLICATE_RESOURCE_CODE,
          severity: "error",
          message: `الصف ${rowNum}: resource_code مكرر (${row.resource_code}) وتم ظهوره في الصف ${seenResourceCodes.get(row.resource_code)}.`,
        });
      } else {
        seenResourceCodes.set(row.resource_code, rowNum);
      }
    }

    const rowIsValid = rowFindings.filter((f) => f.severity === "error").length === 0;

    reportRows.push({
      rowNumber: rowNum,
      row,
      isValid: rowIsValid,
      findings: rowFindings,
    });
  }

  // Validate packages in ZIP map
  for (const [resCode, files] of Object.entries(packageFilesMap)) {
    const matchingRow = excelRows.find((r) => r.resource_code === resCode);
    const result = await validateSingleHtmlPackage(resCode, files, undefined, matchingRow);
    packageResults[resCode] = result;
  }

  // Check missing packages referenced in Excel
  for (const row of excelRows) {
    if (row.resource_code && !packageResults[row.resource_code]) {
      globalFindings.push({
        code: ValidationCodes.MISSING_MANIFEST_JSON,
        severity: "error",
        message: `المورد (${row.resource_code}) المذكور في صف Excel غير موجود كمجلد داخل ملف ZIP.`,
      });
    }
  }

  const totalRows = reportRows.length;
  const validRows = reportRows.filter((r) => r.isValid).length;
  const rejectedRows = totalRows - validRows;

  const pkgArray = Object.values(packageResults);
  const totalResourcesInZip = pkgArray.length;
  const validPackages = pkgArray.filter((p) => p.isValid).length;
  const rejectedPackages = totalResourcesInZip - validPackages;
  const offlineEligibleCount = pkgArray.filter((p) => p.offlineEligible).length;

  return {
    summary: {
      totalRows,
      validRows,
      rejectedRows,
      totalResourcesInZip,
      validPackages,
      rejectedPackages,
      offlineEligibleCount,
    },
    rows: reportRows,
    packageResults,
    globalFindings,
  };
}
