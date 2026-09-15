import { supabase } from "@/integrations/supabase/client";
import {
  buildLessonCapabilityContract,
  applyLifecycleOverlay,
} from "@/lib/lessons/lesson-content-contract";
import {
  rowsToApplicabilityMap,
  rowsToLifecycleMap,
  type LessonLifecycleRow,
} from "@/lib/lessons/lesson-lifecycle";
import { summarizeAdminLessonQuestions } from "@/lib/lessons/admin-lesson-workspace";
import { reportCells, type ReportRow } from "./model";
export async function allRows<T>(
  query: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  signal?: AbortSignal,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 200) {
    signal?.throwIfAborted();
    const { data, error } = await query(offset, offset + 199);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 200) return rows;
  }
}
export async function loadReport(subjectId: string, signal: AbortSignal): Promise<ReportRow[]> {
  const lessons = await allRows(
    (a, b) =>
      supabase
        .from("lessons")
        .select("id,title,semester,updated_at,content_text,delivery_mode")
        .eq("subject_id", subjectId)
        .order("id")
        .range(a, b)
        .abortSignal(signal),
    signal,
  );
  const out: ReportRow[] = [];
  let next = 0;
  async function worker() {
    while (next < lessons.length) {
      const lesson = lessons[next++];
      signal.throwIfAborted();
      const [books, explanations, summaries, resources, simulations, questions, life] =
        await Promise.all([
          allRows(
            (a, b) =>
              supabase
                .from("lesson_book_contents")
                .select("id,content,pdf_url,updated_at")
                .eq("lesson_id", lesson.id)
                .order("id")
                .range(a, b)
                .abortSignal(signal),
            signal,
          ),
          allRows(
            (a, b) =>
              supabase
                .from("lesson_explanations")
                .select("id,content,updated_at")
                .eq("lesson_id", lesson.id)
                .order("id")
                .range(a, b)
                .abortSignal(signal),
            signal,
          ),
          allRows(
            (a, b) =>
              supabase
                .from("lesson_summaries")
                .select("id,summary,key_points,study_tip,updated_at")
                .eq("lesson_id", lesson.id)
                .order("id")
                .range(a, b)
                .abortSignal(signal),
            signal,
          ),
          allRows(
            (a, b) =>
              supabase
                .from("lesson_resources")
                .select(
                  "id,title,resource_type,url,description,html_resource_type,resource_code,created_at",
                )
                .eq("lesson_id", lesson.id)
                .order("id")
                .range(a, b)
                .abortSignal(signal),
            signal,
          ),
          allRows(
            (a, b) =>
              supabase
                .from("lesson_simulations")
                .select("id,title,created_at")
                .eq("lesson_id", lesson.id)
                .order("id")
                .range(a, b)
                .abortSignal(signal),
            signal,
          ),
          allRows(
            (a, b) =>
              supabase
                .from("questions")
                .select("id,question_type,current_published_revision_id")
                .eq("lesson_id", lesson.id)
                .is("archived_at", null)
                .order("id")
                .range(a, b)
                .abortSignal(signal),
            signal,
          ),
          allRows(
            (a, b) =>
              supabase
                .from("lesson_capability_lifecycle")
                .select("capability,status,applicability,ready_at,draft_updated_at,reviewed_at")
                .eq("lesson_id", lesson.id)
                .order("capability")
                .range(a, b)
                .abortSignal(signal),
            signal,
          ),
        ]);
      const revisions = [];
      for (let i = 0; i < questions.length; i += 100)
        revisions.push(
          ...(await allRows(
            (a, b) =>
              supabase
                .from("question_revisions")
                .select(
                  "id,question_id,educational_label,status,revision_number,interaction_type,grading_mode",
                )
                .in(
                  "question_id",
                  questions.slice(i, i + 100).map((q) => q.id),
                )
                .order("id")
                .range(a, b)
                .abortSignal(signal),
            signal,
          )),
        );
      const counts = summarizeAdminLessonQuestions(questions, revisions);
      const rows = life.map((r) => ({ ...r, ready_snapshot: null })) as LessonLifecycleRow[];
      const base = buildLessonCapabilityContract({
        lessonTitle: lesson.title,
        deliveryMode: lesson.delivery_mode,
        inlineContent: lesson.content_text,
        bookContents: books,
        explanations: explanations.filter((e) => e.content?.trim()),
        summaries,
        resources,
        simulations,
        officialQuestionsCount: counts.officialBook.count,
        selfTestQuestionsCount: counts.selfTest.count,
        assessmentsCount: 0,
        lessonExamCount: 0,
        performanceTrackable: true,
        enhancementsAccessible: true,
      });
      const contract = applyLifecycleOverlay(base, rowsToLifecycleMap(rows));
      // A draft question revision is entered work, not published assessment content.
      for (const [key, role] of [
        ["checkUnderstanding", counts.officialBook],
        ["lessonAssessment", counts.selfTest],
      ] as const) {
        if (role.count > role.publishedCount)
          contract[key] = { ...contract[key], status: "DRAFT", studentVisible: false };
      }
      const { data: gate, error } = await supabase
        .rpc("lesson_student_content_gate", { _lesson_id: lesson.id })
        .abortSignal(signal);
      if (error) throw error;
      const g = Array.isArray(gate) ? gate[0] : gate;
      out.push({
        id: lesson.id,
        title: lesson.title,
        semester: lesson.semester,
        updatedAt: lesson.updated_at,
        cells: reportCells(
          contract,
          rowsToApplicabilityMap(rows),
          Object.fromEntries(rows.map((r) => [r.capability, r.status])),
          g?.visible === true,
          {
            officialBookContent: books.length + (lesson.content_text?.trim() ? 1 : 0),
            tamkeenExplanationHtml: explanations.length,
            lessonSummaryHtml: summaries.length,
            mindMapHtml: resources.filter((r) => r.resource_type === "mindmap").length,
            labExperimentHtml:
              resources.filter((r) => r.resource_type === "experiment").length + simulations.length,
            officialBookQuestions: counts.officialBook.count,
            selfTest: counts.selfTest.count + counts.invalidSelfTestCount,
          },
        ),
      });
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, lessons.length) }, worker));
  return out.sort((a, b) => a.title.localeCompare(b.title, "ar"));
}
