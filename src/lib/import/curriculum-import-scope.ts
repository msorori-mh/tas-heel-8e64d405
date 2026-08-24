/**
 * Fixed curriculum scope for structure imports (templates 02/03).
 * The selected official subject is authoritative; workbook subject_code is audit input only.
 */
export interface SubjectImportScope {
  gradeSlug: string;
  trackCodes: string[];
}

export interface CurriculumImportScope extends SubjectImportScope {
  semester: 1 | 2;
  subjectCode: string;
}

export type ContentStructureImportScope = SubjectImportScope | CurriculumImportScope;

export interface ResolvedSubjectImportScope extends SubjectImportScope {
  gradeId: string;
  trackIds: string[];
}

export interface ResolvedCurriculumImportScope extends CurriculumImportScope {
  subjectId: string;
  subjectName: string;
}

export function curriculumImportScopeKey(scope: ContentStructureImportScope | null): string {
  if (!scope) return "";
  const base = [
    scope.gradeSlug.trim().toLowerCase(),
    [...new Set(scope.trackCodes.map((code) => code.trim().toLowerCase()))].sort().join("|"),
  ];
  if (!("subjectCode" in scope)) return [...base, "subjects"].join("::");
  return [...base, scope.semester, scope.subjectCode.trim().toLowerCase()].join("::");
}

export function isCompleteSubjectImportScope(
  scope: ContentStructureImportScope | null,
): scope is SubjectImportScope {
  return Boolean(scope?.gradeSlug.trim() && scope.trackCodes.length > 0);
}

export function isCompleteCurriculumImportScope(
  scope: ContentStructureImportScope | null,
): scope is CurriculumImportScope {
  return Boolean(
    scope?.gradeSlug.trim() &&
      "subjectCode" in scope &&
      scope.subjectCode.trim() &&
      scope.trackCodes.length > 0 &&
      (scope.semester === 1 || scope.semester === 2),
  );
}
