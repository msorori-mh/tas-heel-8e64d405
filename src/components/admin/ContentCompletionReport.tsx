import {
  hasBookFile,
  scopedBooks,
  textbookCoverage,
  textbookStatus,
} from "@/lib/content-report/textbooks";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { allRows, loadReport } from "@/lib/content-report/load";
import { componentReportSummary, labels, reportSummary } from "@/lib/content-report/model";
import { ContentOverviewReport } from "@/components/admin/ContentOverviewReport";
import {
  V3_CAPABILITIES,
  V3_ICON,
  V3_LABEL_AR,
  type V3CapabilityKey,
} from "@/lib/lessons/content-v3";
export function ContentCompletionReport({ enabled }: { enabled: boolean }) {
  const [grade, setGrade] = useState("");
  const [track, setTrack] = useState("");
  const [subject, setSubject] = useState("");
  const [semester, setSemester] = useState("");
  const [status, setStatus] = useState("");
  const [component, setComponent] = useState<V3CapabilityKey | "">("");
  const [search, setSearch] = useState("");
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState(false);
  const catalog = useQuery({
    queryKey: ["content-report-catalog"],
    enabled,
    queryFn: async ({ signal }) => {
      const [subjects, grades, tracks, links] = await Promise.all([
        allRows(
          (a, b) =>
            supabase
              .from("subjects")
              .select("id,name,grade_id,curriculum_track_id")
              .order("id")
              .range(a, b)
              .abortSignal(signal),
          signal,
        ),
        allRows(
          (a, b) =>
            supabase.from("grades").select("id,name").order("id").range(a, b).abortSignal(signal),
          signal,
        ),
        allRows(
          (a, b) =>
            supabase
              .from("curriculum_tracks")
              .select("id,track_name")
              .order("id")
              .range(a, b)
              .abortSignal(signal),
          signal,
        ),
        allRows(
          (a, b) =>
            supabase
              .from("subject_curriculum_tracks")
              .select("subject_id,curriculum_track_id")
              .order("subject_id")
              .order("curriculum_track_id")
              .range(a, b)
              .abortSignal(signal),
          signal,
        ),
      ]);
      return { subjects, grades, tracks, links };
    },
  });
  const report = useQuery({
    queryKey: ["content-completion", subject],
    enabled: enabled && !!subject,
    queryFn: ({ signal }) => loadReport(subject, signal),
    retry: false,
  });
  const booksQ = useQuery({
    queryKey: ["content-report-books", subject],
    enabled: enabled && !!subject,
    retry: false,
    queryFn: ({ signal }) =>
      allRows(
        (a, b) =>
          supabase
            .from("subject_textbooks")
            .select(
              "id,title,book_type,coverage_type,curriculum_track_id,semester,is_active,file_name,file_size,storage_path,version,updated_at,created_by",
            )
            .eq("subject_id", subject)
            .order("id")
            .range(a, b)
            .abortSignal(signal),
        signal,
      ),
  });
  const books = scopedBooks(booksQ.data ?? [], track, semester);
  const subjectRow = catalog.data?.subjects.find((s) => s.id === subject);
  const linkedTracks =
    catalog.data?.links.filter((l) => l.subject_id === subject).map((l) => l.curriculum_track_id) ??
    [];
  const reportTracks = (catalog.data?.tracks ?? []).filter((t) =>
    track
      ? t.id === track
      : linkedTracks.length
        ? linkedTracks.includes(t.id)
        : subjectRow?.curriculum_track_id
          ? t.id === subjectRow.curriculum_track_id
          : true,
  );
  const terms = semester
    ? [Number(semester)]
    : Array.from(
        new Set(
          (report.data ?? []).map((r) => r.semester).filter((t): t is number => t === 1 || t === 2),
        ),
      );
  const coverage = textbookCoverage(books, reportTracks, terms);
  const scope = (report.data ?? []).filter((r) => !semester || String(r.semester) === semester);
  const componentStats = componentReportSummary(scope);
  const filtered = scope.filter((r) => {
    const relevantCells = component ? r.cells.filter((c) => c.key === component) : r.cells;
    return (
      (!search || r.title.includes(search)) &&
      (!status || relevantCells.some((c) => c.status === status))
    );
  });
  const visibleCapabilities = component
    ? V3_CAPABILITIES.filter((key) => key === component)
    : V3_CAPABILITIES;
  const summary = reportSummary(scope);
  const current = catalog.data?.subjects.find((s) => s.id === subject);
  const subjects =
    catalog.data?.subjects.filter(
      (s) =>
        (!grade || s.grade_id === grade) &&
        (!track ||
          s.curriculum_track_id === track ||
          catalog.data.links.some((l) => l.subject_id === s.id && l.curriculum_track_id === track)),
    ) ?? [];
  async function download() {
    setExporting(true);
    setExportError("");
    try {
      const ExcelJS = await import("exceljs");
      const data = filtered.map((r) => ({
        المادة: current?.name ?? "",
        الدرس: r.title,
        الفصل: r.semester ?? "غير محدد",
        ...Object.fromEntries(
          r.cells.map((c) => [
            c.label,
            `${labels[c.status]}${!c.required && c.status !== "na" ? " (اختياري)" : ""}`,
          ]),
        ),
        "النواقص المطلوبة": r.cells
          .filter((c) => c.required && c.status !== "published")
          .map((c) => `${c.label}: ${labels[c.status]}`)
          .join("، "),
        "آخر تحديث للدرس": r.updatedAt,
        المحرر: "غير مسجل في بيانات التقرير",
        "رابط المعالجة": `${location.origin}/admin/lesson-content/${r.id}`,
      }));
      const book = new ExcelJS.Workbook();
      const sheet = book.addWorksheet("اكتمال المحتوى", {
        views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
      });
      const headers = Object.keys(data[0]);
      sheet.columns = headers.map((key) => ({
        header: key,
        key,
        width: key === "الدرس" ? 40 : 28,
      }));
      sheet.addRows(data);
      sheet.getRow(1).font = { bold: true };
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
      const textbookSheet = book.addWorksheet("كتب المادة الكاملة", {
        views: [{ rightToLeft: true }],
      });
      textbookSheet.addRow([
        "العنوان",
        "النوع",
        "المنهج",
        "التغطية",
        "الحالة",
        "اسم الملف",
        "الإصدار",
        "آخر تحديث",
        "معرّف رافع الكتاب",
      ]);
      books.forEach((b) =>
        textbookSheet.addRow([
          b.title,
          b.book_type,
          b.curriculum_track_id
            ? (catalog.data?.tracks.find((t) => t.id === b.curriculum_track_id)?.track_name ??
              "غير معروف")
            : "مشترك",
          b.coverage_type === "FULL_ACADEMIC_YEAR" ? "العام كاملًا" : `الفصل ${b.semester}`,
          textbookStatus(b),
          b.file_name ?? "",
          b.version,
          b.updated_at,
          b.created_by ?? "غير مسجل",
        ]),
      );
      textbookSheet.columns.forEach((c) => {
        c.width = 28;
      });
      textbookSheet.getRow(1).font = { bold: true };
      const coverageSheet = book.addWorksheet("نواقص كتب المادة", {
        views: [{ rightToLeft: true }],
      });
      coverageSheet.addRow(["المنهج", "الفصل", "حالة الكتاب الأساسي"]);
      coverage.forEach((c) =>
        coverageSheet.addRow([
          c.track,
          c.term,
          c.covered ? "موجود ومفعّل" : "ينقص كتاب أساسي مفعّل",
        ]),
      );

      const componentSheet = book.addWorksheet("ملخص المكونات السبعة", {
        views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
      });
      componentSheet.addRow([
        "المكون",
        "الدروس القابلة للتطبيق",
        "مطلوب",
        "اختياري",
        "غير مطلوب",
        "مرفوع",
        "المتبقي للرفع",
        "نسبة الرفع",
        "جاهز",
        "منشور",
        "المتبقي للنشر",
        "قيد المراجعة",
        "يحتاج تصحيحًا",
        "مسودة",
        "نسبة النشر",
      ]);
      componentStats.forEach((item) =>
        componentSheet.addRow([
          item.label,
          item.applicable,
          item.required,
          item.optional,
          item.notApplicable,
          item.uploaded,
          item.remainingUpload,
          item.uploadPercent === null ? "" : `${item.uploadPercent}%`,
          item.ready,
          item.published,
          item.remainingPublish,
          item.review,
          item.invalid,
          item.draft,
          item.publishPercent === null ? "" : `${item.publishPercent}%`,
        ]),
      );
      componentSheet.columns.forEach((column, index) => {
        column.width = index === 0 ? 28 : 18;
      });
      componentSheet.getRow(1).font = { bold: true };
      componentSheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: 15 },
      };

      const remainingSheet = book.addWorksheet("المتبقي حسب المكون", {
        views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
      });
      remainingSheet.addRow([
        "المكون",
        "الدرس",
        "الفصل",
        "الإلزام",
        "حالة الرفع",
        "حالة النشر",
        "الإجراء المطلوب",
        "رابط المعالجة",
      ]);
      scope.forEach((row) => {
        row.cells
          .filter((cell) => cell.status !== "na" && cell.status !== "published")
          .forEach((cell) => {
            remainingSheet.addRow([
              cell.label,
              row.title,
              row.semester ?? "غير محدد",
              cell.required ? "مطلوب" : "اختياري",
              cell.uploaded ? "مرفوع" : "متبقي للرفع",
              labels[cell.status],
              !cell.uploaded
                ? "رفع المكون"
                : cell.status === "invalid"
                  ? "تصحيح المحتوى"
                  : cell.status === "review"
                    ? "استكمال المراجعة"
                    : cell.status === "ready"
                      ? "إتاحة/نشر للطالب"
                      : "استكمال دورة النشر",
              `${location.origin}/admin/lesson-content/${row.id}`,
            ]);
          });
      });
      remainingSheet.columns.forEach((column, index) => {
        column.width = index === 1 ? 40 : index === 7 ? 48 : 22;
      });
      remainingSheet.getRow(1).font = { bold: true };
      remainingSheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: 8 },
      };

      const bytes = await book.xlsx.writeBuffer();
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes)], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "content-completion.xlsx";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setExportError("تعذر تصدير الملف. حاول مجددًا.");
    } finally {
      setExporting(false);
    }
  }
  const cls = "min-h-11 rounded-lg border border-border bg-background px-3 text-sm";
  return (
    <section dir="rtl" className="space-y-5 min-w-0">
      <header>
        <div className="flex gap-4 mb-3">
          <Link to="/admin/subjects" className="text-primary underline">
            إدارة المواد
          </Link>
          <Link to="/admin/units" className="text-primary underline">
            إدارة الوحدات
          </Link>
        </div>
        <h1 className="text-2xl font-bold">متابعة اكتمال المحتوى</h1>
        <p className="text-sm text-muted-foreground mt-2">
          ابدأ من التقرير العام للمنصة، ثم استخدم الصف والمنهج والفصل والمادة للوصول إلى التحليل
          التفصيلي لكل درس ومكون.
        </p>
      </header>
      {catalog.isError ? (
        <p role="alert">
          تعذر تحميل فلاتر المحتوى.{" "}
          <button onClick={() => catalog.refetch()}>إعادة المحاولة</button>
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label>
          الصف
          <select
            aria-label="الصف"
            className={`${cls} w-full`}
            value={grade}
            onChange={(e) => {
              setGrade(e.target.value);
              setSubject("");
            }}
          >
            <option value="">كل الصفوف</option>
            {catalog.data?.grades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          المنهج
          <select
            aria-label="المنهج"
            className={`${cls} w-full`}
            value={track}
            onChange={(e) => {
              setTrack(e.target.value);
              setSubject("");
            }}
          >
            <option value="">كل المناهج</option>
            {catalog.data?.tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.track_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          المادة
          <select
            aria-label="المادة"
            className={`${cls} w-full`}
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setSemester("");
            }}
          >
            <option value="">اختر المادة</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {catalog.data?.grades.find((g) => g.id === s.grade_id)?.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          الفصل
          <select
            aria-label="الفصل"
            className={`${cls} w-full`}
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
          >
            <option value="">كل الفصول</option>
            <option value="1">الأول</option>
            <option value="2">الثاني</option>
          </select>
        </label>
      </div>

      {catalog.data && (
        <ContentOverviewReport
          enabled={enabled}
          catalog={catalog.data}
          grade={grade}
          track={track}
          subject={subject}
          semester={semester}
          onGradeChange={(value) => {
            setGrade(value);
            setSubject("");
          }}
          onTrackChange={(value) => {
            setTrack(value);
            setSubject("");
          }}
          onSubjectChange={(value) => setSubject(value)}
          onSemesterChange={(value) => setSemester(value)}
        />
      )}

      {subject && (
        <section className="space-y-3 border-t border-border pt-5" aria-label="التقرير التفصيلي للمادة">
          <div>
            <h2 className="text-xl font-bold">التقرير التفصيلي للمادة والدروس</h2>
            <p className="text-sm text-muted-foreground">
              هنا يبدأ الفحص العميق لمحتوى المادة المختارة: الكتب، المكونات السبعة، حالة كل درس،
              والنواقص القابلة للمعالجة.
            </p>
          </div>
        </section>
      )}

      {subject && (
        <section className="rounded-xl border p-4 space-y-3" aria-label="كتب المادة الكاملة">
          <div className="flex flex-wrap justify-between gap-3">
            <h2 className="text-lg font-bold">كتب المادة الكاملة</h2>
            <Link className="text-primary underline" to="/admin/textbooks">
              إدارة كتب المادة
            </Link>
          </div>
          {booksQ.isPending ? (
            <p role="status">جارٍ تحميل الكتب…</p>
          ) : booksQ.isError ? (
            <p role="alert">
              تعذر تحميل كتب المادة؛ لا تُحسب كنقص.{" "}
              <button onClick={() => booksQ.refetch()}>إعادة المحاولة</button>
            </p>
          ) : (
            <>
              <p>
                {books.length} كتاب/ملحق مسجل —{" "}
                {books.filter((b) => b.is_active && hasBookFile(b)).length} مفعّل ببيانات ملف
                مكتملة. هذه إحصائية مستقلة عن مكونات الدروس.
              </p>
              {books.map((b) => (
                <div key={b.id} className="border-t py-2">
                  <strong>{b.title}</strong> —{" "}
                  {b.coverage_type === "FULL_ACADEMIC_YEAR"
                    ? "العام الدراسي كاملًا"
                    : `الفصل ${b.semester}`}{" "}
                  —{" "}
                  {b.curriculum_track_id
                    ? catalog.data?.tracks.find((t) => t.id === b.curriculum_track_id)?.track_name
                    : "مشترك بين المناهج"}{" "}
                  — {textbookStatus(b)}
                  <p className="text-xs text-muted-foreground">
                    {b.file_name ?? "لا يوجد اسم ملف"} • الإصدار {b.version} • آخر تحديث{" "}
                    {new Date(b.updated_at).toLocaleDateString("ar")}
                  </p>
                </div>
              ))}
              {!books.length && <p>لا توجد كتب مسجلة ضمن الفلاتر المحددة.</p>}
              {coverage
                .filter((c) => !c.covered)
                .map((c) => (
                  <p key={`${c.track}-${c.term}`} className="text-destructive">
                    {c.track} — الفصل {c.term}: ينقص كتاب أساسي مفعّل.
                  </p>
                ))}
              {!terms.length && (
                <p className="text-sm">
                  اختر فصلًا لتقييم تغطية الكتاب الأساسي؛ لم تتوفر فصول محددة في الدروس.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                اكتمال بيانات الملف والتفعيل لا يغنيان عن فحص فتح PDF. الكتاب السنوي يغطي الفصلين
                ولا يتكرر احتسابه كملفين.
              </p>
            </>
          )}
        </section>
      )}
      {!subject ? (
        <p role="status" className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          {catalog.isPending
            ? "جارٍ تحميل الفلاتر…"
            : "التقرير العام أعلاه يشمل النطاق المحدد. اختر مادة عندما تريد الانتقال إلى الفحص التفصيلي لكل درس ومكون."}
        </p>
      ) : report.isPending ? (
        <p role="status">جارٍ فحص مكونات الدروس…</p>
      ) : report.isError ? (
        <p role="alert" className="text-destructive">
          تعذر إكمال قراءة المحتوى؛ لم تُحسب البيانات الجزئية كنواقص.{" "}
          <button className={cls} onClick={() => report.refetch()}>
            إعادة المحاولة
          </button>
        </p>
      ) : (
        <>
          <section className="space-y-3" aria-label="ملخص اكتمال المادة">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold">ملخص اكتمال المادة</h2>
                <p className="text-xs text-muted-foreground">
                  الأرقام التالية تخص المادة والفصل المحددين فقط.
                </p>
              </div>
              <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                {current?.name ?? "المادة"} • {semester ? `الفصل ${semester}` : "كل الفصول"}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {[
                ["إجمالي الدروس", summary.lessons, "كل الدروس ضمن النطاق"],
                ["دروس مكتملة ومنشورة", summary.complete, "كل المطلوب ظاهر للطالب"],
                ["متبقي رفع مطلوب", summary.missing, "مكونات إلزامية لم تُرفع"],
                ["بانتظار المراجعة", summary.review, "مكونات إلزامية قيد المراجعة"],
                ["تحتاج تصحيحًا", summary.invalid, "مكونات مرفوعة غير صالحة بعد"],
              ].map(([label, n, hint]) => (
                <div key={String(label)} className="rounded-xl border bg-card p-4 shadow-sm">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <strong className="mt-1 block text-2xl">{n}</strong>
                  <small className="text-xs text-muted-foreground">{hint}</small>
                </div>
              ))}
            </div>
          </section>

          <section
            className="rounded-xl border bg-card p-4 space-y-4"
            aria-label="مسار اكتمال المحتوى"
          >
            <div>
              <h2 className="text-lg font-bold">مسار المكونات الإلزامية</h2>
              <p className="text-xs text-muted-foreground">
                الرفع ثم الجاهزية ثم النشر. المقام هو عدد المكونات الإلزامية فقط.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                ["الرفع", summary.uploaded, "تم إدخال محتوى للمكون"],
                ["الجاهزية", summary.ready, "اجتاز دورة المراجعة أو نُشر"],
                ["النشر", summary.published, "ظاهر للطالب وفق بوابة المحتوى"],
              ].map(([label, n, hint]) => {
                const percent = summary.percent(Number(n));
                return (
                  <div key={String(label)} className="rounded-xl bg-muted/50 p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <strong>{label}</strong>
                      <span className="text-sm font-bold">
                        {percent === null ? "—" : `${percent}%`}
                      </span>
                    </div>
                    <div
                      className="h-2 overflow-hidden rounded-full bg-background"
                      role="progressbar"
                      aria-label={String(label)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={percent ?? 0}
                    >
                      <div
                        className="h-full rounded-full bg-primary transition-[width]"
                        style={{ width: `${percent ?? 0}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {n}/{summary.required} • {hint}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="space-y-4" aria-label="تقرير المكونات السبعة">
            <div>
              <h2 className="text-lg font-bold">الرفع والمتبقي لكل مكون من مكونات الدرس السبعة</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                يحسب كل مكون بصورة مستقلة على الدروس القابلة للتطبيق. «غير مطلوب» مستبعد، بينما يظهر
                الاختياري منفصلًا حتى لا يُحتسب كنقص إلزامي.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {componentStats.map((item) => (
                <article
                  key={item.key}
                  className="rounded-xl border bg-card p-4 shadow-sm"
                  data-component-key={item.key}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xl" aria-hidden>
                        {V3_ICON[item.key]}
                      </p>
                      <h3 className="font-bold">{item.label}</h3>
                    </div>
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                      {item.uploadPercent === null ? "—" : `${item.uploadPercent}% رفع`}
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{ width: `${item.uploadPercent ?? 0}%` }}
                    />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg bg-muted/60 p-2">
                      <span className="block text-xs text-muted-foreground">مرفوع</span>
                      <strong>{item.uploaded}</strong>
                    </div>
                    <div className="rounded-lg bg-muted/60 p-2">
                      <span className="block text-xs text-muted-foreground">المتبقي للرفع</span>
                      <strong>{item.remainingUpload}</strong>
                    </div>
                    <div className="rounded-lg bg-muted/60 p-2">
                      <span className="block text-xs text-muted-foreground">منشور</span>
                      <strong>{item.published}</strong>
                    </div>
                    <div className="rounded-lg bg-muted/60 p-2">
                      <span className="block text-xs text-muted-foreground">المتبقي للنشر</span>
                      <strong>{item.remainingPublish}</strong>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    قابل للتطبيق {item.applicable} • مطلوب {item.required} • اختياري {item.optional}
                    {item.notApplicable ? ` • غير مطلوب ${item.notApplicable}` : ""}
                  </p>
                  {(item.review > 0 || item.invalid > 0) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      مراجعة {item.review} • يحتاج تصحيحًا {item.invalid}
                    </p>
                  )}
                  {item.remainingUpload > 0 && (
                    <button
                      type="button"
                      className="mt-3 text-xs font-semibold text-primary hover:underline"
                      onClick={() => {
                        setComponent(item.key);
                        setStatus("missing");
                        setSearch("");
                      }}
                    >
                      عرض الدروس المتبقية للرفع
                    </button>
                  )}
                </article>
              ))}
            </div>

            <div className="overflow-x-auto rounded-xl border" tabIndex={0}>
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="p-3 text-right">المكون</th>
                    <th className="p-3">قابل للتطبيق</th>
                    <th className="p-3">مرفوع</th>
                    <th className="p-3">متبقي للرفع</th>
                    <th className="p-3">جاهز</th>
                    <th className="p-3">منشور</th>
                    <th className="p-3">متبقي للنشر</th>
                    <th className="p-3">مراجعة</th>
                    <th className="p-3">تصحيح</th>
                    <th className="p-3">نسبة الرفع</th>
                    <th className="p-3">نسبة النشر</th>
                  </tr>
                </thead>
                <tbody>
                  {componentStats.map((item) => (
                    <tr key={item.key} className="border-t">
                      <th className="p-3 text-right whitespace-nowrap">
                        {V3_ICON[item.key]} {item.label}
                      </th>
                      <td className="p-3 text-center">{item.applicable}</td>
                      <td className="p-3 text-center">{item.uploaded}</td>
                      <td className="p-3 text-center font-bold">{item.remainingUpload}</td>
                      <td className="p-3 text-center">{item.ready}</td>
                      <td className="p-3 text-center">{item.published}</td>
                      <td className="p-3 text-center">{item.remainingPublish}</td>
                      <td className="p-3 text-center">{item.review}</td>
                      <td className="p-3 text-center">{item.invalid}</td>
                      <td className="p-3 text-center">
                        {item.uploadPercent === null ? "—" : `${item.uploadPercent}%`}
                      </td>
                      <td className="p-3 text-center">
                        {item.publishPercent === null ? "—" : `${item.publishPercent}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="text-sm text-muted-foreground">
            النسب العامة للمكونات الإلزامية فقط؛ أما تقرير المكونات السبعة فيوضح المطلوب والاختياري
            بصورة منفصلة. «منشور» يعني أن قواعد المحتوى تسمح بعرضه، ولا يضمن وحده سلامة كل إجابة أو
            اكتمال تنزيل المورد دون إنترنت.
          </p>
          <div className="flex flex-wrap gap-3">
            <input
              aria-label="بحث باسم الدرس"
              placeholder="ابحث باسم الدرس"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cls}
            />
            <select
              aria-label="المكون"
              value={component}
              onChange={(e) => setComponent(e.target.value as V3CapabilityKey | "")}
              className={cls}
            >
              <option value="">كل المكونات السبعة</option>
              {V3_CAPABILITIES.map((key) => (
                <option value={key} key={key}>
                  {V3_LABEL_AR[key]}
                </option>
              ))}
            </select>
            <select
              aria-label="حالة المكون"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={cls}
            >
              <option value="">كل الحالات</option>
              {Object.entries(labels).map(([k, v]) => (
                <option value={k} key={k}>
                  {v}
                </option>
              ))}
            </select>
            <button
              className={cls}
              disabled={
                exporting ||
                !filtered.length ||
                report.isFetching ||
                booksQ.isPending ||
                booksQ.isError ||
                booksQ.isFetching
              }
              onClick={download}
            >
              {exporting ? "جارٍ التصدير…" : "تصدير Excel"}
            </button>
            <button className={cls} disabled={report.isFetching} onClick={() => report.refetch()}>
              تحديث التقرير
            </button>
            <button
              className={cls}
              onClick={() => {
                setSearch("");
                setStatus("");
                setComponent("");
              }}
            >
              مسح فلاتر الجدول
            </button>
          </div>
          {exportError ? <p role="alert">{exportError}</p> : null}
          <p className="text-sm">
            عرض {filtered.length} من {scope.length} درسًا — وقت القراءة:{" "}
            {new Date(report.dataUpdatedAt).toLocaleString("ar")}
          </p>
          <div
            className="overflow-x-auto rounded-xl border"
            tabIndex={0}
            aria-label="كشف مكونات الدروس"
          >
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="p-3 text-right">الدرس</th>
                  {visibleCapabilities.map((k) => (
                    <th className="p-3 whitespace-nowrap" key={k}>
                      {V3_LABEL_AR[k]}
                    </th>
                  ))}
                  <th>المتبقي والمعالجة</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t">
                    <th className="p-3 text-right min-w-48">
                      <Link
                        to="/admin/lesson-content/$lessonId"
                        params={{ lessonId: r.id }}
                        className="text-primary underline"
                      >
                        {r.title}
                      </Link>
                      <p className="text-xs font-normal">
                        آخر تحديث للدرس: {new Date(r.updatedAt).toLocaleDateString("ar")}
                      </p>
                    </th>
                    {r.cells
                      .filter((cell) => visibleCapabilities.includes(cell.key as V3CapabilityKey))
                      .map((c) => (
                        <td key={c.key} className="p-3">
                          <span
                            className={
                              c.status === "published"
                                ? "text-emerald-700"
                                : c.status === "missing" || c.status === "invalid"
                                  ? "text-destructive"
                                  : ""
                            }
                          >
                            {labels[c.status]}
                          </span>
                          {!c.required && c.status !== "na" ? (
                            <small className="block">اختياري</small>
                          ) : null}
                          <small className="block">{c.count} عنصر</small>
                        </td>
                      ))}
                    <td className="p-3 min-w-64">
                      {r.cells
                        .filter(
                          (cell) =>
                            cell.status !== "published" &&
                            cell.status !== "na" &&
                            (component ? cell.key === component : cell.required),
                        )
                        .map((cell) => (
                          <p key={cell.key}>
                            {cell.label}: {labels[cell.status]}
                            {!cell.required ? " (اختياري)" : ""}
                          </p>
                        ))}
                      <Link
                        to="/admin/lesson-content/$lessonId"
                        params={{ lessonId: r.id }}
                        className="text-primary underline inline-block py-3"
                      >
                        فتح مساحة المعالجة
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!filtered.length ? <p role="status">لا توجد دروس مطابقة للفلاتر.</p> : null}
          <p className="text-xs text-muted-foreground">
            بيانات المحرر ليست متاحة في مصدر التقرير الحالي؛ لا تُنسب التعديلات إلى شخص تخمينًا.
          </p>
        </>
      )}
    </section>
  );
}
