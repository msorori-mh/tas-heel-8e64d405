import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { Breadcrumbs } from "@/components/student/Breadcrumbs";
import { StateMessage } from "@/components/student/StudentNav";
import { SemesterSubjectsView } from "@/components/student/SemesterSubjectsView";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { Semester } from "@/lib/subject-semester";

export const Route = createFileRoute("/_authenticated/semesters/")({
  component: SemestersPage,
  head: () => ({
    meta: [
      { title: "موادي — تمكين الطالب" },
      {
        name: "description",
        content: "تصفح مواد الفصل الأول والثاني حسب صفك ومنهجك، وحمّل كتب المنهج للاستخدام دون إنترنت.",
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
    <div className="space-y-4" dir="rtl">
      <Breadcrumbs items={[{ label: "الرئيسية", to: "/app" }, { label: "موادي" }]} />

      <header>
        <h1 className="text-headline text-foreground">موادي</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          اختر الفصل الدراسي، ثم افتح المادة أو حمّل كتب المنهج.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="الفصل الدراسي"
        className="grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1"
      >
        {([1, 2] as Semester[]).map((value) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={semester === value}
            onClick={() => setSemester(value)}
            className={cn(
              "rounded-lg px-3 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              semester === value
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {value === 1 ? "الفصل الأول" : "الفصل الثاني"}
          </button>
        ))}
      </div>

      <SemesterSubjectsView semester={semester} />
    </div>
  );
}
