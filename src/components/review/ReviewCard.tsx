import { Link } from "@tanstack/react-router";
import { CheckCircle2, Clock, FileText } from "lucide-react";
import { chunkSummary, estimateReadMinutes } from "@/lib/review/review-format";
import type { ReviewItem } from "@/lib/review/review-types";

/**
 * Review list item (adapted from Mufadala QuickReviewCard.tsx — Tamkeen tokens,
 * Tamkeen `ReviewItem` props, RTL accent stripe on `border-r`).
 */
export function ReviewCard({
  item,
  index,
  onFocus,
}: {
  item: ReviewItem;
  index: number;
  onFocus: () => void;
}) {
  const chunks = chunkSummary(item.summary);
  const minutes = estimateReadMinutes(item.summary);
  const preview = chunks[0] ?? "";
  const isPdf = item.deliveryMode !== "standard";

  return (
    <article
      className={[
        "rounded-2xl border border-l border-border border-r-4 bg-card p-4 shadow-card transition-colors",
        item.isCompleted ? "border-r-primary bg-primary/5" : "border-r-muted-foreground/20",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-bold tabular-nums text-primary">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onFocus}
            className="block w-full text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <p className="truncate text-sm font-bold text-foreground">{item.lessonTitle}</p>
          </button>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {item.subjectName}
            {item.unitTitle ? ` · ${item.unitTitle}` : ""}
          </p>

          <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
            {preview}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {minutes} د
            </span>
            {isPdf && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
                <FileText className="h-3.5 w-3.5" aria-hidden />
                ملف الدرس
              </span>
            )}
            {item.isCompleted && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                مكتمل
              </span>
            )}
            <Link
              to="/lessons/$lessonId"
              params={{ lessonId: item.lessonId }}
              className="mr-auto font-semibold text-primary hover:underline"
            >
              افتح الدرس الكامل
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
