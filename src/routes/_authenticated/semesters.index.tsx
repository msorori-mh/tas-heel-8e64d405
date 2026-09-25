import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { Breadcrumbs } from "@/components/student/Breadcrumbs";
import { StateMessage } from "@/components/student/StudentNav";
import { SemesterSubjectsTabs } from "@/components/student/SemesterSubjectsTabs";
import { useAuth } from "@/hooks/use-auth";
import type { Semester } from "@/lib/subject-semester";

export const Route = createFileRoute("/_authenticated/semesters/")({
  component: SemestersPage,
  head: () => ({
    meta: [
      { title: "موادي — تمكين الطالب" },
      {
        name: "description",
        content:
          "تصفح مواد الفصل الأول والثاني حسب صفك ومنهجك، وحمّل كتب المنهج للاستخدام دون إنترنت.",
      },
      { property: "og:title", content: "موادي — تمكين الطالب" },
      {
        property: "og:description",
        content: "مواد الفصلين الدراسيين وكتب المنهج داخل تطبيق تمكين الطالب.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function SemestersPage() {
  const { loading } = useAuth();
  const [semester, setSemester] = useState<Semester>(1);

  if (loading) return <StateMessage variant="loading">جارٍ التحميل…</StateMessage>;

  return (
    <div className="space-y-3 sm:space-y-5" dir="rtl">
      <Breadcrumbs items={[{ label: "الرئيسية", to: "/app" }, { label: "موادي" }]} />

      <header>
        <h1 className="text-xl font-black text-foreground sm:text-2xl">موادي</h1>
        <p className="mt-0.5 text-xs text-muted-foreground sm:mt-1 sm:text-sm sm:leading-relaxed">
          اختر الفصل الدراسي، ثم افتح المادة أو حمّل كتب المنهج.
        </p>
      </header>

      <SemesterSubjectsTabs semester={semester} onSemesterChange={setSemester} />
    </div>
  );
}
