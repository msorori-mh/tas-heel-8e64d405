/**
 * Fixed curriculum scope for structure imports (templates 02/03).
 * The selected official subject is authoritative; workbook subject_code is audit input only.
 */
export interface CurriculumImportScope {
  gradeSlug: string;
  trackCodes: string[];
  semester: 1 | 2;
  subjectCode: string;
}

export interface ResolvedCurriculumImportScope extends CurriculumImportScope {
  subjectName: string;
}

export function curriculumImportScopeKey(scope: CurriculumImportScope | null): string {
  if (!scope) return "";
  return [
    scope.gradeSlug.trim().toLowerCase(),
    [...new Set(scope.trackCodes.map((code) => code.trim().toLowerCase()))].sort().join("|"),
    scope.semester,
    scope.subjectCode.trim().toLowerCase(),
  ].join("::");
}

export function isCompleteCurriculumImportScope(
  scope: CurriculumImportScope | null,
): scope is CurriculumImportScope {
  return Boolean(
    scope?.gradeSlug.trim() &&
      scope.subjectCode.trim() &&
      scope.trackCodes.length > 0 &&
      (scope.semester === 1 || scope.semester === 2),
  );
}
