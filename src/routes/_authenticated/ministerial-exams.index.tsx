import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { StateMessage } from "@/components/student/StudentNav";
import { Breadcrumbs } from "@/components/student/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { fetchMinisterialSubjects } from "@/lib/ministerial/ministerial-student-api";
import {
  BarChart3,
  BookOpenCheck,
  ChevronLeft,
  RefreshCw,
  Repeat2,
  ScrollText,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/ministerial-exams/")({
  head: () => ({
    meta: [
      { title: "نماذج الاختبارات الوزارية — تمكين" },
      {
        name: "description",
        content:
          "استعرض نماذج اختبارات صنعاء وعدن الوزارية السابقة وتدرّب عليها مهما كان مسارك الدراسي.",
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
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["ministerial-subjects"],
    queryFn: fetchMinisterialSubjects,
    staleTime: 5 * 60 * 1000,
  });
  const subjects = data ?? [];
  const totalModels = subjects.reduce((total, subject) => total + subject.models_count, 0);
  const latestYear = subjects.reduce<number | null>(
    (latest, subject) =>
      subject.latest_year !== null && (latest === null || subject.latest_year > latest)
        ? subject.latest_year
        : latest,
    null,
  );

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
              استعرض وتدرّب على نماذج صنعاء وعدن، مهما كان مسارك الدراسي.
            </p>
          </div>
        </div>

        {!isLoading && !error && subjects.length > 0 && (
          <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4 text-center">
            <div>
              <dt className="text-[11px] text-muted-foreground">إجمالي النماذج</dt>
              <dd className="mt-0.5 text-base font-bold text-foreground">{totalModels}</dd>
            </div>
            <div className="border-x border-border">
              <dt className="text-[11px] text-muted-foreground">المواد المتاحة</dt>
              <dd className="mt-0.5 text-base font-bold text-foreground">{subjects.length}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">أحدث سنة</dt>
              <dd className="mt-0.5 text-base font-bold text-foreground">{latestYear ?? "—"}</dd>
            </div>
          </dl>
        )}
      </header>

      <nav className="grid gap-2 sm:grid-cols-2">
        <Link
          to="/ministerial-exams/performance"
          className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BarChart3 className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">محاولاتك ونتائجك</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              تابع درجاتك والدروس التي تحتاج مراجعة.
            </span>
          </span>
          <ChevronLeft
            className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-primary"
            aria-hidden
          />
        </Link>
        <Link
          to="/ministerial-exams/repeated"
          className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
            <Repeat2 className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">
              الأسئلة الأكثر تكراراً
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              راجع الأسئلة المتكررة في السنوات السابقة.
            </span>
          </span>
          <ChevronLeft
            className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-primary"
            aria-hidden
          />
        </Link>
      </nav>

      {isLoading && <StateMessage variant="loading">جارٍ تحميل المواد…</StateMessage>}
      {error && (
        <StateMessage variant="error">
          <p>تعذّر تحميل النماذج الوزارية.</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-3 gap-1"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} aria-hidden />
            إعادة المحاولة
          </Button>
        </StateMessage>
      )}

      {!isLoading && !error && subjects.length === 0 && (
        <StateMessage>
          لا توجد نماذج وزارية منشورة لصفك الدراسي حالياً. ستظهر هنا بعد اعتماد أول نموذج.
        </StateMessage>
      )}

      {!isLoading && !error && subjects.length > 0 && (
        <section aria-labelledby="ministerial-subjects-title" className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2
                id="ministerial-subjects-title"
                className="flex items-center gap-2 text-base font-bold text-foreground"
              >
                <BookOpenCheck className="h-4 w-4 text-primary" aria-hidden />
                اختر المادة
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                ستجد داخل كل مادة نماذج السنوات والأدوار المتاحة.
              </p>
            </div>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2">
            {subjects.map((s) => (
              <li key={s.subject_id}>
                <Link
                  to="/ministerial-exams/$subjectId"
                  params={{ subjectId: s.subject_id }}
                  aria-label={`${s.subject_name}، ${s.models_count} نموذج وزاري`}
                  className="group flex h-full items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-foreground">
                        {s.subject_name}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-foreground">
                        {s.models_count} نموذج
                      </span>
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {s.latest_year ? `أحدث نموذج: ${s.latest_year}` : "سنوات النماذج غير محددة"}
                    </span>
                    <span className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                      {s.sanaa_models_count > 0 && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                          صنعاء {s.sanaa_models_count}
                        </span>
                      )}
                      {s.aden_models_count > 0 && (
                        <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">
                          عدن {s.aden_models_count}
                        </span>
                      )}
                    </span>
                  </span>
                  <ChevronLeft
                    className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-primary"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
