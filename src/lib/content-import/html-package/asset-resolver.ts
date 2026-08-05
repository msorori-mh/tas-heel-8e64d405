import type { PackageFileItem, SecurityFinding } from "./types.ts";
import { ValidationCodes } from "./validation-codes.ts";

/**
 * Resolves referenced asset paths against the actual files present in the package.
 */
export function resolvePackageAssets(
  entryFile: string,
  referencedAssetPaths: string[],
  filesInPackage: PackageFileItem[]
): {
  isValid: boolean;
  missingAssets: string[];
  orphanAssets: string[];
  findings: SecurityFinding[];
} {
  const findings: SecurityFinding[] = [];

  // Build a normalized set of available file paths in package (relative to root)
  const availablePaths = new Set<string>();
  for (const f of filesInPackage) {
    if (!f.isDir) {
      availablePaths.add(f.path.replace(/\\/g, "/").toLowerCase());
    }
  }

  const missingAssets: string[] = [];

  for (const refPath of referencedAssetPaths) {
    // Ignore data: and blob: URLs
    if (refPath.startsWith("data:") || refPath.startsWith("blob:")) {
      continue;
    }

    // Ignore query parameters or hash fragments for path resolution
    const cleanRef = refPath.split("?")[0].split("#")[0].replace(/\\/g, "/");
    const normalizedRef = cleanRef.startsWith("./") ? cleanRef.slice(2) : cleanRef;

    if (!availablePaths.has(normalizedRef.toLowerCase())) {
      missingAssets.push(refPath);
      findings.push({
        code: ValidationCodes.MISSING_REFERENCED_ASSET,
        severity: "error",
        file: entryFile,
        snippet: refPath,
        message: `الملف المرجعي مفقود من الحزمة: ${refPath}`,
      });
    }
  }

  return {
    isValid: missingAssets.length === 0,
    missingAssets,
    orphanAssets: [],
    findings,
  };
}
