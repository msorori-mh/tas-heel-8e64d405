import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Compass } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { fetchTracksForGovernorate, translateTrackError } from "@/lib/curriculum-tracks";

/**
 * Change-curriculum-track button + dialog.
 * Renders only when the user's governorate has more than one allowed track
 * in governorate_curriculum_map (source of truth — no hard-coding).
 */
export function ChangeCurriculumTrackButton() {
  const { user, profile, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const govId = profile?.governorate_id ?? null;
  const currentTrackId = profile?.curriculum_track_id ?? null;

  const tracksQ = useQuery({
    enabled: !!govId,
    queryKey: ["gov-tracks", govId],
    queryFn: () => fetchTracksForGovernorate(govId!),
  });

  const allowed = tracksQ.data ?? [];
  const isMulti = allowed.length > 1;

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setSelected(currentTrackId ?? "");
  }, [open, currentTrackId]);

  if (!govId || !isMulti) return null;

  async function handleSave() {
    if (!user || !selected || selected === currentTrackId) {
      setOpen(false);
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ curriculum_track_id: selected })
        .eq("user_id", user.id);
      if (error) throw error;
      toast.success("تم تحديث المنهج الدراسي.");
      await refreshProfile();
      await queryClient.invalidateQueries({ queryKey: ["pcard-track"] });
      setOpen(false);
    } catch (e) {
      toast.error(translateTrackError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Compass className="h-4 w-4" />
          تغيير المنهج
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>تغيير المنهج الدراسي</DialogTitle>
          <DialogDescription>
            محافظتك يُدرَّس فيها أكثر من منهج. اختر المنهج المعتمد في مدرستك.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          {tracksQ.isLoading ? (
            <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
          ) : (
            allowed.map((t) => (
              <Label
                key={t.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background p-3 text-sm hover:bg-muted"
              >
                <input
                  type="radio"
                  name="curriculum_track"
                  value={t.id}
                  checked={selected === t.id}
                  onChange={() => setSelected(t.id)}
                  className="h-4 w-4"
                />
                <span className="font-medium text-foreground">{t.track_name}</span>
                {currentTrackId === t.id && (
                  <span className="ms-auto rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    الحالي
                  </span>
                )}
              </Label>
            ))
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
            إلغاء
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !selected || selected === currentTrackId}
            className="gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
