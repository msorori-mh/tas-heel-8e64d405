import { Link } from "@tanstack/react-router";
import { BookOpen, ChevronLeft, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { ContinueItem } from "@/hooks/use-home-dashboard";
import { getSubjectIcon } from "@/lib/subjects/subject-icon";

/**
 * 21B4F — the single most important card on Home: "ماذا أعمل الآن؟".
 * New students get a start CTA instead of a zero dashboard.
 */
export function ContinueLearningCard({
  items,
  loading,
}: {
  items: ContinueItem[];
  loading: boolean;
}) {
  const next = items.find((i) => !i.completed) ?? items[0];

  if (loading) {
    return (
      <section aria-label="أكمل تعلمك" aria-busy className="card-edu-lesson p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          <span className="text-sm">جارٍ التحضير…</span>
        </div>
      </section>
    );
  }

  if (!next) {
    return (
      <section
        aria-label="أكمل تعلمك"
        className="card-edu-lesson subject-card-accent flex h-full flex-col justify-center overflow-hidden p-4 sm:p-5"
      >
        <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <p className="text-xs font-bold text-primary">خطوتك التالية</p>
            <h2 className="mt-1 text-lg font-black text-foreground">ابدأ أول درس</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              اختر الفصل والمادة، ثم افتح أول درس مناسب لمنهجك.
            </p>
            <ol className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {["اختر الفصل", "اختر المادة", "ابدأ الدرس"].map((step, index) => (
                <li
                  key={step}
                  className="inline-flex items-center gap-1.5 rounded-full bg-muted/70 px-2.5 py-1.5"
                >
                  <span className="font-black text-primary">{index + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
          <Link
            to="/semesters"
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
          >
            <BookOpen className="h-4 w-4" aria-hidden />
            ابدأ أول درس
          </Link>
        </div>
      </section>
    );
  }

  const pct = next.completed ? 100 : next.quizScore != null ? Math.min(100, next.quizScore) : 35;
  const Icon = getSubjectIcon(next.subjectName);
  const semester = next.semester === 2 ? "الفصل الثاني" : "الفصل الأول";

  return (
    <section
      aria-label="أكمل تعلمك"
      className="card-edu-lesson subject-card-accent flex h-full flex-col overflow-hidden p-4 sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-black text-foreground">خطوتك التالية</h2>
        <span className="rounded-full bg-primary/8 px-2.5 py-1 text-xs font-bold text-primary">
          {semester}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
          style={
            next.subjectColor
              ? { backgroundColor: `${next.subjectColor}1a`, color: next.subjectColor }
              : undefined
          }
          aria-hidden
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-foreground">{next.lessonTitle}</p>
          <p className="truncate text-[13px] text-muted-foreground">{next.subjectName}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-muted-foreground">التقدم في الدرس</span>
        <span className="shrink-0 font-black text-primary">{pct}%</span>
      </div>
      <Progress value={pct} className="mt-1.5 h-2" />
      <Link
        to="/lessons/$lessonId"
        params={{ lessonId: next.lessonId }}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto sm:self-start"
      >
        متابعة الدرس
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  );
}
