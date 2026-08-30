import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  Download,
  GraduationCap,
  LoaderCircle,
  RefreshCcw,
} from "lucide-react";
import { adminReportLessonEngagement, adminReportPrograms } from "./lib/academy-api";
import type { AdminLessonEngagement, AdminProgramReport } from "./types";

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) return String(error.message);
  return "تعذر تحميل التقرير. حاول مرة أخرى.";
}

function rangeBoundary(value: string, endOfDay: boolean): string | null {
  if (!value) return null;
  return new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`).toISOString();
}

function formatDate(value: string | null): string {
  if (!value) return "لا يوجد نشاط";
  return new Date(value).toLocaleString("ar-YE", { dateStyle: "medium", timeStyle: "short" });
}

function downloadCsv(fileName: string, rows: Array<Array<string | number>>) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function Metric({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="metric-card admin-metric-card">
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

export function AdminReports() {
  const [programs, setPrograms] = useState<AdminProgramReport[]>([]);
  const [lessons, setLessons] = useState<AdminLessonEngagement[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [programId, setProgramId] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload(from = fromDate, to = toDate) {
    setLoading(true);
    setError(null);
    try {
      const fromIso = rangeBoundary(from, false);
      const toIso = rangeBoundary(to, true);
      const [programRows, lessonRows] = await Promise.all([
        adminReportPrograms(fromIso, toIso),
        adminReportLessonEngagement(null, fromIso, toIso),
      ]);
      setPrograms(programRows);
      setLessons(lessonRows);
    } catch (loadError) {
      setError(messageOf(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload("", "");
    // The first report is intentionally unbounded; filters are applied explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visiblePrograms = useMemo(
    () =>
      programId === "ALL"
        ? programs
        : programs.filter((item) => item.program_version_id === programId),
    [programId, programs],
  );
  const visibleLessons = useMemo(
    () =>
      programId === "ALL"
        ? lessons
        : lessons.filter((item) => item.program_version_id === programId),
    [lessons, programId],
  );

  const totals = useMemo(() => {
    const enrolled = visiblePrograms.reduce((sum, item) => sum + Number(item.enrolled_count), 0);
    const completed = visiblePrograms.reduce((sum, item) => sum + Number(item.completed_count), 0);
    const attempts = visiblePrograms.reduce((sum, item) => sum + Number(item.attempt_count), 0);
    const passed = visiblePrograms.reduce(
      (sum, item) => sum + Number(item.passed_attempt_count),
      0,
    );
    const certificates = visiblePrograms.reduce(
      (sum, item) => sum + Number(item.valid_certificate_count),
      0,
    );
    return {
      enrolled,
      completed,
      attempts,
      passed,
      certificates,
      completionRate: enrolled ? Math.round((completed / enrolled) * 100) : 0,
      passRate: attempts ? Math.round((passed / attempts) * 100) : 0,
    };
  }, [visiblePrograms]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (fromDate && toDate && fromDate > toDate) {
      setError("تاريخ البداية يجب أن يسبق تاريخ النهاية.");
      return;
    }
    void reload();
  }

  return (
    <div
      className="admin-section"
      role="tabpanel"
      id="admin-panel-reports"
      aria-labelledby="admin-tab-reports"
    >
      <div className="section-toolbar">
        <div>
          <h2>التقارير التشغيلية</h2>
          <p className="muted">قياس التسجيل والإكمال والاجتياز والشهادات وإنجاز كل درس.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void reload()}>
          <RefreshCcw /> تحديث التقرير
        </button>
      </div>

      <form className="filter-grid report-filter-grid" onSubmit={applyFilters}>
        <label>
          البرنامج
          <select value={programId} onChange={(event) => setProgramId(event.target.value)}>
            <option value="ALL">جميع البرامج</option>
            {programs.map((item) => (
              <option value={item.program_version_id} key={item.program_version_id}>
                {item.program_title}
              </option>
            ))}
          </select>
        </label>
        <label>
          من تاريخ التسجيل
          <input
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
          />
        </label>
        <label>
          إلى تاريخ التسجيل
          <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        </label>
        <button className="primary-button report-filter-button" type="submit" disabled={loading}>
          {loading ? <LoaderCircle className="spin" /> : <BarChart3 />} تطبيق الفترة
        </button>
      </form>

      {error ? <div className="notice error-notice">{error}</div> : null}
      {loading ? (
        <div className="loading-inline">
          <LoaderCircle className="spin" /> جارٍ إعداد التقرير…
        </div>
      ) : (
        <>
          <div className="admin-metrics-grid compact-metrics">
            <Metric
              icon={<BookOpenCheck />}
              label="التسجيلات"
              value={totals.enrolled}
              hint={`${totals.completed} تسجيلًا مكتملًا`}
            />
            <Metric
              icon={<CheckCircle2 />}
              label="نسبة الإكمال"
              value={`${totals.completionRate}%`}
              hint="من التسجيلات ضمن الفترة"
            />
            <Metric
              icon={<BarChart3 />}
              label="نسبة الاجتياز"
              value={`${totals.passRate}%`}
              hint={`${totals.passed} من ${totals.attempts} محاولة`}
            />
            <Metric
              icon={<GraduationCap />}
              label="الشهادات السارية"
              value={totals.certificates}
              hint="ضمن التسجيلات المشمولة"
            />
          </div>

          <section className="report-block">
            <div className="section-toolbar compact-toolbar">
              <div>
                <h3>أداء البرامج</h3>
                <p className="muted">صف واحد لكل إصدار منشور حاليًا.</p>
              </div>
              <button
                className="secondary-button"
                type="button"
                disabled={visiblePrograms.length === 0}
                onClick={() =>
                  downloadCsv("academy-program-report.csv", [
                    [
                      "البرنامج",
                      "الجمهور",
                      "التسجيلات",
                      "المكتملة",
                      "نسبة الإكمال",
                      "المحاولات",
                      "نسبة الاجتياز",
                      "متوسط الدرجة",
                      "الشهادات السارية",
                      "الشهادات الملغاة",
                      "آخر نشاط",
                    ],
                    ...visiblePrograms.map((item) => [
                      item.program_title,
                      item.subject_name ?? "جميع المعلمين",
                      item.enrolled_count,
                      item.completed_count,
                      `${item.completion_rate}%`,
                      item.attempt_count,
                      `${item.pass_rate}%`,
                      `${item.average_score_percentage}%`,
                      item.valid_certificate_count,
                      item.revoked_certificate_count,
                      formatDate(item.last_activity_at),
                    ]),
                  ])
                }
              >
                <Download /> تصدير CSV
              </button>
            </div>
            <div className="report-table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>البرنامج</th>
                    <th>التسجيلات</th>
                    <th>الإكمال</th>
                    <th>الاجتياز</th>
                    <th>متوسط الدرجة</th>
                    <th>الشهادات</th>
                    <th>آخر نشاط</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePrograms.map((item) => (
                    <tr key={item.program_version_id}>
                      <td>
                        <strong>{item.program_title}</strong>
                        <small>{item.subject_name ?? "جميع المعلمين"}</small>
                      </td>
                      <td>{item.enrolled_count}</td>
                      <td>
                        {item.completed_count} · {item.completion_rate}%
                      </td>
                      <td>
                        {item.passed_attempt_count}/{item.attempt_count} · {item.pass_rate}%
                      </td>
                      <td>{item.average_score_percentage}%</td>
                      <td>
                        {item.valid_certificate_count} سارية
                        {Number(item.revoked_certificate_count) > 0
                          ? ` · ${item.revoked_certificate_count} ملغاة`
                          : ""}
                      </td>
                      <td>{formatDate(item.last_activity_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="report-block">
            <div className="section-toolbar compact-toolbar">
              <div>
                <h3>إنجاز الدروس</h3>
                <p className="muted">
                  «لم يكملوا» عدد مسجلين لم تُسجّل لهم مشاهدة مكتملة للدرس، وليس حكمًا نهائيًا
                  بالانسحاب.
                </p>
              </div>
              <button
                className="secondary-button"
                type="button"
                disabled={visibleLessons.length === 0}
                onClick={() =>
                  downloadCsv("academy-lesson-engagement.csv", [
                    [
                      "البرنامج",
                      "ترتيب الدرس",
                      "الدرس",
                      "المسجلون",
                      "أكملوا",
                      "النسبة",
                      "لم يكملوا",
                    ],
                    ...visibleLessons.map((item) => [
                      item.program_title,
                      item.display_order,
                      item.lesson_title,
                      item.enrolled_count,
                      item.completed_count,
                      `${item.completion_rate}%`,
                      item.not_completed_count,
                    ]),
                  ])
                }
              >
                <Download /> تصدير CSV
              </button>
            </div>
            <div className="report-table-wrap">
              <table className="report-table compact-report-table">
                <thead>
                  <tr>
                    <th>البرنامج / الدرس</th>
                    <th>المسجلون</th>
                    <th>أكملوا</th>
                    <th>نسبة الإنجاز</th>
                    <th>لم يكملوا</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleLessons.map((item) => (
                    <tr key={item.lesson_id}>
                      <td>
                        <strong>
                          {item.display_order}. {item.lesson_title}
                        </strong>
                        <small>{item.program_title}</small>
                      </td>
                      <td>{item.enrolled_count}</td>
                      <td>{item.completed_count}</td>
                      <td>{item.completion_rate}%</td>
                      <td>{item.not_completed_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
