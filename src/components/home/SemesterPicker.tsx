import { Link } from "@tanstack/react-router";
import { CalendarDays, ChevronLeft } from "lucide-react";

/** 21B4F — compact subjects entry (two semester cards, one tap to subjects). */
export function SemesterPicker() {
  return (
    <section id="start-studying" aria-label="موادي" className="scroll-mt-20 space-y-3">
      <div>
        <h2 className="text-base font-black text-foreground">موادي</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">افتح مواد فصلك وكتب المنهج الرسمية.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
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
      className="group grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 text-right shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <CalendarDays className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-bold text-foreground">{label}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          عرض المواد والكتب
        </span>
      </span>
      <ChevronLeft
        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5"
        aria-hidden
      />
    </Link>
  );
}
