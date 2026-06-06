import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { StateMessage } from "@/components/student/StudentNav";
import { BookOpen, GraduationCap, MapPin, School, ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app")({
  component: StudentHome,
});

type Subject = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  sort_order: number;
};

function StudentHome() {
  const { profile, loading } = useAuth();

  const gradeKey = profile?.grade_uuid ?? (profile?.grade_id ? String(profile.grade_id) : null);

  const { data: grade } = useQuery({
    enabled: !!gradeKey,
    queryKey: ["grade-name", gradeKey],
    queryFn: async () => {
      const { data } = await supabase
        .from("grades")
        .select("id,name")
        .eq("id", gradeKey!)
        .maybeSingle();
      return data as { id: string; name: string } | null;
    },
  });

  const { data: gov } = useQuery({
    enabled: !!profile?.governorate_id,
    queryKey: ["gov-name", profile?.governorate_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("governorates")
        .select("id,name")
        .eq("id", profile!.governorate_id!)
        .maybeSingle();
      return data as { id: string; name: string } | null;
    },
  });

  const {
    data: subjects,
    isLoading: subjLoading,
    error: subjError,
  } = useQuery({
    enabled: !!gradeKey,
    queryKey: ["my-subjects", gradeKey, profile?.curriculum_track_id ?? null],
    queryFn: async () => {
      let q = supabase
        .from("subjects")
        .select("id,name,icon,color,sort_order,curriculum_track_id")
        .eq("grade_id", gradeKey!)
        .order("sort_order");
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as (Subject & { curriculum_track_id: string | null })[];
      const trackId = profile?.curriculum_track_id ?? null;
      return rows.filter(
        (s) => s.curriculum_track_id === null || s.curriculum_track_id === trackId,
      );
    },
  });

  const govName = useMemo(
    () => gov?.name ?? profile?.governorate ?? null,
    [gov, profile?.governorate],
  );

  if (loading) {
    return <StateMessage variant="loading">جارٍ التحميل…</StateMessage>;
  }

  return (
    <div className="space-y-5" dir="rtl">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <h1 className="text-xl font-bold text-foreground">
          مرحبًا {profile?.full_name ?? "بك"} 👋
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">جاهز لمذاكرة اليوم؟</p>

        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
          <InfoChip icon={<GraduationCap className="h-4 w-4" />} label="الصف" value={grade?.name ?? "—"} />
          <InfoChip icon={<MapPin className="h-4 w-4" />} label="المحافظة" value={govName ?? "—"} />
          {profile?.school_name && (
            <InfoChip icon={<School className="h-4 w-4" />} label="المدرسة" value={profile.school_name} />
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">موادي</h2>
          {subjects && <span className="text-xs text-muted-foreground">{subjects.length} مادة</span>}
        </div>

        {subjLoading && <StateMessage variant="loading">جارٍ تحميل المواد…</StateMessage>}
        {subjError && <StateMessage variant="error">تعذّر تحميل المواد.</StateMessage>}

        {subjects && subjects.length === 0 && (
          <StateMessage>لم تُضاف مواد لهذا الصف بعد.</StateMessage>
        )}

        {subjects && subjects.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2">
            {subjects.map((s) => (
              <li key={s.id}>
                <Link
                  to="/subjects/$subjectId"
                  params={{ subjectId: s.id }}
                  className="group flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white text-base font-bold"
                      style={{ backgroundColor: s.color ?? undefined }}
                      aria-hidden
                    >
                      {s.name?.[0] ?? <BookOpen className="h-5 w-5" />}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-foreground">{s.name}</div>
                      <div className="text-xs text-primary group-hover:underline">ابدأ المذاكرة</div>
                    </div>
                  </div>
                  <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function InfoChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
      <span className="text-primary">{icon}</span>
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-semibold text-foreground">{value}</div>
      </div>
    </div>
  );
}

// Silence unused Button import while keeping it available for future CTAs
void Button;
