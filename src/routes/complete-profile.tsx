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

type Grade = { id: string; name: string };
type Gov = { id: string; name: string };

function splitName(full: string | null | undefined): [string, string, string] {
  if (!full) return ["", "", ""];
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0) return ["", "", ""];
  if (parts.length === 1) return [parts[0], "", ""];
  if (parts.length === 2) return [parts[0], "", parts[1]];
  const first = parts[0];
  const last = parts[parts.length - 1];
  const middle = parts.slice(1, -1).join(" ");
  return [first, middle, last];
}

function CompleteProfile() {
  const navigate = useNavigate();
  const { user, profile, loading, refreshProfile, profileComplete, signOut } = useAuth();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [govs, setGovs] = useState<Gov[]>([]);
  const [firstName, setFirstName] = useState("");
  const [secondName, setSecondName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gradeId, setGradeId] = useState<string>("");
  const [govId, setGovId] = useState<string>("");
  const [school, setSchool] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { mode: "login" }, replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!loading && profileComplete) navigate({ to: "/app", replace: true });
  }, [loading, profileComplete, navigate]);

  useEffect(() => {
    if (profile) {
      const [f, s, l] = splitName(profile.full_name);
      setFirstName(f);
      setSecondName(s);
      setLastName(l);
      if (profile.grade_uuid) setGradeId(profile.grade_uuid);
      else if (profile.grade_id) setGradeId(String(profile.grade_id));
      if (profile.governorate_id) setGovId(profile.governorate_id);
      setSchool(profile.school_name ?? "");
    }
  }, [profile]);

  useEffect(() => {
    (async () => {
      const [g, gv] = await Promise.all([
        supabase.from("grades").select("id,name").order("sort_order"),
        supabase.from("governorates").select("id,name").order("sort_order"),
      ]);
      if (g.data) setGrades(g.data as unknown as Grade[]);
      if (gv.data) setGovs(gv.data as unknown as Gov[]);
    })();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setErr(null);
    try {
      const fullName = [firstName, secondName, lastName]
        .map((x) => x.trim())
        .filter(Boolean)
        .join(" ");
      if (!fullName) throw new Error("الاسم مطلوب");

      // اشتقاق المسار من المحافظة (لا يُكتب من الواجهة)
      let trackId: string | null = profile?.curriculum_track_id ?? null;
      if (govId) {
        const { data: mapRow } = await supabase
          .from("governorate_curriculum_map")
          .select("curriculum_track_id")
          .eq("governorate_id", govId)
          .limit(1)
          .maybeSingle();
        if (mapRow?.curriculum_track_id) trackId = mapRow.curriculum_track_id as string;
      }

      const gov = govs.find((x) => x.id === govId);
      const payload = {
        user_id: user.id,
        full_name: fullName,
        grade_id: gradeId,
        grade_uuid: gradeId,
        governorate_id: govId,
        governorate: gov?.name ?? null,
        school_name: school.trim() || null,
        ...(trackId ? { curriculum_track_id: trackId } : {}),
      };
      const { error } = await supabase
        .from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(payload as any, { onConflict: "user_id" });
      if (error) throw error;
      await refreshProfile();
      navigate({ to: "/app", replace: true });
    } catch (e2) {
      setErr(translateAuthError(e2));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">جارٍ التحميل...</div>;
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8" dir="rtl">
      <div className="mx-auto max-w-lg rounded-2xl border bg-card p-6 shadow-card">
        <h1 className="text-2xl font-bold">أكمل بياناتك</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          نحتاج بعض المعلومات لنعرض لك المنهج المناسب.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="fn">الاسم الأول</Label>
              <Input id="fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="sn">الاسم الثاني</Label>
              <Input id="sn" value={secondName} onChange={(e) => setSecondName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ln">اللقب</Label>
              <Input id="ln" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
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
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="sc">المدرسة</Label>
            <Input id="sc" value={school} onChange={(e) => setSchool(e.target.value)} required />
          </div>

          <div>
            <Label htmlFor="gr">الصف الدراسي</Label>
            <select
              id="gr"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={gradeId}
              onChange={(e) => setGradeId(e.target.value)}
              required
            >
              <option value="">-- اختر الصف --</option>
              {grades.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          {err && <p className="text-sm text-destructive">{err}</p>}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "جارٍ الحفظ..." : "حفظ ومتابعة"}
          </Button>

          <button
            type="button"
            className="w-full text-sm text-muted-foreground"
            onClick={async () => { await signOut(); navigate({ to: "/auth", search: { mode: "login" } }); }}
          >
            تسجيل الخروج
          </button>
        </form>
      </div>
    </div>
  );
}
