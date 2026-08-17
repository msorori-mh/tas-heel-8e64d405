/**
 * 21B — admin management of curriculum textbooks.
 *
 * Yousuf works purely in domain terms: المادة → المسار → الفصل → كتب المنهج.
 * Buckets, storage paths, SQL and table names are never shown.
 */

import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BookOpen, Eye, Loader2, Power, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { formatBytes } from "@/lib/lessons/lesson-pdf-upload-client";
import {
  bindSubjectTextbookFile,
  createSubjectTextbookUploadTarget,
  deleteSubjectTextbook,
  listSubjectTextbooksAdmin,
  setSubjectTextbookActive,
} from "@/lib/api/subject-textbook.functions";
import { InAppPdfDelivery } from "@/components/lessons/InAppPdfDelivery";

const MAX_BYTES = 200 * 1024 * 1024;

type SubjectRow = {
  id: string;
  name: string;
  grade_id: string | null;
  semester: number | null;
  curriculum_track_id: string | null;
};

async function sha256Hex(file: File): Promise<string | null> {
  try {
    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

export function SubjectTextbooksManager() {
  const qc = useQueryClient();
  const listFn = useServerFn(listSubjectTextbooksAdmin);
  const targetFn = useServerFn(createSubjectTextbookUploadTarget);
  const bindFn = useServerFn(bindSubjectTextbookFile);
  const activeFn = useServerFn(setSubjectTextbookActive);
  const deleteFn = useServerFn(deleteSubjectTextbook);

  const [subjectId, setSubjectId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [trackId, setTrackId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [coverageType, setCoverageType] = useState<"FULL_ACADEMIC_YEAR" | "SEMESTER_SPECIFIC">(
    "FULL_ACADEMIC_YEAR",
  );
  const [semester, setSemester] = useState<1 | 2>(1);
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const subjectsQuery = useQuery({
    queryKey: ["admin-textbooks-subjects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id,name,grade_id,semester,curriculum_track_id")
        .order("name");
      if (error) throw error;
      return (data ?? []) as SubjectRow[];
    },
  });

  const tracksQuery = useQuery({
    queryKey: ["admin-textbooks-tracks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("curriculum_tracks")
        .select("id,track_name")
        .order("track_name");
      if (error) throw error;
      return (data ?? []).map((t) => ({ id: t.id as string, name: (t.track_name as string) ?? "مسار" }));
    },
  });

  const textbooksQuery = useQuery({
    enabled: !!subjectId,
    queryKey: ["admin-textbooks", subjectId],
    queryFn: () => listFn({ data: { subjectId, includeInactive: true } }),
  });

  const subjects = useMemo(() => {
    const rows = subjectsQuery.data ?? [];
    const term = search.trim();
    return (term ? rows.filter((s) => s.name.includes(term)) : rows).slice(0, 200);
  }, [subjectsQuery.data, search]);

  const trackName = (id: string | null) =>
    id ? (tracksQuery.data?.find((t) => t.id === id)?.name ?? "مسار") : "كل المسارات";

  const upload = async (file: File) => {
    if (!subjectId) return toast.error("اختر المادة أولاً.");
    if (!/\.pdf$/i.test(file.name)) return toast.error("الامتداد يجب أن يكون .pdf");
    if (file.size <= 0 || file.size > MAX_BYTES) return toast.error("حجم الملف غير مقبول.");

    setBusy(true);
    try {
      const target = await targetFn({
        data: { subjectId, fileName: file.name, fileSize: file.size },
      });
      const { error } = await supabase.storage
        .from(target.bucket)
        .uploadToSignedUrl(target.path, target.token, file, {
          contentType: "application/pdf",
          upsert: false,
        });
      if (error) throw new Error(error.message);

      const hash = await sha256Hex(file);
      await bindFn({
        data: {
          subjectId,
          curriculumTrackId: trackId || null,
          coverageType,
          semester: coverageType === "SEMESTER_SPECIFIC" ? semester : null,
          title: title.trim() || file.name.replace(/\.pdf$/i, ""),
          path: target.path,
          fileName: file.name,
          fileSize: file.size,
          sha256: hash,
          replaceId,
        },
      });
      toast.success(replaceId ? "تم استبدال الكتاب." : "تم رفع الكتاب.");
      setTitle("");
      setReplaceId(null);
      if (fileRef.current) fileRef.current.value = "";
      await qc.invalidateQueries({ queryKey: ["admin-textbooks", subjectId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر رفع الكتاب.");
    } finally {
      setBusy(false);
    }
  };

  const textbooks = textbooksQuery.data?.textbooks ?? [];

  return (
    <div className="space-y-4" dir="rtl">
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-bold text-foreground">اختر المادة</h2>
        <Input
          placeholder="ابحث باسم المادة…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
        >
          <option value="">— اختر المادة —</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </section>

      {subjectId && (
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <Upload className="h-4 w-4 text-primary" />
            {replaceId ? "استبدال كتاب" : "رفع كتاب منهج"}
          </h2>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">اسم الكتاب</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="كتاب المادة" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">المسار</Label>
              <select
                value={trackId}
                onChange={(e) => setTrackId(e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value="">كل المسارات</option>
                {(tracksQuery.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">نوع التغطية</Label>
              <select
                value={coverageType}
                onChange={(e) =>
                  setCoverageType(e.target.value as "FULL_ACADEMIC_YEAR" | "SEMESTER_SPECIFIC")
                }
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value="FULL_ACADEMIC_YEAR">يغطي العام الدراسي كاملاً</option>
                <option value="SEMESTER_SPECIFIC">خاص بفصل دراسي</option>
              </select>
            </div>
          </div>

          {coverageType === "SEMESTER_SPECIFIC" && (
            <div className="max-w-xs space-y-1">
              <Label className="text-xs">الفصل الدراسي</Label>
              <select
                value={semester}
                onChange={(e) => setSemester(Number(e.target.value) === 2 ? 2 : 1)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value={1}>الفصل الأول</option>
                <option value={2}>الفصل الثاني</option>
              </select>
            </div>
          )}


          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
            className="block w-full text-xs"
          />

          {busy && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> جارٍ الرفع…
            </p>
          )}
          {replaceId && (
            <Button size="sm" variant="ghost" onClick={() => setReplaceId(null)}>
              إلغاء الاستبدال
            </Button>
          )}
        </section>
      )}

      {subjectId && (
        <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <BookOpen className="h-4 w-4 text-primary" /> كتب هذه المادة
          </h2>

          {textbooksQuery.isLoading && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل…
            </p>
          )}

          {!textbooksQuery.isLoading && textbooks.length === 0 && (
            <p className="text-xs text-muted-foreground">لا توجد كتب مرفوعة لهذه المادة بعد.</p>
          )}

          <ul className="space-y-2">
            {textbooks.map((book) => (
              <li
                key={book.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 p-3 text-xs"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{book.title}</p>
                  <p className="text-muted-foreground">
                    {trackName(book.curriculumTrackId)} ·{" "}
                    {book.coverageType === "SEMESTER_SPECIFIC"
                      ? `الفصل ${book.semester === 2 ? "الثاني" : "الأول"}`
                      : "الفصلان معاً"}{" "}
                    ·{" "}
                    {formatBytes(book.fileSize)} · إصدار {book.version.slice(0, 6)} ·{" "}
                    {book.isActive ? "مفعّل" : "معطّل"}
                  </p>
                  <p className="text-muted-foreground">
                    آخر تحديث:{" "}
                    {book.updatedAt ? new Date(book.updatedAt).toLocaleDateString("ar") : "—"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setPreviewId(book.id)}>
                    <Eye className="ms-1.5 h-3.5 w-3.5" /> معاينة
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setReplaceId(book.id);
                      setTitle(book.title);
                      setTrackId(book.curriculumTrackId ?? "");
                      setCoverageType(book.coverageType);
                      if (book.semester === 1 || book.semester === 2) setSemester(book.semester);
                    }}
                  >
                    <Upload className="ms-1.5 h-3.5 w-3.5" /> استبدال
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await activeFn({ data: { textbookId: book.id, isActive: !book.isActive } });
                      await qc.invalidateQueries({ queryKey: ["admin-textbooks", subjectId] });
                    }}
                  >
                    <Power className="ms-1.5 h-3.5 w-3.5" /> {book.isActive ? "تعطيل" : "تفعيل"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await deleteFn({ data: { textbookId: book.id } });
                      await qc.invalidateQueries({ queryKey: ["admin-textbooks", subjectId] });
                    }}
                  >
                    <Trash2 className="ms-1.5 h-3.5 w-3.5" /> حذف
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Dialog open={!!previewId} onOpenChange={(open) => !open && setPreviewId(null)}>
        <DialogContent dir="rtl" className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-sm">معاينة الكتاب</DialogTitle>
          </DialogHeader>
          {previewId && (
            <InAppPdfDelivery resourceId={previewId} kind="textbook" title="كتاب المنهج" />
          )}
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setPreviewId(null)}>
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SubjectTextbooksManager;
