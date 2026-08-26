import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { BookOpen, ExternalLink, Repeat2 } from "lucide-react";
import { Breadcrumbs } from "@/components/student/Breadcrumbs";
import { StateMessage } from "@/components/student/StudentNav";
import {
  AnalyticsUnavailableError,
  fetchRepeatedQuestions,
} from "@/lib/ministerial/ministerial-analytics-api";
import { roundLabel } from "@/lib/ministerial/ministerial-student-api";

export const Route = createFileRoute("/_authenticated/ministerial-exams/repeated/$subjectId")({
  head: () => ({
    meta: [
      { title: "أسئلة متكررة في المادة — تمكين" },
      {
        name: "description",
        content: "قائمة الأسئلة الوزارية التي تكرر ظهورها في هذه المادة داخل منهجك الدراسي.",
      },
      { property: "og:title", content: "أسئلة متكررة في المادة — تمكين" },
      {
        property: "og:description",
        content: "عدد مرات التكرار والسنوات والأدوار والدرس المرتبط بكل سؤال.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RepeatedQuestionsPage,
});

function RepeatedQuestionsPage() {
  const { subjectId } = Route.useParams();
  const [minOccurrences, setMinOccurrences] = useState(2);
  const [yearFrom, setYearFrom] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["ministerial-repeated", subjectId, minOccurrences, yearFrom],
    queryFn: () => fetchRepeatedQuestions({ subjectId, minOccurrences, yearFrom }),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const yearOptions = useMemo(() => {
    const now = new Date().getFullYear();
    return [now - 2, now - 4, now - 6, now - 10];
  }, []);

  return (
    <div className="space-y-4 pb-6" dir="rtl">
      <Breadcrumbs
        items={[
          { label: "النماذج الوزارية", to: "/ministerial-exams" },
          { label: "الأسئلة المتكررة", to: "/ministerial-exams/repeated" },
          { label: "المادة" },
        ]}
      />

      <header>
        <h1 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <Repeat2 className="h-5 w-5 text-primary" aria-hidden />
          الأسئلة الأكثر تكراراً
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          التكرار يُحسب بعدد النماذج المنشورة داخل منهجك الدراسي.
        </p>
      </header>

      <section className="flex flex-wrap gap-2 rounded-xl border border-border bg-card p-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          الحد الأدنى للتكرار
          <select
            value={minOccurrences}
            onChange={(e) => setMinOccurrences(Number(e.target.value))}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
          >
            {[2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}+
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          من سنة
          <select
            value={yearFrom ?? ""}
            onChange={(e) => setYearFrom(e.target.value ? Number(e.target.value) : null)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
          >
            <option value="">كل السنوات</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </section>

      {isLoading && <StateMessage variant="loading">جارٍ التحميل…</StateMessage>}
      {error instanceof AnalyticsUnavailableError && (
        <StateMessage>هذه الميزة قيد التفعيل، وستظهر فور اعتماد التحديث.</StateMessage>
      )}
      {error && !(error instanceof AnalyticsUnavailableError) && (
        <StateMessage variant="error">تعذّر تحميل الأسئلة المتكررة.</StateMessage>
      )}

      {data && data.length === 0 && <StateMessage>لا توجد أسئلة مطابقة لهذه الفلاتر.</StateMessage>}

      <ul className="space-y-3">
        {(data ?? []).map((q) => (
          <li key={q.question_id} className="rounded-2xl border border-border bg-card p-4">
            {q.stimulus_text && (
              <p className="mb-2 whitespace-pre-wrap text-xs text-muted-foreground">
                {q.stimulus_text}
              </p>
            )}
            <p className="whitespace-pre-wrap text-sm font-semibold leading-6 text-foreground">
              {q.question_text}
            </p>

            <p className="mt-2 text-xs font-bold text-primary">تكرر {q.occurrence_count} مرات</p>

            <ul className="mt-2 flex flex-wrap gap-1.5">
              {(q.occurrences ?? []).map((o) => (
                <li
                  key={`${o.model_id}`}
                  className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {o.academic_year} • {roundLabel(o.round_code)}
                </li>
              ))}
            </ul>

            <div className="mt-3 flex flex-wrap gap-2">
              {q.latest_model_id && (
                <Link
                  to="/ministerial-exams/models/$modelId"
                  params={{ modelId: q.latest_model_id }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  افتح أحدث نموذج ورد فيه السؤال
                </Link>
              )}
              {q.lesson_id && (
                <Link
                  to="/lessons/$lessonId"
                  params={{ lessonId: q.lesson_id }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                >
                  <BookOpen className="h-3.5 w-3.5" aria-hidden />
                  راجع الدرس{q.lesson_title ? `: ${q.lesson_title}` : ""}
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
