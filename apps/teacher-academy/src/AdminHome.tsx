import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Download,
  Eye,
  ExternalLink,
  FilePenLine,
  FileUp,
  GraduationCap,
  LayoutDashboard,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCcw,
  RotateCcw,
  Search,
  Trash2,
  UserRound,
  UsersRound,
  Video,
  XCircle,
} from "lucide-react";
import { AssessmentEditor } from "./AssessmentEditor";
import {
  adminCreateDraftVersion,
  adminCreateProgram,
  adminDeleteDraftVersion,
  adminDeleteLiveSession,
  adminDeleteLesson,
  adminImportProgramBundle,
  adminListLiveSessions,
  adminListLessons,
  adminListProgress,
  adminListPrograms,
  adminListTeachers,
  adminPublishProgram,
  adminReorderLessons,
  adminRevokeCertificate,
  adminSaveLiveSession,
  adminSaveStructuredLesson,
  adminSetProgramArchived,
  adminSetTeacherStatus,
  adminUpdateDraftProgram,
  adminValidateProgram,
  loadProfileOptions,
  type ProgramDraftInput,
} from "./lib/academy-api";
import { validateProgramImportBundle, type ProgramImportBundle } from "./lib/program-bundle";
import type {
  AcademyCapability,
  AcademySubject,
  AdminLesson,
  AdminProgram,
  AdminProgramCheck,
  AdminProgress,
  AdminTeacher,
  LessonSectionType,
  LiveSession,
} from "./types";

type AdminTab = "overview" | "programs" | "teachers" | "progress";

const ERROR_MESSAGES: Record<string, string> = {
  PROGRAM_LESSON_REQUIRED: "أضف درسًا واحدًا على الأقل قبل النشر.",
  PROGRAM_ASSESSMENT_QUESTION_REQUIRED: "أضف سؤالًا واحدًا على الأقل إلى التقييم قبل النشر.",
  PROGRAM_DETAILS_REQUIRED: "أكمل الوصف التفصيلي والأهداف والتعليمات قبل النشر.",
  STRUCTURED_LESSON_SECTIONS_REQUIRED: "يجب أن يتضمن كل درس هدفًا وشرحًا وخلاصة.",
  EXACTLY_ONE_SUBJECT_REQUIRED: "اختر مادة واحدة فقط للبرنامج التخصصي.",
  INVALID_LIVE_SESSION_INPUT: "راجع بيانات المحاضرة وموعدها ورابط HTTPS.",
  DRAFT_PROGRAM_VERSION_NOT_FOUND: "لم تعد هذه المسودة متاحة للتعديل.",
  PUBLISHED_ACADEMY_CONTENT_IS_IMMUTABLE: "المحتوى المنشور محمي. أنشئ إصدارًا جديدًا لتعديله.",
  ACADEMY_CATALOG_MANAGE_REQUIRED: "لا تملك صلاحية إدارة البرامج.",
  ACADEMY_TEACHERS_VIEW_REQUIRED: "لا تملك صلاحية إدارة المعلمين.",
  ACADEMY_PROGRESS_VIEW_REQUIRED: "لا تملك صلاحية إدارة التقدم.",
  ACADEMY_IMPORT_PROGRAM_ALREADY_EXISTS: "يوجد برنامج حالي أو مسودة بالاسم نفسه.",
  INVALID_PROGRAM_BUNDLE: "ملف البرنامج غير صالح أو ناقص.",
  INVALID_PROGRAM_BUNDLE_LESSON: "أحد الدروس في ملف البرنامج غير صالح.",
  INVALID_PROGRAM_BUNDLE_QUESTION: "أحد أسئلة التقييم في ملف البرنامج غير صالح.",
  ACADEMY_IMPORT_SERVER_VALIDATION_FAILED: "فشل فحص المسودة المستوردة ولم تُحفظ.",
  LESSON_ORDER_MUST_BE_EXACT: "تعذر حفظ ترتيب الدروس؛ أعد تحميل المحتوى وحاول مرة أخرى.",
  DRAFT_PROGRAM_HAS_LEARNING_RECORDS: "لا يمكن حذف مسودة مرتبطة ببيانات تعلم.",
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

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
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
  const [detailedDescription, setDetailedDescription] = useState(
    initial?.detailed_description ?? "",
  );
  const [objectives, setObjectives] = useState((initial?.objectives ?? []).join("\n"));
  const [prerequisites, setPrerequisites] = useState((initial?.prerequisites ?? []).join("\n"));
  const [instructions, setInstructions] = useState((initial?.instructions ?? []).join("\n"));
  const [audience, setAudience] = useState<"ALL_TEACHERS" | "SUBJECT_SPECIFIC">(
    initial?.audience_type ?? "ALL_TEACHERS",
  );
  const [subjectId, setSubjectId] = useState<string>(initial?.subject_ids[0] ?? "");
  const [minutes, setMinutes] = useState(initial?.estimated_minutes ?? 60);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const basicsComplete =
    title.trim().length >= 3 && summary.trim().length >= 10 && minutes >= 1 && minutes <= 100_000;
  const detailsComplete =
    detailedDescription.trim().length >= 50 &&
    splitLines(objectives).length > 0 &&
    splitLines(instructions).length > 0;
  const audienceComplete = audience === "ALL_TEACHERS" || Boolean(subjectId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({
      title: title.trim(),
      summary: summary.trim(),
      detailedDescription: detailedDescription.trim(),
      objectives: splitLines(objectives),
      prerequisites: splitLines(prerequisites),
      instructions: splitLines(instructions),
      audienceType: audience,
      estimatedMinutes: minutes,
      subjectId: audience === "SUBJECT_SPECIFIC" ? subjectId : null,
    });
  }

  return (
    <form className="admin-form program-wizard" onSubmit={submit}>
      <div className="section-toolbar compact-toolbar">
        <div>
          <h2>{initial ? "تعديل بيانات المسودة" : "إضافة برنامج تدريبي"}</h2>
          <p className="muted">ثلاث خطوات واضحة، ثم ينتقل البرنامج إلى مساحة بناء المحتوى.</p>
        </div>
        {onCancel ? (
          <button className="text-button inline-text-button" type="button" onClick={onCancel}>
            إلغاء
          </button>
        ) : null}
      </div>
      <div className="wizard-steps" aria-label="خطوات إنشاء البرنامج">
        {[
          [1, "البيانات الأساسية"],
          [2, "التفاصيل والأهداف"],
          [3, "الجمهور والمراجعة"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={step === value ? "active" : ""}
            onClick={() => setStep(value as 1 | 2 | 3)}
            aria-current={step === value ? "step" : undefined}
          >
            <span>{value}</span> {label}
          </button>
        ))}
      </div>
      {step === 1 ? (
        <div className="form-grid" data-program-step="basics">
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
        </div>
      ) : null}
      {step === 2 ? (
        <div className="form-grid" data-program-step="details">
          <label className="full-field">
            الوصف التفصيلي الذي سيظهر للمعلم
            <textarea
              value={detailedDescription}
              onChange={(event) => setDetailedDescription(event.target.value)}
              minLength={50}
              maxLength={5000}
              required
            />
          </label>
          <label className="full-field">
            أهداف البرنامج (هدف واحد في كل سطر)
            <textarea
              value={objectives}
              onChange={(event) => setObjectives(event.target.value)}
              placeholder="بنهاية البرنامج سيكون المعلم قادرًا على…"
              required
            />
          </label>
          <label className="full-field">
            المتطلبات السابقة (متطلب واحد في كل سطر، اختيارية)
            <textarea
              value={prerequisites}
              onChange={(event) => setPrerequisites(event.target.value)}
            />
          </label>
          <label className="full-field">
            تعليمات البرنامج (تعليمة واحدة في كل سطر)
            <textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              required
            />
          </label>
        </div>
      ) : null}
      {step === 3 ? (
        <div className="form-grid" data-program-step="audience">
          <label>
            جمهور البرنامج
            <select
              value={audience}
              onChange={(event) => {
                const value = event.target.value as typeof audience;
                setAudience(value);
                if (value === "ALL_TEACHERS") setSubjectId("");
              }}
            >
              <option value="ALL_TEACHERS">جميع المعلمين</option>
              <option value="SUBJECT_SPECIFIC">مادة واحدة</option>
            </select>
          </label>
          {audience === "SUBJECT_SPECIFIC" ? (
            <label>
              المادة المستهدفة
              <select
                value={subjectId}
                onChange={(event) => setSubjectId(event.target.value)}
                required
              >
                <option value="">اختر مادة واحدة</option>
                {subjects.map((subject) => (
                  <option value={subject.id} key={subject.id}>
                    {subject.name_ar}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="wizard-review full-field">
            <strong>{title || "اسم البرنامج غير مكتمل"}</strong>
            <span>
              {audience === "ALL_TEACHERS" ? "برنامج عام لجميع المعلمين" : "برنامج لمادة واحدة"}
            </span>
            <span>
              {minutes} دقيقة · {splitLines(objectives).length} أهداف ·{" "}
              {splitLines(instructions).length} تعليمات
            </span>
          </div>
        </div>
      ) : null}
      <div className="wizard-actions">
        {step > 1 ? (
          <button
            className="secondary-button"
            type="button"
            onClick={() => setStep((step - 1) as 1 | 2)}
          >
            السابق
          </button>
        ) : (
          <span />
        )}
        {step < 3 ? (
          <button
            className="primary-button"
            type="button"
            disabled={step === 1 ? !basicsComplete : !detailsComplete}
            onClick={() => setStep((step + 1) as 2 | 3)}
          >
            التالي
          </button>
        ) : (
          <button
            className="primary-button"
            type="submit"
            disabled={busy || !basicsComplete || !detailsComplete || !audienceComplete}
          >
            {busy ? <LoaderCircle className="spin" /> : <CheckCircle2 />} {submitLabel}
          </button>
        )}
      </div>
    </form>
  );
}

function programReadiness(program: AdminProgram) {
  const items = [
    {
      label: "التفاصيل والأهداف",
      passed:
        program.detailed_description?.trim().length >= 50 &&
        program.objectives.length > 0 &&
        program.instructions.length > 0,
    },
    {
      label: "الجمهور",
      passed:
        program.audience_type === "ALL_TEACHERS" ||
        (program.audience_type === "SUBJECT_SPECIFIC" && program.subject_ids.length === 1),
    },
    { label: "الدروس", passed: program.lesson_count > 0 },
    {
      label: "هيكلة الدروس",
      passed: program.lesson_count > 0 && program.structured_lesson_count === program.lesson_count,
    },
    { label: "التقييم", passed: program.question_count > 0 },
  ];
  return {
    items,
    percentage: Math.round((items.filter((item) => item.passed).length / items.length) * 100),
  };
}

function ProgramImportPanel({
  subjects,
  busy,
  onImport,
  onCancel,
}: {
  subjects: AcademySubject[];
  busy: boolean;
  onImport: (bundle: ProgramImportBundle) => Promise<void>;
  onCancel: () => void;
}) {
  const [bundle, setBundle] = useState<ProgramImportBundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setBundle(null);
    setError(null);
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("حجم ملف JSON يجب ألا يتجاوز 2 ميجابايت.");
      return;
    }
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      setBundle(
        validateProgramImportBundle(parsed, new Set(subjects.map((subject) => subject.code))),
      );
    } catch (parseError) {
      setError(messageOf(parseError));
    }
  }

  return (
    <section className="admin-form import-panel" aria-labelledby="program-import-title">
      <div className="section-toolbar compact-toolbar">
        <div>
          <h2 id="program-import-title">استيراد برنامج من JSON</h2>
          <p className="muted">
            يُفحص الملف قبل الإرسال، ثم تُنشأ مسودة واحدة ذريًا. الاستيراد لا ينشر البرنامج.
          </p>
        </div>
        <button className="text-button inline-text-button" type="button" onClick={onCancel}>
          إلغاء
        </button>
      </div>
      <label className="file-drop-field">
        <FileUp />
        <span>اختر ملف البرنامج بصيغة JSON</span>
        <input type="file" accept="application/json,.json" onChange={selectFile} />
      </label>
      {error ? <div className="notice error-notice">{error}</div> : null}
      {bundle ? (
        <div className="import-preview">
          <div>
            <span className="eyebrow">معاينة قبل الإنشاء</span>
            <strong>{bundle.metadata.title}</strong>
            <small>
              {bundle.metadata.audienceType === "ALL_TEACHERS"
                ? "جميع المعلمين"
                : `مادة ${bundle.metadata.subjectCode}`}
            </small>
          </div>
          <div className="program-admin-meta">
            <span>{bundle.lessons.length} دروس</span>
            <span>{bundle.assessment.questions.length} أسئلة</span>
            <span>{bundle.metadata.estimatedMinutes} دقيقة</span>
          </div>
          {bundle.liveSessionPlan !== undefined ? (
            <p className="muted">
              خطة المحاضرة المرفقة إرشادية فقط؛ يُضاف الرابط الحقيقي لاحقًا من مساحة المحتوى.
            </p>
          ) : null}
          <button
            className="primary-button"
            type="button"
            disabled={busy}
            onClick={() => onImport(bundle)}
          >
            {busy ? <LoaderCircle className="spin" /> : <FileUp />} إنشاء المسودة
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ProgramsAdmin() {
  const [programs, setPrograms] = useState<AdminProgram[]>([]);
  const [subjects, setSubjects] = useState<AcademySubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingMetadata, setEditingMetadata] = useState<AdminProgram | null>(null);
  const [editingContent, setEditingContent] = useState<{
    program: AdminProgram;
    readOnly: boolean;
  } | null>(null);
  const [checks, setChecks] = useState<Record<string, AdminProgramCheck[]>>({});
  const [scope, setScope] = useState<"ACTIVE" | "ARCHIVED">("ACTIVE");
  const [query, setQuery] = useState("");
  const [audienceFilter, setAudienceFilter] = useState<"ALL" | "ALL_TEACHERS" | "SUBJECT_SPECIFIC">(
    "ALL",
  );
  const [subjectFilter, setSubjectFilter] = useState("ALL");

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

  async function importProgram(bundle: ProgramImportBundle) {
    setBusyId("import");
    setError(null);
    try {
      const draftId = await adminImportProgramBundle(bundle);
      const items = await reload();
      const draft = items.find((item) => item.program_version_id === draftId);
      setShowImport(false);
      if (draft) setEditingContent({ program: draft, readOnly: false });
    } catch (importError) {
      setError(messageOf(importError));
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

  async function deleteDraft(program: AdminProgram) {
    if (
      !window.confirm(
        `حذف المسودة «${program.title}» نهائيًا؟ سيُحذف محتواها فقط إذا لم ترتبط بأي بيانات تعلم.`,
      )
    ) {
      return;
    }
    setBusyId(program.program_version_id);
    setError(null);
    try {
      await adminDeleteDraftVersion(program.program_version_id);
      await reload();
      setChecks((current) => {
        const next = { ...current };
        delete next[program.program_version_id];
        return next;
      });
    } catch (deleteError) {
      setError(messageOf(deleteError));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <Loading label="جارٍ تحميل البرامج…" />;

  const normalizedQuery = query.trim().toLocaleLowerCase("ar");
  const visiblePrograms = programs.filter((item) => {
    const inScope = scope === "ACTIVE" ? !item.archived_at : Boolean(item.archived_at);
    const matchesAudience = audienceFilter === "ALL" || item.audience_type === audienceFilter;
    const matchesSubject = subjectFilter === "ALL" || item.subject_ids.includes(subjectFilter);
    const matchesQuery =
      !normalizedQuery ||
      [item.title, item.summary, item.subject_names ?? ""].some((value) =>
        value.toLocaleLowerCase("ar").includes(normalizedQuery),
      );
    return inScope && matchesAudience && matchesSubject && matchesQuery;
  });

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
            className="secondary-button"
            type="button"
            onClick={() => {
              setShowImport((value) => !value);
              setShowCreate(false);
            }}
          >
            <FileUp /> استيراد JSON
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setShowCreate((value) => !value);
              setShowImport(false);
            }}
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
      {showImport ? (
        <ProgramImportPanel
          subjects={subjects}
          busy={busyId === "import"}
          onImport={importProgram}
          onCancel={() => setShowImport(false)}
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
      <div className="filter-grid program-filter-grid" aria-label="البحث وتصفية البرامج">
        <label>
          البحث
          <span className="search-input-wrap">
            <Search />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="اسم البرنامج أو الوصف أو المادة"
            />
          </span>
        </label>
        <label>
          الجمهور
          <select
            value={audienceFilter}
            onChange={(event) => setAudienceFilter(event.target.value as typeof audienceFilter)}
          >
            <option value="ALL">الكل</option>
            <option value="ALL_TEACHERS">جميع المعلمين</option>
            <option value="SUBJECT_SPECIFIC">مادة واحدة</option>
          </select>
        </label>
        <label>
          المادة
          <select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}>
            <option value="ALL">كل المواد</option>
            {subjects.map((subject) => (
              <option value={subject.id} key={subject.id}>
                {subject.name_ar}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="program-admin-grid">
        {visiblePrograms.length === 0 ? (
          <div className="compact-empty full-span">لا توجد برامج تطابق البحث والفلاتر الحالية.</div>
        ) : null}
        {visiblePrograms.map((program) => {
          const programChecks = checks[program.program_version_id] ?? [];
          const ready = programChecks.length > 0 && programChecks.every((item) => item.passed);
          const readiness = programReadiness(program);
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

              <div
                className="readiness-summary"
                aria-label={`اكتمال البرنامج ${readiness.percentage}%`}
              >
                <div>
                  <strong>اكتمال الإعداد</strong>
                  <span>{readiness.percentage}%</span>
                </div>
                <progress max={100} value={readiness.percentage}>
                  {readiness.percentage}%
                </progress>
                <small>
                  {program.structured_lesson_count}/{program.lesson_count} دروس مهيكلة ·{" "}
                  {program.lesson_minutes || "—"} دقيقة فعلية · نسبة الاجتياز{" "}
                  {program.assessment_pass_percentage ?? "—"}%
                </small>
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
                    <button
                      className="danger-button"
                      type="button"
                      disabled={busyId === program.program_version_id}
                      onClick={() => deleteDraft(program)}
                    >
                      <Trash2 /> حذف المسودة
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
  const [resourceUrl, setResourceUrl] = useState("");
  const [minutes, setMinutes] = useState(10);
  const [newSectionType, setNewSectionType] = useState<LessonSectionType>("EXAMPLE");
  const [sections, setSections] = useState(() => defaultLessonSections());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contentStep, setContentStep] = useState<"LESSONS" | "ASSESSMENT" | "LIVE" | "READINESS">(
    "LESSONS",
  );

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
    setResourceUrl("");
    setMinutes(10);
    setSections(defaultLessonSections());
  }

  function edit(lesson: AdminLesson) {
    setEditingLesson(lesson);
    setTitle(lesson.title);
    setLessonType(lesson.lesson_type);
    setResourceUrl(lesson.resource_url ?? "");
    setMinutes(lesson.duration_minutes);
    setSections(
      lesson.sections.map((section) => ({
        key: section.section_id,
        section_type: section.section_type,
        title: section.title ?? "",
        content: section.content,
        resource_url: section.resource_url ?? "",
      })),
    );
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminSaveStructuredLesson({
        lessonId: editingLesson?.lesson_id ?? null,
        programVersionId: program.program_version_id,
        title: title.trim(),
        lessonType,
        resourceUrl: lessonType === "TEXT" ? null : resourceUrl.trim() || null,
        durationMinutes: minutes,
        sections: sections.map((section) => ({
          section_type: section.section_type,
          title: section.title.trim() || null,
          content: section.content.trim(),
          resource_url: section.resource_url.trim() || null,
        })),
      });
      await reload();
      await onChanged();
      resetForm();
    } catch (saveError) {
      setError(messageOf(saveError));
    } finally {
      setBusy(false);
    }
  }

  function updateSection(key: string, field: "title" | "content" | "resource_url", value: string) {
    setSections((current) =>
      current.map((section) => (section.key === key ? { ...section, [field]: value } : section)),
    );
  }

  function addSection() {
    setSections((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        section_type: newSectionType,
        title: SECTION_LABELS[newSectionType],
        content: "",
        resource_url: "",
      },
    ]);
  }

  function removeSection(key: string) {
    setSections((current) => current.filter((section) => section.key !== key));
  }

  function moveSection(index: number, direction: -1 | 1) {
    setSections((current) => {
      const destination = index + direction;
      if (destination < 0 || destination >= current.length) return current;
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
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

  async function moveLesson(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= lessons.length) return;
    const reordered = [...lessons];
    [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
    setBusy(true);
    setError(null);
    try {
      await adminReorderLessons(
        program.program_version_id,
        reordered.map((lesson) => lesson.lesson_id),
      );
      setLessons(
        reordered.map((lesson, displayOrder) => ({ ...lesson, display_order: displayOrder })),
      );
      await onChanged();
    } catch (moveError) {
      setError(messageOf(moveError));
      await reload();
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
        <nav className="content-workspace-steps" aria-label="مراحل إعداد محتوى البرنامج">
          {[
            ["LESSONS", "1. الدروس"],
            ["ASSESSMENT", "2. التقييم"],
            ["LIVE", "3. المحاضرة"],
            ["READINESS", "4. الجاهزية"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={contentStep === value ? "active" : ""}
              onClick={() => setContentStep(value as typeof contentStep)}
              aria-current={contentStep === value ? "step" : undefined}
            >
              {label}
            </button>
          ))}
        </nav>
        {contentStep === "LESSONS" ? (
          <>
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
                    {readOnly ? (
                      <div className="lesson-section-preview-list">
                        {lesson.sections.map((section) => (
                          <div
                            className={`lesson-section-preview ${section.section_type.toLowerCase()}`}
                            key={section.section_id}
                          >
                            <strong>{section.title ?? SECTION_LABELS[section.section_type]}</strong>
                            <p>{section.content}</p>
                            {section.resource_url ? (
                              <a href={section.resource_url} target="_blank" rel="noreferrer">
                                <ExternalLink /> فتح المورد
                              </a>
                            ) : null}
                          </div>
                        ))}
                      </div>
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
                        className="icon-button"
                        type="button"
                        disabled={busy || index === 0}
                        onClick={() => moveLesson(index, -1)}
                        aria-label={`تحريك درس ${lesson.title} لأعلى`}
                      >
                        <ArrowUp />
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        disabled={busy || index === lessons.length - 1}
                        onClick={() => moveLesson(index, 1)}
                        aria-label={`تحريك درس ${lesson.title} لأسفل`}
                      >
                        <ArrowDown />
                      </button>
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
                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      required
                    />
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
                    أقسام الدرس
                    <span className="field-hint">يجب أن يتضمن هدفًا وشرحًا وخلاصة على الأقل.</span>
                  </label>
                </div>
                <div className="section-editor-list">
                  {sections.map((section, index) => {
                    const requiredType = ["OBJECTIVE", "CONTENT", "SUMMARY"].includes(
                      section.section_type,
                    );
                    const sameTypeCount = sections.filter(
                      (item) => item.section_type === section.section_type,
                    ).length;
                    return (
                      <article className="section-editor-card" key={section.key}>
                        <div className="section-editor-heading">
                          <span>{SECTION_LABELS[section.section_type]}</span>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="icon-button"
                              disabled={index === 0}
                              onClick={() => moveSection(index, -1)}
                              aria-label="تحريك القسم لأعلى"
                            >
                              <ArrowUp />
                            </button>
                            <button
                              type="button"
                              className="icon-button"
                              disabled={index === sections.length - 1}
                              onClick={() => moveSection(index, 1)}
                              aria-label="تحريك القسم لأسفل"
                            >
                              <ArrowDown />
                            </button>
                            <button
                              type="button"
                              className="icon-button danger-icon"
                              disabled={requiredType && sameTypeCount === 1}
                              onClick={() => removeSection(section.key)}
                              aria-label="حذف القسم"
                            >
                              <Trash2 />
                            </button>
                          </div>
                        </div>
                        <label>
                          عنوان القسم (اختياري)
                          <input
                            value={section.title}
                            onChange={(event) =>
                              updateSection(section.key, "title", event.target.value)
                            }
                          />
                        </label>
                        <label>
                          المحتوى
                          <textarea
                            value={section.content}
                            onChange={(event) =>
                              updateSection(section.key, "content", event.target.value)
                            }
                            required
                          />
                        </label>
                        {section.section_type === "RESOURCE" ? (
                          <label>
                            رابط المورد HTTPS
                            <input
                              type="url"
                              pattern="https://.*"
                              value={section.resource_url}
                              onChange={(event) =>
                                updateSection(section.key, "resource_url", event.target.value)
                              }
                              required
                            />
                          </label>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
                <div className="add-section-row">
                  <select
                    value={newSectionType}
                    onChange={(event) => setNewSectionType(event.target.value as LessonSectionType)}
                  >
                    {Object.entries(SECTION_LABELS).map(([value, label]) => (
                      <option value={value} key={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <button className="secondary-button" type="button" onClick={addSection}>
                    <Plus /> إضافة قسم
                  </button>
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
          </>
        ) : null}
        {contentStep === "ASSESSMENT" ? (
          <AssessmentEditor programVersionId={program.program_version_id} readOnly={readOnly} />
        ) : null}
        {contentStep === "LIVE" ? (
          <LiveSessionsEditor program={program} readOnly={readOnly} />
        ) : null}
        {contentStep === "READINESS" ? (
          <section className="workspace-readiness">
            <div className="section-toolbar compact-toolbar">
              <div>
                <p className="eyebrow">ملخص الإصدار</p>
                <h3>الجاهزية قبل النشر</h3>
              </div>
              <ClipboardCheck />
            </div>
            <div className="readiness-checklist">
              {programReadiness(program).items.map((item) => (
                <div className={item.passed ? "passed" : "blocked"} key={item.label}>
                  {item.passed ? <CheckCircle2 /> : <XCircle />}
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
            <p className="muted">
              المحاضرة المباشرة اختيارية. عد إلى بطاقة البرنامج ونفّذ فحص الخادم قبل النشر النهائي.
            </p>
          </section>
        ) : null}
      </section>
    </div>
  );
}

const SECTION_LABELS: Record<LessonSectionType, string> = {
  OBJECTIVE: "هدف الدرس",
  INTRODUCTION: "تمهيد",
  CONTENT: "الشرح",
  EXAMPLE: "مثال تطبيقي",
  ACTIVITY: "نشاط أو تطبيق",
  SUMMARY: "الخلاصة",
  RESOURCE: "مورد إضافي",
};

type EditableLessonSection = {
  key: string;
  section_type: LessonSectionType;
  title: string;
  content: string;
  resource_url: string;
};

function defaultLessonSections(): EditableLessonSection[] {
  return (["OBJECTIVE", "CONTENT", "EXAMPLE", "ACTIVITY", "SUMMARY"] as LessonSectionType[]).map(
    (sectionType) => ({
      key: crypto.randomUUID(),
      section_type: sectionType,
      title: SECTION_LABELS[sectionType],
      content: "",
      resource_url: "",
    }),
  );
}

function toDateTimeInput(value: string): string {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function LiveSessionsEditor({
  program,
  readOnly = false,
}: {
  program: AdminProgram;
  readOnly?: boolean;
}) {
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [editing, setEditing] = useState<LiveSession | null>(null);
  const [title, setTitle] = useState("");
  const [provider, setProvider] = useState("Zoom");
  const [speaker, setSpeaker] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [duration, setDuration] = useState(60);
  const [meetingUrl, setMeetingUrl] = useState("");
  const [instructions, setInstructions] = useState("");
  const [status, setStatus] = useState<"SCHEDULED" | "CANCELLED">("SCHEDULED");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setSessions(await adminListLiveSessions(program.program_version_id));
  }

  useEffect(() => {
    let active = true;
    adminListLiveSessions(program.program_version_id)
      .then((items) => active && setSessions(items))
      .catch((loadError) => active && setError(messageOf(loadError)));
    return () => {
      active = false;
    };
  }, [program.program_version_id]);

  function reset() {
    setEditing(null);
    setTitle("");
    setProvider("Zoom");
    setSpeaker("");
    setStartsAt("");
    setDuration(60);
    setMeetingUrl("");
    setInstructions("");
    setStatus("SCHEDULED");
  }

  function edit(session: LiveSession) {
    setEditing(session);
    setTitle(session.title);
    setProvider(session.provider_label);
    setSpeaker(session.speaker_name ?? "");
    setStartsAt(toDateTimeInput(session.starts_at));
    setDuration(session.duration_minutes);
    setMeetingUrl(session.meeting_url);
    setInstructions(session.instructions);
    setStatus(session.status);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminSaveLiveSession({
        liveSessionId: editing?.live_session_id ?? null,
        programVersionId: program.program_version_id,
        title: title.trim(),
        providerLabel: provider.trim(),
        speakerName: speaker.trim() || null,
        startsAt: new Date(startsAt).toISOString(),
        durationMinutes: duration,
        meetingUrl: meetingUrl.trim(),
        instructions: instructions.trim(),
        status,
      });
      await reload();
      reset();
    } catch (saveError) {
      setError(messageOf(saveError));
    } finally {
      setBusy(false);
    }
  }

  async function remove(session: LiveSession) {
    if (!window.confirm(`حذف المحاضرة «${session.title}»؟`)) return;
    setBusy(true);
    setError(null);
    try {
      await adminDeleteLiveSession(session.live_session_id);
      await reload();
      if (editing?.live_session_id === session.live_session_id) reset();
    } catch (deleteError) {
      setError(messageOf(deleteError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="live-session-admin">
      <div className="section-toolbar compact-toolbar">
        <div>
          <p className="eyebrow">لقاء مباشر اختياري</p>
          <h3>المحاضرات المباشرة</h3>
          <p className="muted">أضف رابط Zoom أو Google Meet أو أي خدمة HTTPS متاحة وقت التنفيذ.</p>
        </div>
        <Video />
      </div>
      <div className="data-list compact-list">
        {sessions.length === 0 ? (
          <div className="compact-empty">لا توجد محاضرات مجدولة.</div>
        ) : null}
        {sessions.map((session) => (
          <article className="data-row live-session-row" key={session.live_session_id}>
            <CalendarDays />
            <div className="data-main">
              <strong>{session.title}</strong>
              <small>
                {new Date(session.starts_at).toLocaleString("ar-YE", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
                {" · "}
                {session.provider_label}
                {" · "}
                {session.duration_minutes} دقيقة
                {session.speaker_name ? ` · ${session.speaker_name}` : ""}
              </small>
            </div>
            <span className={session.status === "SCHEDULED" ? "status live" : "status stopped"}>
              {session.status === "SCHEDULED" ? "مجدولة" : "ملغاة"}
            </span>
            {!readOnly ? (
              <div className="row-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => edit(session)}
                  disabled={busy}
                >
                  <Pencil /> تعديل
                </button>
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => remove(session)}
                  disabled={busy}
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
            <h3>{editing ? "تعديل المحاضرة" : "جدولة محاضرة"}</h3>
            {editing ? (
              <button className="text-button inline-text-button" type="button" onClick={reset}>
                إلغاء التعديل
              </button>
            ) : null}
          </div>
          <div className="form-grid">
            <label>
              عنوان المحاضرة
              <input value={title} onChange={(event) => setTitle(event.target.value)} required />
            </label>
            <label>
              المنصة
              <input
                list="live-session-providers"
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
                required
              />
              <datalist id="live-session-providers">
                <option value="Zoom" />
                <option value="Google Meet" />
                <option value="Microsoft Teams" />
              </datalist>
            </label>
            <label>
              اسم المتخصص (اختياري)
              <input value={speaker} onChange={(event) => setSpeaker(event.target.value)} />
            </label>
            <label>
              الموعد
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                required
              />
            </label>
            <label>
              المدة بالدقائق
              <input
                type="number"
                min={15}
                max={480}
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}
                required
              />
            </label>
            <label>
              الحالة
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as typeof status)}
              >
                <option value="SCHEDULED">مجدولة</option>
                <option value="CANCELLED">ملغاة</option>
              </select>
            </label>
            <label className="full-field">
              رابط الانضمام HTTPS
              <input
                type="url"
                pattern="https://.*"
                value={meetingUrl}
                onChange={(event) => setMeetingUrl(event.target.value)}
                required
              />
            </label>
            <label className="full-field">
              تعليمات الحضور
              <textarea
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                maxLength={2000}
              />
            </label>
          </div>
          {error ? <div className="notice error-notice">{error}</div> : null}
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? <LoaderCircle className="spin" /> : <CheckCircle2 />}
            {editing ? "حفظ التعديل" : "حفظ المحاضرة"}
          </button>
        </form>
      ) : error ? (
        <div className="notice error-notice">{error}</div>
      ) : null}
    </section>
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
