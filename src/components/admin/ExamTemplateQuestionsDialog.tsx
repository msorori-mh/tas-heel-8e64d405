import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Search, Check } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string | null;
  templateTitle?: string;
}

type LinkRow = {
  id: string;
  question_id: string;
  sort_order: number;
  points: number;
  question_text: string;
};

function truncate(s: string, n: number) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export function ExamTemplateQuestionsDialog({ open, onOpenChange, templateId, templateTitle }: Props) {
  const queryClient = useQueryClient();
  const [showPicker, setShowPicker] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [unitFilter, setUnitFilter] = useState<string>("all");
  const [lessonFilter, setLessonFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) {
      setShowPicker(false);
      setSubjectFilter("all");
      setUnitFilter("all");
      setLessonFilter("all");
      setSearch("");
    }
  }, [open]);

  const linksQ = useQuery({
    enabled: open && !!templateId,
    queryKey: ["admin-template-questions", templateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_template_questions")
        .select("id, question_id, sort_order, points, question:questions!exam_template_questions_question_id_fkey(question_text)")
        .eq("template_id", templateId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const rows: LinkRow[] = ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        question_id: r.question_id,
        sort_order: r.sort_order ?? 0,
        points: Number(r.points ?? 1),
        question_text: r.question?.question_text ?? "",
      }));
      return rows;
    },
  });

  const existingIds = useMemo(
    () => new Set((linksQ.data ?? []).map((l) => l.question_id)),
    [linksQ.data]
  );

  // Filter options
  const subjectsQ = useQuery({
    enabled: open && showPicker,
    queryKey: ["admin-tpl-q-subjects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id, name")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const unitsQ = useQuery({
    enabled: open && showPicker,
    queryKey: ["admin-tpl-q-units"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("units")
        .select("id, title, subject_id")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const lessonsQ = useQuery({
    enabled: open && showPicker,
    queryKey: ["admin-tpl-q-lessons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lessons")
        .select("id, title, subject_id, unit_id")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const questionsQ = useQuery({
    enabled: open && showPicker,
    queryKey: ["admin-tpl-q-bank", subjectFilter, unitFilter, lessonFilter, search],
    queryFn: async () => {
      let q = supabase
        .from("questions")
        .select("id, question_text, lesson_id, subject_id, lesson:lessons!questions_lesson_id_fkey(unit_id)")
        .order("sort_order", { ascending: true })
        .limit(50);
      if (search.trim()) q = q.ilike("question_text", `%${search.trim()}%`);
      if (lessonFilter !== "all") q = q.eq("lesson_id", lessonFilter);
      if (subjectFilter !== "all") q = q.eq("subject_id", subjectFilter);
      const { data, error } = await q;
      if (error) throw error;
      let rows = (data ?? []) as any[];
      if (unitFilter !== "all") {
        rows = rows.filter((r) => r.lesson?.unit_id === unitFilter);
      }
      return rows.map((r) => ({ id: r.id as string, question_text: r.question_text as string }));
    },
  });

  const unitOptions = subjectFilter !== "all"
    ? (unitsQ.data ?? []).filter((u) => u.subject_id === subjectFilter)
    : (unitsQ.data ?? []);
  const lessonOptions = unitFilter !== "all"
    ? (lessonsQ.data ?? []).filter((l) => l.unit_id === unitFilter)
    : subjectFilter !== "all"
      ? (lessonsQ.data ?? []).filter((l) => l.subject_id === subjectFilter)
      : (lessonsQ.data ?? []);

  const addQuestion = async (questionId: string) => {
    if (!templateId) return;
    if (existingIds.has(questionId)) {
      toast.info("هذا السؤال مضاف مسبقًا.");
      return;
    }
    const maxSort = (linksQ.data ?? []).reduce((m, r) => Math.max(m, r.sort_order), -1);
    const { error } = await supabase
      .from("exam_template_questions")
      .insert({
        template_id: templateId,
        question_id: questionId,
        sort_order: maxSort + 1,
        points: 1,
      });
    if (error) {
      // Unique violation safeguard
      if ((error as any).code === "23505") {
        toast.info("هذا السؤال مضاف مسبقًا.");
      } else {
        toast.error("تعذر إضافة السؤال.");
      }
      return;
    }
    toast.success("تمت إضافة السؤال.");
    queryClient.invalidateQueries({ queryKey: ["admin-template-questions", templateId] });
    queryClient.invalidateQueries({ queryKey: ["admin-exam-templates"] });
  };

  const updateLink = async (id: string, patch: { sort_order?: number; points?: number }) => {
    const { error } = await supabase
      .from("exam_template_questions")
      .update(patch)
      .eq("id", id);
    if (error) {
      toast.error("تعذر تحديث السؤال.");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["admin-template-questions", templateId] });
  };

  const removeLink = async (id: string) => {
    const { error } = await supabase
      .from("exam_template_questions")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("تعذر إزالة السؤال.");
      return;
    }
    toast.success("تمت إزالة السؤال من القالب.");
    queryClient.invalidateQueries({ queryKey: ["admin-template-questions", templateId] });
    queryClient.invalidateQueries({ queryKey: ["admin-exam-templates"] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-right">إدارة أسئلة القالب</DialogTitle>
          <DialogDescription className="text-right">
            {templateTitle ?? "قالب اختبار"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">الأسئلة الحالية ({(linksQ.data ?? []).length})</h3>
            <Button size="sm" onClick={() => setShowPicker((v) => !v)} className="gap-1">
              <Plus className="h-4 w-4" />
              {showPicker ? "إخفاء" : "إضافة سؤال"}
            </Button>
          </div>

          {linksQ.isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (linksQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              لا توجد أسئلة مرتبطة بهذا القالب.
            </p>
          ) : (
            <ul className="space-y-2">
              {(linksQ.data ?? []).map((l, idx) => (
                <li key={l.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                      {idx + 1}
                    </span>
                    <p className="text-sm text-foreground flex-1">{truncate(l.question_text, 140)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1">
                      <Label className="text-xs">ترتيب</Label>
                      <Input
                        type="number"
                        min={0}
                        defaultValue={l.sort_order}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isInteger(v) && v >= 0 && v !== l.sort_order) {
                            updateLink(l.id, { sort_order: v });
                          }
                        }}
                        className="w-20 h-8"
                        dir="ltr"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <Label className="text-xs">درجة</Label>
                      <Input
                        type="number"
                        min={0.1}
                        step={0.1}
                        defaultValue={l.points}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && v > 0 && v !== l.points) {
                            updateLink(l.id, { points: v });
                          }
                        }}
                        className="w-20 h-8"
                        dir="ltr"
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ms-auto text-destructive"
                      onClick={() => removeLink(l.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {showPicker && (
            <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-3">
              <h4 className="text-sm font-semibold">إضافة من بنك الأسئلة</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select
                  value={subjectFilter}
                  onChange={(e) => { setSubjectFilter(e.target.value); setUnitFilter("all"); setLessonFilter("all"); }}
                  className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                >
                  <option value="all">كل المواد</option>
                  {(subjectsQ.data ?? []).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <select
                  value={unitFilter}
                  onChange={(e) => { setUnitFilter(e.target.value); setLessonFilter("all"); }}
                  className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                >
                  <option value="all">كل الوحدات</option>
                  {unitOptions.map((u) => (
                    <option key={u.id} value={u.id}>{u.title}</option>
                  ))}
                </select>
                <select
                  value={lessonFilter}
                  onChange={(e) => setLessonFilter(e.target.value)}
                  className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                >
                  <option value="all">كل الدروس</option>
                  {lessonOptions.map((l) => (
                    <option key={l.id} value={l.id}>{l.title}</option>
                  ))}
                </select>
              </div>
              <div className="relative">
                <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ابحث في نص السؤال..."
                  className="ps-8"
                />
              </div>

              {questionsQ.isLoading ? (
                <div className="flex items-center justify-center py-4 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : (questionsQ.data ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">لا توجد أسئلة مطابقة.</p>
              ) : (
                <ul className="space-y-1 max-h-64 overflow-y-auto">
                  {(questionsQ.data ?? []).map((q) => {
                    const added = existingIds.has(q.id);
                    return (
                      <li key={q.id} className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5">
                        <p className="text-xs text-foreground flex-1">{truncate(q.question_text, 100)}</p>
                        {added ? (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Check className="h-3 w-3" /> مُضاف
                          </span>
                        ) : (
                          <Button size="sm" variant="outline" className="h-7" onClick={() => addQuestion(q.id)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ExamTemplateQuestionsDialog;
