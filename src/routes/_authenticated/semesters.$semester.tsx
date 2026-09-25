import { createFileRoute, notFound } from "@tanstack/react-router";

import { StateMessage } from "@/components/student/StudentNav";
import { Breadcrumbs } from "@/components/student/Breadcrumbs";
import { SemesterSubjectsTabs } from "@/components/student/SemesterSubjectsTabs";
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
  const navigate = Route.useNavigate();

  if (loading) return <StateMessage variant="loading">جارٍ التحميل…</StateMessage>;

  return (
    <div className="space-y-3 sm:space-y-5" dir="rtl">
      <Breadcrumbs
        items={[
          { label: "الرئيسية", to: "/app" },
          { label: "موادي", to: "/semesters" },
          { label: semesterLabel(semester) },
        ]}
      />

      <header>
        <h1 className="text-xl font-black text-foreground sm:text-2xl">موادي</h1>
        <p className="mt-0.5 text-xs text-muted-foreground sm:mt-1 sm:text-sm sm:leading-relaxed">
          اختر الفصل الدراسي، ثم افتح المادة أو حمّل كتب المنهج.
        </p>
      </header>

      <SemesterSubjectsTabs
        semester={semester}
        onSemesterChange={(value) => {
          void navigate({ to: "/semesters/$semester", params: { semester: String(value) } });
        }}
      />
    </div>
  );
}
