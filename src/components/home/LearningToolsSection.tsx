import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, NotebookPen, ScrollText, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "@tanstack/react-router";

const THIRD_SECONDARY_SLUG = "grade-12";

/**
 * Compact review list; ministerial entry retains the grade-12 gate.
 */
export function LearningToolsSection() {
  const { profile } = useAuth();
  const gradeId = profile?.grade_uuid ?? null;

  const { data: grade } = useQuery({
    enabled: !!gradeId,
    staleTime: 30 * 60 * 1000,
    queryKey: ["grade-slug", gradeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grades")
        .select("id,slug")
        .eq("id", gradeId as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const isThirdSecondary = grade?.slug === THIRD_SECONDARY_SLUG;

  return (
    <section aria-label="أدوات المراجعة" className="space-y-3">
      <h2 className="text-base font-black text-foreground">أدوات المراجعة</h2>
      <div className="divide-y divide-border overflow-hidden rounded-[20px] border border-border bg-card">
        <ReviewToolRow
          to="/my-mistakes"
          icon={NotebookPen}
          title="دفتر أخطائي"
          description="تظهر هنا الأسئلة التي تخطئ فيها"
          tone="bg-[#E2F3F1] text-[#087E79]"
        />
        <ReviewToolRow
          to="/quick-review"
          icon={Sparkles}
          title="المراجعة السريعة"
          description="ملخصات دروسك في بطاقات"
          tone="bg-primary/10 text-primary"
        />
        {isThirdSecondary ? (
          <ReviewToolRow
            to="/ministerial-exams"
            icon={ScrollText}
            title="النماذج الوزارية"
            description="نماذج السنوات السابقة لمنهجك"
            tone="bg-[#FFF1EE] text-[#A43C2C]"
          />
        ) : null}
      </div>
    </section>
  );
}
export function ReviewToolRow({
  to,
  icon: Icon,
  title,
  description,
  tone = "bg-primary/10 text-primary",
}: {
  to: "/my-mistakes" | "/quick-review" | "/ministerial-exams";
  icon: typeof NotebookPen;
  title: string;
  description: string;
  tone?: string;
}) {
  return (
    <Link
      to={to}
      className="flex min-h-16 items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone}`}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-sm font-bold text-foreground">{title}</strong>
        <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
      </span>
      <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
