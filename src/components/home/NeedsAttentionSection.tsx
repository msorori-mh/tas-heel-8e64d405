import { Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronLeft } from "lucide-react";
import type { ContinueItem } from "@/hooks/use-home-dashboard";

const LOW_SCORE = 60;

export type AttentionItem = {
  id: string;
  title: string;
  reason: string;
  lessonId: string;
};

/** 21B4F — derives real signals only: weak quiz score or a started-not-finished lesson. */
export function deriveNeedsAttention(items: ContinueItem[]): AttentionItem[] {
  const out: AttentionItem[] = [];
  for (const i of items) {
    if (i.quizScore != null && i.quizScore < LOW_SCORE) {
      out.push({
        id: `${i.lessonId}-score`,
        title: i.lessonTitle,
        reason: `نتيجة ضعيفة (${i.quizScore}%) — يحتاج مراجعة`,
        lessonId: i.lessonId,
      });
    } else if (!i.completed) {
      out.push({
        id: `${i.lessonId}-incomplete`,
        title: i.lessonTitle,
        reason: "درس بدأته ولم تكمله",
        lessonId: i.lessonId,
      });
    }
  }
  return out.slice(0, 3);
}

/** Hidden entirely when there is nothing to flag (no empty-state card at all). */
export function NeedsAttentionSection({ items }: { items: ContinueItem[] }) {
  const flagged = deriveNeedsAttention(items);
  if (flagged.length === 0) return null;

  return (
    <section aria-label="يحتاج انتباهك" className="space-y-2">
      <h2 className="flex items-center gap-1.5 text-sm font-black text-foreground">
        <AlertTriangle className="h-4 w-4 text-accent" aria-hidden />
        يحتاج انتباهك
      </h2>
      <ul className="space-y-2">
        {flagged.map((f) => (
          <li key={f.id}>
            <Link
              to="/lessons/$lessonId"
              params={{ lessonId: f.lessonId }}
              className="flex min-h-11 items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-foreground">{f.title}</p>
                <p className="truncate text-[11px] text-muted-foreground">{f.reason}</p>
              </div>
              <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
