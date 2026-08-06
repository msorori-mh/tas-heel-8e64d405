import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, ChevronLeft } from "lucide-react";
import { Breadcrumbs } from "@/components/student/Breadcrumbs";

export const Route = createFileRoute("/_authenticated/semesters/")({
  component: SemestersPage,
});

function SemestersPage() {
  return (
    <div className="space-y-4" dir="rtl">
      <Breadcrumbs items={[{ label: "الرئيسية", to: "/app" }, { label: "موادي" }]} />

      <header>
        <h1 className="text-headline text-foreground">موادي</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          اختر الفصل الدراسي لعرض المواد الخاصة بمنهجك وصفك.
        </p>
      </header>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <SemesterCard semester={1} label="الفصل الدراسي الأول" subtitle="مواد الفصل الأول" />
        <SemesterCard semester={2} label="الفصل الدراسي الثاني" subtitle="مواد الفصل الثاني" />
      </div>
    </div>
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
      className="group flex items-center justify-between rounded-xl border border-border/60 bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <CalendarDays className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-foreground">{label}</p>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5" />
    </Link>
  );
}
