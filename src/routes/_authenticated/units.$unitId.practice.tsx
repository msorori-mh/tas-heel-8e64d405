import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StateMessage } from "@/components/student/StudentNav";
import { Button } from "@/components/ui/button";
import { Home, ClipboardList } from "lucide-react";

export const Route = createFileRoute("/_authenticated/units/$unitId/practice")({
  component: UnitPracticePage,
});

function UnitPracticePage() {
  const { unitId } = Route.useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ["unit-practice-placeholder", unitId],
    queryFn: async () => {
      const { data: unit, error: unitErr } = await supabase
        .from("units")
        .select("id,title,subject_id")
        .eq("id", unitId)
        .maybeSingle();
      if (unitErr) throw unitErr;
      if (!unit) return { unit: null, subject: null };

      const { data: subject, error: subjErr } = await supabase
        .from("subjects")
        .select("id,name")
        .eq("id", unit.subject_id)
        .maybeSingle();
      if (subjErr) throw subjErr;

      return { unit, subject };
    },
  });

  if (isLoading) return <StateMessage variant="loading">جارٍ التحميل…</StateMessage>;
  if (error) return <StateMessage variant="error">تعذّر تحميل بيانات الوحدة.</StateMessage>;
  if (!data?.unit) return <StateMessage>هذه الوحدة غير موجودة.</StateMessage>;

  const subjectId = data.unit.subject_id;

  return (
    <div className="space-y-5">
      <nav className="text-xs text-muted-foreground" aria-label="مسار التنقل">
        <Link to="/app" className="hover:text-primary">موادي</Link>
        <span className="mx-1">/</span>
        <Link to="/subjects/$subjectId" params={{ subjectId }} className="hover:text-primary">
          {data.subject?.name ?? "المادة"}
        </Link>
        <span className="mx-1">/</span>
        <span className="text-foreground">اختبار الوحدة</span>
      </nav>

      <header className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <h1 className="text-xl font-bold text-foreground">اختبار الوحدة</h1>
        {data.unit.title && (
          <p className="mt-1 text-sm text-muted-foreground">{data.unit.title}</p>
        )}
      </header>

      <section className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
        <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground opacity-60" />
        <p className="mt-4 text-sm text-muted-foreground">
          سيتم عرض أسئلة اختبار الوحدة هنا قريبًا.
        </p>
      </section>

      <div className="pt-2">
        <Button asChild variant="outline" className="gap-1">
          <Link to="/subjects/$subjectId" params={{ subjectId }}>
            <Home className="h-4 w-4" /> العودة إلى المادة
          </Link>
        </Button>
      </div>
    </div>
  );
}
