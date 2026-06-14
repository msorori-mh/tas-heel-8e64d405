import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

import { StateMessage } from "@/components/student/StudentNav";
import { StudentProfileCard } from "@/components/student/StudentProfileCard";
import { BookOpen, ChevronLeft, CalendarDays, ArrowRight } from "lucide-react";

const searchSchema = z.object({
  semester: fallback(z.union([z.literal(1), z.literal(2)]).optional(), undefined),
});

export const Route = createFileRoute("/_authenticated/app")({
  validateSearch: zodValidator(searchSchema),
  component: StudentHome,
});

type Subject = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  sort_order: number;
  semester: number | null;
  curriculum_track_id: string | null;
};

function StudentHome() {
  const { profile, loading } = useAuth();
  const { semester } = Route.useSearch();
  const navigate = useNavigate();

  const gradeKey = profile?.grade_uuid ?? (profile?.grade_id ? String(profile.grade_id) : null);

  const {
    data: subjects,
    isLoading: subjLoading,
    error: subjError,
  } = useQuery({
    enabled: !!gradeKey && !!semester,
    queryKey: ["my-subjects", gradeKey, profile?.curriculum_track_id ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id,name,icon,color,sort_order,semester,curriculum_track_id")
        .eq("grade_id", gradeKey!)
        .order("sort_order");
      if (error) throw error;
      const rows = (data ?? []) as Subject[];
      const trackId = profile?.curriculum_track_id ?? null;
      // Subjects are shared across both semesters; semester filtering happens
      // on units/lessons inside each subject. Only filter by curriculum track here.
      return rows.filter(
        (s) => s.curriculum_track_id === null || s.curriculum_track_id === trackId,
      );
    },
  });

  if (loading) {
    return <StateMessage variant="loading">جارٍ التحميل…</StateMessage>;
  }

  return (
    <div className="space-y-5" dir="rtl">
      <StudentProfileCard />


      {!semester ? (
        <section>
          <h2 className="mb-3 text-base font-bold text-foreground">اختر الفصل الدراسي</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <SemesterCard
              label="الفصل الدراسي الأول"
              subtitle="مواد الفصل الأول"
              onClick={() => navigate({ to: "/app", search: { semester: 1 } })}
              gradient="from-primary/15 to-primary/5"
            />
            <SemesterCard
              label="الفصل الدراسي الثاني"
              subtitle="مواد الفصل الثاني"
              onClick={() => navigate({ to: "/app", search: { semester: 2 } })}
              gradient="from-accent/20 to-accent/5"
            />
          </div>
        </section>
      ) : (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-foreground">
                مواد {semester === 1 ? "الفصل الأول" : "الفصل الثاني"}
              </h2>
              {subjects && (
                <span className="text-xs text-muted-foreground">({subjects.length})</span>
              )}
            </div>
            <button
              onClick={() => navigate({ to: "/app", search: {} })}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              تغيير الفصل
            </button>
          </div>

          {subjLoading && <StateMessage variant="loading">جارٍ تحميل المواد…</StateMessage>}
          {subjError && <StateMessage variant="error">تعذّر تحميل المواد.</StateMessage>}

          {subjects && subjects.length === 0 && (
            <StateMessage>لا توجد مواد لهذا الفصل بعد.</StateMessage>
          )}

          {subjects && subjects.length > 0 && (
            <ul className="grid gap-3 sm:grid-cols-2">
              {subjects.map((s) => (
                <li key={s.id}>
                  <Link
                    to="/subjects/$subjectId"
                    params={{ subjectId: s.id }}
                    search={{ semester }}
                    className="group flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-base font-bold text-white"
                        style={{ backgroundColor: s.color ?? undefined }}
                        aria-hidden
                      >
                        {s.name?.[0] ?? <BookOpen className="h-5 w-5" />}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-foreground">{s.name}</div>
                        <div className="text-xs text-primary group-hover:underline">ابدأ المذاكرة</div>
                      </div>
                    </div>
                    <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function SemesterCard({
  label,
  subtitle,
  onClick,
  gradient,
}: {
  label: string;
  subtitle: string;
  onClick: () => void;
  gradient: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex items-center justify-between rounded-2xl border border-border bg-gradient-to-br ${gradient} p-5 text-right shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover`}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <CalendarDays className="h-6 w-6" />
        </span>
        <div>
          <div className="text-base font-bold text-foreground">{label}</div>
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        </div>
      </div>
      <ChevronLeft className="h-5 w-5 text-muted-foreground transition-transform group-hover:-translate-x-1" />
    </button>
  );
}
