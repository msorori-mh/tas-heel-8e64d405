import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ChevronLeft, ScrollText } from "lucide-react";

/**
 * 14D entry point. Shown to third-secondary students only; other grades get a
 * ministerial surface later if a suitable model type is defined for them.
 */
const THIRD_SECONDARY_SLUG = "grade-12";

export function MinisterialExamsEntry() {
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

  if (grade?.slug !== THIRD_SECONDARY_SLUG) return null;

  return (
    <Link
      to="/ministerial-exams"
      className="flex items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-card p-4 shadow-sm transition hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-hero-gradient">
          <ScrollText className="h-5 w-5 text-primary-foreground" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block font-bold text-foreground">نماذج الاختبارات الوزارية</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            تدرّب على نماذج السنوات السابقة الخاصة بمنهجك.
          </span>
        </span>
      </span>
      <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
