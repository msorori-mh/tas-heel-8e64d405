import { Link } from "@tanstack/react-router";
import { CalendarDays, ChevronLeft } from "lucide-react";

/** Step 5 of the home page: entry point into each semester's subjects. */
export function SemesterPicker() {
  return (
    <section id="start-studying" className="scroll-mt-20">
      <h2 className="mb-3 text-xl font-bold text-foreground lg:text-[22px]">الفصول الدراسية</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:gap-6">
        <SemesterCard semester={1} label="الفصل الدراسي الأول" subtitle="مواد الفصل الأول" />
        <SemesterCard semester={2} label="الفصل الدراسي الثاني" subtitle="مواد الفصل الثاني" />
      </div>
    </section>
  );
}

function SemesterCard({
  semester,
  label,
  subtitle,
}: {
  semester: 1 | 2;
  label: string;
  subtitle: string;
}) {
  return (
    <Link
      to="/semesters/$semester"
      params={{ semester: String(semester) }}
      className="group flex h-full w-full items-center justify-between gap-4 rounded-2xl border border-border/60 bg-card p-5 text-right shadow-sm transition-shadow hover:border-primary/40 hover:shadow-md lg:p-6"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <CalendarDays className="h-7 w-7" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-foreground">{label}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity group-hover:opacity-90">
        ابدأ
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </span>
    </Link>
  );
}
