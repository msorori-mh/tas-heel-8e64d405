import { Link } from "@tanstack/react-router";
import { ChevronLeft, BookOpen, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { ContinueItem } from "@/hooks/use-home-dashboard";

type ContinueSectionProps = {
  items: ContinueItem[];
  loading: boolean;
  onStartStudy: () => void;
};

function lessonProgress(item: ContinueItem): number {
  if (item.completed) return 100;
  if (item.quizScore != null) return Math.min(100, item.quizScore);
  return 35;
}

export function ContinueSection({ items, loading, onStartStudy }: ContinueSectionProps) {
  return (
    <section aria-label="أكمل من حيث توقفت">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-foreground">أكمل من حيث توقفت</h2>
        {items.length > 0 && (
          <button
            type="button"
            onClick={onStartStudy}
            className="text-xs text-primary hover:underline"
          >
            كل المواد
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center rounded-xl border border-border bg-card py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-5 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-sm text-muted-foreground">
            لم تبدأ أي درس بعد. اختر فصلك وابدأ أول درس اليوم.
          </p>
          <button
            type="button"
            onClick={onStartStudy}
            className="mt-3 text-sm font-medium text-primary hover:underline"
          >
            ابدأ الدراسة الآن
          </button>
        </div>
      )}

      {!loading && items.length > 0 && (
        <ul className="space-y-2.5">
          {items.map((item) => {
            const pct = lessonProgress(item);
            return (
              <li key={item.lessonId}>
                <Link
                  to="/lessons/$lessonId"
                  params={{ lessonId: item.lessonId }}
                  className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-sm transition-shadow hover:shadow-md"
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
                    style={{ backgroundColor: item.subjectColor ?? undefined }}
                    aria-hidden
                  >
                    {item.subjectName[0] ?? "م"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {item.lessonTitle}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{item.subjectName}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Progress value={pct} className="h-1.5 flex-1" />
                      <span className="text-[10px] font-medium text-muted-foreground">{pct}%</span>
                    </div>
                  </div>
                  <ChevronLeft
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
