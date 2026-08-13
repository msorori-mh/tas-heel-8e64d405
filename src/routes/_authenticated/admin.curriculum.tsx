import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useRequireAdminSection } from "@/lib/admin-route-access";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  FileSpreadsheet,
  Layers,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  CurriculumDeleteDialog,
  type CurriculumDeleteTarget,
} from "@/components/admin/CurriculumDeleteDialog";

export const Route = createFileRoute("/_authenticated/admin/curriculum")({
  component: AdminCurriculumPage,
  head: () => ({
    meta: [
      { title: "إدارة المناهج | لوحة تمكين" },
      {
        name: "description",
        content: "شجرة المناهج الكاملة: الصفوف والمسارات والمواد والوحدات والدروس مع إضافة وتعديل وحذف آمن.",
      },
      { property: "og:title", content: "إدارة المناهج | لوحة تمكين" },
      {
        property: "og:description",
        content: "إدارة هرم المناهج بالكامل مع معاينة أثر الحذف قبل التنفيذ.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Grade = { id: string; name: string; slug: string; sort_order: number | null };
type Track = { id: string; track_name: string; track_code: string };
type Subject = {
  id: string;
  name: string;
  code: string | null;
  slug: string;
  grade_id: string;
  curriculum_track_id: string | null;
  group_code: string | null;
  group_name: string | null;
  sort_order: number | null;
};
type Unit = { id: string; title: string; code: string | null; subject_id: string; sort_order: number | null };
type Lesson = {
  id: string;
  title: string;
  slug: string;
  subject_id: string;
  unit_id: string | null;
  sort_order: number | null;
};

function CodeBadge({ code }: { code: string | null }) {
  if (!code) {
    return (
      <span className="rounded-md bg-destructive/10 px-2 py-0.5 font-mono text-[11px] text-destructive">
        بلا كود
      </span>
    );
  }
  return (
    <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
      {code}
    </span>
  );
}

function RowActions({
  onDelete,
  editTo,
}: {
  onDelete: () => void;
  editTo?: { to: string };
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {editTo && (
        <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="تعديل">
          <Link to={editTo.to}>
            <Pencil className="h-3.5 w-3.5" />
          </Link>
        </Button>
      )}
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-destructive hover:text-destructive"
        title="حذف"
        onClick={onDelete}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function AdminCurriculumPage() {
  const { loading, enabled } = useRequireAdminSection("content");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [target, setTarget] = useState<CurriculumDeleteTarget | null>(null);

  const toggle = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const treeQ = useQuery({
    enabled,
    queryKey: ["admin-curriculum", "tree"],
    queryFn: async () => {
      const [grades, tracks, subjects, units, lessons] = await Promise.all([
        supabase.from("grades").select("id, name, slug, sort_order").order("sort_order"),
        supabase.from("curriculum_tracks").select("id, track_name, track_code"),
        supabase
          .from("subjects")
          .select("id, name, code, slug, grade_id, curriculum_track_id, group_code, group_name, sort_order")
          .order("sort_order"),
        supabase.from("units").select("id, title, code, subject_id, sort_order").order("sort_order"),
        supabase
          .from("lessons")
          .select("id, title, slug, subject_id, unit_id, sort_order")
          .order("sort_order"),
      ]);
      for (const r of [grades, tracks, subjects, units, lessons]) {
        if (r.error) throw r.error;
      }
      return {
        grades: (grades.data ?? []) as Grade[],
        tracks: (tracks.data ?? []) as Track[],
        subjects: (subjects.data ?? []) as Subject[],
        units: (units.data ?? []) as Unit[],
        lessons: (lessons.data ?? []) as Lesson[],
      };
    },
  });

  const data = treeQ.data;

  const totals = useMemo(() => {
    if (!data) return null;
    return {
      subjects: data.subjects.length,
      units: data.units.length,
      lessons: data.lessons.length,
      uncoded: data.subjects.filter((s) => !s.code).length,
    };
  }, [data]);

  if (loading || !enabled) {
    return (
      <AdminLayout>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6" dir="rtl">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">إدارة المناهج</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              الهرم الكامل: الصف ← المسار ← المجموعة ← المادة ← الوحدة ← الدرس.
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/admin/import">
                <FileSpreadsheet className="ml-2 h-4 w-4" />
                استيراد من Excel
              </Link>
            </Button>
            <Button asChild>
              <Link to="/admin/subjects">
                <BookOpen className="ml-2 h-4 w-4" />
                إضافة مادة
              </Link>
            </Button>
          </div>
        </header>

        {totals && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "المواد", value: totals.subjects },
              { label: "الوحدات", value: totals.units },
              { label: "الدروس", value: totals.lessons },
              { label: "مواد بلا كود", value: totals.uncoded },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {treeQ.isLoading && (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {treeQ.isError && (
          <p className="text-sm text-destructive">
            تعذر تحميل الشجرة: {(treeQ.error as Error).message}
          </p>
        )}

        {data && data.subjects.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-10 text-center">
            <p className="text-sm text-muted-foreground">
              لا توجد أي مادة بعد. ابدأ بإضافة مادة أو استيراد القوالب.
            </p>
          </div>
        )}

        {data && data.subjects.length > 0 && (
          <div className="space-y-3">
            {data.grades.map((grade) => {
              const gradeSubjects = data.subjects.filter((s) => s.grade_id === grade.id);
              if (gradeSubjects.length === 0) return null;
              const gKey = `g:${grade.id}`;
              const gOpen = expanded[gKey] ?? true;

              const trackIds = Array.from(
                new Set(gradeSubjects.map((s) => s.curriculum_track_id ?? "none")),
              );

              return (
                <div key={grade.id} className="rounded-xl border border-border bg-card">
                  <button
                    className="flex w-full items-center gap-2 px-4 py-3 text-right"
                    onClick={() => toggle(gKey)}
                  >
                    {gOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="font-semibold text-foreground">{grade.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({gradeSubjects.length} مادة)
                    </span>
                  </button>

                  {gOpen && (
                    <div className="space-y-2 border-t border-border p-3">
                      {trackIds.map((trackId) => {
                        const track = data.tracks.find((t) => t.id === trackId);
                        const trackSubjects = gradeSubjects.filter(
                          (s) => (s.curriculum_track_id ?? "none") === trackId,
                        );
                        const groups = Array.from(
                          new Set(trackSubjects.map((s) => s.group_code ?? "")),
                        );

                        return (
                          <div key={trackId} className="rounded-lg bg-muted/30 p-3">
                            <p className="mb-2 text-xs font-medium text-muted-foreground">
                              المسار: {track ? track.track_name : "غير محدد"}
                            </p>

                            <div className="space-y-2">
                              {groups.map((groupCode) => {
                                const groupSubjects = trackSubjects.filter(
                                  (s) => (s.group_code ?? "") === groupCode,
                                );
                                const groupName = groupSubjects[0]?.group_name;

                                const content = groupSubjects.map((subject) => {
                                  const sKey = `s:${subject.id}`;
                                  const sOpen = expanded[sKey] ?? false;
                                  const subjectUnits = data.units.filter(
                                    (u) => u.subject_id === subject.id,
                                  );
                                  const directLessons = data.lessons.filter(
                                    (l) => l.subject_id === subject.id && !l.unit_id,
                                  );

                                  return (
                                    <div
                                      key={subject.id}
                                      className="rounded-lg border border-border bg-card"
                                    >
                                      <div className="flex items-center gap-2 px-3 py-2">
                                        <button
                                          className="flex flex-1 items-center gap-2 text-right"
                                          onClick={() => toggle(sKey)}
                                        >
                                          {sOpen ? (
                                            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                                          ) : (
                                            <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
                                          )}
                                          <BookOpen className="h-4 w-4 shrink-0 text-primary" />
                                          <span className="text-sm font-medium text-foreground">
                                            {subject.name}
                                          </span>
                                          <CodeBadge code={subject.code} />
                                          <span className="text-xs text-muted-foreground">
                                            {subjectUnits.length} وحدة ·{" "}
                                            {
                                              data.lessons.filter(
                                                (l) => l.subject_id === subject.id,
                                              ).length
                                            }{" "}
                                            درس
                                          </span>
                                        </button>
                                        <RowActions
                                          editTo={{ to: "/admin/subjects" }}
                                          onDelete={() =>
                                            setTarget({
                                              type: "subject",
                                              id: subject.id,
                                              label: subject.name,
                                            })
                                          }
                                        />
                                      </div>

                                      {sOpen && (
                                        <div className="space-y-1 border-t border-border p-2 pr-6">
                                          {subjectUnits.length === 0 &&
                                            directLessons.length === 0 && (
                                              <p className="px-2 py-1 text-xs text-muted-foreground">
                                                لا توجد وحدات أو دروس.
                                              </p>
                                            )}

                                          {subjectUnits.map((unit) => {
                                            const uKey = `u:${unit.id}`;
                                            const uOpen = expanded[uKey] ?? false;
                                            const unitLessons = data.lessons.filter(
                                              (l) => l.unit_id === unit.id,
                                            );
                                            return (
                                              <div key={unit.id} className="rounded-md">
                                                <div className="flex items-center gap-2 px-2 py-1.5">
                                                  <button
                                                    className="flex flex-1 items-center gap-2 text-right"
                                                    onClick={() => toggle(uKey)}
                                                  >
                                                    {uOpen ? (
                                                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                                    ) : (
                                                      <ChevronLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                                    )}
                                                    <Layers className="h-3.5 w-3.5 shrink-0 text-accent" />
                                                    <span className="text-sm text-foreground">
                                                      {unit.title}
                                                    </span>
                                                    <CodeBadge code={unit.code} />
                                                    <span className="text-xs text-muted-foreground">
                                                      {unitLessons.length} درس
                                                    </span>
                                                  </button>
                                                  <RowActions
                                                    editTo={{ to: "/admin/units" }}
                                                    onDelete={() =>
                                                      setTarget({
                                                        type: "unit",
                                                        id: unit.id,
                                                        label: unit.title,
                                                      })
                                                    }
                                                  />
                                                </div>

                                                {uOpen && (
                                                  <div className="space-y-1 pr-6">
                                                    {unitLessons.length === 0 && (
                                                      <p className="px-2 py-1 text-xs text-muted-foreground">
                                                        لا توجد دروس.
                                                      </p>
                                                    )}
                                                    {unitLessons.map((lesson) => (
                                                      <LessonRow
                                                        key={lesson.id}
                                                        lesson={lesson}
                                                        onDelete={() =>
                                                          setTarget({
                                                            type: "lesson",
                                                            id: lesson.id,
                                                            label: lesson.title,
                                                          })
                                                        }
                                                      />
                                                    ))}
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}

                                          {directLessons.map((lesson) => (
                                            <LessonRow
                                              key={lesson.id}
                                              lesson={lesson}
                                              onDelete={() =>
                                                setTarget({
                                                  type: "lesson",
                                                  id: lesson.id,
                                                  label: lesson.title,
                                                })
                                              }
                                            />
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                });

                                if (!groupCode) {
                                  return (
                                    <div key="ungrouped" className="space-y-2">
                                      {content}
                                    </div>
                                  );
                                }

                                return (
                                  <div
                                    key={groupCode}
                                    className="rounded-lg border border-dashed border-border p-2"
                                  >
                                    <p className="mb-2 px-1 text-xs font-semibold text-foreground">
                                      {groupName ?? groupCode}
                                      <span className="mr-2 font-mono text-[11px] text-muted-foreground">
                                        {groupCode}
                                      </span>
                                    </p>
                                    <div className="space-y-2">{content}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CurriculumDeleteDialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        target={target}
        onDeleted={() => treeQ.refetch()}
      />
    </AdminLayout>
  );
}

function LessonRow({ lesson, onDelete }: { lesson: Lesson; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <div className="flex flex-1 items-center gap-2">
        <span className="text-sm text-foreground">{lesson.title}</span>
        <CodeBadge code={lesson.slug} />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="تعديل">
          <Link to="/admin/lessons/$lessonId" params={{ lessonId: lesson.id }}>
            <Pencil className="h-3.5 w-3.5" />
          </Link>
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-destructive hover:text-destructive"
          title="حذف"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
