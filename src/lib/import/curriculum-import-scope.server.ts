import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  CurriculumImportScope,
  ResolvedCurriculumImportScope,
} from "./curriculum-import-scope";

export async function resolveCurriculumImportScope(
  supabase: SupabaseClient<Database>,
  scope: CurriculumImportScope,
): Promise<ResolvedCurriculumImportScope> {
  const { loadContentCodeRegistry } = await import(
    "@/lib/content-codes/content-code-registry.server"
  );
  const registry = await loadContentCodeRegistry(supabase);
  const gradeSlug = scope.gradeSlug.trim().toLowerCase();
  const subjectCode = scope.subjectCode.trim().toLowerCase();
  const trackCodes = [...new Set(scope.trackCodes.map((code) => code.trim().toLowerCase()))].sort();

  if (!gradeSlug || !subjectCode || trackCodes.length === 0) {
    throw new Error("IMPORT_SCOPE_REQUIRED: اختر الصف والمسار والفصل والمادة قبل رفع الملف.");
  }
  if (scope.semester !== 1 && scope.semester !== 2) {
    throw new Error("IMPORT_SCOPE_SEMESTER_INVALID");
  }

  const subject = registry.subjects.find(
    (candidate) =>
      candidate.isOfficialCode &&
      candidate.subjectCode.toLowerCase() === subjectCode &&
      candidate.gradeSlug.toLowerCase() === gradeSlug,
  );
  if (!subject) {
    throw new Error("IMPORT_SCOPE_SUBJECT_NOT_FOUND");
  }

  const { data: subjectRow, error: subjectError } = await supabase
    .from("subjects")
    .select("id")
    .eq("code", subject.subjectCode)
    .maybeSingle();
  if (subjectError || !subjectRow) {
    throw new Error("IMPORT_SCOPE_SUBJECT_NOT_FOUND");
  }

  const missingTrack = trackCodes.find((code) => !subject.trackCodes.includes(code));
  if (missingTrack) {
    throw new Error(`IMPORT_SCOPE_TRACK_MISMATCH: ${missingTrack}`);
  }

  return {
    subjectId: subjectRow.id,
    gradeSlug,
    trackCodes,
    semester: scope.semester,
    subjectCode: subject.subjectCode,
    subjectName: subject.name,
  };
}

export function applyCurriculumImportScopeToRows<T extends { data: Record<string, string> }>(
  rows: T[],
  scope: ResolvedCurriculumImportScope,
): T[] {
  return rows.map((row) => ({
    ...row,
    data: {
      ...row.data,
      subject_code: scope.subjectCode,
      semester: String(scope.semester),
    },
  }));
}
