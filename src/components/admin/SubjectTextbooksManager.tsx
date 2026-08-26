/**
 * 13K — explicit subject textbook intake.
 *
 * The operator always selects grade, one or both official tracks, subject,
 * coverage and the PDF before a visible upload action is enabled.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BookOpen, Eye, FileText, Loader2, Power, Trash2, Upload } from "lucide-react";

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
import { InAppPdfDelivery } from "@/components/lessons/InAppPdfDelivery";
import { supabase } from "@/integrations/supabase/client";
import {
  bindSubjectTextbookFile,
  createSubjectTextbookUploadTarget,
  deleteSubjectTextbook,
  listSubjectTextbookCatalogAdmin,
  listSubjectTextbooksAdmin,
  setSubjectTextbookActive,
} from "@/lib/api/subject-textbook.functions";
import { formatBytes } from "@/lib/lessons/lesson-pdf-upload-client";
import { BOOK_TYPE_LABEL } from "@/lib/textbooks/subject-textbook-client";

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
  const catalogFn = useServerFn(listSubjectTextbookCatalogAdmin);
  const listFn = useServerFn(listSubjectTextbooksAdmin);
  const targetFn = useServerFn(createSubjectTextbookUploadTarget);
  const bindFn = useServerFn(bindSubjectTextbookFile);
  const activeFn = useServerFn(setSubjectTextbookActive);
  const deleteFn = useServerFn(deleteSubjectTextbook);

  const [gradeId, setGradeId] = useState("");
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [bookType, setBookType] = useState<"MAIN_TEXTBOOK" | "EXERCISE_BOOK" | "OTHER">(
    "MAIN_TEXTBOOK",
  );
  const [coverageType, setCoverageType] = useState<"FULL_ACADEMIC_YEAR" | "SEMESTER_SPECIFIC">(
    "FULL_ACADEMIC_YEAR",
  );
  const [semester, setSemester] = useState<1 | 2>(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const tracksInitialized = useRef(false);

  const catalogQuery = useQuery({
    queryKey: ["admin-textbooks-catalog"],
    queryFn: () => catalogFn(),
  });

  const textbooksQuery = useQuery({
    enabled: !!subjectId,
    queryKey: ["admin-textbooks", subjectId],
    queryFn: () => listFn({ data: { subjectId, includeInactive: true } }),
  });

  const grades = catalogQuery.data?.grades ?? [];
  const tracks = catalogQuery.data?.tracks ?? [];

  useEffect(() => {
    if (tracksInitialized.current || tracks.length === 0) return;
    tracksInitialized.current = true;
    setSelectedTrackIds(tracks.map((track) => track.id));
  }, [tracks]);

  const subjectTrackMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const link of catalogQuery.data?.subjectTracks ?? []) {
      const current = map.get(link.subject_id) ?? new Set<string>();
      current.add(link.curriculum_track_id);
      map.set(link.subject_id, current);
    }
    return map;
  }, [catalogQuery.data]);

  const subjects = useMemo(() => {
    if (!gradeId || selectedTrackIds.length === 0) return [];
    const rows = (catalogQuery.data?.subjects ?? []) as SubjectRow[];
    const term = search.trim();
    return rows.filter((subject) => {
      if (subject.grade_id !== gradeId) return false;
      if (term && !subject.name.includes(term)) return false;

      const linkedTrackIds = subjectTrackMap.get(subject.id);
      if (linkedTrackIds?.size) {
        return selectedTrackIds.every((trackId) => linkedTrackIds.has(trackId));
      }
      if (subject.curriculum_track_id) {
        return selectedTrackIds.length === 1 && selectedTrackIds[0] === subject.curriculum_track_id;
      }
      return true;
    });
  }, [catalogQuery.data, gradeId, search, selectedTrackIds, subjectTrackMap]);

  useEffect(() => {
    if (subjectId && !subjects.some((subject) => subject.id === subjectId)) {
      setSubjectId("");
      setReplaceId(null);
      setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [subjectId, subjects]);

  const selectedGrade = grades.find((grade) => grade.id === gradeId);
  const selectedSubject = subjects.find((subject) => subject.id === subjectId);
  const selectedTrackNames = tracks
    .filter((track) => selectedTrackIds.includes(track.id))
    .map((track) => track.name);
  const coversAllTracks =
    tracks.length > 0 &&
    selectedTrackIds.length === tracks.length &&
    tracks.every((track) => selectedTrackIds.includes(track.id));
  const curriculumTrackId = coversAllTracks ? null : (selectedTrackIds[0] ?? null);

  const trackName = (id: string | null) =>
    id ? (tracks.find((track) => track.id === id)?.name ?? "مسار") : "منهج صنعاء وعدن معًا";

  const textbooks = textbooksQuery.data?.textbooks ?? [];
  const existingScopeBook = textbooks.find(
    (book) =>
      !replaceId &&
      book.curriculumTrackId === curriculumTrackId &&
      book.bookType === bookType &&
      book.coverageType === coverageType &&
      (coverageType === "FULL_ACADEMIC_YEAR" || book.semester === semester),
  );

  const clearFile = () => {
    setSelectedFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const beginReplace = (book: (typeof textbooks)[number]) => {
    setReplaceId(book.id);
    setTitle(book.title);
    setSelectedTrackIds(
      book.curriculumTrackId ? [book.curriculumTrackId] : tracks.map((track) => track.id),
    );
    setBookType(book.bookType);
    setCoverageType(book.coverageType);
    if (book.semester === 1 || book.semester === 2) setSemester(book.semester);
    clearFile();
  };

  const selectFile = (file: File | undefined) => {
    if (!file) return clearFile();
    if (!/\.pdf$/i.test(file.name)) {
      clearFile();
      return toast.error("اختر ملف PDF فقط.");
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      clearFile();
      return toast.error("حجم ملف الكتاب يجب أن يكون بين 1 بايت و200 ميجابايت.");
    }
    setSelectedFile(file);
  };

  const upload = async () => {
    if (!gradeId || !selectedGrade) return toast.error("اختر الصف الدراسي.");
    if (selectedTrackIds.length === 0) return toast.error("اختر مسارًا واحدًا على الأقل.");
    if (selectedTrackIds.length > 2)
      return toast.error("المسارات الرسمية المتاحة هي صنعاء وعدن فقط.");
    if (!subjectId || !selectedSubject) return toast.error("اختر المادة بعد تحديد الصف والمسار.");
    if (!selectedFile) return toast.error("اختر ملف الكتاب PDF.");
    if (existingScopeBook)
      return toast.error("يوجد كتاب في النطاق نفسه؛ استخدم استبدال الكتاب الموجود.");

    setBusy(true);
    try {
      const target = await targetFn({
        data: { subjectId, fileName: selectedFile.name, fileSize: selectedFile.size },
      });
      const { error } = await supabase.storage
        .from(target.bucket)
        .uploadToSignedUrl(target.path, target.token, selectedFile, {
          contentType: "application/pdf",
          upsert: false,
        });
      if (error) throw new Error(error.message);

      const hash = await sha256Hex(selectedFile);
      await bindFn({
        data: {
          subjectId,
          curriculumTrackId,
          bookType,
          coverageType,
          semester: coverageType === "SEMESTER_SPECIFIC" ? semester : null,
          title: title.trim() || selectedFile.name.replace(/\.pdf$/i, ""),
          path: target.path,
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          sha256: hash,
          replaceId,
        },
      });
      toast.success(replaceId ? "تم استبدال الكتاب بنجاح." : "تم رفع كتاب المادة بنجاح.");
      setTitle("");
      setReplaceId(null);
      clearFile();
      await qc.invalidateQueries({ queryKey: ["admin-textbooks", subjectId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر رفع الكتاب.");
    } finally {
      setBusy(false);
    }
  };

  const formReady =
    !!selectedGrade &&
    selectedTrackIds.length > 0 &&
    !!selectedSubject &&
    !!selectedFile &&
    !existingScopeBook &&
    !busy;

  return (
    <div className="space-y-4" dir="rtl">
      <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <div>
          <h2 className="text-sm font-bold text-foreground">1. تحديد الكتاب وربطه بالمنهج</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            حدد الصف أولًا، ثم اختر صنعاء وعدن معًا أو أحدهما، وبعدها ستظهر مواد هذا الصف فقط. لا
            يشترط وجود كتاب مسبقًا؛ يمكنك رفع أول نسخة مباشرة بعد إكمال الربط.
          </p>
        </div>

        {catalogQuery.isError && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            تعذر تحميل الصفوف والمواد. أعد فتح الصفحة أو تحقق من صلاحية إدارة المحتوى.
          </p>
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="textbook-grade">الصف الدراسي *</Label>
            <select
              id="textbook-grade"
              value={gradeId}
              disabled={busy || catalogQuery.isLoading}
              onChange={(event) => {
                setGradeId(event.target.value);
                setSubjectId("");
                setReplaceId(null);
                clearFile();
              }}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
            >
              <option value="">— اختر الصف —</option>
              {grades.map((grade) => (
                <option key={grade.id} value={grade.id}>
                  {grade.name ?? "صف دراسي"}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">المسار/المسارات *</legend>
            <div className="flex min-h-10 flex-wrap items-center gap-4 rounded-lg border border-border bg-background px-3 py-2">
              {tracks.map((track) => (
                <label key={track.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedTrackIds.includes(track.id)}
                    disabled={busy}
                    onChange={(event) => {
                      setSelectedTrackIds((current) =>
                        event.target.checked
                          ? [...new Set([...current, track.id])]
                          : current.filter((id) => id !== track.id),
                      );
                      setSubjectId("");
                      setReplaceId(null);
                      clearFile();
                    }}
                    className="h-4 w-4 accent-primary"
                  />
                  {track.name}
                </label>
              ))}
              {!catalogQuery.isLoading && tracks.length === 0 && (
                <span className="text-xs text-destructive">تعذر العثور على مساري صنعاء وعدن.</span>
              )}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="textbook-subject">المادة *</Label>
            <select
              id="textbook-subject"
              value={subjectId}
              disabled={busy || !gradeId || selectedTrackIds.length === 0}
              onChange={(event) => {
                setSubjectId(event.target.value);
                setReplaceId(null);
                clearFile();
              }}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm disabled:opacity-60"
            >
              <option value="">
                {!gradeId
                  ? "اختر الصف أولًا"
                  : selectedTrackIds.length === 0
                    ? "اختر المسار أولًا"
                    : "— اختر المادة —"}
              </option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name} — {selectedGrade?.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {gradeId && selectedTrackIds.length > 0 && (
          <Input
            placeholder="ابحث داخل مواد الصف المختار…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            disabled={busy}
          />
        )}

        {gradeId && selectedTrackIds.length > 0 && subjects.length === 0 && (
          <p
            role="status"
            className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
          >
            لا توجد مادة مرتبطة بهذا الصف والمسار. أضفها من «المواد والمسارات» أولًا.
          </p>
        )}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5 xl:col-span-2">
            <Label htmlFor="textbook-title">اسم الكتاب</Label>
            <Input
              id="textbook-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="مثال: كتاب الكيمياء الرسمي"
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="textbook-type">نوع الكتاب</Label>
            <select
              id="textbook-type"
              value={bookType}
              onChange={(event) =>
                setBookType(event.target.value as "MAIN_TEXTBOOK" | "EXERCISE_BOOK" | "OTHER")
              }
              disabled={busy}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
            >
              <option value="MAIN_TEXTBOOK">الكتاب الأساسي</option>
              <option value="EXERCISE_BOOK">كتاب التمارين</option>
              <option value="OTHER">ملحق</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="textbook-coverage">الفصل الدراسي</Label>
            <select
              id="textbook-coverage"
              value={coverageType === "FULL_ACADEMIC_YEAR" ? "FULL" : String(semester)}
              onChange={(event) => {
                if (event.target.value === "FULL") setCoverageType("FULL_ACADEMIC_YEAR");
                else {
                  setCoverageType("SEMESTER_SPECIFIC");
                  setSemester(event.target.value === "2" ? 2 : 1);
                }
              }}
              disabled={busy}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
            >
              <option value="FULL">كتاب واحد للفصلين</option>
              <option value="1">الفصل الأول</option>
              <option value="2">الفصل الثاني</option>
            </select>
          </div>
        </div>

        {selectedGrade && selectedSubject && selectedTrackNames.length > 0 && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-foreground">
            <span className="font-bold">سيُربط الكتاب بـ:</span> {selectedGrade.name} ·{" "}
            {selectedSubject.name} · {selectedTrackNames.join(" + ")} ·{" "}
            {coverageType === "FULL_ACADEMIC_YEAR"
              ? "الفصلين"
              : semester === 2
                ? "الفصل الثاني"
                : "الفصل الأول"}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Upload className="h-4 w-4 text-primary" />
          {replaceId ? "2. اختيار النسخة الجديدة واستبدال الكتاب" : "2. اختيار ملف الكتاب ورفعه"}
        </h2>
        <div className="space-y-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4">
          <Label htmlFor="subject-textbook-pdf" className="text-sm font-semibold">
            ملف الكتاب الرسمي PDF *
          </Label>
          <p className="text-xs text-muted-foreground">
            الحد الأقصى 200 ميجابايت. اختيار الملف لا يرفعه؛ يبدأ الرفع فقط عند الضغط على الزر
            أدناه.
          </p>
          <input
            id="subject-textbook-pdf"
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            disabled={busy || !selectedSubject}
            onChange={(event) => selectFile(event.target.files?.[0])}
            className="block w-full text-xs disabled:opacity-60"
          />
          {selectedFile && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-background p-2 text-xs">
              <FileText className="h-4 w-4 text-primary" />
              <span className="font-medium">{selectedFile.name}</span>
              <span className="text-muted-foreground">({formatBytes(selectedFile.size)})</span>
            </div>
          )}
        </div>

        {existingScopeBook && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <span>يوجد كتاب مسجل لنفس المادة والمسار والفصل. استبدله بدل إنشاء نسخة مكررة.</span>
            <Button size="sm" variant="outline" onClick={() => beginReplace(existingScopeBook)}>
              استبدال الكتاب الموجود
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void upload()} disabled={!formReady}>
            {busy ? (
              <Loader2 className="ms-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="ms-2 h-4 w-4" />
            )}
            {replaceId ? "استبدال الكتاب" : "رفع كتاب المادة"}
          </Button>
          {replaceId && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setReplaceId(null);
                setTitle("");
                clearFile();
              }}
            >
              إلغاء الاستبدال
            </Button>
          )}
          {!selectedSubject && (
            <span className="text-xs text-muted-foreground">
              أكمل الصف والمسار والمادة لتفعيل اختيار الملف.
            </span>
          )}
        </div>
      </section>

      {subjectId && (
        <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
            <BookOpen className="h-4 w-4 text-primary" /> كتب المادة المرفوعة
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
                  <p className="flex flex-wrap items-center gap-2 truncate text-sm font-semibold text-foreground">
                    {book.title}
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                      {BOOK_TYPE_LABEL[book.bookType]}
                    </span>
                  </p>
                  <p className="text-muted-foreground">
                    {selectedGrade?.name} · {trackName(book.curriculumTrackId)} ·{" "}
                    {book.coverageType === "SEMESTER_SPECIFIC"
                      ? `الفصل ${book.semester === 2 ? "الثاني" : "الأول"}`
                      : "الفصلان معًا"}{" "}
                    · {formatBytes(book.fileSize)} · إصدار {book.version.slice(0, 6)} ·{" "}
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
                  <Button size="sm" variant="outline" onClick={() => beginReplace(book)}>
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
