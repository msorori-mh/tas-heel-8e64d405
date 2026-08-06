import { Link } from "@tanstack/react-router";
import { ChevronLeft, BookOpen, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { ContinueItem } from "@/hooks/use-home-dashboard";
import { resolveSemesterSearch, type Semester } from "@/lib/subject-semester";
import { getSubjectIcon } from "@/lib/subjects/subject-icon";

type ContinueSectionProps = {
  items: ContinueItem[];
  loading: boolean;
  selectedSemester?: Semester;
};

function lessonProgress(item: ContinueItem): number {
  if (item.completed) return 100;
  if (item.quizScore != null) return Math.min(100, item.quizScore);
  return 35;
}

export function ContinueSection({ items, loading, selectedSemester }: ContinueSectionProps) {
  return (
    <section aria-label="أكمل من حيث توقفت" aria-busy={loading}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground lg:text-[22px]">أكمل من حيث توقفت</h2>
        {items.length > 0 && (
          <Link to="/semesters" className="text-sm font-semibold text-primary hover:underline">
            كل المواد
          </Link>
        )}
      </div>

      {loading && (
        <div className="card-student-quiet flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
          <span className="sr-only">جارٍ تحميل الدروس الأخيرة</span>
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="empty-state-boost">
          <div className="edu-lesson mx-auto flex h-14 w-14 items-center justify-center rounded-2xl">
            <Sparkles className="h-7 w-7 text-primary" />
          </div>
          <h3 className="mt-3 text-base font-bold text-foreground">أول خطوة في رحلتك</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            لم تبدأ أي درس بعد. اختر فصلك وافتح أول درس — كل خطوة تقربك من الاختبار.
          </p>
          <Button asChild variant="accent" size="lg" className="mt-4 gap-2">
            <Link to="/semesters">
              <BookOpen className="h-4 w-4" />
              ابدأ أول درس الآن
            </Link>
          </Button>
        </div>
      )}

      {!loading && items.length > 0 && (
        <ul className="grid gap-3 lg:grid-cols-2">
          {items.map((item) => {
            const pct = lessonProgress(item);
            const semesterSearch = resolveSemesterSearch(item.semester, selectedSemester);
            const Icon = getSubjectIcon(item.subjectName);
            return (
              <li key={item.lessonId}>
                <Link
                  to="/lessons/$lessonId"
                  params={{ lessonId: item.lessonId }}
                  search={semesterSearch}
                  className="subject-card-accent card-edu-lesson group flex h-full items-center gap-3.5 p-4 transition-shadow hover:shadow-card-hover"
                >
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm"
                    style={
                      item.subjectColor
                        ? { backgroundColor: `${item.subjectColor}1a`, color: item.subjectColor }
                        : undefined
                    }
                    aria-hidden
                  >
                    <Icon className="h-6 w-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-semibold text-foreground">
                      {item.lessonTitle}
                    </p>
                    <p className="text-sm text-muted-foreground">{item.subjectName}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <Progress value={pct} className="h-1.5 flex-1" />
                      <span className="text-xs font-semibold text-primary">{pct}%</span>
                    </div>
                  </div>
                  <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
