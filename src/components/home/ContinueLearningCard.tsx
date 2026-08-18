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
      <section aria-label="أكمل تعلمك" className="card-edu-lesson p-4">
        <p className="text-base font-bold text-foreground">ابدأ أول درس</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          اختر مادتك وافتح أول درس — كل خطوة تقرّبك من الاختبار.
        </p>
        <Link
          to="/semesters"
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground sm:w-auto"
        >
          <BookOpen className="h-4 w-4" aria-hidden />
          ابدأ أول درس
        </Link>
      </section>
    );
  }

  const pct = next.completed ? 100 : next.quizScore != null ? Math.min(100, next.quizScore) : 35;
  const Icon = getSubjectIcon(next.subjectName);

  return (
    <section aria-label="أكمل تعلمك" className="card-edu-lesson p-4">
      <h2 className="text-sm font-black text-foreground">أكمل تعلمك</h2>
      <div className="mt-2.5 flex items-center gap-3">
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
          <p className="truncate text-[15px] font-bold text-foreground">{next.lessonTitle}</p>
          <p className="truncate text-xs text-muted-foreground">{next.subjectName}</p>
        </div>
        <span className="shrink-0 text-xs font-bold text-primary">{pct}%</span>
      </div>
      <Progress value={pct} className="mt-2.5 h-1.5" />
      <Link
        to="/lessons/$lessonId"
        params={{ lessonId: next.lessonId }}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
      >
        متابعة الدرس
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  );
}
