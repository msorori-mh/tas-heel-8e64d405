import { Link } from "@tanstack/react-router";
import { ChevronLeft, BookOpen, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { ContinueItem } from "@/hooks/use-home-dashboard";
import { resolveSemesterSearch, type Semester } from "@/lib/subject-semester";

type ContinueSectionProps = {
  items: ContinueItem[];
  loading: boolean;
  onStartStudy: () => void;
  selectedSemester?: Semester;
};

function lessonProgress(item: ContinueItem): number {
  if (item.completed) return 100;
  if (item.quizScore != null) return Math.min(100, item.quizScore);
  return 35;
}

export function ContinueSection({
  items,
  loading,
  onStartStudy,
  selectedSemester,
}: ContinueSectionProps) {
  return (
    <section aria-label="أكمل من حيث توقفت">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-headline text-foreground">أكمل من حيث توقفت</h2>
        {items.length > 0 && (
          <button
            type="button"
            onClick={onStartStudy}
            className="text-xs font-semibold text-primary hover:underline"
          >
            كل المواد
          </button>
        )}
      </div>

      {loading && (
        <div className="card-student-quiet flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="empty-state-boost">
          <div className="edu-lesson mx-auto flex h-14 w-14 items-center justify-center rounded-2xl">
            <Sparkles className="h-7 w-7 text-primary" />
          </div>
          <h3 className="mt-3 text-sm font-bold text-foreground">أول خطوة في رحلتك</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            لم تبدأ أي درس بعد. اختر فصلك وافتح أول درس — كل خطوة تقربك من الاختبار.
          </p>
          <Button variant="accent" size="lg" className="mt-4 gap-2" onClick={onStartStudy}>
            <BookOpen className="h-4 w-4" />
            ابدأ أول درس الآن
          </Button>
        </div>
      )}

      {!loading && items.length > 0 && (
        <ul className="space-y-2.5">
          {items.map((item) => {
            const pct = lessonProgress(item);
            const semesterSearch = resolveSemesterSearch(item.semester, selectedSemester);
            return (
              <li key={item.lessonId}>
                <Link
                  to="/lessons/$lessonId"
                  params={{ lessonId: item.lessonId }}
                  search={semesterSearch}
                  className="subject-card-accent card-edu-lesson group flex items-center gap-3 p-3 transition-shadow hover:shadow-card-hover"
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm"
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
                      <span className="text-[10px] font-semibold text-primary">{pct}%</span>
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
