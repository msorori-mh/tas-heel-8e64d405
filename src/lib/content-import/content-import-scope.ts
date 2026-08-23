export const STRUCTURAL_SCOPE_TEMPLATE_KEYS = ["units", "lessons"] as const;

export type StructuralScopeTemplateKey =
  (typeof STRUCTURAL_SCOPE_TEMPLATE_KEYS)[number];

export interface StructuralImportScope {
  gradeSlug: string;
  trackCodes: string[];
  semester: 1 | 2;
  subjectCode: string;
}

export interface StructuralScopeRegistry {
  grades: Array<{ gradeSlug: string }>;
  tracks: Array<{ trackCode: string }>;
  subjects: Array<{
    subjectCode: string;
    gradeSlug: string;
    trackCodes: string[];
  }>;
}

export interface StructuralScopeParsedSheet {
  rows: Array<{ rowNumber: number; data: Record<string, string> }>;
}

export interface StructuralScopeIssue {
  rowNumber: number | null;
  column: string | null;
  code?: string;
  message: string;
}

interface DryRunReportLike {
  ok: boolean;
  status: "pass" | "warn" | "fail";
  totalRows: number;
  validRows: number;
  errorCount: number;
  errors: StructuralScopeIssue[];
}

const canonical = (value: string): string => value.trim().toLowerCase();

export function assertStructuralScopeTemplateKey(
  templateKey: string,
): StructuralScopeTemplateKey {
  if (!STRUCTURAL_SCOPE_TEMPLATE_KEYS.includes(templateKey as StructuralScopeTemplateKey)) {
    throw new Error(
      "هذا المسار يقبل ملفي الوحدات والدروس الهيكليين فقط (units/lessons).",
    );
  }
  return templateKey as StructuralScopeTemplateKey;
}

export function normalizeStructuralImportScope(
  scope: StructuralImportScope,
): StructuralImportScope {
  const trackCodes = scope.trackCodes.map(canonical).filter(Boolean);
  if (new Set(trackCodes).size !== trackCodes.length) {
    throw new Error("لا يجوز تكرار المسار داخل سياق الاستيراد.");
  }
  return {
    gradeSlug: canonical(scope.gradeSlug),
    trackCodes: [...trackCodes].sort(),
    semester: scope.semester,
    subjectCode: canonical(scope.subjectCode),
  };
}

export function validateStructuralImportScope(
  templateKey: string,
  parsed: StructuralScopeParsedSheet,
  rawScope: StructuralImportScope,
  registry: StructuralScopeRegistry,
): StructuralScopeIssue[] {
  assertStructuralScopeTemplateKey(templateKey);
  const scope = normalizeStructuralImportScope(rawScope);
  const issues: StructuralScopeIssue[] = [];

  if (!registry.grades.some((grade) => canonical(grade.gradeSlug) === scope.gradeSlug)) {
    issues.push({
      rowNumber: null,
      column: "gradeSlug",
      code: "IMPORT_SCOPE_GRADE_NOT_FOUND",
      message: `الصف «${scope.gradeSlug}» غير موجود في السجل الرسمي.`,
    });
  }

  const registryTracks = new Set(registry.tracks.map((track) => canonical(track.trackCode)));
  for (const trackCode of scope.trackCodes) {
    if (!registryTracks.has(trackCode)) {
      issues.push({
        rowNumber: null,
        column: "trackCodes",
        code: "IMPORT_SCOPE_TRACK_NOT_FOUND",
        message: `المسار «${trackCode}» غير موجود في السجل الرسمي.`,
      });
    }
  }

  const subject = registry.subjects.find(
    (candidate) => canonical(candidate.subjectCode) === scope.subjectCode,
  );
  if (!subject) {
    issues.push({
      rowNumber: null,
      column: "subjectCode",
      code: "IMPORT_SCOPE_SUBJECT_NOT_FOUND",
      message: `المادة «${scope.subjectCode}» غير موجودة في سجل الأكواد.`,
    });
  } else {
    if (canonical(subject.gradeSlug) !== scope.gradeSlug) {
      issues.push({
        rowNumber: null,
        column: "gradeSlug",
        code: "IMPORT_SCOPE_SUBJECT_GRADE_CONFLICT",
        message: "المادة المختارة لا تنتمي إلى الصف المحدد في سياق الاستيراد.",
      });
    }
    const subjectTracks = new Set(subject.trackCodes.map(canonical));
    const unavailableTracks = scope.trackCodes.filter((track) => !subjectTracks.has(track));
    if (unavailableTracks.length > 0) {
      issues.push({
        rowNumber: null,
        column: "trackCodes",
        code: "IMPORT_SCOPE_SUBJECT_TRACK_CONFLICT",
        message: `المادة غير متاحة للمسار/المسارات: ${unavailableTracks.join(" | ")}.`,
      });
    }
  }

  for (const row of parsed.rows) {
    if (canonical(row.data.subject_code ?? "") !== scope.subjectCode) {
      issues.push({
        rowNumber: row.rowNumber,
        column: "subject_code",
        code: "IMPORT_SCOPE_SUBJECT_ROW_CONFLICT",
        message: `subject_code في الصف يجب أن يساوي المادة المختارة «${scope.subjectCode}».`,
      });
    }

    const rowSemester = Number((row.data.semester ?? "").trim());
    if (!Number.isInteger(rowSemester) || rowSemester !== scope.semester) {
      issues.push({
        rowNumber: row.rowNumber,
        column: "semester",
        code: "IMPORT_SCOPE_SEMESTER_ROW_CONFLICT",
        message: `semester في الصف يجب أن يساوي الفصل المختار (${scope.semester}).`,
      });
    }
  }

  return issues;
}

export function applyStructuralImportScopeValidation<T extends DryRunReportLike>(
  report: T,
  parsed: StructuralScopeParsedSheet,
  scope: StructuralImportScope,
  registry: StructuralScopeRegistry,
  templateKey: string,
): T {
  const scopeIssues = validateStructuralImportScope(
    templateKey,
    parsed,
    scope,
    registry,
  );
  if (scopeIssues.length === 0) return report;

  const errors = [...report.errors, ...scopeIssues];
  const hasFileError = errors.some((issue) => issue.rowNumber == null);
  const invalidRows = hasFileError
    ? report.totalRows
    : new Set(errors.flatMap((issue) =>
        issue.rowNumber == null ? [] : [issue.rowNumber],
      )).size;

  return {
    ...report,
    ok: false,
    status: "fail",
    validRows: Math.max(0, report.totalRows - invalidRows),
    errorCount: errors.length,
    errors,
  };
}
