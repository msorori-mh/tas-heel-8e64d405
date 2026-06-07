import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
import { Plus, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import FileUpload from "@/components/admin/FileUpload";

const PDF_STORAGE_PREFIX = "supabase-storage://lesson-pdfs/";

export function isSafeStorageRef(value: string, lessonId: string): boolean {
  const v = (value ?? "").trim();
  if (!v.startsWith(PDF_STORAGE_PREFIX)) return false;
  const rest = v.slice(PDF_STORAGE_PREFIX.length);
  if (!rest.toLowerCase().endsWith(".pdf")) return false;
  const parts = rest.split("/");
  if (parts.length < 2) return false;
  if (parts[0] !== lessonId) return false;
  return true;
}

export function isAcceptableResourceUrl(value: string, lessonId: string): boolean {
  const v = (value ?? "").trim();
  if (!v) return false;
  if (v.startsWith("supabase-storage://")) return isSafeStorageRef(v, lessonId);
  return isSafeHttpUrl(v);
}

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
] as const;

const ALLOWED_TYPES = new Set(RESOURCE_TYPES.map((t) => t.value));

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

export function isSafeHttpUrl(value: string): boolean {
  const v = (value ?? "").trim();
  if (!v) return false;
  if (!/^https?:\/\//i.test(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function LessonResourcesDialog({
  open,
  onOpenChange,
  lessonId,
  lessonTitle,
  items,
}: Props) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<LessonResourceItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setErrMsg(null);
      setSaving(false);
      setRows(
        [...items]
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((x) => ({ ...x }))
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

  const handleSave = async () => {
    if (saving) return;
    setErrMsg(null);

    // Validation pass
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const title = (r.title ?? "").trim();
      const url = (r.url ?? "").trim();
      if (!title) {
        setErrMsg(`العنوان مطلوب للمورد #${i + 1}.`);
        toast.error("بعض الحقول غير مكتملة.");
        return;
      }
      if (!url) {
        setErrMsg(`الرابط مطلوب للمورد #${i + 1}.`);
        toast.error("بعض الحقول غير مكتملة.");
        return;
      }
      if (!isAcceptableResourceUrl(url, lessonId)) {
        setErrMsg(
          `رابط المورد #${i + 1} غير صالح. يجب أن يكون http(s) أو ملف PDF مرفوع لهذا الدرس.`,
        );
        toast.error("رابط المورد غير صالح.");
        return;
      }
      if (!ALLOWED_TYPES.has(r.resource_type as any)) {
        setErrMsg(`نوع المورد غير مدعوم للمورد #${i + 1}.`);
        toast.error("نوع مورد غير مدعوم.");
        return;
      }
      const so = Number(r.sort_order);
      if (!Number.isInteger(so) || so < 0) {
        setErrMsg(`الترتيب غير صالح للمورد #${i + 1}.`);
        toast.error("ترتيب غير صالح.");
        return;
      }
    }

    setSaving(true);
    try {
      for (const r of rows) {
        const title = r.title.trim();
        const url = r.url.trim();
        const descTrim = (r.description ?? "").trim();
        const description = descTrim.length > 0 ? descTrim : null;
        const sort_order = Number(r.sort_order);
        const resource_type = r.resource_type as
          | "video"
          | "mindmap"
          | "experiment"
          | "pdf"
          | "link";

        if (isLocal(r)) {
          const { error } = await supabase.from("lesson_resources").insert({
            lesson_id: lessonId,
            title,
            resource_type,
            url,
            description,
            sort_order,
          });
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("lesson_resources")
            .update({
              title,
              resource_type,
              url,
              description,
              sort_order,
            })
            .eq("id", r.id);
          if (error) throw error;
        }
      }

      toast.success("تم حفظ موارد الدرس بنجاح");
      await qc.invalidateQueries({
        queryKey: ["admin-lesson-detail", "resources", lessonId],
      });
      onOpenChange(false);
    } catch (e: any) {
      toast.error("تعذر حفظ موارد الدرس.");
      setErrMsg(
        e?.message ? `تعذر الحفظ: ${e.message}` : "تعذر حفظ موارد الدرس."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => (!saving ? onOpenChange(o) : null)}
    >
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
            يمكنك تعديل الموارد المحفوظة وإضافة موارد جديدة. لا يوجد رفع ملفات
            في هذه المرحلة، وحذف الموارد المحفوظة سيتم دعمه لاحقًا.
          </span>
        </div>

        {errMsg && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive text-right">
            {errMsg}
          </div>
        )}

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
                        disabled={saving}
                        className="h-7 px-2 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5 ml-1" />
                        حذف من الواجهة
                      </Button>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        حذف المورد المحفوظ سيتم دعمه لاحقًا.
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
                        disabled={saving}
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
                        disabled={saving}
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
                        disabled={saving}
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
                        disabled={saving}
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
                      disabled={saving}
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
            disabled={saving}
            className="w-full"
          >
            <Plus className="h-4 w-4 ml-1" />
            إضافة مورد
          </Button>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            إغلاق
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
                جارٍ الحفظ...
              </>
            ) : (
              "حفظ الموارد"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
