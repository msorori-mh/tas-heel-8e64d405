import { useEffect, useState } from "react";
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
import { FileText } from "lucide-react";

export type SummaryItem = {
  id: string;
  summary: string | null;
  key_points: unknown;
  study_tip: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lessonTitle?: string | null;
  items: SummaryItem[];
}

function keyPointsToText(kp: unknown): string {
  if (Array.isArray(kp)) {
    return kp
      .map((x) => (typeof x === "string" ? x : JSON.stringify(x)))
      .join("\n");
  }
  return "";
}

export function LessonSummaryDialog({
  open,
  onOpenChange,
  lessonTitle,
  items,
}: Props) {
  const [summary, setSummary] = useState("");
  const [keyPointsText, setKeyPointsText] = useState("");
  const [studyTip, setStudyTip] = useState("");

  const tooMany = items.length > 1;

  useEffect(() => {
    if (!open) return;
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

  const keyPointsCount = keyPointsText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            تحرير ملخص الدرس
          </DialogTitle>
          <DialogDescription className="text-right">
            {lessonTitle ? `الدرس: ${lessonTitle}` : "تحرير ملخص الدرس."}
          </DialogDescription>
        </DialogHeader>

        {tooMany && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 text-right">
            يوجد أكثر من ملخص لهذا الدرس، سيتم دعم التحرير المتعدد لاحقًا.
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
              disabled={tooMany}
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
              disabled={tooMany}
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
              disabled={tooMany}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button disabled>الحفظ في المرحلة التالية</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default LessonSummaryDialog;
