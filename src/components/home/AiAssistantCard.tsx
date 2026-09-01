import { Link } from "@tanstack/react-router";
import { ChevronLeft, Lightbulb, Sparkles } from "lucide-react";
import type { ContinueItem, HomeStats } from "@/hooks/use-home-dashboard";

type DailySuggestion =
  | { kind: "lesson"; title: string; description: string; label: string; lessonId: string }
  | {
      kind: "route";
      title: string;
      description: string;
      label: string;
      to: "/semesters" | "/exams" | "/my-mistakes" | "/quick-review";
    };

function buildDailySuggestion(items: ContinueItem[], stats?: HomeStats): DailySuggestion {
  const weak = items.find((item) => item.quizScore != null && item.quizScore < 60);
  if (weak) {
    return {
      kind: "route",
      title: "ثبّت نقطة ضعف واحدة",
      description: `ابدأ بمراجعة أخطائك في ${weak.subjectName} قبل درس جديد.`,
      label: "راجع أخطاءك",
      to: "/my-mistakes",
    };
  }

  if (items.length === 0 && (!stats || stats.completedLessons === 0)) {
    return {
      kind: "route",
      title: "خطوتك الأولى بسيطة",
      description: "اختر مادة واحدة وأكمل درسًا قصيرًا اليوم.",
      label: "اختر أول درس",
      to: "/semesters",
    };
  }

  if (stats && stats.completedLessons > 0 && stats.examsCompleted === 0) {
    return {
      kind: "route",
      title: "حوّل المذاكرة إلى نتيجة",
      description: "حل اختبارًا قصيرًا لتبدأ مؤشرات أدائك بالظهور.",
      label: "ابدأ اختبارًا",
      to: "/exams",
    };
  }

  const unfinished = items.find((item) => !item.completed);
  if (unfinished) {
    return {
      kind: "lesson",
      title: "أكمل ما بدأت",
      description: `${unfinished.lessonTitle} هو أقرب خطوة لإنجاز جديد.`,
      label: "متابعة الدرس",
      lessonId: unfinished.lessonId,
    };
  }

  return {
    kind: "route",
    title: "مراجعة خفيفة تكفي اليوم",
    description: "استرجع أهم أفكار دروسك في دقائق قليلة.",
    label: "افتح المراجعة السريعة",
    to: "/quick-review",
  };
}

export function AiAssistantCard({ items, stats }: { items: ContinueItem[]; stats?: HomeStats }) {
  const suggestion = buildDailySuggestion(items, stats);

  return (
    <section aria-label="اقتراح اليوم" className="flex h-full flex-col">
      <div className="flex h-full flex-col rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/5 via-card to-accent/5 p-4 shadow-sm sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Lightbulb className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold text-primary">اقتراح اليوم</p>
            <h2 className="mt-0.5 text-base font-black text-foreground">{suggestion.title}</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{suggestion.description}</p>
          </div>
          <Sparkles className="h-4 w-4 shrink-0 text-primary/60" aria-hidden />
        </div>

        <div className="mt-3">
          {suggestion.kind === "lesson" ? (
            <Link
              to="/lessons/$lessonId"
              params={{ lessonId: suggestion.lessonId }}
              className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-primary px-4 py-2 text-[13px] font-bold text-primary-foreground shadow-sm transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
            >
              {suggestion.label}
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Link>
          ) : (
            <Link
              to={suggestion.to}
              className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-primary px-4 py-2 text-[13px] font-bold text-primary-foreground shadow-sm transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
            >
              {suggestion.label}
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
