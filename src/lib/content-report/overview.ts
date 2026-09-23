import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_APPLICABILITY,
  V3_CAPABILITIES,
  V3_LABEL_AR,
  V3_TO_LEGACY_KEY,
  type CapabilityApplicability,
  type V3CapabilityKey,
} from "@/lib/lessons/content-v3";
import { allRows } from "./load";

export type OverviewLessonRow = {
  id: string;
  title: string;
  subject_id: string;
  semester: number | null;
  updated_at: string;
};

export type OverviewLifecycleRow = {
  lesson_id: string;
  capability: string;
  status: string;
  applicability: string | null;
};

export type OverviewGateRow = {
  lesson_id: string;
  managed: boolean;
  visible: boolean;
};

export type OverviewSubject = {
  id: string;
  name: string;
  grade_id: string;
  curriculum_track_id: string | null;
};

export type OverviewGrade = { id: string; name: string };
export type OverviewTrack = { id: string; track_name: string };
export type OverviewSubjectTrackLink = { subject_id: string; curriculum_track_id: string };

export type ContentOverviewCatalog = {
  subjects: OverviewSubject[];
  grades: OverviewGrade[];
  tracks: OverviewTrack[];
  links: OverviewSubjectTrackLink[];
};

export type OverviewCapabilityFact = {
  key: V3CapabilityKey;
  label: string;
  applicability: CapabilityApplicability;
  entered: boolean;
  status: "MISSING" | "DRAFT" | "REVIEW" | "READY" | "OTHER";
  ready: boolean;
  published: boolean;
};

export type OverviewLessonFact = {
  id: string;
  title: string;
  subjectId: string;
  semester: number | null;
  updatedAt: string;
  managed: boolean;
  visible: boolean;
  components: OverviewCapabilityFact[];
};

export type OverviewFilters = {
  gradeId?: string;
  trackId?: string;
  subjectId?: string;
  semester?: string;
};

export type OverviewSummary = {
  totalLessons: number;
  managedLessons: number;
  unmanagedLessons: number;
  visibleLessons: number;
  managedVisibleLessons: number;
  managedCompleteLessons: number;
  managedNeedsAttention: number;
  requiredTotal: number;
  requiredEntered: number;
  requiredReady: number;
  requiredPublished: number;
  requiredReview: number;
  requiredDraft: number;
  requiredMissing: number;
  readinessPercent: number | null;
  publicationPercent: number | null;
};

export type OverviewComponentSummary = {
  key: V3CapabilityKey;
  label: string;
  applicable: number;
  required: number;
  optional: number;
  entered: number;
  missing: number;
  draft: number;
  review: number;
  ready: number;
  published: number;
  uploadPercent: number | null;
  readinessPercent: number | null;
  publicationPercent: number | null;
};

export type OverviewDimension = "grade" | "track" | "semester" | "subject" | "lesson";

export type OverviewBreakdownRow = {
  id: string;
  label: string;
  summary: OverviewSummary;
};

export type OverviewAttentionRow = {
  id: string;
  title: string;
  subject: string;
  semester: number | null;
  visible: boolean;
  requiredTotal: number;
  requiredReady: number;
  missingLabels: string[];
  reviewLabels: string[];
  draftLabels: string[];
};

function normalizeApplicability(
  value: string | null | undefined,
  fallback: CapabilityApplicability,
): CapabilityApplicability {
  return value === "REQUIRED" || value === "OPTIONAL" || value === "NA" ? value : fallback;
}

function normalizeStatus(value: string | null | undefined): OverviewCapabilityFact["status"] {
  if (value === "DRAFT" || value === "REVIEW" || value === "READY") return value;
  if (!value) return "MISSING";
  return "OTHER";
}

export function buildOverviewFacts(
  lessons: OverviewLessonRow[],
  lifecycle: OverviewLifecycleRow[],
  gates: OverviewGateRow[],
): OverviewLessonFact[] {
  const lifecycleByLesson = new Map<string, Map<string, OverviewLifecycleRow>>();
  for (const row of lifecycle) {
    let map = lifecycleByLesson.get(row.lesson_id);
    if (!map) {
      map = new Map();
      lifecycleByLesson.set(row.lesson_id, map);
    }
    map.set(row.capability, row);
  }
  const gateByLesson = new Map(gates.map((row) => [row.lesson_id, row]));

  return lessons.map((lesson) => {
    const gate = gateByLesson.get(lesson.id) ?? {
      lesson_id: lesson.id,
      managed: false,
      visible: true,
    };
    const rows = lifecycleByLesson.get(lesson.id) ?? new Map<string, OverviewLifecycleRow>();
    const components = V3_CAPABILITIES.map((key) => {
      const legacyKey = V3_TO_LEGACY_KEY[key];
      const row = rows.get(legacyKey) ?? rows.get(key);
      const applicability = normalizeApplicability(row?.applicability, DEFAULT_APPLICABILITY[key]);
      const status = normalizeStatus(row?.status);
      const ready = status === "READY";
      return {
        key,
        label: V3_LABEL_AR[key],
        applicability,
        entered: Boolean(row),
        status,
        ready,
        published: ready && gate.visible,
      } satisfies OverviewCapabilityFact;
    });

    return {
      id: lesson.id,
      title: lesson.title,
      subjectId: lesson.subject_id,
      semester: lesson.semester,
      updatedAt: lesson.updated_at,
      managed: gate.managed,
      visible: gate.visible,
      components,
    };
  });
}

export async function loadContentOverview(signal: AbortSignal): Promise<OverviewLessonFact[]> {
  const [lessons, lifecycle] = await Promise.all([
    allRows<OverviewLessonRow>(
      (a, b) =>
        supabase
          .from("lessons")
          .select("id,title,subject_id,semester,updated_at")
          .order("id")
          .range(a, b)
          .abortSignal(signal),
      signal,
    ),
    allRows<OverviewLifecycleRow>(
      (a, b) =>
        supabase
          .from("lesson_capability_lifecycle")
          .select("lesson_id,capability,status,applicability")
          .order("lesson_id")
          .order("capability")
          .range(a, b)
          .abortSignal(signal),
      signal,
    ),
  ]);

  const gates: OverviewGateRow[] = [];
  for (let i = 0; i < lessons.length; i += 200) {
    signal.throwIfAborted();
    const ids = lessons.slice(i, i + 200).map((lesson) => lesson.id);
    const { data, error } = await supabase
      .rpc("lessons_student_visible", { _lesson_ids: ids })
      .abortSignal(signal);
    if (error) throw new Error(error.message);
    gates.push(...((data ?? []) as OverviewGateRow[]));
  }

  const returned = new Set(gates.map((gate) => gate.lesson_id));
  if (lessons.some((lesson) => !returned.has(lesson.id))) {
    throw new Error("تعذر التحقق من إتاحة بعض الدروس؛ أُلغي التقرير العام لمنع عرض أرقام جزئية.");
  }

  return buildOverviewFacts(lessons, lifecycle, gates);
}

export function subjectTrackIds(subject: OverviewSubject, catalog: ContentOverviewCatalog): string[] {
  const ids = new Set<string>();
  if (subject.curriculum_track_id) ids.add(subject.curriculum_track_id);
  for (const link of catalog.links) {
    if (link.subject_id === subject.id) ids.add(link.curriculum_track_id);
  }
  return [...ids];
}

export function scopeOverviewFacts(
  facts: OverviewLessonFact[],
  catalog: ContentOverviewCatalog,
  filters: OverviewFilters,
): OverviewLessonFact[] {
  const subjectById = new Map(catalog.subjects.map((subject) => [subject.id, subject]));
  return facts.filter((fact) => {
    const subject = subjectById.get(fact.subjectId);
    if (!subject) return false;
    if (filters.gradeId && subject.grade_id !== filters.gradeId) return false;
    if (filters.subjectId && subject.id !== filters.subjectId) return false;
    if (filters.semester && String(fact.semester ?? "") !== filters.semester) return false;
    if (filters.trackId && !subjectTrackIds(subject, catalog).includes(filters.trackId)) return false;
    return true;
  });
}

export function overviewSummary(facts: OverviewLessonFact[]): OverviewSummary {
  const managed = facts.filter((fact) => fact.managed);
  const required = managed.flatMap((fact) =>
    fact.components.filter((component) => component.applicability === "REQUIRED"),
  );
  const requiredReady = required.filter((component) => component.ready).length;
  const requiredPublished = required.filter((component) => component.published).length;
  const managedCompleteLessons = managed.filter((fact) => {
    const needed = fact.components.filter((component) => component.applicability === "REQUIRED");
    return needed.length > 0 && needed.every((component) => component.ready);
  }).length;

  return {
    totalLessons: facts.length,
    managedLessons: managed.length,
    unmanagedLessons: facts.length - managed.length,
    visibleLessons: facts.filter((fact) => fact.visible).length,
    managedVisibleLessons: managed.filter((fact) => fact.visible).length,
    managedCompleteLessons,
    managedNeedsAttention: managed.length - managedCompleteLessons,
    requiredTotal: required.length,
    requiredEntered: required.filter((component) => component.entered).length,
    requiredReady,
    requiredPublished,
    requiredReview: required.filter((component) => component.status === "REVIEW").length,
    requiredDraft: required.filter(
      (component) => component.status === "DRAFT" || component.status === "OTHER",
    ).length,
    requiredMissing: required.filter((component) => component.status === "MISSING").length,
    readinessPercent: required.length ? Math.round((requiredReady / required.length) * 100) : null,
    publicationPercent: required.length
      ? Math.round((requiredPublished / required.length) * 100)
      : null,
  };
}

export function overviewComponentSummary(
  facts: OverviewLessonFact[],
): OverviewComponentSummary[] {
  const managed = facts.filter((fact) => fact.managed);
  return V3_CAPABILITIES.map((key) => {
    const cells = managed
      .map((fact) => fact.components.find((component) => component.key === key))
      .filter((component): component is OverviewCapabilityFact => Boolean(component))
      .filter((component) => component.applicability !== "NA");
    const entered = cells.filter((component) => component.entered).length;
    const ready = cells.filter((component) => component.ready).length;
    const published = cells.filter((component) => component.published).length;
    return {
      key,
      label: V3_LABEL_AR[key],
      applicable: cells.length,
      required: cells.filter((component) => component.applicability === "REQUIRED").length,
      optional: cells.filter((component) => component.applicability === "OPTIONAL").length,
      entered,
      missing: cells.filter((component) => component.status === "MISSING").length,
      draft: cells.filter(
        (component) => component.status === "DRAFT" || component.status === "OTHER",
      ).length,
      review: cells.filter((component) => component.status === "REVIEW").length,
      ready,
      published,
      uploadPercent: cells.length ? Math.round((entered / cells.length) * 100) : null,
      readinessPercent: cells.length ? Math.round((ready / cells.length) * 100) : null,
      publicationPercent: cells.length ? Math.round((published / cells.length) * 100) : null,
    };
  });
}

function addToGroup(
  groups: Map<string, { label: string; facts: OverviewLessonFact[] }>,
  id: string,
  label: string,
  fact: OverviewLessonFact,
) {
  const current = groups.get(id);
  if (current) current.facts.push(fact);
  else groups.set(id, { label, facts: [fact] });
}

export function overviewBreakdown(
  facts: OverviewLessonFact[],
  catalog: ContentOverviewCatalog,
  dimension: OverviewDimension,
): OverviewBreakdownRow[] {
  const groups = new Map<string, { label: string; facts: OverviewLessonFact[] }>();
  const subjectById = new Map(catalog.subjects.map((subject) => [subject.id, subject]));
  const gradeById = new Map(catalog.grades.map((grade) => [grade.id, grade.name]));
  const trackById = new Map(catalog.tracks.map((track) => [track.id, track.track_name]));

  for (const fact of facts) {
    const subject = subjectById.get(fact.subjectId);
    if (!subject) continue;
    if (dimension === "grade") {
      addToGroup(groups, subject.grade_id, gradeById.get(subject.grade_id) ?? "صف غير معروف", fact);
    } else if (dimension === "subject") {
      addToGroup(groups, subject.id, subject.name, fact);
    } else if (dimension === "lesson") {
      addToGroup(groups, fact.id, `${subject.name} — ${fact.title}`, fact);
    } else if (dimension === "semester") {
      const id = fact.semester == null ? "unknown" : String(fact.semester);
      const label = fact.semester == null ? "فصل غير محدد" : `الفصل ${fact.semester}`;
      addToGroup(groups, id, label, fact);
    } else {
      const trackIds = subjectTrackIds(subject, catalog);
      if (!trackIds.length) addToGroup(groups, "unassigned", "منهج غير محدد", fact);
      for (const trackId of trackIds) {
        addToGroup(groups, trackId, trackById.get(trackId) ?? "منهج غير معروف", fact);
      }
    }
  }

  return [...groups.entries()]
    .map(([id, group]) => ({ id, label: group.label, summary: overviewSummary(group.facts) }))
    .sort((a, b) => a.label.localeCompare(b.label, "ar"));
}

export function overviewAttentionRows(
  facts: OverviewLessonFact[],
  catalog: ContentOverviewCatalog,
  limit = 25,
): OverviewAttentionRow[] {
  const subjectById = new Map(catalog.subjects.map((subject) => [subject.id, subject.name]));
  return facts
    .filter((fact) => fact.managed)
    .map((fact) => {
      const required = fact.components.filter(
        (component) => component.applicability === "REQUIRED",
      );
      return {
        id: fact.id,
        title: fact.title,
        subject: subjectById.get(fact.subjectId) ?? "مادة غير معروفة",
        semester: fact.semester,
        visible: fact.visible,
        requiredTotal: required.length,
        requiredReady: required.filter((component) => component.ready).length,
        missingLabels: required
          .filter((component) => component.status === "MISSING")
          .map((component) => component.label),
        reviewLabels: required
          .filter((component) => component.status === "REVIEW")
          .map((component) => component.label),
        draftLabels: required
          .filter(
            (component) => component.status === "DRAFT" || component.status === "OTHER",
          )
          .map((component) => component.label),
      };
    })
    .filter((row) => row.requiredReady < row.requiredTotal)
    .sort((a, b) => {
      const gapA = a.requiredTotal - a.requiredReady;
      const gapB = b.requiredTotal - b.requiredReady;
      return gapB - gapA || a.subject.localeCompare(b.subject, "ar") || a.title.localeCompare(b.title, "ar");
    })
    .slice(0, limit);
}
