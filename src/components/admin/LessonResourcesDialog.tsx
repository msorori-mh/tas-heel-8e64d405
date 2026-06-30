import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, AlertTriangle } from "lucide-react";

export type LessonResourceItem = {
  id: string;
  lesson_id?: string;
  title: string;
  resource_type: string;
  url: string;
  description: string | null;
  sort_order: number;
  __local?: boolean;
};

const RESOURCE_TYPES = [
  { value: "pdf", label: "PDF" },
  { value: "video", label: "فيديو" },
  { value: "link", label: "رابط" },
  { value: "mindmap", label: "خريطة ذهنية" },
  { value: "experiment", label: "تجربة" },
  { value: "other", label: "أخرى" },
] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lessonId: string;
  lessonTitle: string | null;
  items: LessonResourceItem[];
}

let _tmpCounter = 0;
const makeTempId = () => `__tmp_${Date.now()}_${++_tmpCounter}`;
const isLocal = (r: LessonResourceItem) =>
  r.__local === true || r.id.startsWith("__tmp_");

export function LessonResourcesDialog({
  open,
  onOpenChange,
  lessonId: _lessonId,
  lessonTitle,
  items,
}: Props) {
  const [rows, setRows] = useState<LessonResourceItem[]>([]);

  useEffect(() => {
    if (open) {
      setRows(
        [...items]
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((x) => ({ ...x })),
      );
    }
  }, [open, items]);

  const updateRow = (id: string, patch: Partial<LessonResourceItem>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const addLocal = () => {
    const nextSort =
      rows.length === 0
        ? 0
        : Math.max(...rows.map((r) => r.sort_order ?? 0)) + 1;
    setRows((rs) => [
      ...rs,
      {
        id: makeTempId(),
        title: "",
        resource_type: "link",
        url: "",
        description: null,
        sort_order: nextSort,
        __local: true,
      },
    ]);
  };

  const removeLocal = (id: string) => {
    setRows((rs) => rs.filter((r) => r.id !== id));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        className="max-w-2xl text-right max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="text-right">
            إدارة موارد الدرس
            {lessonTitle ? (
              <span className="block text-xs font-normal text-muted-foreground mt-1">
                {lessonTitle}
              </span>
            ) : null}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            هذه مرحلة واجهة فقط (UI Only). يمكنك تعديل القيم وإضافة/حذف موارد
            محليًا، لكن لن يتم حفظ أي تغيير في قاعدة البيانات. سيتم تفعيل الحفظ
            في المرحلة التالية.
          </span>
        </div>

        <div className="space-y-3">
          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              لا توجد موارد لهذا الدرس بعد.
            </p>
          ) : (
            rows.map((r, idx) => {
              const local = isLocal(r);
              return (
                <div
                  key={r.id}
                  className="rounded-lg border border-border bg-card p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      مورد #{idx + 1}
                      {local && (
                        <span className="mr-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-400">
                          جديد محليًا
                        </span>
                      )}
                    </span>
                    {local ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => removeLocal(r.id)}
                        className="h-7 px-2 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5 ml-1" />
                        حذف من الواجهة
                      </Button>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        محفوظ — لا يمكن حذفه في هذه المرحلة.
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="sm:col-span-2">
                      <label className="text-[11px] text-muted-foreground">
                        العنوان
                      </label>
                      <Input
                        value={r.title ?? ""}
                        onChange={(e) =>
                          updateRow(r.id, { title: e.target.value })
                        }
                        placeholder="عنوان المورد"
                        className="text-right"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground">
                        النوع
                      </label>
                      <Select
                        value={r.resource_type}
                        onValueChange={(v) =>
                          updateRow(r.id, { resource_type: v })
                        }
                        dir="rtl"
                      >
                        <SelectTrigger className="text-right">
                          <SelectValue placeholder="اختر النوع" />
                        </SelectTrigger>
                        <SelectContent>
                          {RESOURCE_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="sm:col-span-2">
                      <label className="text-[11px] text-muted-foreground">
                        الرابط (نص فقط — لا يُعرض كرابط قابل للنقر)
                      </label>
                      <Input
                        value={r.url ?? ""}
                        onChange={(e) =>
                          updateRow(r.id, { url: e.target.value })
                        }
                        placeholder="https://…"
                        className="text-right font-mono text-xs"
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground">
                        الترتيب
                      </label>
                      <Input
                        type="number"
                        min={0}
                        value={r.sort_order ?? 0}
                        onChange={(e) =>
                          updateRow(r.id, {
                            sort_order: Number(e.target.value) || 0,
                          })
                        }
                        className="text-right"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] text-muted-foreground">
                      الوصف (اختياري)
                    </label>
                    <Textarea
                      value={r.description ?? ""}
                      onChange={(e) =>
                        updateRow(r.id, {
                          description: e.target.value || null,
                        })
                      }
                      rows={3}
                      className="text-right"
                      placeholder="وصف مختصر…"
                    />
                  </div>
                </div>
              );
            })
          )}

          <Button
            type="button"
            variant="outline"
            onClick={addLocal}
            className="w-full"
          >
            <Plus className="h-4 w-4 ml-1" />
            إضافة مورد
          </Button>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
          <Button disabled title="سيتم تفعيل الحفظ في المرحلة التالية">
            الحفظ في المرحلة التالية
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
