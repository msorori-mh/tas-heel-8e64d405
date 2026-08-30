import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { StateMessage } from "@/components/student/StudentNav";
import { Breadcrumbs } from "@/components/student/Breadcrumbs";
import { SemesterSubjectsView } from "@/components/student/SemesterSubjectsView";
import { useAuth } from "@/hooks/use-auth";
import { type Semester, semesterLabel } from "@/lib/subject-semester";

export const Route = createFileRoute("/_authenticated/semesters/$semester")({
  beforeLoad: ({ params }) => {
    if (params.semester !== "1" && params.semester !== "2") throw notFound();
  },
  component: SemesterSubjectsPage,
});

function SemesterSubjectsPage() {
  const { semester: raw } = Route.useParams();
  const semester = (Number(raw) === 2 ? 2 : 1) as Semester;
  const { loading } = useAuth();

  if (loading) return <StateMessage variant="loading">جارٍ التحميل…</StateMessage>;

  return (
    <div className="space-y-5" dir="rtl">
      <Breadcrumbs
        items={[
          { label: "الرئيسية", to: "/app" },
          { label: "موادي", to: "/semesters" },
          { label: semesterLabel(semester) },
        ]}
      />

      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-black text-foreground sm:text-2xl">
            مواد {semesterLabel(semester)}
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            تعرض هنا مواد {semesterLabel(semester)} المطابقة لمنهجك وصفك.
          </p>
        </div>
        <Link
          to="/semesters/$semester"
          params={{ semester: semester === 1 ? "2" : "1" }}
          className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground shadow-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {semester === 1 ? "الفصل الثاني" : "الفصل الأول"}
        </Link>
      </header>

      <SemesterSubjectsView semester={semester} />
    </div>
  );
}
