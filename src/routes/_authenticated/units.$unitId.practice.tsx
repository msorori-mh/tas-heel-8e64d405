import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { StateMessage } from "@/components/student/StudentNav";
import { Button } from "@/components/ui/button";
import { Home, ClipboardList, Lock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/units/$unitId/practice")({
  component: UnitPracticePage,
});

type UnitRow = { id: string; title: string; subject_id: string; is_free: boolean };
type SubjectRow = {
  id: string;
  name: string;
  grade_id: string;
  curriculum_track_id: string | null;
};

function UnitPracticePage() {
  const { unitId } = Route.useParams();
  const { profile } = useAuth();

  const { data: unit, isLoading: loadingUnit, error: unitErr } = useQuery({
    queryKey: ["unit-practice-unit", unitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units")
        .select("id,title,subject_id,is_free")
        .eq("id", unitId)
        .maybeSingle();
      if (error) throw error;
      return (data as UnitRow | null) ?? null;
    },
  });

  const { data: subject } = useQuery({
    enabled: !!unit?.subject_id,
    queryKey: ["unit-practice-subject", unit?.subject_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id,name,grade_id,curriculum_track_id")
        .eq("id", unit!.subject_id)
        .maybeSingle();
      if (error) throw error;
      return (data as SubjectRow | null) ?? null;
    },
  });

  const { data: hasActiveSub } = useQuery({
    enabled: !!profile?.user_id,
    queryKey: ["has-active-subscription", profile?.user_id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_active_subscription", {
        _user_id: profile!.user_id,
      });
      if (error) return false;
      return Boolean(data);
    },
  });

  const { data: isAdmin } = useQuery({
    enabled: !!profile?.user_id,
    queryKey: ["is-admin", profile?.user_id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: profile!.user_id,
        _role: "admin",
      });
      if (error) return false;
      return Boolean(data);
    },
  });

  const accessibleGradeTrack = useMemo(() => {
    if (!subject || !profile) return null;
    const profileGrade =
      profile.grade_uuid ?? (profile.grade_id ? String(profile.grade_id) : null);
    if (profileGrade && subject.grade_id !== profileGrade) return false;
    if (
      subject.curriculum_track_id &&
      profile.curriculum_track_id &&
      subject.curriculum_track_id !== profile.curriculum_track_id
    ) {
      return false;
    }
    return true;
  }, [subject, profile]);

  if (loadingUnit) return <StateMessage variant="loading">جارٍ التحميل…</StateMessage>;
  if (unitErr) return <StateMessage variant="error">تعذّر تحميل بيانات الوحدة.</StateMessage>;
  if (!unit) return <StateMessage>هذه الوحدة غير موجودة.</StateMessage>;

  const subjectId = unit.subject_id;

  const BackBtn = (
    <div className="pt-2">
      <Button asChild variant="outline" className="gap-1">
        <Link to="/subjects/$subjectId" params={{ subjectId }}>
          <Home className="h-4 w-4" /> العودة إلى المادة
        </Link>
      </Button>
    </div>
  );

  const Breadcrumb = (
    <nav className="text-xs text-muted-foreground" aria-label="مسار التنقل">
      <Link to="/app" className="hover:text-primary">موادي</Link>
      <span className="mx-1">/</span>
      <Link to="/subjects/$subjectId" params={{ subjectId }} className="hover:text-primary">
        {subject?.name ?? "المادة"}
      </Link>
      <span className="mx-1">/</span>
      <span className="text-foreground">اختبار الوحدة</span>
    </nav>
  );

  if (subject && accessibleGradeTrack === false) {
    return (
      <div className="space-y-4">
        {Breadcrumb}
        <StateMessage>هذا الاختبار غير متاح.</StateMessage>
        {BackBtn}
      </div>
    );
  }

  const canAccessPractice =
    Boolean(isAdmin) || unit.is_free === true || Boolean(hasActiveSub);

  return (
    <div className="space-y-5">
      {Breadcrumb}

      <header className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <h1 className="text-xl font-bold text-foreground">اختبار الوحدة</h1>
        {unit.title && (
          <p className="mt-1 text-sm text-muted-foreground">{unit.title}</p>
        )}
      </header>

      {canAccessPractice ? (
        <section className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
          <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground opacity-60" />
          <p className="mt-4 text-sm text-muted-foreground">
            سيتم عرض أسئلة اختبار الوحدة هنا قريبًا.
          </p>
        </section>
      ) : (
        <section className="rounded-2xl border border-border bg-card p-6 text-center shadow-card">
          <Lock className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-sm font-medium text-foreground">
            اختبار هذه الوحدة متاح ضمن الاشتراك.
          </p>
        </section>
      )}

      {BackBtn}
    </div>
  );
}
