import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Archive,
  BarChart3,
  BookOpen,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Download,
  Eye,
  FilePenLine,
  GraduationCap,
  LayoutDashboard,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCcw,
  RotateCcw,
  Trash2,
  UserRound,
  UsersRound,
  XCircle,
} from "lucide-react";
import { AssessmentEditor } from "./AssessmentEditor";
import {
  adminAddLesson,
  adminCreateDraftVersion,
  adminCreateProgram,
  adminDeleteLesson,
  adminListLessons,
  adminListProgress,
  adminListPrograms,
  adminListTeachers,
  adminPublishProgram,
  adminRevokeCertificate,
  adminSetProgramArchived,
  adminSetTeacherStatus,
  adminUpdateDraftProgram,
  adminUpdateLesson,
  adminValidateProgram,
  loadProfileOptions,
  type ProgramDraftInput,
} from "./lib/academy-api";
import type {
  AcademyCapability,
  AcademySubject,
  AdminLesson,
  AdminProgram,
  AdminProgramCheck,
  AdminProgress,
  AdminTeacher,
} from "./types";

type AdminTab = "overview" | "programs" | "teachers" | "progress";

const ERROR_MESSAGES: Record<string, string> = {
  PROGRAM_LESSON_REQUIRED: "أضف درسًا واحدًا على الأقل قبل النشر.",
  PROGRAM_ASSESSMENT_QUESTION_REQUIRED: "أضف سؤالًا واحدًا على الأقل إلى التقييم قبل النشر.",
  DRAFT_PROGRAM_VERSION_NOT_FOUND: "لم تعد هذه المسودة متاحة للتعديل.",
  PUBLISHED_ACADEMY_CONTENT_IS_IMMUTABLE: "المحتوى المنشور محمي. أنشئ إصدارًا جديدًا لتعديله.",
  ACADEMY_CATALOG_MANAGE_REQUIRED: "لا تملك صلاحية إدارة البرامج.",
  ACADEMY_TEACHERS_VIEW_REQUIRED: "لا تملك صلاحية إدارة المعلمين.",
  ACADEMY_PROGRESS_VIEW_REQUIRED: "لا تملك صلاحية إدارة التقدم.",
};

function messageOf(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String(error.message)
        : "";
  const known = Object.entries(ERROR_MESSAGES).find(([code]) => raw.includes(code));
  return known?.[1] ?? (raw || "تعذرت العملية. حاول مرة أخرى.");
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("ar-YE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function completionPercentage(item: AdminProgress): number {
  return item.total_lessons ? Math.round((item.completed_lessons / item.total_lessons) * 100) : 0;
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

function MetricCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  hint: string;
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

function AdminOverview({ capabilities }: { capabilities: Set<AcademyCapability> }) {
  const [programs, setPrograms] = useState<AdminProgram[]>([]);
  const [teachers, setTeachers] = useState<AdminTeacher[]>([]);
  const [progress, setProgress] = useState<AdminProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      capabilities.has("ACADEMY_CATALOG_MANAGE") ? adminListPrograms() : Promise.resolve([]),
      capabilities.has("ACADEMY_TEACHERS_VIEW") ? adminListTeachers() : Promise.resolve([]),
      capabilities.has("ACADEMY_PROGRESS_VIEW") ? adminListProgress() : Promise.resolve([]),
    ])
      .then(([programItems, teacherItems, progressItems]) => {
        if (!active) return;
        setPrograms(programItems);
        setTeachers(teacherItems);
        setProgress(progressItems);
      })
      .catch((loadError) => active && setError(messageOf(loadError)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [capabilities]);

  if (loading) return <Loading label="جارٍ تحميل مؤشرات التشغيل…" />;

  const activePrograms = new Set(
    programs
      .filter((item) => item.is_current_published && !item.archived_at)
      .map((item) => item.program_id),
  ).size;
  const drafts = programs.filter((item) => item.status === "DRAFT" && !item.archived_at).length;
  const activeTeachers = teachers.filter((item) => item.status === "ACTIVE").length;
  const completed = progress.filter((item) => item.enrollment_status === "COMPLETED").length;
  const completionRate = progress.length ? Math.round((completed / progress.length) * 100) : 0;
  const validCertificates = progress.filter(
    (item) => item.certificate_id && item.certificate_valid,
  ).length;
  const suspended = teachers.filter((item) => item.status === "SUSPENDED").length;
  const learning = progress.filter((item) => item.enrollment_status === "ACTIVE").length;

  return (
    <div
      className="admin-section"
      role="tabpanel"
      id="admin-panel-overview"
      aria-labelledby="admin-tab-overview"
    >
      {error ? <div className="notice error-notice">{error}</div> : null}
      <div className="admin-metrics-grid">
        {capabilities.has("ACADEMY_CATALOG_MANAGE") ? (
          <MetricCard
            icon={<BookOpen />}
            label="البرامج المنشورة"
            value={activePrograms}
            hint={`${drafts} مسودة قيد الإعداد`}
          />
        ) : null}
        {capabilities.has("ACADEMY_TEACHERS_VIEW") ? (
          <MetricCard
            icon={<UsersRound />}
            label="المعلمون النشطون"
            value={activeTeachers}
            hint={`${teachers.length} ملف معلم إجمالًا`}
          />
        ) : null}
        {capabilities.has("ACADEMY_PROGRESS_VIEW") ? (
          <>
            <MetricCard
              icon={<BarChart3 />}
              label="نسبة إكمال التسجيلات"
              value={`${completionRate}%`}
              hint={`${completed} من ${progress.length} تسجيل`}
            />
            <MetricCard
              icon={<GraduationCap />}
              label="الشهادات السارية"
              value={validCertificates}
              hint={`${progress.filter((item) => item.certificate_id).length} شهادة صادرة`}
            />
          </>
        ) : null}
      </div>

      <div className="overview-columns">
        <section className="overview-panel">
          <div className="section-toolbar compact-toolbar">
            <div>
              <h2>تنبيهات التشغيل</h2>
              <p className="muted">المهام التي تحتاج تدخّل فريق الإدارة.</p>
            </div>
          </div>
          <div className="operations-list">
            {drafts > 0 ? (
              <div>
                <FilePenLine />
                <span>
                  <strong>{drafts} مسودة</strong> تحتاج استكمال المحتوى والفحص.
                </span>
              </div>
            ) : null}
            {suspended > 0 ? (
              <div>
                <CircleAlert />
                <span>
                  <strong>{suspended} معلم</strong> حساباتهم موقوفة.
                </span>
              </div>
            ) : null}
            {learning > 0 ? (
              <div>
                <BarChart3 />
                <span>
                  <strong>{learning} تسجيل</strong> ما زالت قيد التدريب.
                </span>
              </div>
            ) : null}
            {drafts === 0 && suspended === 0 && learning === 0 ? (
              <div className="operation-ok">
                <CheckCircle2 />
                <span>لا توجد تنبيهات تشغيلية حاليًا.</span>
              </div>
            ) : null}
          </div>
        </section>

        <section className="overview-panel">
          <div className="section-toolbar compact-toolbar">
            <div>
              <h2>آخر التسجيلات</h2>
              <p className="muted">أحدث حالات التعلم الظاهرة للمسؤول.</p>
            </div>
          </div>
          <div className="data-list compact-list">
            {progress.length === 0 ? (
              <div className="compact-empty">لا توجد تسجيلات بعد.</div>
            ) : null}
            {progress.slice(0, 5).map((item) => (
              <article className="data-row compact-row" key={item.enrollment_id}>
                <div className="data-main">
                  <strong>{item.teacher_name}</strong>
                  <small>{item.program_title}</small>
                </div>
                <span
                  className={
                    item.enrollment_status === "COMPLETED" ? "status live" : "status draft"
                  }
                >
                  {completionPercentage(item)}%
                </span>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function ProgramForm({
  subjects,
  initial,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  subjects: AcademySubject[];
  initial?: AdminProgram;
  busy: boolean;
  submitLabel: string;
  onSubmit: (input: ProgramDraftInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [audience, setAudience] = useState<"ALL_TEACHERS" | "SUBJECT_SPECIFIC">(
    initial?.audience_type ?? "ALL_TEACHERS",
  );
  const [subjectIds, setSubjectIds] = useState<string[]>(initial?.subject_ids ?? []);
  const [minutes, setMinutes] = useState(initial?.estimated_minutes ?? 60);

  function toggleSubject(subjectId: string) {
    setSubjectIds((current) =>
      current.includes(subjectId)
        ? current.filter((item) => item !== subjectId)
        : [...current, subjectId],
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({
      title: title.trim(),
      summary: summary.trim(),
      audienceType: audience,
      estimatedMinutes: minutes,
      subjectIds: audience === "SUBJECT_SPECIFIC" ? subjectIds : [],
    });
  }

  return (
    <form className="admin-form" onSubmit={submit}>
      <div className="section-toolbar compact-toolbar">
        <div>
          <h2>{initial ? "تعديل بيانات المسودة" : "إضافة برنامج تدريبي"}</h2>
          <p className="muted">احفظ البيانات، ثم أضف الدروس والتقييم وافحص الجاهزية.</p>
        </div>
        {onCancel ? (
          <button className="text-button inline-text-button" type="button" onClick={onCancel}>
            إلغاء
          </button>
        ) : null}
      </div>
      <div className="form-grid">
        <label>
          اسم البرنامج
          <input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <label>
          المدة التقديرية بالدقائق
          <input
            type="number"
            min={1}
            value={minutes}
            onChange={(event) => setMinutes(Number(event.target.value))}
            required
          />
        </label>
        <label className="full-field">
          الوصف المختصر
          <textarea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            minLength={10}
            maxLength={600}
            required
          />
        </label>
        <label>
          جمهور البرنامج
          <select
            value={audience}
            onChange={(event) => {
              const value = event.target.value as typeof audience;
              setAudience(value);
              if (value === "ALL_TEACHERS") setSubjectIds([]);
            }}
          >
            <option value="ALL_TEACHERS">جميع المعلمين</option>
            <option value="SUBJECT_SPECIFIC">مواد محددة</option>
          </select>
        </label>
      </div>
      {audience === "SUBJECT_SPECIFIC" ? (
        <fieldset className="subject-picker">
          <legend>المواد المستهدفة</legend>
          {subjects.map((subject) => (
            <label key={subject.id}>
              <input
                type="checkbox"
                checked={subjectIds.includes(subject.id)}
                onChange={() => toggleSubject(subject.id)}
              />
              {subject.name_ar}
            </label>
          ))}
        </fieldset>
      ) : null}
      <button
        className="primary-button"
        type="submit"
        disabled={busy || (audience === "SUBJECT_SPECIFIC" && subjectIds.length === 0)}
      >
        {busy ? <LoaderCircle className="spin" /> : <CheckCircle2 />} {submitLabel}
      </button>
    </form>
  );
}

function ProgramsAdmin() {
  const [programs, setPrograms] = useState<AdminProgram[]>([]);
  const [subjects, setSubjects] = useState<AcademySubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingMetadata, setEditingMetadata] = useState<AdminProgram | null>(null);
  const [editingContent, setEditingContent] = useState<{
    program: AdminProgram;
    readOnly: boolean;
  } | null>(null);
  const [checks, setChecks] = useState<Record<string, AdminProgramCheck[]>>({});
  const [scope, setScope] = useState<"ACTIVE" | "ARCHIVED">("ACTIVE");

  async function reload() {
    const items = await adminListPrograms();
    setPrograms(items);
    return items;
  }

  useEffect(() => {
    let active = true;
    Promise.all([adminListPrograms(), loadProfileOptions()])
      .then(([programItems, options]) => {
        if (!active) return;
        setPrograms(programItems);
        setSubjects(options.subjects);
        setShowCreate(programItems.length === 0);
      })
      .catch((loadError) => active && setError(messageOf(loadError)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  async function create(input: ProgramDraftInput) {
    setBusyId("create");
    setError(null);
    try {
      await adminCreateProgram(input);
      await reload();
      setShowCreate(false);
    } catch (createError) {
      setError(messageOf(createError));
    } finally {
      setBusyId(null);
    }
  }

  async function update(input: ProgramDraftInput) {
    if (!editingMetadata) return;
    setBusyId(editingMetadata.program_version_id);
    setError(null);
    try {
      await adminUpdateDraftProgram(editingMetadata.program_version_id, input);
      await reload();
      setChecks((current) => ({ ...current, [editingMetadata.program_version_id]: [] }));
      setEditingMetadata(null);
    } catch (updateError) {
      setError(messageOf(updateError));
    } finally {
      setBusyId(null);
    }
  }

  async function createVersion(program: AdminProgram) {
    if (
      !window.confirm(
        `إنشاء مسودة جديدة من الإصدار ${program.version_number} لبرنامج «${program.title}»؟`,
      )
    ) {
      return;
    }
    setBusyId(program.program_version_id);
    setError(null);
    try {
      const draftId = await adminCreateDraftVersion(program.program_version_id);
      const items = await reload();
      const draft = items.find((item) => item.program_version_id === draftId);
      if (draft) setEditingContent({ program: draft, readOnly: false });
    } catch (versionError) {
      setError(messageOf(versionError));
    } finally {
      setBusyId(null);
    }
  }

  async function validate(program: AdminProgram) {
    setBusyId(program.program_version_id);
    setError(null);
    try {
      const items = await adminValidateProgram(program.program_version_id);
      setChecks((current) => ({ ...current, [program.program_version_id]: items }));
    } catch (validateError) {
      setError(messageOf(validateError));
    } finally {
      setBusyId(null);
    }
  }

  async function publish(program: AdminProgram) {
    const programChecks = checks[program.program_version_id] ?? [];
    if (programChecks.length === 0 || programChecks.some((item) => !item.passed)) {
      setError("نفّذ فحص الجاهزية وأغلق جميع نقاطه قبل النشر.");
      return;
    }
    if (!window.confirm(`نشر الإصدار ${program.version_number} من برنامج «${program.title}»؟`)) {
      return;
    }
    setBusyId(program.program_version_id);
    setError(null);
    try {
      await adminPublishProgram(program.program_version_id);
      await reload();
      setChecks((current) => ({ ...current, [program.program_version_id]: [] }));
    } catch (publishError) {
      setError(messageOf(publishError));
    } finally {
      setBusyId(null);
    }
  }

  async function setArchived(program: AdminProgram, archived: boolean) {
    const action = archived ? "أرشفة" : "استعادة";
    if (!window.confirm(`${action} برنامج «${program.title}»؟`)) return;
    setBusyId(program.program_id);
    setError(null);
    try {
      await adminSetProgramArchived(program.program_id, archived);
      await reload();
    } catch (archiveError) {
      setError(messageOf(archiveError));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <Loading label="جارٍ تحميل البرامج…" />;

  const visiblePrograms = programs.filter((item) =>
    scope === "ACTIVE" ? !item.archived_at : Boolean(item.archived_at),
  );

  return (
    <div
      className="admin-section"
      role="tabpanel"
      id="admin-panel-programs"
      aria-labelledby="admin-tab-programs"
    >
      <div className="section-toolbar">
        <div>
          <h2>البرامج التدريبية</h2>
          <p className="muted">إدارة الإصدارات والمحتوى والفحص والنشر دون تعديل النسخ المنشورة.</p>
        </div>
        <div className="toolbar-actions">
          <div className="segmented-control" aria-label="حالة البرامج">
            <button
              className={scope === "ACTIVE" ? "active" : ""}
              type="button"
              onClick={() => setScope("ACTIVE")}
            >
              الحالية
            </button>
            <button
              className={scope === "ARCHIVED" ? "active" : ""}
              type="button"
              onClick={() => setScope("ARCHIVED")}
            >
              المؤرشفة
            </button>
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={() => setShowCreate((value) => !value)}
          >
            <Plus /> برنامج جديد
          </button>
        </div>
      </div>

      {showCreate ? (
        <ProgramForm
          key="new-program"
          subjects={subjects}
          busy={busyId === "create"}
          submitLabel="حفظ المسودة"
          onSubmit={create}
          onCancel={() => setShowCreate(false)}
        />
      ) : null}
      {editingMetadata ? (
        <ProgramForm
          key={editingMetadata.program_version_id}
          subjects={subjects}
          initial={editingMetadata}
          busy={busyId === editingMetadata.program_version_id}
          submitLabel="حفظ التعديلات"
          onSubmit={update}
          onCancel={() => setEditingMetadata(null)}
        />
      ) : null}

      {error ? <div className="notice error-notice">{error}</div> : null}
      <div className="program-admin-grid">
        {visiblePrograms.length === 0 ? (
          <div className="compact-empty full-span">
            {scope === "ACTIVE" ? "لا توجد برامج حالية." : "لا توجد برامج مؤرشفة."}
          </div>
        ) : null}
        {visiblePrograms.map((program) => {
          const programChecks = checks[program.program_version_id] ?? [];
          const ready = programChecks.length > 0 && programChecks.every((item) => item.passed);
          return (
            <article className="program-admin-card" key={program.program_version_id}>
              <div className="program-admin-header">
                <div>
                  <span className="version-label">الإصدار {program.version_number}</span>
                  <h3>{program.title}</h3>
                </div>
                <ProgramStatus program={program} />
              </div>
              <p>{program.summary}</p>
              <div className="program-admin-meta">
                <span>
                  <UsersRound />{" "}
                  {program.audience_type === "ALL_TEACHERS"
                    ? "جميع المعلمين"
                    : program.subject_names}
                </span>
                <span>
                  <BookOpen /> {program.lesson_count} درس
                </span>
                <span>
                  <ClipboardCheck /> {program.question_count} سؤال
                </span>
                <span>{program.estimated_minutes} دقيقة</span>
              </div>

              {programChecks.length > 0 ? (
                <div className={ready ? "validation-panel ready" : "validation-panel blocked"}>
                  {programChecks.map((item) => (
                    <div key={item.check_key}>
                      {item.passed ? <CheckCircle2 /> : <XCircle />}
                      <span>
                        <strong>{item.label}</strong>
                        <small>{item.details}</small>
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="card-actions">
                {program.status === "DRAFT" ? (
                  <>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => setEditingMetadata(program)}
                    >
                      <Pencil /> البيانات
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => setEditingContent({ program, readOnly: false })}
                    >
                      <FilePenLine /> المحتوى
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={busyId === program.program_version_id}
                      onClick={() => validate(program)}
                    >
                      {busyId === program.program_version_id ? (
                        <LoaderCircle className="spin" />
                      ) : (
                        <ClipboardCheck />
                      )}{" "}
                      فحص الجاهزية
                    </button>
                    <button
                      className="primary-button"
                      type="button"
                      disabled={!ready || busyId === program.program_version_id}
                      onClick={() => publish(program)}
                    >
                      <CheckCircle2 /> نشر الإصدار
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => setEditingContent({ program, readOnly: true })}
                    >
                      <Eye /> معاينة المحتوى
                    </button>
                    {program.is_current_published && !program.archived_at ? (
                      <button
                        className="primary-button"
                        type="button"
                        disabled={busyId === program.program_version_id}
                        onClick={() => createVersion(program)}
                      >
                        {busyId === program.program_version_id ? (
                          <LoaderCircle className="spin" />
                        ) : (
                          <RefreshCcw />
                        )}{" "}
                        إصدار جديد
                      </button>
                    ) : null}
                    {program.is_current_published ? (
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={busyId === program.program_id}
                        onClick={() => setArchived(program, !program.archived_at)}
                      >
                        {program.archived_at ? <RotateCcw /> : <Archive />}
                        {program.archived_at ? "استعادة" : "أرشفة"}
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {editingContent ? (
        <LessonsEditor
          program={editingContent.program}
          readOnly={editingContent.readOnly}
          onClose={() => setEditingContent(null)}
          onChanged={async () => {
            setChecks((current) => ({
              ...current,
              [editingContent.program.program_version_id]: [],
            }));
            const items = await reload();
            const updated = items.find(
              (item) => item.program_version_id === editingContent.program.program_version_id,
            );
            if (updated) {
              setEditingContent((current) => (current ? { ...current, program: updated } : null));
            }
          }}
        />
      ) : null}
    </div>
  );
}

function ProgramStatus({ program }: { program: AdminProgram }) {
  if (program.archived_at) return <span className="status stopped">مؤرشف</span>;
  if (program.status === "DRAFT") return <span className="status draft">مسودة</span>;
  if (program.is_current_published) return <span className="status live">منشور حالي</span>;
  return <span className="status neutral">إصدار سابق</span>;
}

function LessonsEditor({
  program,
  readOnly,
  onClose,
  onChanged,
}: {
  program: AdminProgram;
  readOnly: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [lessons, setLessons] = useState<AdminLesson[]>([]);
  const [editingLesson, setEditingLesson] = useState<AdminLesson | null>(null);
  const [title, setTitle] = useState("");
  const [lessonType, setLessonType] = useState<"TEXT" | "VIDEO" | "LINK">("TEXT");
  const [content, setContent] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");
  const [minutes, setMinutes] = useState(10);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLessons(await adminListLessons(program.program_version_id));
  }

  useEffect(() => {
    let active = true;
    adminListLessons(program.program_version_id)
      .then((items) => active && setLessons(items))
      .catch((loadError) => active && setError(messageOf(loadError)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [program.program_version_id]);

  function resetForm() {
    setEditingLesson(null);
    setTitle("");
    setLessonType("TEXT");
    setContent("");
    setResourceUrl("");
    setMinutes(10);
  }

  function edit(lesson: AdminLesson) {
    setEditingLesson(lesson);
    setTitle(lesson.title);
    setLessonType(lesson.lesson_type);
    setContent(lesson.content);
    setResourceUrl(lesson.resource_url ?? "");
    setMinutes(lesson.duration_minutes);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const input = {
        title: title.trim(),
        lessonType,
        content: content.trim(),
        resourceUrl: lessonType === "TEXT" ? null : resourceUrl.trim(),
        durationMinutes: minutes,
      };
      if (editingLesson) {
        await adminUpdateLesson({ lessonId: editingLesson.lesson_id, ...input });
      } else {
        await adminAddLesson({ programVersionId: program.program_version_id, ...input });
      }
      await reload();
      await onChanged();
      resetForm();
    } catch (saveError) {
      setError(messageOf(saveError));
    } finally {
      setBusy(false);
    }
  }

  async function remove(lesson: AdminLesson) {
    if (!window.confirm(`حذف درس «${lesson.title}»؟`)) return;
    setBusy(true);
    setError(null);
    try {
      await adminDeleteLesson(lesson.lesson_id);
      await reload();
      await onChanged();
      if (editingLesson?.lesson_id === lesson.lesson_id) resetForm();
    } catch (deleteError) {
      setError(messageOf(deleteError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="dialog-card large-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={readOnly ? "معاينة محتوى البرنامج" : "تحرير محتوى البرنامج"}
      >
        <div className="section-toolbar dialog-toolbar">
          <div>
            <p className="eyebrow">{readOnly ? "معاينة الإصدار المنشور" : "تحرير المسودة"}</p>
            <h2>{program.title}</h2>
            <p className="muted">
              الإصدار {program.version_number} · {program.lesson_count} درس ·{" "}
              {program.question_count} سؤال
            </p>
          </div>
          <button className="secondary-button" type="button" onClick={onClose}>
            إغلاق
          </button>
        </div>
        {loading ? <Loading label="جارٍ تحميل الدروس…" /> : null}
        <div className="data-list compact-list">
          {!loading && lessons.length === 0 ? (
            <div className="compact-empty">لا توجد دروس بعد.</div>
          ) : null}
          {lessons.map((lesson, index) => (
            <article className="data-row lesson-admin-row" key={lesson.lesson_id}>
              <span className="lesson-number">{index + 1}</span>
              <div className="data-main">
                <strong>{lesson.title}</strong>
                <small>
                  {lesson.lesson_type === "TEXT"
                    ? "نص"
                    : lesson.lesson_type === "VIDEO"
                      ? "فيديو"
                      : "رابط"}{" "}
                  · {lesson.duration_minutes} دقيقة
                </small>
                {readOnly && lesson.lesson_type === "TEXT" ? (
                  <p className="lesson-preview">{lesson.content}</p>
                ) : null}
                {readOnly && lesson.resource_url ? (
                  <a
                    className="resource-link"
                    href={lesson.resource_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    فتح المورد
                  </a>
                ) : null}
              </div>
              {!readOnly ? (
                <div className="row-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={busy}
                    onClick={() => edit(lesson)}
                  >
                    <Pencil /> تعديل
                  </button>
                  <button
                    className="danger-button"
                    type="button"
                    disabled={busy}
                    onClick={() => remove(lesson)}
                  >
                    <Trash2 /> حذف
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>

        {!readOnly ? (
          <form className="admin-form nested-form" onSubmit={save}>
            <div className="section-toolbar compact-toolbar">
              <h3>{editingLesson ? "تعديل الدرس" : "إضافة درس"}</h3>
              {editingLesson ? (
                <button
                  className="text-button inline-text-button"
                  type="button"
                  onClick={resetForm}
                >
                  إلغاء التعديل
                </button>
              ) : null}
            </div>
            <div className="form-grid">
              <label>
                عنوان الدرس
                <input value={title} onChange={(event) => setTitle(event.target.value)} required />
              </label>
              <label>
                النوع
                <select
                  value={lessonType}
                  onChange={(event) => setLessonType(event.target.value as typeof lessonType)}
                >
                  <option value="TEXT">نص</option>
                  <option value="VIDEO">فيديو</option>
                  <option value="LINK">رابط</option>
                </select>
              </label>
              <label>
                المدة بالدقائق
                <input
                  type="number"
                  min={1}
                  value={minutes}
                  onChange={(event) => setMinutes(Number(event.target.value))}
                  required
                />
              </label>
              {lessonType !== "TEXT" ? (
                <label>
                  رابط HTTPS
                  <input
                    type="url"
                    pattern="https://.*"
                    value={resourceUrl}
                    onChange={(event) => setResourceUrl(event.target.value)}
                    required
                  />
                </label>
              ) : null}
              <label className="full-field">
                {lessonType === "TEXT" ? "محتوى الدرس" : "وصف اختياري"}
                <textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  required={lessonType === "TEXT"}
                />
              </label>
            </div>
            {error ? <div className="notice error-notice">{error}</div> : null}
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" />
              ) : editingLesson ? (
                <CheckCircle2 />
              ) : (
                <Plus />
              )}
              {editingLesson ? "حفظ التعديل" : "إضافة الدرس"}
            </button>
          </form>
        ) : error ? (
          <div className="notice error-notice">{error}</div>
        ) : null}
        <AssessmentEditor programVersionId={program.program_version_id} readOnly={readOnly} />
      </section>
    </div>
  );
}

function TeachersAdmin() {
  const [teachers, setTeachers] = useState<AdminTeacher[]>([]);
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("ALL");
  const [governorate, setGovernorate] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setTeachers(await adminListTeachers());
  }

  useEffect(() => {
    let active = true;
    adminListTeachers()
      .then((items) => active && setTeachers(items))
      .catch((loadError) => active && setError(messageOf(loadError)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const subjects = useMemo(
    () => [...new Set(teachers.map((item) => item.subject_name))].sort(),
    [teachers],
  );
  const governorates = useMemo(
    () => [...new Set(teachers.map((item) => item.governorate_name))].sort(),
    [teachers],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return teachers.filter(
      (teacher) =>
        [
          teacher.full_name,
          teacher.subject_name,
          teacher.governorate_name,
          teacher.school_name,
          teacher.phone,
        ]
          .join(" ")
          .toLowerCase()
          .includes(needle) &&
        (subject === "ALL" || teacher.subject_name === subject) &&
        (governorate === "ALL" || teacher.governorate_name === governorate) &&
        (status === "ALL" || teacher.status === status),
    );
  }, [teachers, query, subject, governorate, status]);

  async function toggleStatus(teacher: AdminTeacher) {
    const next = teacher.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    const action = next === "SUSPENDED" ? "إيقاف" : "إعادة تفعيل";
    if (!window.confirm(`${action} حساب ${teacher.full_name}؟`)) return;
    setBusyId(teacher.user_id);
    setError(null);
    try {
      await adminSetTeacherStatus(teacher.user_id, next);
      await reload();
    } catch (statusError) {
      setError(messageOf(statusError));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <Loading label="جارٍ تحميل المعلمين…" />;

  return (
    <div
      className="admin-section"
      role="tabpanel"
      id="admin-panel-teachers"
      aria-labelledby="admin-tab-teachers"
    >
      <div className="section-toolbar">
        <div>
          <h2>المعلمون</h2>
          <p className="muted">متابعة ملفات المعلمين وحالتهم المهنية.</p>
        </div>
        <button
          className="secondary-button"
          type="button"
          disabled={filtered.length === 0}
          onClick={() =>
            downloadCsv("academy-teachers.csv", [
              ["الاسم", "المادة", "المحافظة", "المدرسة", "الهاتف", "الحالة", "تاريخ الانضمام"],
              ...filtered.map((item) => [
                item.full_name,
                item.subject_name,
                item.governorate_name,
                item.school_name,
                item.phone,
                item.status === "ACTIVE" ? "نشط" : "موقوف",
                formatDate(item.created_at),
              ]),
            ])
          }
        >
          <Download /> تصدير النتائج
        </button>
      </div>
      <div className="admin-metrics-grid compact-metrics">
        <MetricCard
          icon={<UsersRound />}
          label="إجمالي المعلمين"
          value={teachers.length}
          hint="ملفات مهنية مسجلة"
        />
        <MetricCard
          icon={<CheckCircle2 />}
          label="الحسابات النشطة"
          value={teachers.filter((item) => item.status === "ACTIVE").length}
          hint="يمكنها الالتحاق والتعلم"
        />
        <MetricCard
          icon={<CircleAlert />}
          label="الحسابات الموقوفة"
          value={teachers.filter((item) => item.status === "SUSPENDED").length}
          hint="ممنوعة من التقدم"
        />
      </div>
      <div className="filter-grid">
        <label>
          البحث
          <input
            type="search"
            placeholder="الاسم أو المدرسة أو الهاتف…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          المادة
          <select value={subject} onChange={(event) => setSubject(event.target.value)}>
            <option value="ALL">جميع المواد</option>
            {subjects.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          المحافظة
          <select value={governorate} onChange={(event) => setGovernorate(event.target.value)}>
            <option value="ALL">جميع المحافظات</option>
            {governorates.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          الحالة
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="ALL">جميع الحالات</option>
            <option value="ACTIVE">نشط</option>
            <option value="SUSPENDED">موقوف</option>
          </select>
        </label>
      </div>
      {error ? <div className="notice error-notice">{error}</div> : null}
      <div className="data-list">
        {filtered.length === 0 ? (
          <div className="compact-empty">لا توجد نتائج مطابقة للفلاتر الحالية.</div>
        ) : null}
        {filtered.map((teacher) => (
          <article className="data-row" key={teacher.user_id}>
            <div className="data-main">
              <div className="data-title-line">
                <strong>{teacher.full_name}</strong>
                <span className={teacher.status === "ACTIVE" ? "status live" : "status stopped"}>
                  {teacher.status === "ACTIVE" ? "نشط" : "موقوف"}
                </span>
              </div>
              <p>
                {teacher.subject_name} · {teacher.school_name}
              </p>
              <small>
                {teacher.governorate_name} · <bdi>{teacher.phone}</bdi> · انضم{" "}
                {formatDate(teacher.created_at)}
              </small>
            </div>
            <button
              className={teacher.status === "ACTIVE" ? "danger-button" : "secondary-button"}
              type="button"
              disabled={busyId === teacher.user_id}
              onClick={() => toggleStatus(teacher)}
            >
              {busyId === teacher.user_id ? (
                <LoaderCircle className="spin" />
              ) : teacher.status === "ACTIVE" ? (
                <CircleAlert />
              ) : (
                <CheckCircle2 />
              )}
              {teacher.status === "ACTIVE" ? "إيقاف" : "تفعيل"}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

function ProgressAdmin() {
  const [items, setItems] = useState<AdminProgress[]>([]);
  const [query, setQuery] = useState("");
  const [program, setProgram] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [certificate, setCertificate] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setItems(await adminListProgress());
  }

  useEffect(() => {
    let active = true;
    adminListProgress()
      .then((progressItems) => active && setItems(progressItems))
      .catch((loadError) => active && setError(messageOf(loadError)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const programs = useMemo(
    () => [...new Set(items.map((item) => item.program_title))].sort(),
    [items],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter(
      (item) =>
        `${item.teacher_name} ${item.program_title} ${item.certificate_code ?? ""}`
          .toLowerCase()
          .includes(needle) &&
        (program === "ALL" || item.program_title === program) &&
        (status === "ALL" || item.enrollment_status === status) &&
        (certificate === "ALL" ||
          (certificate === "VALID" && item.certificate_valid === true) ||
          (certificate === "REVOKED" &&
            Boolean(item.certificate_id) &&
            item.certificate_valid === false) ||
          (certificate === "NONE" && !item.certificate_id)),
    );
  }, [items, query, program, status, certificate]);

  async function revoke(item: AdminProgress) {
    if (!item.certificate_id) return;
    const reason = window.prompt("سبب إلغاء الشهادة (3 أحرف على الأقل):")?.trim();
    if (!reason) return;
    setBusyId(item.certificate_id);
    setError(null);
    try {
      await adminRevokeCertificate(item.certificate_id, reason);
      await reload();
    } catch (revokeError) {
      setError(messageOf(revokeError));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <Loading label="جارٍ تحميل التقدم…" />;
  const completed = items.filter((item) => item.enrollment_status === "COMPLETED").length;
  const validCertificates = items.filter((item) => item.certificate_valid === true).length;

  return (
    <div
      className="admin-section"
      role="tabpanel"
      id="admin-panel-progress"
      aria-labelledby="admin-tab-progress"
    >
      <div className="section-toolbar">
        <div>
          <h2>التقدم والشهادات</h2>
          <p className="muted">متابعة التسجيل والإنجاز والشهادات لكل معلم.</p>
        </div>
        <button
          className="secondary-button"
          type="button"
          disabled={filtered.length === 0}
          onClick={() =>
            downloadCsv("academy-progress.csv", [
              [
                "المعلم",
                "البرنامج",
                "الحالة",
                "الدروس المكتملة",
                "إجمالي الدروس",
                "نسبة الإنجاز",
                "رمز الشهادة",
                "حالة الشهادة",
              ],
              ...filtered.map((item) => [
                item.teacher_name,
                item.program_title,
                item.enrollment_status === "COMPLETED" ? "مكتمل" : "قيد التدريب",
                item.completed_lessons,
                item.total_lessons,
                `${completionPercentage(item)}%`,
                item.certificate_code ?? "",
                item.certificate_valid === true
                  ? "سارية"
                  : item.certificate_id
                    ? "ملغاة"
                    : "لم تصدر",
              ]),
            ])
          }
        >
          <Download /> تصدير النتائج
        </button>
      </div>
      <div className="admin-metrics-grid compact-metrics">
        <MetricCard
          icon={<LayoutDashboard />}
          label="إجمالي التسجيلات"
          value={items.length}
          hint="كل البرامج والمعلمين"
        />
        <MetricCard
          icon={<CheckCircle2 />}
          label="التسجيلات المكتملة"
          value={completed}
          hint={`${items.length ? Math.round((completed / items.length) * 100) : 0}% من الإجمالي`}
        />
        <MetricCard
          icon={<GraduationCap />}
          label="الشهادات السارية"
          value={validCertificates}
          hint={`${items.filter((item) => item.certificate_id && !item.certificate_valid).length} شهادة ملغاة`}
        />
      </div>
      <div className="filter-grid">
        <label>
          البحث
          <input
            type="search"
            placeholder="المعلم أو البرنامج أو رمز الشهادة…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          البرنامج
          <select value={program} onChange={(event) => setProgram(event.target.value)}>
            <option value="ALL">جميع البرامج</option>
            {programs.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          التقدم
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="ALL">جميع الحالات</option>
            <option value="ACTIVE">قيد التدريب</option>
            <option value="COMPLETED">مكتمل</option>
          </select>
        </label>
        <label>
          الشهادة
          <select value={certificate} onChange={(event) => setCertificate(event.target.value)}>
            <option value="ALL">جميع الحالات</option>
            <option value="VALID">سارية</option>
            <option value="REVOKED">ملغاة</option>
            <option value="NONE">لم تصدر</option>
          </select>
        </label>
      </div>
      {error ? <div className="notice error-notice">{error}</div> : null}
      <div className="data-list">
        {filtered.length === 0 ? (
          <div className="compact-empty">لا توجد تسجيلات مطابقة للفلاتر الحالية.</div>
        ) : null}
        {filtered.map((item) => {
          const progress = completionPercentage(item);
          return (
            <article className="data-row" key={item.enrollment_id}>
              <div className="data-main progress-data">
                <div className="data-title-line">
                  <strong>{item.teacher_name}</strong>
                  <span
                    className={
                      item.enrollment_status === "COMPLETED" ? "status live" : "status draft"
                    }
                  >
                    {item.enrollment_status === "COMPLETED" ? "مكتمل" : "قيد التدريب"}
                  </span>
                </div>
                <p>{item.program_title}</p>
                <div className="progress-track" aria-label={`نسبة الإنجاز ${progress}%`}>
                  <span style={{ width: `${progress}%` }} />
                </div>
                <small>
                  {item.completed_lessons} من {item.total_lessons} · {progress}%
                </small>
                {item.certificate_code ? (
                  <small>
                    الشهادة: <bdi>{item.certificate_code}</bdi>
                  </small>
                ) : (
                  <small>لم تصدر شهادة بعد.</small>
                )}
              </div>
              {item.certificate_id && item.certificate_valid ? (
                <button
                  className="danger-button"
                  type="button"
                  disabled={busyId === item.certificate_id}
                  onClick={() => revoke(item)}
                >
                  {busyId === item.certificate_id ? <LoaderCircle className="spin" /> : <XCircle />}{" "}
                  إلغاء الشهادة
                </button>
              ) : item.certificate_id ? (
                <span className="status stopped">شهادة ملغاة</span>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="loading-inline">
      <LoaderCircle className="spin" /> {label}
    </div>
  );
}

export function AdminHome({ capabilities }: { capabilities: Set<AcademyCapability> }) {
  const [tab, setTab] = useState<AdminTab>("overview");
  const tabs: Array<{ id: AdminTab; label: string; icon: ReactNode; visible: boolean }> = [
    { id: "overview", label: "نظرة عامة", icon: <LayoutDashboard />, visible: true },
    {
      id: "programs",
      label: "البرامج",
      icon: <BookOpen />,
      visible: capabilities.has("ACADEMY_CATALOG_MANAGE"),
    },
    {
      id: "teachers",
      label: "المعلمون",
      icon: <UserRound />,
      visible: capabilities.has("ACADEMY_TEACHERS_VIEW"),
    },
    {
      id: "progress",
      label: "التقدم والشهادات",
      icon: <BarChart3 />,
      visible: capabilities.has("ACADEMY_PROGRESS_VIEW"),
    },
  ];

  return (
    <section>
      <div className="page-heading admin-heading">
        <div>
          <p className="eyebrow">إدارة الأكاديمية</p>
          <h1>لوحة التشغيل</h1>
          <p className="muted">
            إدارة البرامج والمعلمين والتقدم والشهادات من مساحة مستقلة ومحكومة بالصلاحيات.
          </p>
        </div>
        <span className="security-chip">
          <CheckCircle2 /> مساحة مستقلة
        </span>
      </div>
      <div className="admin-tabs" role="tablist" aria-label="أقسام إدارة الأكاديمية">
        {tabs
          .filter((item) => item.visible)
          .map((item) => (
            <button
              id={`admin-tab-${item.id}`}
              role="tab"
              aria-selected={tab === item.id}
              aria-controls={`admin-panel-${item.id}`}
              tabIndex={tab === item.id ? 0 : -1}
              className={tab === item.id ? "active" : ""}
              type="button"
              key={item.id}
              onClick={() => setTab(item.id)}
            >
              {item.icon} {item.label}
            </button>
          ))}
      </div>
      {tab === "overview" ? <AdminOverview capabilities={capabilities} /> : null}
      {tab === "programs" && capabilities.has("ACADEMY_CATALOG_MANAGE") ? <ProgramsAdmin /> : null}
      {tab === "teachers" && capabilities.has("ACADEMY_TEACHERS_VIEW") ? <TeachersAdmin /> : null}
      {tab === "progress" && capabilities.has("ACADEMY_PROGRESS_VIEW") ? <ProgressAdmin /> : null}
    </section>
  );
}
