import { Link } from "@tanstack/react-router";
import { Target, ChevronLeft } from "lucide-react";
import type { ContinueItem } from "@/hooks/use-home-dashboard";

/** Step 2: one concrete action for today, derived from the latest activity. */
export function TodayMissionCard({
  items,
  loading,
}: {
  items: ContinueItem[];
  loading?: boolean;
}) {
  const next = items.find((i) => !i.completed) ?? items[0];

  return (
    <section className="card-edu-lesson flex h-full flex-col p-5 lg:p-6" aria-label="مهمة اليوم">
      <div className="flex items-center gap-2 text-primary">
        <Target className="h-5 w-5" aria-hidden />
        <h2 className="text-lg font-bold">مهمة اليوم</h2>
      </div>

      {loading ? (
        <p className="mt-2 animate-pulse text-sm text-muted-foreground">جارٍ التحضير…</p>
      ) : next ? (
        <>
          <p className="mt-3 text-base font-semibold leading-relaxed text-foreground">
            {next.completed ? "راجع" : "أكمل"} درس «{next.lessonTitle}»
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{next.subjectName}</p>
          <Link
            to="/lessons/$lessonId"
            params={{ lessonId: next.lessonId }}
            className="mt-auto inline-flex w-fit items-center gap-1 rounded-lg bg-primary px-4 py-2.5 pt-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            ابدأ الآن
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Link>
        </>
      ) : (
        <>
          <p className="mt-3 text-base font-semibold text-foreground">افتح أول درس لك اليوم</p>
          <p className="mt-1 text-sm text-muted-foreground">
            اختر الفصل الدراسي ثم المادة، وابدأ خطوتك الأولى.
          </p>
          <Link
            to="/semesters"
            className="mt-auto inline-flex w-fit items-center gap-1 rounded-lg bg-primary px-4 py-2.5 pt-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            اختر مادة
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Link>
        </>
      )}
    </section>
  );
}
