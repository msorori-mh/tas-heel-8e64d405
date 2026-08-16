/**
 * 18C-4 — "المحتوى دون إنترنت" settings surface.
 *
 * Grade pack is explicit opt-in only: nothing downloads until the student
 * presses the button, and the estimated size is shown first.
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HardDrive, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { OfflinePackCard } from "./OfflinePackCard";
import { clearAll, isNativeStorage, totalCachedBytes } from "@/lib/offline/pdf-cache";
import { formatBytes } from "@/lib/offline/network";

export function OfflineContentSettings() {
  const { profile } = useAuth();
  const gradeKey = profile?.grade_uuid ?? (profile?.grade_id ? String(profile.grade_id) : null);
  const trackId = profile?.curriculum_track_id ?? null;

  const [used, setUsed] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const [showGradePack, setShowGradePack] = useState(false);

  const refreshUsage = async () => setUsed(await totalCachedBytes());
  useEffect(() => {
    void refreshUsage();
  }, []);

  const { data: lessonIds = [], isLoading } = useQuery({
    enabled: !!gradeKey && showGradePack,
    queryKey: ["offline-grade-lessons", gradeKey, trackId],
    queryFn: async () => {
      const { data: subjects, error: subjectsError } = await supabase
        .from("subjects")
        .select("id,curriculum_track_id")
        .eq("grade_id", gradeKey!);
      if (subjectsError) throw subjectsError;

      const ids = (subjects ?? [])
        .filter((s) => !trackId || !s.curriculum_track_id || s.curriculum_track_id === trackId)
        .map((s) => s.id);
      if (ids.length === 0) return [];

      const { data: lessons, error: lessonsError } = await supabase
        .from("lessons")
        .select("id")
        .in("subject_id", ids);
      if (lessonsError) throw lessonsError;
      return (lessons ?? []).map((l) => l.id as string);
    },
  });

  const handleClear = async () => {
    setClearing(true);
    try {
      await clearAll();
    } finally {
      setClearing(false);
      await refreshUsage();
    }
  };

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2 text-xs">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <HardDrive className="h-4 w-4" />
          المساحة المستخدمة على الجهاز
        </span>
        <span className="font-semibold text-foreground">{formatBytes(used)}</span>
      </div>

      <p className="text-xs text-muted-foreground">
        تُحفظ الملفات داخل مساحة التطبيق الخاصة
        {isNativeStorage() ? " على هاتفك" : " في هذا المتصفح"} ولا تظهر في مدير الملفات.
      </p>

      {!showGradePack ? (
        <Button size="sm" variant="outline" onClick={() => setShowGradePack(true)}>
          تحميل مواد صفي للاستخدام دون إنترنت
        </Button>
      ) : isLoading ? (
        <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> جارٍ حساب محتوى الصف…
        </span>
      ) : (
        <OfflinePackCard
          title="محتوى صفي الدراسي"
          lessonIds={lessonIds}
          description="تحميل ملفات دروس مواد صفك كاملة. يُفضّل استخدام Wi-Fi."
        />
      )}

      {(used ?? 0) > 0 && (
        <Button size="sm" variant="ghost" onClick={handleClear} disabled={clearing}>
          {clearing ? (
            <Loader2 className="ms-2 h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="ms-2 h-4 w-4" />
          )}
          إفراغ المحتوى المحمّل
        </Button>
      )}
    </div>
  );
}

export default OfflineContentSettings;
