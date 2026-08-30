import { useQuery } from "@tanstack/react-query";
import { BarChart3, NotebookPen, ScrollText, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { NavTile } from "@/components/common/NavTile";

const THIRD_SECONDARY_SLUG = "grade-12";

/**
 * 17A — One "أدوات التعلم" section replacing four stacked full-width entry
 * cards. Same destinations and same third-secondary gate as before; only the
 * layout density changes (2x2 on phones instead of four tall rows).
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
    <section aria-label="أدوات التعلم" className="space-y-3">
      <div>
        <h2 className="text-base font-black text-foreground">أدوات التعلم</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          مراجعة أسرع، أخطاء أوضح، وتقدم يمكنك متابعته.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
        <NavTile
          to="/quick-review"
          icon={Sparkles}
          title="المراجعة السريعة"
          description="ملخصات دروسك في بطاقات."
        />
        <NavTile
          to="/my-mistakes"
          icon={NotebookPen}
          title="دفتر أخطائي"
          description="الأسئلة التي أخطأت فيها."
          tone="bg-accent/10 text-accent"
        />
        <NavTile
          to="/performance"
          icon={BarChart3}
          title="تحليل أدائي"
          description="درجاتك وتقدمك ونقاط ضعفك."
          tone="bg-success/10 text-success"
        />
        {isThirdSecondary ? (
          <NavTile
            to="/ministerial-exams"
            icon={ScrollText}
            title="النماذج الوزارية"
            description="نماذج السنوات السابقة لمنهجك."
            tone="bg-secondary/20 text-primary"
          />
        ) : null}
      </div>
    </section>
  );
}
