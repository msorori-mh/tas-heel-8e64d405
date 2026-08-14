import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { StateMessage } from "@/components/student/StudentNav";
import { Breadcrumbs } from "@/components/student/Breadcrumbs";
import { fetchMinisterialSubjects } from "@/lib/ministerial/ministerial-student-api";
import { ChevronLeft, ScrollText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ministerial-exams/")({
  head: () => ({
    meta: [
      { title: "نماذج الاختبارات الوزارية — تمكين" },
      {
        name: "description",
        content: "استعرض نماذج الاختبارات الوزارية السابقة الخاصة بمسارك الدراسي وتدرّب عليها.",
      },
      { property: "og:title", content: "نماذج الاختبارات الوزارية — تمكين" },
      {
        property: "og:description",
        content: "نماذج وزارية سابقة مرتبة حسب المادة والسنة والدور.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MinisterialExamsIndex,
});

function MinisterialExamsIndex() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["ministerial-subjects"],
    queryFn: fetchMinisterialSubjects,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="space-y-4 pb-6" dir="rtl">
      <Breadcrumbs items={[{ label: "نماذج الاختبارات الوزارية" }]} />

      <header className="rounded-2xl border border-primary/15 bg-card p-4 shadow-sm sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-hero-gradient">
            <ScrollText className="h-5 w-5 text-primary-foreground" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-foreground sm:text-xl">
              نماذج الاختبارات الوزارية
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              النماذج المعروضة تخص منهجك الدراسي فقط.
            </p>
          </div>
        </div>
      </header>

      <nav className="grid gap-2 sm:grid-cols-2">
        <Link
          to="/ministerial-exams/performance"
          className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 text-sm font-semibold text-foreground transition hover:border-primary/40"
        >
          أدائي في الاختبارات الوزارية
          <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
        <Link
          to="/ministerial-exams/repeated"
          className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 text-sm font-semibold text-foreground transition hover:border-primary/40"
        >
          الأسئلة الأكثر تكراراً
          <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      </nav>

      {isLoading && <StateMessage variant="loading">جارٍ تحميل المواد…</StateMessage>}
      {error && <StateMessage variant="error">تعذّر تحميل النماذج الوزارية.</StateMessage>}

      {!isLoading && !error && (data?.length ?? 0) === 0 && (
        <StateMessage>لا توجد نماذج وزارية منشورة لمسارك الدراسي حالياً.</StateMessage>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {(data ?? []).map((s) => (
          <li key={s.subject_id}>
            <Link
              to="/ministerial-exams/$subjectId"
              params={{ subjectId: s.subject_id }}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold text-foreground">
                  {s.subject_name}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {s.models_count} نموذج
                  {s.latest_year ? ` • أحدث سنة ${s.latest_year}` : ""}
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
