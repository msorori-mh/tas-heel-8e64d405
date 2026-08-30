import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpenCheck, ClipboardList, History, ScrollText } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Breadcrumbs } from "@/components/student/Breadcrumbs";

export const Route = createFileRoute("/_authenticated/exams/")({
  component: ExamsHubPage,
  head: () => ({
    meta: [
      { title: "الاختبارات — تمكين الطالب" },
      {
        name: "description",
        content: "ابدأ اختبارات موادك أو راجع محاولاتك السابقة في تمكين الطالب.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function ExamsHubPage() {
  const { profile } = useAuth();
  const gradeId = profile?.grade_uuid ?? null;
  const { data: gradeSlug } = useQuery({
    enabled: Boolean(gradeId),
    queryKey: ["exams-hub-grade", gradeId],
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grades")
        .select("slug")
        .eq("id", gradeId as string)
        .maybeSingle();
      if (error) throw error;
      return data?.slug ?? null;
    },
  });

  const isThirdSecondary = gradeSlug === "grade-12";

  return (
    <div className="space-y-5" dir="rtl">
      <Breadcrumbs items={[{ label: "الرئيسية", to: "/app" }, { label: "الاختبارات" }]} />

      <header>
        <h1 className="text-headline flex items-center gap-2 text-foreground">
          <ClipboardList className="h-5 w-5 text-primary" aria-hidden />
          الاختبارات
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          ابدأ اختبارًا من مادّتك، أو راجع نتائج محاولاتك السابقة.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <HubLink
          to="/semesters"
          icon={BookOpenCheck}
          title="اختبارات المواد"
          description="اختر المادة ثم الوحدة أو الدرس لبدء التدريب المتاح."
        />
        <HubLink
          to="/exams/history"
          icon={History}
          title="سجل الاختبارات"
          description="راجع المحاولات المنتهية والنتائج السابقة."
        />
        {isThirdSecondary ? (
          <HubLink
            to="/ministerial-exams"
            icon={ScrollText}
            title="النماذج الوزارية"
            description="تدرّب على نماذج السنوات السابقة المناسبة لمنهجك."
          />
        ) : null}
      </div>
    </div>
  );
}

function HubLink({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: "/semesters" | "/exams/history" | "/ministerial-exams";
  icon: typeof ClipboardList;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="rounded-2xl border border-border/60 bg-card p-4 shadow-card transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <h2 className="mt-3 text-base font-bold text-foreground">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
    </Link>
  );
}
