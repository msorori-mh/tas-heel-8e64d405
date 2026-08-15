import { BookOpen, History, Repeat2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MISTAKE_STATE_LABEL,
  attemptReviewPath,
  formatMistakeDate,
  type MistakeItem,
} from "@/lib/mistakes/my-mistakes-api";

/**
 * 15B mistake card — mobile-first RTL, card pattern reused from 15A ReviewCard.
 * Shows only student-safe data: never the correct answer.
 */
export function MistakeCard({
  item,
  onReviewLesson,
  onReviewAttempt,
}: {
  item: MistakeItem;
  onReviewLesson: (lessonId: string) => void;
  onReviewAttempt: (path: string) => void;
}) {
  const stateTone =
    item.latest_state === "MASTERED_LATER"
      ? "bg-primary/10 text-primary"
      : item.latest_state === "BLANK"
        ? "bg-muted text-muted-foreground"
        : "bg-destructive/10 text-destructive";

  const attemptPath = attemptReviewPath(item);

  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className={`rounded-full px-2 py-0.5 font-medium ${stateTone}`}>
          {MISTAKE_STATE_LABEL[item.latest_state]}
        </span>
        {item.has_repeated_mistake && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 font-medium text-accent-foreground">
            <Repeat2 className="h-3 w-3" aria-hidden />
            متكرر
          </span>
        )}
        <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">
          {item.latest_attempt_scope === "MINISTERIAL" ? "وزاري" : "اختبار"}
        </span>
      </div>

      <p className="line-clamp-3 text-sm font-semibold leading-relaxed text-foreground">
        {item.question_text ?? "سؤال بدون نص محفوظ"}
      </p>

      <dl className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <dt className="sr-only">المادة</dt>
          <dd>{item.subject_name ?? "مادة غير محددة"}</dd>
        </div>
        <span aria-hidden>·</span>
        <div className="flex items-center gap-1">
          <dt className="sr-only">الدرس</dt>
          <dd>{item.lesson_title ?? "بدون درس مرتبط"}</dd>
        </div>
        <span aria-hidden>·</span>
        <div className="flex items-center gap-1">
          <dt className="sr-only">عدد مرات الخطأ</dt>
          <dd className="tabular-nums">{item.occurrence_count} مرة</dd>
        </div>
        <span aria-hidden>·</span>
        <div className="flex items-center gap-1">
          <dt className="sr-only">آخر خطأ</dt>
          <dd className="tabular-nums">{formatMistakeDate(item.last_mistake_at)}</dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap gap-2">
        {item.can_review_lesson && item.lesson_id && (
          <Button size="sm" variant="secondary" onClick={() => onReviewLesson(item.lesson_id!)}>
            <BookOpen className="ms-1 h-4 w-4" aria-hidden />
            راجع الدرس
          </Button>
        )}
        {item.can_open_attempt && attemptPath && (
          <Button size="sm" variant="outline" onClick={() => onReviewAttempt(attemptPath)}>
            <History className="ms-1 h-4 w-4" aria-hidden />
            راجع المحاولة
          </Button>
        )}
      </div>
    </article>
  );
}
