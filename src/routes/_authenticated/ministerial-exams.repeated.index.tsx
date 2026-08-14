import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Repeat2 } from "lucide-react";
import { Breadcrumbs } from "@/components/student/Breadcrumbs";
import { StateMessage } from "@/components/student/StudentNav";
import {
  AnalyticsUnavailableError,
  fetchRepeatedSubjects,
} from "@/lib/ministerial/ministerial-analytics-api";

export const Route = createFileRoute("/_authenticated/ministerial-exams/repeated/")({
  head: () => ({
    meta: [
      { title: "الأسئلة الوزارية الأكثر تكراراً — تمكين" },
      {
        name: "description",
        content: "اكتشف الأسئلة التي تكرر ظهورها في النماذج الوزارية داخل منهجك الدراسي.",
      },
      { property: "og:title", content: "الأسئلة الوزارية الأكثر تكراراً — تمكين" },
      {
        property: "og:description",
        content: "أسئلة متكررة حسب المادة والسنة داخل مسارك الدراسي.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RepeatedSubjectsPage,
});

function RepeatedSubjectsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["ministerial-repeated-subjects"],
    queryFn: fetchRepeatedSubjects,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return (
    <div className="space-y-4 pb-6" dir="rtl">
      <Breadcrumbs
        items={[
          { label: "النماذج الوزارية", to: "/ministerial-exams" },
          { label: "الأسئلة المتكررة" },
        ]}
      />

      <header>
        <h1 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <Repeat2 className="h-5 w-5 text-primary" aria-hidden />
          الأسئلة الوزارية الأكثر تكراراً
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          التكرار محسوب داخل منهجك الدراسي فقط — نماذج المناهج الأخرى لا تُحتسب.
        </p>
      </header>

      {isLoading && <StateMessage variant="loading">جارٍ التحميل…</StateMessage>}
      {error instanceof AnalyticsUnavailableError && (
        <StateMessage>هذه الميزة قيد التفعيل، وستظهر فور اعتماد التحديث.</StateMessage>
      )}
      {error && !(error instanceof AnalyticsUnavailableError) && (
        <StateMessage variant="error">تعذّر تحميل الأسئلة المتكررة.</StateMessage>
      )}

      {data && data.length === 0 && (
        <StateMessage>لا توجد أسئلة متكررة في مسارك الدراسي حتى الآن.</StateMessage>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {(data ?? []).map((s) => (
          <li key={s.subject_id}>
            <Link
              to="/ministerial-exams/repeated/$subjectId"
              params={{ subjectId: s.subject_id }}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-primary/40"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold text-foreground">
                  {s.subject_name}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {s.repeated_questions_count} سؤال متكرر • أعلى تكرار {s.max_occurrences} مرات
                </span>
              </span>
              <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
