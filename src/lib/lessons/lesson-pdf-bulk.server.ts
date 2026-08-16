/** 18D — server side of the bulk subject PDF upload plan. */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  buildBulkMatchMatrix,
  bulkMatchBlockers,
  canExecuteBulk,
  isSubjectComplete,
  type BulkFileInput,
  type BulkLessonInput,
} from "./bulk-pdf-match";

export async function planSubjectBulk(
  admin: SupabaseClient<Database>,
  subjectId: string,
  files: BulkFileInput[],
) {
  const { data: lessons, error } = await admin
    .from("lessons")
    .select("id, title, lesson_code, sort_order")
    .eq("subject_id", subjectId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error("lessons_lookup_failed");

  const ids = (lessons ?? []).map((l) => l.id);
  const primaryByLesson = new Set<string>();
  if (ids.length > 0) {
    const { data: primaries, error: pErr } = await admin
      .from("lesson_resources")
      .select("lesson_id")
      .in("lesson_id", ids)
      .eq("is_primary", true);
    if (pErr) throw new Error("primary_lookup_failed");
    for (const r of primaries ?? []) primaryByLesson.add(r.lesson_id);
  }

  const lessonInputs: BulkLessonInput[] = (lessons ?? []).map((l) => ({
    lessonId: l.id,
    lessonCode: (l as { lesson_code?: string | null }).lesson_code ?? null,
    lessonTitle: l.title,
    hasPrimaryPdf: primaryByLesson.has(l.id),
  }));

  const rows = buildBulkMatchMatrix(lessonInputs, files);
  return {
    rows,
    blockers: bulkMatchBlockers(rows),
    canExecute: canExecuteBulk(rows),
    subjectComplete: isSubjectComplete(rows),
    lessonCount: lessonInputs.length,
  };
}
