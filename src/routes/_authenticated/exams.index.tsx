import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { useAuth } from "@/hooks/use-auth";
import { useConnectivity } from "@/hooks/use-connectivity";
import { supabase } from "@/integrations/supabase/client";
import { useSemesterSubjects } from "@/components/student/SemesterSubjectsView";
import { ReviewToolRow } from "@/components/home/LearningToolsSection";
import { ExamCountdown } from "@/components/home/ExamCountdown";
import { useExamHistory } from "@/hooks/use-exam-history";
import { historyPercentage, historyScoreLabel } from "@/lib/exams/history-score";
import { arabicCount } from "@/lib/i18n/arabic-count";

export const Route = createFileRoute("/_authenticated/exams/")({
  component: ExamsHubPage,
  head: () => ({
    meta: [
      { title: "الاختبارات — تمكين الطالب" },
      {
        name: "description",
        content: "ابدأ اختبارات موادك أو راجع محاولاتك السابقة في تمكين الطالب.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
});

export function ExamsHubPage() {
  const { profile } = useAuth();
  const online = useConnectivity();
  const first = useSemesterSubjects(1, 30 * 60 * 1000);
  const second = useSemesterSubjects(2, 30 * 60 * 1000);
  const subjects = online
    ? [
        ...new Map(
          [...(first.data?.subjects ?? []), ...(second.data?.subjects ?? [])].map((s) => [s.id, s]),
        ).values(),
      ]
    : [];
  const history = useExamHistory();
  const gradeId = profile?.grade_uuid ?? null;
  const { data: gradeSlug } = useQuery({
    enabled: Boolean(gradeId),
    queryKey: ["exams-hub-grade", gradeId],
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grades")
        .select("slug")
        .eq("id", gradeId as string)
        .maybeSingle();
      if (error) throw error;
      return data?.slug ?? null;
    },
  });
  return (
    <div className="ds-v2 space-y-5" dir="rtl">
      <header className="rounded-[20px] bg-primary p-5 text-white sm:p-6">
        <h1 className="text-2xl font-black">اختبر نفسك الآن</h1>
        <p className="mt-2 text-sm leading-6 text-white/90">اختر مادة وابدأ تدريباً من دروسها.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {subjects.length ? (
            subjects.map((subject) => (
              <Link
                key={subject.id}
                to="/subjects/$subjectId"
                params={{ subjectId: subject.id }}
                className="inline-flex min-h-11 items-center rounded-xl border border-white/40 px-4 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {subject.name}
              </Link>
            ))
          ) : (
            <Link
              to="/semesters"
              className="flex min-h-[52px] w-full items-center justify-center rounded-xl bg-white px-4 font-bold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              تصفح المواد والتدريبات
            </Link>
          )}
        </div>
      </header>
      <ExamCountdown compact />
      {gradeSlug === "grade-12" && (
        <div className="overflow-hidden rounded-[20px] border border-border bg-card">
          <ReviewToolRow
            to="/ministerial-exams"
            icon={ScrollText}
            title="النماذج الوزارية"
            description="نماذج السنوات السابقة لمنهجك"
            tone="bg-[#FFF1EE] text-[#A43C2C]"
          />
        </div>
      )}
      <section aria-label="سجل الاختبارات" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-black">سجل الاختبارات</h2>
          <Link
            to="/exams/history"
            className="inline-flex min-h-11 items-center text-sm font-bold text-primary"
          >
            السجل كاملاً
          </Link>
        </div>
        {history.isPending ? (
          <p
            role="status"
            className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground"
          >
            جارٍ تحميل سجل الاختبارات…
          </p>
        ) : history.isError ? (
          <div role="alert" className="rounded-2xl border border-border bg-card p-5 text-sm">
            <p>تعذّر تحميل سجل الاختبارات.</p>
            <button
              type="button"
              onClick={() => void history.refetch()}
              className="min-h-11 font-bold text-primary"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : !history.data?.length ? (
          <p className="rounded-2xl border border-border bg-card p-5 text-sm leading-6 text-muted-foreground">
            لم تُنهِ أي اختبار بعد. ابدأ بمادة من الأعلى.
          </p>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-[20px] border border-border bg-card">
            {history.data.slice(0, 3).map((row) => {
              const percent = historyPercentage(row);
              const tone =
                percent === null
                  ? "bg-muted text-foreground"
                  : percent >= 75
                    ? "bg-[#E2F3F1] text-[#12635E]"
                    : percent >= 50
                      ? "bg-[#FFF3D8] text-[#805414]"
                      : "bg-[#FFF1EE] text-[#A43C2C]";
              const date = new Date(row.submitted_at ?? row.started_at);
              return (
                <Link
                  key={row.id}
                  to="/exams/history/$sessionId"
                  params={{ sessionId: row.id }}
                  className="flex min-h-[84px] items-center gap-3 px-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="min-w-0 flex-1">
                    <strong className="block text-sm font-bold">
                      {row.exam_templates?.title ||
                        (row.mode === "ministry" ? "اختبار وزاري" : "اختبار تدريبي")}
                    </strong>
                    <span className="mt-2 block text-xs text-muted-foreground">
                      {Number.isNaN(date.getTime())
                        ? ""
                        : formatDistanceToNow(date, { addSuffix: true, locale: ar })}{" "}
                      ·{" "}
                      {arabicCount(row.total_questions, {
                        one: "سؤال واحد",
                        two: "سؤالان",
                        few: "أسئلة",
                        many: "سؤالاً",
                      })}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-xl px-3 py-2 text-sm font-black ${tone}`}>
                    {historyScoreLabel(row)}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
