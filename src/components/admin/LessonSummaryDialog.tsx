import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Loader2 } from "lucide-react";

export type SummaryItem = {
  id: string;
  summary: string | null;
  key_points: unknown;
  study_tip: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lessonId: string;
  lessonTitle?: string | null;
  items: SummaryItem[];
}

function keyPointsToText(kp: unknown): string {
  if (Array.isArray(kp)) {
    return kp.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("\n");
  }
  return "";
}

function textToKeyPoints(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export function LessonSummaryDialog({ open, onOpenChange, lessonId, lessonTitle, items }: Props) {
  const qc = useQueryClient();
  const [summary, setSummary] = useState("");
  const [keyPointsText, setKeyPointsText] = useState("");
  const [studyTip, setStudyTip] = useState("");
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const tooMany = items.length > 1;

  useEffect(() => {
    if (!open) return;
    setErrMsg(null);
    setSaving(false);
    if (items.length === 0) {
      setSummary("");
      setKeyPointsText("");
      setStudyTip("");
      return;
    }
    const r = items[0];
    setSummary(r.summary ?? "");
    setKeyPointsText(keyPointsToText(r.key_points));
    setStudyTip(r.study_tip ?? "");
  }, [open, items]);

  const keyPointsCount = textToKeyPoints(keyPointsText).length;

  const handleSave = async () => {
    if (saving) return;
    setErrMsg(null);

    if (tooMany) {
      setErrMsg("يوجد أكثر من ملخص لهذا الدرس، سيتم دعم التحرير المتعدد لاحقًا.");
      return;
    }

    const trimmedSummary = summary.trim();
    if (!trimmedSummary) {
      setErrMsg("الملخص مطلوب.");
      return;
    }

    const pointsArray = textToKeyPoints(keyPointsText);
    if (pointsArray.length === 0) {
      setErrMsg("أضف نقطة رئيسية واحدة على الأقل.");
      return;
    }

    const trimmedTip = studyTip.trim();
    const tipOrNull = trimmedTip.length > 0 ? trimmedTip : null;

    setSaving(true);
    try {
      if (items.length === 1) {
        const existing = items[0];
        const { error } = await supabase
          .from("lesson_summaries")
          .update({
            summary: trimmedSummary,
            key_points: pointsArray,
            study_tip: tipOrNull,
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("lesson_summaries").insert({
          lesson_id: lessonId,
          summary: trimmedSummary,
          key_points: pointsArray,
          study_tip: tipOrNull,
        });
        if (error) throw error;
      }

      toast.success("تم حفظ ملخص الدرس بنجاح.");
      await qc.invalidateQueries({
        queryKey: ["admin-lesson-detail", "summary", lessonId],
      });
      onOpenChange(false);
    } catch (e: any) {
      toast.error("تعذر حفظ ملخص الدرس.");
      setErrMsg(e?.message ? `تعذر الحفظ: ${e.message}` : "تعذر حفظ ملخص الدرس.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (!saving ? onOpenChange(o) : null)}>
      <DialogContent dir="rtl" className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            🧠 المراجعة السريعة
          </DialogTitle>
          <DialogDescription className="text-right">
            {lessonTitle ? `الدرس: ${lessonTitle}` : "تحرير المراجعة السريعة للدرس."}
          </DialogDescription>
        </DialogHeader>

        {/* 20D1 §2 — Quick Review هي طبقة تعلّم من تمكين، وليست نص الكتاب. */}
        <div className="rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-[11px] leading-5 text-muted-foreground text-right">
          المراجعة السريعة طبقة تعلّم من إعداد تمكين: أهم الأفكار، النقاط التي يجب تذكّرها، المفاهيم
          الرئيسية، وتنبيهات على الأخطاء الشائعة.
          <span className="block text-amber-600">
            لا تنسخ نص الكتاب الرسمي أو «تقويم الكتاب» هنا.
          </span>
          بعد الحفظ لن يراها الطالب حتى تمر بالمسار: مسودة ← مراجعة ← اعتماد.
        </div>

        {tooMany && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 text-right">
            يوجد أكثر من ملخص لهذا الدرس، سيتم دعم التحرير المتعدد لاحقًا.
          </div>
        )}

        {errMsg && !tooMany && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive text-right">
            {errMsg}
          </div>
        )}

        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="summary-text">الملخص</Label>
              <span className="text-[11px] text-muted-foreground">
                {summary.length.toLocaleString("ar-SA")} حرف
              </span>
            </div>
            <Textarea
              id="summary-text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={6}
              dir="rtl"
              disabled={tooMany || saving}
              className="resize-y"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="key-points">النقاط الرئيسية</Label>
              <span className="text-[11px] text-muted-foreground">
                {keyPointsCount.toLocaleString("ar-SA")} نقطة (كل سطر = نقطة)
              </span>
            </div>
            <Textarea
              id="key-points"
              value={keyPointsText}
              onChange={(e) => setKeyPointsText(e.target.value)}
              rows={5}
              dir="rtl"
              disabled={tooMany || saving}
              placeholder="النقطة الأولى&#10;النقطة الثانية&#10;..."
              className="resize-y"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="study-tip">نصيحة للدراسة (اختياري)</Label>
            <Input
              id="study-tip"
              value={studyTip}
              onChange={(e) => setStudyTip(e.target.value)}
              dir="rtl"
              disabled={tooMany || saving}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            إلغاء
          </Button>
          <Button onClick={handleSave} disabled={saving || tooMany}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
                جاري الحفظ...
              </>
            ) : (
              "حفظ"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default LessonSummaryDialog;
