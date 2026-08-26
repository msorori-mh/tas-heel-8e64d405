import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { fetchTracksForGovernorate, translateTrackError } from "@/lib/curriculum-tracks";

type Grade = { id: string; name: string };
type Gov = { id: string; name: string };

/**
 * Edit-profile dialog. Updates only the current user's profile row (RLS scoped).
 * Curriculum-track selector renders only for multi-track governorates (source: governorate_curriculum_map).
 */
export function EditProfileDialog() {
  const { user, profile, refreshProfile } = useAuth();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [school, setSchool] = useState("");
  const [govId, setGovId] = useState<string>("");
  const [gradeId, setGradeId] = useState<string>("");
  const [trackId, setTrackId] = useState<string>("");

  // Static lookups — load when dialog opens
  const lookupsQ = useQuery({
    enabled: open,
    queryKey: ["edit-profile-lookups"],
    queryFn: async () => {
      const [g, gv] = await Promise.all([
        supabase.from("grades").select("id,name").order("sort_order"),
        supabase.from("governorates").select("id,name").order("sort_order"),
      ]);
      return {
        grades: (g.data ?? []) as Grade[],
        govs: (gv.data ?? []) as Gov[],
      };
    },
  });

  const tracksQ = useQuery({
    enabled: !!govId && open,
    queryKey: ["gov-tracks", govId],
    queryFn: () => fetchTracksForGovernorate(govId),
  });
  const allowedTracks = tracksQ.data ?? [];
  const isMulti = allowedTracks.length > 1;

  // Seed form when dialog opens
  useEffect(() => {
    if (!open || !profile) return;
    setFullName(profile.full_name ?? "");
    setSchool(profile.school_name ?? "");
    setGovId(profile.governorate_id ?? "");
    setGradeId(profile.grade_uuid ?? (profile.grade_id ? String(profile.grade_id) : ""));
    setTrackId(profile.curriculum_track_id ?? "");
  }, [open, profile]);

  // Reconcile track when governorate changes / allowed tracks load
  useEffect(() => {
    if (!govId) return;
    if (allowedTracks.length === 1) {
      setTrackId(allowedTracks[0].id);
    } else if (allowedTracks.length > 1) {
      setTrackId((curr) => (curr && allowedTracks.some((t) => t.id === curr) ? curr : ""));
    }
  }, [govId, allowedTracks]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const name = fullName.trim();
    if (!name) {
      toast.error("الاسم مطلوب");
      return;
    }
    if (!govId) {
      toast.error("المحافظة مطلوبة");
      return;
    }
    if (!gradeId) {
      toast.error("الصف الدراسي مطلوب");
      return;
    }
    if (isMulti && !trackId) {
      toast.error("اختر المنهج الدراسي");
      return;
    }

    setSaving(true);
    try {
      const govName = lookupsQ.data?.govs.find((g) => g.id === govId)?.name ?? null;
      // Send curriculum_track_id only when user explicitly picked (multi-track gov);
      // for single-track gov, leave it null → trigger fills default.
      const effectiveTrackId =
        trackId && allowedTracks.some((t) => t.id === trackId) ? trackId : null;

      const patch = {
        full_name: name,
        school_name: school.trim() || null,
        governorate_id: govId,
        governorate: govName,
        grade_uuid: gradeId,
        grade_id: gradeId,
        ...(effectiveTrackId ? { curriculum_track_id: effectiveTrackId } : {}),
      };

      const { error } = await supabase
        .from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(patch as any)
        .eq("user_id", user.id);
      if (error) throw error;

      toast.success("تم حفظ التغييرات.");
      await refreshProfile();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["pcard-grade"] }),
        queryClient.invalidateQueries({ queryKey: ["pcard-track"] }),
        queryClient.invalidateQueries({ queryKey: ["pcard-gov"] }),
        queryClient.invalidateQueries({ queryKey: ["gov-tracks"] }),
      ]);
      setOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("curriculum_track")) {
        toast.error(translateTrackError(err));
      } else {
        toast.error("تعذّر حفظ التغييرات. حاول مرة أخرى.");
      }
    } finally {
      setSaving(false);
    }
  }

  const grades = lookupsQ.data?.grades ?? [];
  const govs = lookupsQ.data?.govs ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Pencil className="h-4 w-4" />
          تعديل البيانات
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>تعديل البيانات الشخصية</DialogTitle>
          <DialogDescription>
            عدّل بياناتك الأساسية. لن يتم تغيير البريد أو كلمة المرور هنا.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <Label htmlFor="ep-name">الاسم الكامل</Label>
            <Input
              id="ep-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              disabled={saving}
            />
          </div>

          <div>
            <Label htmlFor="ep-school">المدرسة</Label>
            <Input
              id="ep-school"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              disabled={saving}
            />
          </div>

          <div>
            <Label htmlFor="ep-gov">المحافظة</Label>
            <select
              id="ep-gov"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={govId}
              onChange={(e) => setGovId(e.target.value)}
              disabled={saving || lookupsQ.isLoading}
              required
            >
              <option value="">-- اختر المحافظة --</option>
              {govs.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {isMulti && (
            <div>
              <Label htmlFor="ep-track">المنهج الدراسي</Label>
              <select
                id="ep-track"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={trackId}
                onChange={(e) => setTrackId(e.target.value)}
                disabled={saving}
                required
              >
                <option value="">-- اختر المنهج --</option>
                {allowedTracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.track_name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                محافظتك يُدرَّس فيها أكثر من منهج. اختر المنهج المعتمد في مدرستك.
              </p>
            </div>
          )}

          <div>
            <Label htmlFor="ep-grade">الصف الدراسي</Label>
            <select
              id="ep-grade"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={gradeId}
              onChange={(e) => setGradeId(e.target.value)}
              disabled={saving || lookupsQ.isLoading}
              required
            >
              <option value="">-- اختر الصف --</option>
              {grades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          <DialogFooter className="gap-2 pt-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              إلغاء
            </Button>
            <Button type="submit" disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              حفظ التغييرات
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
