import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useHomeDashboard } from "@/hooks/use-home-dashboard";

import { StateMessage } from "@/components/student/StudentNav";
import { HomeHero } from "@/components/home/HomeHero";
import { HomeSubscriptionBanner } from "@/components/home/HomeSubscriptionBanner";
import { ProgressSummary } from "@/components/home/ProgressSummary";
import { ContinueSection } from "@/components/home/ContinueSection";
import { AchievementsSection } from "@/components/home/AchievementsSection";
import { AiAssistantCard } from "@/components/home/AiAssistantCard";
import { MotivationFooter } from "@/components/home/MotivationFooter";
import { SemesterPicker } from "@/components/home/SemesterPicker";
import { BookOpen, ChevronLeft, ArrowRight } from "lucide-react";
import {
  type Semester,
  buildSemesterMap,
  isSubjectVisibleForSemester,
  semesterLabel,
} from "@/lib/subject-semester";

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

  const { stats, statsLoading, continueItems, continueLoading, badges, badgesLoading } =
    useHomeDashboard();

  const gradeKey = profile?.grade_uuid ?? (profile?.grade_id ? String(profile.grade_id) : null);

  const {
    data: subjects,
    isLoading: subjLoading,
    error: subjError,
    refetch: refetchSubjects,
  } = useQuery({
    enabled: !!gradeKey && !!semester,
    queryKey: ["my-subjects", gradeKey, profile?.curriculum_track_id ?? null, semester],
    queryFn: async () => {
      const selectedSemester = semester as Semester;
      const { data, error } = await supabase
        .from("subjects")
        .select("id,name,icon,color,sort_order,semester,curriculum_track_id")
        .eq("grade_id", gradeKey!)
        .order("sort_order");
      if (error) throw error;
      const rows = (data ?? []) as Subject[];
      const trackId = profile?.curriculum_track_id ?? null;
      const byTrack = rows.filter(
        (s) => s.curriculum_track_id === null || s.curriculum_track_id === trackId,
      );

      if (byTrack.length === 0) return [];

      const subjectIds = byTrack.map((s) => s.id);
      const [unitsRes, lessonsRes] = await Promise.all([
        supabase.from("units").select("subject_id,semester").in("subject_id", subjectIds),
        supabase.from("lessons").select("subject_id,semester").in("subject_id", subjectIds),
      ]);
      if (unitsRes.error) throw unitsRes.error;
      if (lessonsRes.error) throw lessonsRes.error;

      const unitSemesters = buildSemesterMap(
        (unitsRes.data ?? []) as { subject_id: string; semester: number | null }[],
      );
      const lessonSemesters = buildSemesterMap(
        (lessonsRes.data ?? []) as { subject_id: string; semester: number | null }[],
      );

      return byTrack.filter((s) =>
        isSubjectVisibleForSemester(s, selectedSemester, unitSemesters, lessonSemesters),
      );
    },
  });

  const scrollToStudy = () => {
    if (semester) {
      document.getElementById("subjects-list")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    document.getElementById("start-studying")?.scrollIntoView({ behavior: "smooth" });
  };

  const pickSemester = (s: 1 | 2) => {
    navigate({ to: "/app", search: { semester: s } });
  };

  if (loading) {
    return <StateMessage variant="loading">جارٍ التحميل…</StateMessage>;
  }

  return (
    <div className="space-y-6 pb-4" dir="rtl">
      <HomeHero onStartStudy={scrollToStudy} stats={stats} />

      <HomeSubscriptionBanner />

      <ProgressSummary stats={stats} loading={statsLoading} />

      <ContinueSection
        items={continueItems}
        loading={continueLoading}
        onStartStudy={scrollToStudy}
        selectedSemester={semester}
      />

      <AchievementsSection badges={badges} loading={badgesLoading} />

      <AiAssistantCard />

      {!semester ? (
        <SemesterPicker onSelect={pickSemester} />
      ) : (
        <section id="subjects-list" className="scroll-mt-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-foreground">
                  مواد {semesterLabel(semester as Semester)}
                </h2>
                {subjects && (
                  <span className="text-xs text-muted-foreground">({subjects.length})</span>
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                تعرض هنا مواد {semesterLabel(semester as Semester)} فقط.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate({ to: "/app", search: {} })}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              تغيير الفصل
            </button>
          </div>

          {subjLoading && <StateMessage variant="loading">جارٍ تحميل المواد…</StateMessage>}
          {subjError && (
            <div className="space-y-3">
              <StateMessage variant="error">
                تعذّر تحميل المواد. تحقق من اتصالك ثم حاول مرة أخرى.
              </StateMessage>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => void refetchSubjects()}
                  className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  إعادة المحاولة
                </button>
              </div>
            </div>
          )}

          {!subjError && subjects && subjects.length === 0 && (
            <div className="space-y-3">
              <StateMessage>
                لا توجد مواد مضافة لهذا الفصل بعد. يمكنك اختيار الفصل الآخر.
              </StateMessage>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => navigate({ to: "/app", search: {} })}
                  className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  اختيار فصل آخر
                </button>
              </div>
            </div>
          )}

          {subjects && subjects.length > 0 && (
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {subjects.map((s) => (
                <li key={s.id}>
                  <Link
                    to="/subjects/$subjectId"
                    params={{ subjectId: s.id }}
                    search={{ semester }}
                    className="group flex items-center justify-between rounded-xl border border-border/60 bg-card p-3.5 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
                        style={{ backgroundColor: s.color ?? undefined }}
                        aria-hidden
                      >
                        {s.name?.[0] ?? <BookOpen className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-foreground">{s.name}</div>
                        <div className="text-[11px] text-primary">ابدأ المذاكرة</div>
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

      <MotivationFooter />
    </div>
  );
}
