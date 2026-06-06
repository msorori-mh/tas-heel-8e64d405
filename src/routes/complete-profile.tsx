import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { translateAuthError } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/complete-profile")({
  component: CompleteProfile,
});

type Grade = { id: number; name_ar: string };
type Gov = { id: string; name_ar: string };

function CompleteProfile() {
  const navigate = useNavigate();
  const { user, profile, loading, refreshProfile, profileComplete, signOut } = useAuth();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [govs, setGovs] = useState<Gov[]>([]);
  const [fullName, setFullName] = useState("");
  const [gradeId, setGradeId] = useState<string>("");
  const [govId, setGovId] = useState<string>("");
  const [school, setSchool] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!loading && profileComplete) navigate({ to: "/", replace: true });
  }, [loading, profileComplete, navigate]);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      if (profile.grade_id) setGradeId(String(profile.grade_id));
      if (profile.governorate_id) setGovId(profile.governorate_id);
      setSchool(profile.school_name ?? "");
    }
  }, [profile]);

  useEffect(() => {
    (async () => {
      const [g, gv] = await Promise.all([
        supabase.from("grades").select("id,name_ar").order("id"),
        supabase.from("governorates").select("id,name_ar").order("name_ar"),
      ]);
      if (g.data) setGrades(g.data as Grade[]);
      if (gv.data) setGovs(gv.data as Gov[]);
    })();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setErr(null);
    try {
      const gov = govs.find((x) => x.id === govId);
      const payload: Record<string, unknown> = {
        user_id: user.id,
        full_name: fullName.trim(),
        grade_id: Number(gradeId),
        governorate_id: govId,
        governorate: gov?.name_ar ?? null,
        school_name: school.trim() || null,
      };
      const { error } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "user_id" });
      if (error) throw error;
      await refreshProfile();
      navigate({ to: "/", replace: true });
    } catch (e) {
      setErr(translateAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">جارٍ التحميل...</div>;
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-lg rounded-2xl border bg-card p-6 shadow-card">
        <h1 className="text-2xl font-bold">أكمل بياناتك</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          نحتاج بعض المعلومات لنعرض لك المنهج المناسب.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <Label htmlFor="fn">الاسم الكامل</Label>
            <Input id="fn" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>

          <div>
            <Label htmlFor="gr">الصف</Label>
            <select
              id="gr"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={gradeId}
              onChange={(e) => setGradeId(e.target.value)}
              required
            >
              <option value="">-- اختر الصف --</option>
              {grades.map((g) => (
                <option key={g.id} value={g.id}>{g.name_ar}</option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="gv">المحافظة</Label>
            <select
              id="gv"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={govId}
              onChange={(e) => setGovId(e.target.value)}
              required
            >
              <option value="">-- اختر المحافظة --</option>
              {govs.map((g) => (
                <option key={g.id} value={g.id}>{g.name_ar}</option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="sc">المدرسة (اختياري)</Label>
            <Input id="sc" value={school} onChange={(e) => setSchool(e.target.value)} />
          </div>

          {err && <p className="text-sm text-destructive">{err}</p>}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "جارٍ الحفظ..." : "حفظ ومتابعة"}
          </Button>

          <button
            type="button"
            className="w-full text-sm text-muted-foreground"
            onClick={async () => { await signOut(); navigate({ to: "/auth" }); }}
          >
            تسجيل الخروج
          </button>
        </form>
      </div>
    </div>
  );
}
