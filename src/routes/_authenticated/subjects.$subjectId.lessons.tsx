import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StateMessage } from "@/components/student/StudentNav";
import { ChevronLeft, PlayCircle, Lock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/subjects/$subjectId/lessons")({
  component: LessonsPage,
});

type Unit = { id: string; title: string; description: string | null; sort_order: number };
type Lesson = {
  id: string;
  title: string;
  duration: string | null;
  unit_id: string | null;
  is_free: boolean;
  sort_order: number;
};

function LessonsPage() {
  const { subjectId } = Route.useParams();

  const { data: subject } = useQuery({
    queryKey: ["subject", subjectId],
    queryFn: async () => {
      const { data } = await supabase
        .from("subjects")
        .select("id,name")
        .eq("id", subjectId)
        .maybeSingle();
      return data;
    },
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["units-and-lessons", subjectId],
    queryFn: async () => {
      const [u, l] = await Promise.all([
        supabase
          .from("units")
          .select("id,title,description,sort_order")
          .eq("subject_id", subjectId)
          .order("sort_order"),
        supabase
          .from("lessons")
          .select("id,title,duration,unit_id,is_free,sort_order")
          .eq("subject_id", subjectId)
          .order("sort_order"),
      ]);
      if (u.error) throw u.error;
      if (l.error) throw l.error;
      return {
        units: (u.data ?? []) as Unit[],
        lessons: (l.data ?? []) as Lesson[],
      };
    },
  });

  if (isLoading) return <StateMessage variant="loading">جارٍ التحميل…</StateMessage>;
  if (error) return <StateMessage variant="error">تعذّر تحميل الدروس.</StateMessage>;
  if (!data || (data.units.length === 0 && data.lessons.length === 0))
    return <StateMessage>لا توجد دروس متاحة حالياً.</StateMessage>;

  const lessonsByUnit = new Map<string | null, Lesson[]>();
  for (const ls of data.lessons) {
    const k = ls.unit_id ?? null;
    if (!lessonsByUnit.has(k)) lessonsByUnit.set(k, []);
    lessonsByUnit.get(k)!.push(ls);
  }

  const orphans = lessonsByUnit.get(null) ?? [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">{subject?.name ?? "الدروس"}</h1>
      </div>

      <div className="space-y-6">
        {data.units.map((u) => {
          const items = lessonsByUnit.get(u.id) ?? [];
          if (items.length === 0) return null;
          return <UnitBlock key={u.id} title={u.title} description={u.description} lessons={items} />;
        })}
        {orphans.length > 0 && (
          <UnitBlock title="دروس أخرى" description={null} lessons={orphans} />
        )}
      </div>
    </div>
  );
}

function UnitBlock({
  title,
  description,
  lessons,
}: {
  title: string;
  description: string | null;
  lessons: Lesson[];
}) {
  return (
    <section>
      <h2 className="mb-2 text-base font-bold text-foreground">{title}</h2>
      {description && (
        <p className="mb-2 text-xs text-muted-foreground">{description}</p>
      )}
      <ul className="space-y-2">
        {lessons.map((l) => (
          <li key={l.id}>
            <Link
              to="/lessons/$lessonId"
              params={{ lessonId: l.id }}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-3 shadow-card transition-colors hover:bg-secondary/40"
            >
              <div className="flex items-center gap-3">
                {l.is_free ? (
                  <PlayCircle className="h-5 w-5 text-primary" />
                ) : (
                  <Lock className="h-5 w-5 text-muted-foreground" />
                )}
                <div>
                  <div className="text-sm font-semibold text-card-foreground">{l.title}</div>
                  {l.duration && (
                    <div className="text-xs text-muted-foreground">{l.duration}</div>
                  )}
                </div>
              </div>
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
