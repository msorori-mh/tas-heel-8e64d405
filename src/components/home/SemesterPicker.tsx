import { Link } from "@tanstack/react-router";
import { CalendarDays, ChevronLeft } from "lucide-react";

/** 21B4F — compact subjects entry (two semester cards, one tap to subjects). */
export function SemesterPicker() {
  return (
    <section id="start-studying" aria-label="موادي" className="scroll-mt-20 space-y-2.5">
      <h2 className="text-sm font-black text-foreground">موادي</h2>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <SemesterCard semester={1} label="الفصل الدراسي الأول" />
        <SemesterCard semester={2} label="الفصل الدراسي الثاني" />
      </div>
    </section>
  );
}

function SemesterCard({ semester, label }: { semester: 1 | 2; label: string }) {
  return (
    <Link
      to="/semesters/$semester"
      params={{ semester: String(semester) }}
      className="grid min-h-12 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl border border-border/60 bg-card px-3 py-2.5 text-right transition-colors hover:border-primary/40"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <CalendarDays className="h-4.5 w-4.5" aria-hidden />
      </span>
      <span className="truncate text-[13px] font-bold text-foreground">{label}</span>
      <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
