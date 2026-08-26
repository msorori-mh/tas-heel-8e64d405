/**
 * Quick Review data access — Tamkeen native (Mufadala's data layer is REJECTED).
 *
 * Security model: every read below is scoped by the existing RLS gates
 * (`can_access_lesson`, `can_access_subject`, subject↔curriculum-track mapping).
 * The client never re-implements access logic; it only renders what RLS returns.
 *
 * B5 (PostgREST 1000-row cap): every list read is scoped and paginated with an
 * explicit `.range()` loop, so no query can be silently truncated.
 */

import { supabase } from "@/integrations/supabase/client";
import { hasUsableSummary, normalizeKeyPoints, type ReviewItem } from "./review-types";
import { fetchAllPaged } from "./review-paging";

export { REVIEW_PAGE_SIZE, REVIEW_MAX_PAGES, fetchAllPaged } from "./review-paging";

const ID_CHUNK = 100;

export type ReviewSubject = {
  id: string;
  name: string;
  icon: string | null;
  sort_order: number;
};

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

type LessonRow = {
  id: string;
  title: string;
  subject_id: string;
  unit_id: string | null;
  sort_order: number;
  semester: number | null;
  delivery_mode: string;
};

export async function fetchReviewSubjects(gradeId: string): Promise<ReviewSubject[]> {
  // RLS ("Subjects viewable per track assignment") already enforces TCS-2 /
  // shared-subject multi-track visibility for the signed-in student.
  const rows = await fetchAllPaged<ReviewSubject>((from, to) =>
    supabase
      .from("subjects")
      .select("id,name,icon,sort_order")
      .eq("grade_id", gradeId)
      .order("sort_order")
      .order("name")
      .range(from, to),
  );
  return rows;
}

export async function fetchReviewItems(input: {
  subjects: ReviewSubject[];
  userId: string;
}): Promise<ReviewItem[]> {
  const { subjects, userId } = input;
  if (subjects.length === 0) return [];
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
  const subjectIds = subjects.map((s) => s.id);

  // 1) Lessons — scoped per subject batch, paginated.
  const lessons: LessonRow[] = [];
  for (const ids of chunk(subjectIds, 10)) {
    const rows = await fetchAllPaged<LessonRow>((from, to) =>
      supabase
        .from("lessons")
        .select("id,title,subject_id,unit_id,sort_order,semester,delivery_mode")
        .in("subject_id", ids)
        .order("subject_id")
        .order("sort_order")
        .order("title")
        .range(from, to),
    );
    lessons.push(...rows);
  }
  if (lessons.length === 0) return [];

  const lessonIds = lessons.map((l) => l.id);

  // 2) Summaries — the review body. Lessons without one are dropped entirely.
  type SummaryRow = {
    lesson_id: string;
    summary: string | null;
    key_points: unknown;
    study_tip: string | null;
  };
  const summaries: SummaryRow[] = [];
  for (const ids of chunk(lessonIds, ID_CHUNK)) {
    const rows = await fetchAllPaged<SummaryRow>((from, to) =>
      supabase
        .from("lesson_summaries")
        .select("lesson_id,summary,key_points,study_tip")
        .in("lesson_id", ids)
        .order("lesson_id")
        .range(from, to),
    );
    summaries.push(...rows);
  }
  const summaryByLesson = new Map(summaries.map((s) => [s.lesson_id, s]));

  // 3) Units — titles only, for lessons that belong to a unit.
  const unitIds = Array.from(
    new Set(lessons.map((l) => l.unit_id).filter((v): v is string => !!v)),
  );
  const unitTitle = new Map<string, string>();
  for (const ids of chunk(unitIds, ID_CHUNK)) {
    const rows = await fetchAllPaged<{ id: string; title: string }>((from, to) =>
      supabase.from("units").select("id,title").in("id", ids).order("id").range(from, to),
    );
    for (const u of rows) unitTitle.set(u.id, u.title);
  }

  // 4) Completion — read-only. Quick Review never writes progress.
  const completed = new Set<string>();
  for (const ids of chunk(lessonIds, ID_CHUNK)) {
    const rows = await fetchAllPaged<{ lesson_id: string }>((from, to) =>
      supabase
        .from("user_progress")
        .select("lesson_id")
        .eq("user_id", userId)
        .eq("completed", true)
        .in("lesson_id", ids)
        .order("lesson_id")
        .range(from, to),
    );
    for (const r of rows) completed.add(r.lesson_id);
  }

  const items: ReviewItem[] = [];
  lessons.forEach((lesson, index) => {
    const summaryRow = summaryByLesson.get(lesson.id);
    if (!summaryRow || !hasUsableSummary(summaryRow.summary)) return;
    items.push({
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      subjectId: lesson.subject_id,
      subjectName: subjectName.get(lesson.subject_id) ?? "",
      unitId: lesson.unit_id,
      unitTitle: lesson.unit_id ? (unitTitle.get(lesson.unit_id) ?? null) : null,
      summary: (summaryRow.summary ?? "").trim(),
      keyPoints: normalizeKeyPoints(summaryRow.key_points),
      studyTip: summaryRow.study_tip,
      isCompleted: completed.has(lesson.id),
      deliveryMode: lesson.delivery_mode,
      semester: lesson.semester,
      order: lesson.sort_order ?? index,
    });
  });
  return items;
}
