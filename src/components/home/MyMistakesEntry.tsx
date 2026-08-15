import { Link } from "@tanstack/react-router";
import { NotebookPen, ChevronLeft } from "lucide-react";

/** Home entry point for /my-mistakes. */
export function MyMistakesEntry() {
  return (
    <section aria-label="دفتر أخطائي">
      <Link
        to="/my-mistakes"
        className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card transition-colors hover:bg-muted/40"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <NotebookPen className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-foreground">دفتر أخطائي</span>
          <span className="block truncate text-xs text-muted-foreground">
            الأسئلة التي أخطأت فيها أو تركتها فارغة — راجعها قبل الاختبار.
          </span>
        </span>
        <ChevronLeft className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </section>
  );
}
