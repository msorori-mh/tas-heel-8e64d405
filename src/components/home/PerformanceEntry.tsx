import { Link } from "@tanstack/react-router";
import { BarChart3, ChevronLeft } from "lucide-react";

/** Home entry point for /performance. */
export function PerformanceEntry() {
  return (
    <section aria-label="تحليل أدائي">
      <Link
        to="/performance"
        className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card transition-colors hover:bg-muted/40"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <BarChart3 className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-foreground">تحليل أدائي</span>
          <span className="block truncate text-xs text-muted-foreground">
            متوسط درجاتك، تقدمك في المنهج، ونقاط قوتك وضعفك في لوحة واحدة.
          </span>
        </span>
        <ChevronLeft className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </section>
  );
}
