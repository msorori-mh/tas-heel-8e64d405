import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  overviewAttentionRows,
  overviewBreakdown,
  overviewComponentSummary,
  overviewSummary,
  loadContentOverview,
  scopeOverviewFacts,
  type ContentOverviewCatalog,
  type OverviewDimension,
} from "@/lib/content-report/overview";
import { V3_ICON } from "@/lib/lessons/content-v3";

type Props = {
  enabled: boolean;
  catalog: ContentOverviewCatalog;
  grade: string;
  track: string;
  subject: string;
  semester: string;
  onGradeChange: (value: string) => void;
  onTrackChange: (value: string) => void;
  onSubjectChange: (value: string) => void;
  onSemesterChange: (value: string) => void;
};

const dimensionLabels: Record<OverviewDimension, string> = {
  grade: "الصف",
  track: "المنهج",
  semester: "الفصل",
  subject: "المادة",
};

function percentLabel(value: number | null) {
  return value === null ? "—" : `${value}%`;
}

export function ContentOverviewReport({
  enabled,
  catalog,
  grade,
  track,
  subject,
  semester,
  onGradeChange,
  onTrackChange,
  onSubjectChange,
  onSemesterChange,
}: Props) {
  const [dimension, setDimension] = useState<OverviewDimension>("subject");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const overviewQ = useQuery({
    queryKey: ["content-overview"],
    enabled,
    queryFn: ({ signal }) => loadContentOverview(signal),
    retry: false,
    staleTime: 60_000,
  });

  const scope = useMemo(
    () =>
      scopeOverviewFacts(overviewQ.data ?? [], catalog, {
        gradeId: grade || undefined,
        trackId: track || undefined,
        subjectId: subject || undefined,
        semester: semester || undefined,
      }),
    [overviewQ.data, catalog, grade, track, subject, semester],
  );
  const summary = useMemo(() => overviewSummary(scope), [scope]);
  const components = useMemo(() => overviewComponentSummary(scope), [scope]);
  const breakdown = useMemo(
    () => overviewBreakdown(scope, catalog, dimension),
    [scope, catalog, dimension],
  );
  const attention = useMemo(() => overviewAttentionRows(scope, catalog), [scope, catalog]);

  const scopeLabel = [
    grade ? catalog.grades.find((row) => row.id === grade)?.name : null,
    track ? catalog.tracks.find((row) => row.id === track)?.track_name : null,
    subject ? catalog.subjects.find((row) => row.id === subject)?.name : null,
    semester ? `الفصل ${semester}` : null,
  ]
    .filter(Boolean)
    .join(" • ");

  function drill(rowId: string) {
    if (dimension === "grade") onGradeChange(rowId);
    else if (dimension === "track") onTrackChange(rowId);
    else if (dimension === "semester") onSemesterChange(rowId === "unknown" ? "" : rowId);
    else onSubjectChange(rowId);
  }

  async function downloadOverview() {
    if (!scope.length) return;
    setExporting(true);
    setExportError("");
    try {
      const ExcelJS = await import("exceljs");
      const book = new ExcelJS.Workbook();

      const general = book.addWorksheet("نظرة عامة", {
        views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
      });
      general.addRow(["المؤشر", "القيمة"]);
      [
        ["إجمالي الدروس", summary.totalLessons],
        ["الدروس المدارة تحريريًا", summary.managedLessons],
        ["الدروس القديمة غير المدارة", summary.unmanagedLessons],
        ["الدروس الظاهرة للطالب", summary.visibleLessons],
        ["الدروس المدارة المكتملة", summary.managedCompleteLessons],
        ["الدروس المدارة التي تحتاج عملًا", summary.managedNeedsAttention],
        ["المكونات المطلوبة", summary.requiredTotal],
        ["المكونات المطلوبة المدخلة", summary.requiredEntered],
        ["المكونات المطلوبة الجاهزة", summary.requiredReady],
        ["المكونات المطلوبة الظاهرة للطالب", summary.requiredPublished],
        ["المكونات المطلوبة قيد المراجعة", summary.requiredReview],
        ["المكونات المطلوبة المسودة", summary.requiredDraft],
        ["المكونات المطلوبة غير المدخلة", summary.requiredMissing],
        ["نسبة الجاهزية", percentLabel(summary.readinessPercent)],
        ["نسبة الإتاحة للطالب", percentLabel(summary.publicationPercent)],
      ].forEach((row) => general.addRow(row));
      general.columns = [{ width: 38 }, { width: 24 }];
      general.getRow(1).font = { bold: true };

      const componentSheet = book.addWorksheet("المكونات السبعة العامة", {
        views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
      });
      componentSheet.addRow([
        "المكون",
        "قابل للتطبيق",
        "مطلوب",
        "اختياري",
        "مدخل",
        "غير مدخل",
        "مسودة",
        "مراجعة",
        "جاهز",
        "ظاهر للطالب",
        "نسبة الإدخال",
        "نسبة الجاهزية",
        "نسبة الإتاحة",
      ]);
      components.forEach((item) =>
        componentSheet.addRow([
          item.label,
          item.applicable,
          item.required,
          item.optional,
          item.entered,
          item.missing,
          item.draft,
          item.review,
          item.ready,
          item.published,
          percentLabel(item.uploadPercent),
          percentLabel(item.readinessPercent),
          percentLabel(item.publicationPercent),
        ]),
      );
      componentSheet.columns.forEach((column, index) => {
        column.width = index === 0 ? 28 : 18;
      });
      componentSheet.getRow(1).font = { bold: true };

      for (const d of ["grade", "track", "semester", "subject"] as OverviewDimension[]) {
        const sheet = book.addWorksheet(`تحليل ${dimensionLabels[d]}`, {
          views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
        });
        sheet.addRow([
          dimensionLabels[d],
          "الدروس",
          "مدارة",
          "ظاهرة للطالب",
          "مكتملة",
          "تحتاج عملًا",
          "المكونات المطلوبة",
          "الجاهزة",
          "المتبقي",
          "نسبة الجاهزية",
        ]);
        overviewBreakdown(scope, catalog, d).forEach((row) =>
          sheet.addRow([
            row.label,
            row.summary.totalLessons,
            row.summary.managedLessons,
            row.summary.visibleLessons,
            row.summary.managedCompleteLessons,
            row.summary.managedNeedsAttention,
            row.summary.requiredTotal,
            row.summary.requiredReady,
            row.summary.requiredTotal - row.summary.requiredReady,
            percentLabel(row.summary.readinessPercent),
          ]),
        );
        sheet.columns.forEach((column, index) => {
          column.width = index === 0 ? 34 : 18;
        });
        sheet.getRow(1).font = { bold: true };
      }

      const lessonsSheet = book.addWorksheet("الدروس التي تحتاج معالجة", {
        views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
      });
      lessonsSheet.addRow([
        "المادة",
        "الدرس",
        "الفصل",
        "الجاهز من المطلوب",
        "غير مدخل",
        "قيد المراجعة",
        "مسودة",
        "ظاهر للطالب",
        "رابط المعالجة",
      ]);
      attention.forEach((row) =>
        lessonsSheet.addRow([
          row.subject,
          row.title,
          row.semester ?? "غير محدد",
          `${row.requiredReady}/${row.requiredTotal}`,
          row.missingLabels.join("، "),
          row.reviewLabels.join("، "),
          row.draftLabels.join("، "),
          row.visible ? "نعم" : "لا",
          `${location.origin}/admin/lesson-content/${row.id}`,
        ]),
      );
      lessonsSheet.columns.forEach((column, index) => {
        column.width = index === 1 ? 42 : index === 8 ? 48 : 26;
      });
      lessonsSheet.getRow(1).font = { bold: true };

      const bytes = await book.xlsx.writeBuffer();
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes)], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "content-overview.xlsx";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setExportError("تعذر تصدير التقرير العام. حاول مجددًا.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section
      className="space-y-5 rounded-2xl border border-primary/10 bg-card/50 p-4 md:p-5"
      aria-label="التقرير العام للمحتوى"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">التقرير العام للمحتوى</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            نظرة تشغيلية على جميع الدروس في النطاق المحدد، ثم تحليل حسب الصف والمنهج والفصل والمادة
            والدرس. إحصاءات المكونات تعتمد على دورة المحتوى للدروس المدارة تحريريًا، بينما تظهر
            الدروس القديمة غير المدارة كفئة مستقلة حتى لا تُحسب كنواقص بصورة خاطئة.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {scopeLabel && (
            <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
              {scopeLabel}
            </span>
          )}
          <button
            type="button"
            className="min-h-10 rounded-lg border border-border bg-background px-3 text-sm"
            onClick={() => overviewQ.refetch()}
            disabled={overviewQ.isFetching}
          >
            {overviewQ.isFetching ? "جارٍ التحديث…" : "تحديث العام"}
          </button>
          <button
            type="button"
            className="min-h-10 rounded-lg border border-border bg-background px-3 text-sm"
            onClick={downloadOverview}
            disabled={exporting || !scope.length || overviewQ.isFetching}
          >
            {exporting ? "جارٍ التصدير…" : "تصدير التقرير العام"}
          </button>
        </div>
      </div>

      {overviewQ.isPending ? (
        <p role="status">جارٍ بناء التقرير العام للمحتوى…</p>
      ) : overviewQ.isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p role="alert" className="text-destructive">
            تعذر تحميل التقرير العام؛ لم تُحوّل البيانات الجزئية إلى إحصاءات.
          </p>
          <button className="mt-2 text-primary underline" onClick={() => overviewQ.refetch()}>
            إعادة المحاولة
          </button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {[
              ["إجمالي الدروس", summary.totalLessons, "ضمن الفلاتر الحالية"],
              ["مدارة تحريريًا", summary.managedLessons, "تدخل في مؤشرات المكونات"],
              ["ظاهرة للطالب", summary.visibleLessons, "مدارة وقديمة"],
              ["مكتملة", summary.managedCompleteLessons, "كل المطلوب جاهز"],
              ["تحتاج عملًا", summary.managedNeedsAttention, "من الدروس المدارة"],
              ["متبقي مطلوب", summary.requiredTotal - summary.requiredReady, "مكون مطلوب غير جاهز"],
            ].map(([label, value, hint]) => (
              <div key={String(label)} className="rounded-xl border bg-background p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <strong className="mt-1 block text-2xl">{value}</strong>
                <small className="text-[11px] text-muted-foreground">{hint}</small>
              </div>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border bg-background p-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h3 className="font-bold">جاهزية المكونات المطلوبة</h3>
                  <p className="text-xs text-muted-foreground">
                    {summary.requiredReady}/{summary.requiredTotal} مكونًا مطلوبًا جاهز
                  </p>
                </div>
                <strong className="text-2xl">{percentLabel(summary.readinessPercent)}</strong>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${summary.readinessPercent ?? 0}%` }}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>غير مدخل: {summary.requiredMissing}</span>
                <span>مسودة: {summary.requiredDraft}</span>
                <span>مراجعة: {summary.requiredReview}</span>
              </div>
            </div>
            <div className="rounded-xl border bg-background p-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h3 className="font-bold">إتاحة المكونات المطلوبة للطالب</h3>
                  <p className="text-xs text-muted-foreground">
                    الجاهز داخل درس غير مكتمل لا يُعد ظاهرًا بعد
                  </p>
                </div>
                <strong className="text-2xl">{percentLabel(summary.publicationPercent)}</strong>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${summary.publicationPercent ?? 0}%` }}
                />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {summary.requiredPublished}/{summary.requiredTotal} مكون مطلوب ظاهر ضمن درس متاح
                للطالب.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <h3 className="font-bold">المكونات السبعة على مستوى النطاق العام</h3>
              <p className="text-xs text-muted-foreground">
                هذا الملخص سريع وخفيف؛ الفحص التفصيلي للبايتات وصلاحية كل عنصر يظهر بعد اختيار
                المادة في القسم التفصيلي.
              </p>
            </div>
            <div className="overflow-x-auto rounded-xl border bg-background" tabIndex={0}>
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="p-3 text-right">المكون</th>
                    <th className="p-3">قابل للتطبيق</th>
                    <th className="p-3">مدخل</th>
                    <th className="p-3">غير مدخل</th>
                    <th className="p-3">مسودة</th>
                    <th className="p-3">مراجعة</th>
                    <th className="p-3">جاهز</th>
                    <th className="p-3">ظاهر للطالب</th>
                    <th className="p-3">الإدخال</th>
                    <th className="p-3">الجاهزية</th>
                  </tr>
                </thead>
                <tbody>
                  {components.map((item) => (
                    <tr key={item.key} className="border-t" data-overview-component={item.key}>
                      <th className="p-3 text-right whitespace-nowrap">
                        {V3_ICON[item.key]} {item.label}
                      </th>
                      <td className="p-3 text-center">{item.applicable}</td>
                      <td className="p-3 text-center">{item.entered}</td>
                      <td className="p-3 text-center font-bold">{item.missing}</td>
                      <td className="p-3 text-center">{item.draft}</td>
                      <td className="p-3 text-center">{item.review}</td>
                      <td className="p-3 text-center">{item.ready}</td>
                      <td className="p-3 text-center">{item.published}</td>
                      <td className="p-3 text-center">{percentLabel(item.uploadPercent)}</td>
                      <td className="p-3 text-center">{percentLabel(item.readinessPercent)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3" aria-label="التحليل العام حسب المستوى">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold">التحليل التفصيلي العام</h3>
                <p className="text-xs text-muted-foreground">
                  انتقل من الصورة العامة إلى الصف أو المنهج أو الفصل أو المادة بضغطة واحدة.
                </p>
              </div>
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="مستوى التحليل">
                {(Object.keys(dimensionLabels) as OverviewDimension[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={dimension === key}
                    className={
                      dimension === key
                        ? "rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
                        : "rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    }
                    onClick={() => setDimension(key)}
                  >
                    حسب {dimensionLabels[key]}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border bg-background" tabIndex={0}>
              <table className="w-full min-w-[880px] text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="p-3 text-right">{dimensionLabels[dimension]}</th>
                    <th className="p-3">الدروس</th>
                    <th className="p-3">مدارة</th>
                    <th className="p-3">ظاهرة</th>
                    <th className="p-3">مكتملة</th>
                    <th className="p-3">تحتاج عملًا</th>
                    <th className="p-3">المتبقي المطلوب</th>
                    <th className="p-3">الجاهزية</th>
                    <th className="p-3">التفاصيل</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((row) => (
                    <tr key={row.id} className="border-t">
                      <th className="p-3 text-right">{row.label}</th>
                      <td className="p-3 text-center">{row.summary.totalLessons}</td>
                      <td className="p-3 text-center">{row.summary.managedLessons}</td>
                      <td className="p-3 text-center">{row.summary.visibleLessons}</td>
                      <td className="p-3 text-center">{row.summary.managedCompleteLessons}</td>
                      <td className="p-3 text-center">{row.summary.managedNeedsAttention}</td>
                      <td className="p-3 text-center font-bold">
                        {row.summary.requiredTotal - row.summary.requiredReady}
                      </td>
                      <td className="p-3 text-center">
                        {percentLabel(row.summary.readinessPercent)}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          className="text-primary underline"
                          onClick={() => drill(row.id)}
                        >
                          تصفية بهذا {dimensionLabels[dimension]}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {dimension === "track" && (
              <p className="text-xs text-muted-foreground">
                المادة المرتبطة بأكثر من منهج تظهر تحت كل منهج؛ لذلك مجموع صفوف المناهج قد يتجاوز
                إجمالي الدروس الفريد.
              </p>
            )}
          </div>

          <div className="space-y-3" aria-label="الدروس التي تحتاج معالجة">
            <div>
              <h3 className="font-bold">أكثر الدروس احتياجًا للمعالجة</h3>
              <p className="text-xs text-muted-foreground">
                مرتبة حسب عدد المكونات المطلوبة غير الجاهزة، وبحد أقصى 25 درسًا.
              </p>
            </div>
            {attention.length ? (
              <div className="overflow-x-auto rounded-xl border bg-background" tabIndex={0}>
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="p-3 text-right">المادة</th>
                      <th className="p-3 text-right">الدرس</th>
                      <th className="p-3">الفصل</th>
                      <th className="p-3">الجاهز</th>
                      <th className="p-3 text-right">غير مدخل</th>
                      <th className="p-3 text-right">مراجعة/مسودة</th>
                      <th className="p-3">المعالجة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attention.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="p-3">{row.subject}</td>
                        <td className="p-3 font-medium">{row.title}</td>
                        <td className="p-3 text-center">{row.semester ?? "—"}</td>
                        <td className="p-3 text-center">
                          {row.requiredReady}/{row.requiredTotal}
                        </td>
                        <td className="p-3">{row.missingLabels.join("، ") || "—"}</td>
                        <td className="p-3">
                          {[...row.reviewLabels, ...row.draftLabels].join("، ") || "—"}
                        </td>
                        <td className="p-3 text-center">
                          <Link
                            to="/admin/lesson-content/$lessonId"
                            params={{ lessonId: row.id }}
                            className="text-primary underline"
                          >
                            فتح الدرس
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">
                لا توجد دروس مدارة تحتاج معالجة ضمن النطاق الحالي.
              </p>
            )}
          </div>
        </>
      )}

      {exportError ? (
        <p role="alert" className="text-sm text-destructive">
          {exportError}
        </p>
      ) : null}
    </section>
  );
}
