/**
 * OFFICIAL_CONTENT_CODE_SYSTEM_13B — read-only code registry.
 *
 * Server-only. Reads master data (grades, curriculum_tracks) and the codes that
 * already exist in the curriculum tables so the TCS-1 allocator can pick the
 * next free number. Zero writes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  CONTENT_CODE_SCHEME_VERSION,
  nextAllocatedNumber,
  parseTcs1Code,
} from "./tcs1";
import { TCS1_GRADES, TCS1_TRACKS } from "./tcs1-master-data";
import type {
  CodeRegistryLesson,
  CodeRegistrySubject,
  CodeRegistryUnit,
  ContentCodeRegistry,
} from "./content-codes.types";

type AnyClient = SupabaseClient<Database>;

export async function loadContentCodeRegistry(
  supabase: AnyClient,
): Promise<ContentCodeRegistry> {
  const [gradesRes, tracksRes, subjectsRes, unitsRes, lessonsRes] = await Promise.all([
    supabase.from("grades").select("id, slug, name").order("sort_order", { ascending: true }),
    supabase.from("curriculum_tracks").select("id, track_code, track_name"),
    supabase
      .from("subjects")
      .select("id, code, name, group_code, group_name, grade_id, curriculum_track_id")
      .order("code", { ascending: true }),
    supabase.from("units").select("id, code, title, subject_id").order("code", { ascending: true }),
    supabase.from("lessons").select("id, slug, title, subject_id, unit_id").order("slug", { ascending: true }),
  ]);

  const firstError =
    gradesRes.error ?? tracksRes.error ?? subjectsRes.error ?? unitsRes.error ?? lessonsRes.error;
  if (firstError) {
    throw new Error(`تعذر قراءة سجل الأكواد: ${firstError.message}`);
  }

  const gradeSlugById = new Map<string, string>();
  for (const g of gradesRes.data ?? []) gradeSlugById.set(g.id, g.slug);

  const trackCodeById = new Map<string, string>();
  for (const t of tracksRes.data ?? []) trackCodeById.set(t.id, t.track_code);

  const nonConformingCodes: string[] = [];

  const subjectById = new Map<string, CodeRegistrySubject>();
  const subjects: CodeRegistrySubject[] = [];
  for (const s of subjectsRes.data ?? []) {
    const code = (s.code ?? "").trim();
    const parsed = code ? parseTcs1Code(code) : null;
    if (code && (!parsed || parsed.kind !== "subject")) nonConformingCodes.push(code);
    const row: CodeRegistrySubject = {
      subjectCode: code,
      name: s.name ?? "",
      gradeSlug: (s.grade_id ? gradeSlugById.get(s.grade_id) : null) ?? parsed?.gradeSlug ?? "",
      trackCode:
        (s.curriculum_track_id ? trackCodeById.get(s.curriculum_track_id) : null) ??
        parsed?.trackCode ??
        "",
      groupCode: s.group_code ?? null,
      groupName: s.group_name ?? null,
      subjectNo: parsed?.kind === "subject" ? (parsed.numbers[0] ?? null) : null,
      isTcs1: parsed?.kind === "subject",
    };
    subjects.push(row);
    subjectById.set(s.id, row);
  }

  const units: CodeRegistryUnit[] = [];
  const unitCodeById = new Map<string, string>();
  for (const u of unitsRes.data ?? []) {
    const code = (u.code ?? "").trim();
    if (code && parseTcs1Code(code)?.kind !== "unit") nonConformingCodes.push(code);
    unitCodeById.set(u.id, code);
    units.push({
      unitCode: code,
      subjectCode: (u.subject_id ? subjectById.get(u.subject_id)?.subjectCode : "") ?? "",
      title: u.title ?? "",
    });
  }

  const lessons: CodeRegistryLesson[] = [];
  for (const l of lessonsRes.data ?? []) {
    const code = (l.slug ?? "").trim();
    if (code && parseTcs1Code(code)?.kind !== "lesson") nonConformingCodes.push(code);
    lessons.push({
      lessonCode: code,
      subjectCode: (l.subject_id ? subjectById.get(l.subject_id)?.subjectCode : "") ?? "",
      unitCode: (l.unit_id ? unitCodeById.get(l.unit_id) : null) ?? null,
      title: l.title ?? "",
    });
  }

  const subjectCodes = subjects.map((s) => s.subjectCode).filter(Boolean);
  const groupCodes = subjects.map((s) => s.groupCode ?? "").filter(Boolean);

  const allocations = TCS1_GRADES.flatMap((grade) =>
    TCS1_TRACKS.map((track) => {
      const scope = { gradeSlug: grade.gradeSlug, trackCode: track.trackCode };
      return {
        gradeSlug: grade.gradeSlug,
        trackCode: track.trackCode,
        nextSubjectNo: nextAllocatedNumber(subjectCodes, "subject", scope),
        nextGroupNo: nextAllocatedNumber(groupCodes, "group", scope),
        subjectCount: subjects.filter(
          (s) => s.gradeSlug === grade.gradeSlug && s.trackCode === track.trackCode,
        ).length,
      };
    }),
  );

  return {
    schemeVersion: CONTENT_CODE_SCHEME_VERSION,
    grades: TCS1_GRADES.map((g) => ({
      gradeSlug: g.gradeSlug,
      gradeShort: g.gradeShort,
      nameAr: (gradesRes.data ?? []).find((row) => row.slug === g.gradeSlug)?.name ?? g.nameAr,
    })),
    tracks: TCS1_TRACKS.map((t) => ({
      trackCode: t.trackCode,
      nameAr: (tracksRes.data ?? []).find((row) => row.track_code === t.trackCode)?.track_name ?? t.nameAr,
    })),
    subjects,
    units,
    lessons,
    allocations,
    nonConformingCodes: [...new Set(nonConformingCodes)],
    generatedAt: new Date().toISOString(),
  };
}

/** All question codes — needed to allocate the next question number. */
export async function loadQuestionCodes(supabase: AnyClient): Promise<string[]> {
  const { data, error } = await supabase.from("questions").select("code").limit(10000);
  if (error) throw new Error(`تعذر قراءة أكواد الأسئلة: ${error.message}`);
  return (data ?? []).map((r) => (r.code ?? "").trim()).filter(Boolean);
}

/** Existing child codes of a lesson-scoped template (explanations/resources/assessments). */
export async function loadLessonChildCodes(
  supabase: AnyClient,
  templateKey: "explanations" | "resources" | "assessments",
): Promise<string[]> {
  if (templateKey === "explanations") {
    const { data, error } = await supabase
      .from("lesson_explanations")
      .select("explanation_code")
      .limit(10000);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => (r.explanation_code ?? "").trim()).filter(Boolean);
  }
  if (templateKey === "resources") {
    const { data, error } = await supabase
      .from("lesson_resources")
      .select("resource_code")
      .limit(10000);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => (r.resource_code ?? "").trim()).filter(Boolean);
  }
  const { data, error } = await supabase
    .from("lesson_assessments")
    .select("assessment_code")
    .limit(10000);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => (r.assessment_code ?? "").trim()).filter(Boolean);
}
