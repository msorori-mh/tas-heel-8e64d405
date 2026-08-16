import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileUp, FolderUp, Loader2, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  bindLessonPrimaryPdf,
  createLessonPdfUploadTarget,
  findUploadedLessonPdfObject,
  getLessonPrimaryPdfState,
  planSubjectPdfBulkUpload,
} from "@/lib/api/lesson-pdf.functions";
import type { BulkMatchRow, BulkMatchStatus } from "@/lib/lessons/bulk-pdf-match";
import {
  formatBytes,
  uploadLessonPrimaryPdf,
} from "@/lib/lessons/lesson-pdf-upload-client";

const STATUS_LABEL: Record<BulkMatchStatus, string> = {
  MATCHED: "مطابق",
  REPLACE_EXISTING: "استبدال",
  MISSING_FILE: "لا يوجد ملف",
  UNKNOWN_FILE: "ملف غير معروف",
  DUPLICATE_FILE: "ملف مكرر",
  INVALID_PDF: "ملف غير صالح",
};

const STATUS_TONE: Record<BulkMatchStatus, string> = {
  MATCHED: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
  REPLACE_EXISTING: "border-amber-500/40 text-amber-700 dark:text-amber-400",
  MISSING_FILE: "border-border text-muted-foreground",
  UNKNOWN_FILE: "border-destructive/40 text-destructive",
  DUPLICATE_FILE: "border-destructive/40 text-destructive",
  INVALID_PDF: "border-destructive/40 text-destructive",
};

export function BulkLessonPdfUploadPanel() {
  const planFn = useServerFn(planSubjectPdfBulkUpload);
  const createTarget = useServerFn(createLessonPdfUploadTarget);
  const bind = useServerFn(bindLessonPrimaryPdf);
  const findObject = useServerFn(findUploadedLessonPdfObject);
  const getPrimary = useServerFn(getLessonPrimaryPdfState);

  const inputRef = useRef<HTMLInputElement>(null);
  const [subjectId, setSubjectId] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const [plan, setPlan] = useState<{
    rows: BulkMatchRow[];
    blockers: Record<string, number>;
    canExecute: boolean;
    subjectComplete: boolean;
  } | null>(null);
  const [planning, setPlanning] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{
    processed: number;
    succeeded: number;
    failed: number;
    total: number;
  } | null>(null);
  const [failures, setFailures] = useState<string[]>([]);

  const subjectsQ = useQuery({
    queryKey: ["admin-bulk-pdf", "subjects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const fileMap = useMemo(() => {
    const m = new Map<string, File>();
    for (const f of files) m.set(f.name, f);
    return m;
  }, [files]);

  const runPlan = async (nextFiles: File[]) => {
    if (!subjectId) {
      toast.error("اختر المادة أولاً.");
      return;
    }
    setPlanning(true);
    setFailures([]);
    try {
      const res = await planFn({
        data: {
          subjectId,
          files: nextFiles.map((f) => ({ name: f.name, size: f.size, type: f.type || null })),
        },
      });
      setPlan(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر فحص الملفات.");
    } finally {
      setPlanning(false);
    }
  };

  const onPick = (list: FileList | null) => {
    const arr = Array.from(list ?? []);
    setFiles(arr);
    if (arr.length > 0) void runPlan(arr);
  };

  /**
   * 18E1 — a file only counts as SUCCESS after PRIMARY_VERIFIED.
   * Reaching the end of the loop is "processed", never "succeeded".
   */
  const execute = async () => {
    if (!plan) return;
    const targets = plan.rows.filter(
      (r) => (r.status === "MATCHED" || r.status === "REPLACE_EXISTING") && r.lessonId && r.fileName,
    );
    setRunning(true);
    setFailures([]);
    setProgress({ processed: 0, succeeded: 0, failed: 0, total: targets.length });
    const errs: string[] = [];
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    for (const row of targets) {
      const lessonId = row.lessonId as string;
      const fileName = row.fileName as string;
      const file = fileMap.get(fileName);
      let stage = "MATCHED";
      try {
        if (!file) throw new Error("الملف غير موجود في الاختيار");

        // RETRY_BIND_EXISTING_OBJECT: never re-upload bytes that already landed.
        const existing = await findObject({ data: { lessonId } });
        if (existing.latest && existing.latest.size === file.size) {
          stage = "STORAGE_VERIFIED";
          await bind({
            data: {
              lessonId,
              path: existing.latest.path,
              fileName,
              fileSize: file.size,
              title: null,
            },
          });
        } else {
          stage = "SIGNED_URL_CREATED";
          await uploadLessonPrimaryPdf({ createTarget, bind }, lessonId, file);
        }
        stage = "RESOURCE_BOUND";

        const state = await getPrimary({ data: { lessonId } });
        if (!state.primary || !state.primary.managed) throw new Error("لم يتم تثبيت الملف كأساسي");
        stage = "PRIMARY_VERIFIED";
        succeeded += 1;
      } catch (e) {
        failed += 1;
        errs.push(`${fileName} [${stage}]: ${e instanceof Error ? e.message : "فشل"}`);
      }
      processed += 1;
      setProgress({ processed, succeeded, failed, total: targets.length });
    }
    setFailures(errs);
    setRunning(false);
    if (failed === 0) toast.success(`تم التحقق من ربط ${succeeded} ملفاً كمحتوى أساسي.`);
    else toast.error(`تمت معالجة ${processed} — نجح ${succeeded} وفشل ${failed} (لم يكتمل الربط).`);
    await runPlan(files);
  };

  const blockerCount = plan
    ? Object.values(plan.blockers).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <section
      dir="rtl"
      className="space-y-4 rounded-2xl border border-primary/25 bg-card p-5 shadow-card"
      aria-labelledby="bulk-pdf-heading"
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <FolderUp className="h-5 w-5 shrink-0 text-primary" />
          <h2 id="bulk-pdf-heading" className="text-lg font-semibold text-foreground">
            رفع ملفات PDF جماعياً لمادة
          </h2>
          <Badge variant="secondary" className="text-[11px]">18D</Badge>
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          سمِّ كل ملف باسم كود الدرس: <span className="font-mono">&lt;lesson_code&gt;.pdf</span>. يعرض
          النظام مصفوفة المطابقة قبل التنفيذ ولا ينفّذ عند وجود ملفات غير معروفة أو مكررة.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={subjectId}
          onValueChange={(v) => {
            setSubjectId(v);
            setPlan(null);
            setFiles([]);
          }}
        >
          <SelectTrigger className="w-64 text-right">
            <SelectValue placeholder="اختر المادة" />
          </SelectTrigger>
          <SelectContent>
            {(subjectsQ.data ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="outline"
          disabled={!subjectId || planning || running}
          onClick={() => inputRef.current?.click()}
        >
          <FileUp className="ms-1 h-4 w-4" />
          اختيار ملفات PDF
        </Button>
        {planning && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => onPick(e.target.files)}
        />
      </div>

      {plan && (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-right text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="p-2 font-medium">كود الدرس</th>
                  <th className="p-2 font-medium">الدرس</th>
                  <th className="p-2 font-medium">الملف</th>
                  <th className="p-2 font-medium">الحجم</th>
                  <th className="p-2 font-medium">الحالة</th>
                  <th className="p-2 font-medium">الإجراء</th>
                </tr>
              </thead>
              <tbody>
                {plan.rows.map((r, i) => (
                  <tr key={`${r.lessonId ?? r.fileName}-${i}`} className="border-t border-border/60">
                    <td className="p-2 font-mono">{r.lessonCode ?? "—"}</td>
                    <td className="p-2">{r.lessonTitle ?? "—"}</td>
                    <td className="p-2 break-all">{r.fileName ?? "—"}</td>
                    <td className="p-2">{formatBytes(r.fileSize)}</td>
                    <td className="p-2">
                      <Badge variant="outline" className={STATUS_TONE[r.status]}>
                        {STATUS_LABEL[r.status]}
                      </Badge>
                    </td>
                    <td className="p-2 text-muted-foreground">{r.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {blockerCount > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                التنفيذ متوقف: {blockerCount} صف يحتاج تصحيحاً (ملفات غير معروفة أو مكررة أو غير
                صالحة).
              </span>
            </div>
          )}

          {failures.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              {failures.map((f) => (
                <li key={f}>• {f}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={!plan.canExecute || running} onClick={execute}>
              {running && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}
              تنفيذ الرفع والربط
            </Button>
            {progress && (
              <span className="text-xs text-muted-foreground">
                {progress.done} / {progress.total}
              </span>
            )}
            {plan.subjectComplete && (
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
                كل دروس المادة لديها ملف أساسي
              </Badge>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
