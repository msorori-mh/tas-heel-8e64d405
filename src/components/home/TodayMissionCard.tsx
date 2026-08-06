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
    <section className="card-edu-lesson p-4" aria-label="مهمة اليوم">
      <div className="flex items-center gap-2 text-primary">
        <Target className="h-4 w-4" aria-hidden />
        <h2 className="text-sm font-bold">مهمة اليوم</h2>
      </div>

      {loading ? (
        <p className="mt-2 animate-pulse text-xs text-muted-foreground">جارٍ التحضير…</p>
      ) : next ? (
        <>
          <p className="mt-2 text-sm font-semibold text-foreground">
            {next.completed ? "راجع" : "أكمل"} درس «{next.lessonTitle}»
          </p>
          <p className="text-[11px] text-muted-foreground">{next.subjectName}</p>
          <Link
            to="/lessons/$lessonId"
            params={{ lessonId: next.lessonId }}
            className="mt-3 inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            ابدأ الآن
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm font-semibold text-foreground">افتح أول درس لك اليوم</p>
          <p className="text-[11px] text-muted-foreground">
            اختر الفصل الدراسي ثم المادة، وابدأ خطوتك الأولى.
          </p>
          <Link
            to="/semesters"
            className="mt-3 inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            اختر مادة
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </>
      )}
    </section>
  );
}
