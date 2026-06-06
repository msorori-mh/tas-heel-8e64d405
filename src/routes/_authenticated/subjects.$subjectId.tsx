import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { StateMessage } from "@/components/student/StudentNav";
import { Button } from "@/components/ui/button";
import { ClipboardList, ChevronLeft, BookOpen, Layers, FileText, Home } from "lucide-react";

export const Route = createFileRoute("/_authenticated/subjects/$subjectId")({
  component: SubjectIndexPage,
});

type Subject = {
  id: string;
  name: string;
  grade_id: string;
  curriculum_track_id: string | null;
};

type Unit = {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  is_free: boolean;
};

type Lesson = {
  id: string;
  title: string;
  duration: string | null;
  unit_id: string | null;
  sort_order: number;
};

function SubjectIndexPage() {
  const { subjectId } = Route.useParams();
  const { profile } = useAuth();

  const { data: subject, isLoading: loadingSubject } = useQuery({
    queryKey: ["subject-meta", subjectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id,name,grade_id,curriculum_track_id")
        .eq("id", subjectId)
        .maybeSingle();
      if (error) throw error;
      return data as Subject | null;
    },
  });

  const accessible = useMemo(() => {
    if (!subject || !profile) return null;
    const profileGrade = profile.grade_uuid ?? (profile.grade_id ? String(profile.grade_id) : null);
    if (profileGrade && subject.grade_id !== profileGrade) return false;
    if (
      subject.curriculum_track_id &&
      profile.curriculum_track_id &&
      subject.curriculum_track_id !== profile.curriculum_track_id
    ) {
      return false;
    }
    return true;
  }, [subject, profile]);

  const { data, isLoading, error } = useQuery({
    enabled: !!subject && accessible === true,
    queryKey: ["subject-index", subjectId],
    queryFn: async () => {
      const [u, l] = await Promise.all([
        supabase
          .from("units")
          .select("id,title,description,sort_order,is_free")
          .eq("subject_id", subjectId)
          .order("sort_order")
          .order("title"),
        supabase
          .from("lessons")
          .select("id,title,duration,unit_id,sort_order")
          .eq("subject_id", subjectId)
          .order("sort_order")
          .order("title"),
      ]);
      if (u.error) throw u.error;
      if (l.error) throw l.error;
      return {
        units: (u.data ?? []) as Unit[],
        lessons: (l.data ?? []) as Lesson[],
      };
    },
  });

  if (loadingSubject) return <StateMessage variant="loading">جارٍ التحميل…</StateMessage>;
  if (!subject || accessible === false) {
    return (
      <div>
        <Breadcrumbs subjectName={null} />
        <StateMessage>هذه المادة غير متاحة.</StateMessage>
        <div className="mt-4 text-center">
          <Button asChild variant="outline">
            <Link to="/app"><Home className="ml-1 h-4 w-4" /> العودة إلى موادي</Link>
          </Button>
        </div>
      </div>
    );
  }
  if (isLoading) return <StateMessage variant="loading">جارٍ تحميل الفهرس…</StateMessage>;
  if (error) return <StateMessage variant="error">تعذّر تحميل فهرس المادة.</StateMessage>;

  const units = data?.units ?? [];
  const lessons = data?.lessons ?? [];

  const lessonsByUnit = new Map<string | null, Lesson[]>();
  for (const ls of lessons) {
    const k = ls.unit_id ?? null;
    if (!lessonsByUnit.has(k)) lessonsByUnit.set(k, []);
    lessonsByUnit.get(k)!.push(ls);
  }
  const orphans = lessonsByUnit.get(null) ?? [];
  const hasAny = units.length > 0 || lessons.length > 0;

  return (
    <div className="space-y-5">
      <Breadcrumbs subjectName={subject.name} />

      <header className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <h1 className="text-xl font-bold text-foreground">{subject.name}</h1>
        <p className="mt-1 text-xs text-muted-foreground">فهرس المادة</p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Layers className="h-3.5 w-3.5" /> {units.length} وحدة
          </span>
          <span className="inline-flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" /> {lessons.length} درس
          </span>
        </div>
      </header>

      {!hasAny && <StateMessage>لم تُضاف دروس لهذه المادة بعد.</StateMessage>}

      {hasAny && (
        <p className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
          المحتوى الأساسي لكل درس متاح، وبعض الإضافات قد تتطلب اشتراكًا.
        </p>
      )}

      <div className="space-y-5">
        {units.map((u, idx) => {
          const items = lessonsByUnit.get(u.id) ?? [];
          return (
            <UnitBlock
              key={u.id}
              index={idx + 1}
              title={u.title}
              description={u.description}
              isFree={u.is_free}
              lessons={items}
            />
          );
        })}

        {orphans.length > 0 && (
          <UnitBlock title="دروس أخرى" description={null} isFree={null} lessons={orphans} />
        )}
      </div>

      <div className="pt-2">
        <Button asChild variant="outline" className="gap-1">
          <Link to="/app"><Home className="h-4 w-4" /> العودة إلى موادي</Link>
        </Button>
      </div>
    </div>
  );
}

function Breadcrumbs({ subjectName }: { subjectName: string | null }) {
  return (
    <nav className="text-xs text-muted-foreground" aria-label="مسار التنقل">
      <Link to="/app" className="hover:text-primary">موادي</Link>
      <span className="mx-1">/</span>
      <span className="text-foreground">{subjectName ?? "المادة"}</span>
    </nav>
  );
}

function UnitBlock({
  index,
  title,
  description,
  isFree,
  lessons,
}: {
  index?: number;
  title: string;
  description: string | null;
  isFree: boolean | null;
  lessons: Lesson[];
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-foreground">
            {index ? <span className="text-muted-foreground">الوحدة {index}: </span> : null}
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{description}</p>
          )}
        </div>
        {isFree !== null && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              isFree
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
            }`}
          >
            {isFree ? "مجانية" : "ضمن الاشتراك"}
          </span>
        )}
      </div>

      {lessons.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">لا توجد دروس في هذه الوحدة بعد.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {lessons.map((l) => (
            <li key={l.id}>
              <Link
                to="/lessons/$lessonId"
                params={{ lessonId: l.id }}
                className="flex items-center justify-between rounded-lg border border-border bg-background p-3 transition-colors hover:bg-secondary/40"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                    <BookOpen className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{l.title}</div>
                    {l.duration && (
                      <div className="text-xs text-muted-foreground">{l.duration}</div>
                    )}
                  </div>
                </div>
                <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
