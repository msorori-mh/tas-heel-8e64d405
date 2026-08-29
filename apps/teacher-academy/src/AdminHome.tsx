import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BookOpen, LayoutDashboard, LoaderCircle, Plus, Trash2, UserRound } from "lucide-react";
import { AssessmentEditor } from "./AssessmentEditor";
import {
  adminAddLesson,
  adminCreateProgram,
  adminDeleteLesson,
  adminListLessons,
  adminListProgress,
  adminListPrograms,
  adminListTeachers,
  adminPublishProgram,
  adminRevokeCertificate,
  adminSetTeacherStatus,
  loadProfileOptions,
} from "./lib/academy-api";
import type {
  AcademyCapability,
  AcademySubject,
  AdminLesson,
  AdminProgress,
  AdminProgram,
  AdminTeacher,
} from "./types";

type AdminTab = "programs" | "teachers" | "progress";

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String(error.message);
  }
  return "تعذرت العملية. حاول مرة أخرى.";
}

function ProgramsAdmin() {
  const [programs, setPrograms] = useState<AdminProgram[]>([]);
  const [subjects, setSubjects] = useState<AcademySubject[]>([]);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [audience, setAudience] = useState<"ALL_TEACHERS" | "SUBJECT_SPECIFIC">("ALL_TEACHERS");
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [minutes, setMinutes] = useState(60);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingProgram, setEditingProgram] = useState<AdminProgram | null>(null);

  async function reload() {
    setPrograms(await adminListPrograms());
  }

  useEffect(() => {
    let active = true;
    Promise.all([adminListPrograms(), loadProfileOptions()])
      .then(([programItems, options]) => {
        if (!active) return;
        setPrograms(programItems);
        setSubjects(options.subjects);
      })
      .catch((loadError) => active && setError(messageOf(loadError)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  function toggleSubject(subjectId: string) {
    setSubjectIds((current) =>
      current.includes(subjectId)
        ? current.filter((item) => item !== subjectId)
        : [...current, subjectId],
    );
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminCreateProgram({
        title: title.trim(),
        summary: summary.trim(),
        audienceType: audience,
        estimatedMinutes: minutes,
        subjectIds: audience === "SUBJECT_SPECIFIC" ? subjectIds : [],
      });
      await reload();
      setTitle("");
      setSummary("");
      setAudience("ALL_TEACHERS");
      setSubjectIds([]);
      setMinutes(60);
    } catch (createError) {
      setError(messageOf(createError));
    } finally {
      setBusy(false);
    }
  }

  async function publish(program: AdminProgram) {
    if (!window.confirm(`نشر برنامج «${program.title}» للمعلمين المستهدفين؟`)) return;
    setBusy(true);
    setError(null);
    try {
      await adminPublishProgram(program.program_version_id);
      await reload();
    } catch (publishError) {
      setError(messageOf(publishError));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading label="جارٍ تحميل البرامج…" />;

  return (
    <div className="admin-section">
      <form className="admin-form" onSubmit={create}>
        <h2>إضافة برنامج تدريبي</h2>
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
          {busy ? <LoaderCircle className="spin" /> : <BookOpen />} حفظ المسودة
        </button>
      </form>

      {error ? <div className="notice error-notice">{error}</div> : null}
      <div className="data-list">
        {programs.length === 0 ? <div className="compact-empty">لا توجد برامج بعد.</div> : null}
        {programs.map((program) => (
          <article className="data-row" key={program.program_version_id}>
            <div className="data-main">
              <div className="data-title-line">
                <strong>{program.title}</strong>
                <Status live={program.status === "PUBLISHED"} />
              </div>
              <p>{program.summary}</p>
              <small>
                {program.audience_type === "ALL_TEACHERS" ? "جميع المعلمين" : program.subject_names}{" "}
                · {program.estimated_minutes} دقيقة
              </small>
            </div>
            {program.status === "DRAFT" ? (
              <div className="row-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setEditingProgram(program)}
                >
                  المحتوى
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={busy}
                  onClick={() => publish(program)}
                >
                  نشر
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
      {editingProgram ? (
        <LessonsEditor program={editingProgram} onClose={() => setEditingProgram(null)} />
      ) : null}
    </div>
  );
}

function LessonsEditor({ program, onClose }: { program: AdminProgram; onClose: () => void }) {
  const [lessons, setLessons] = useState<AdminLesson[]>([]);
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

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminAddLesson({
        programVersionId: program.program_version_id,
        title: title.trim(),
        lessonType,
        content: lessonType === "TEXT" ? content.trim() : content.trim(),
        resourceUrl: lessonType === "TEXT" ? null : resourceUrl.trim(),
        durationMinutes: minutes,
      });
      await reload();
      setTitle("");
      setContent("");
      setResourceUrl("");
      setMinutes(10);
    } catch (addError) {
      setError(messageOf(addError));
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
    } catch (deleteError) {
      setError(messageOf(deleteError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog-card" role="dialog" aria-modal="true" aria-label="محتوى البرنامج">
        <div className="section-toolbar">
          <div>
            <p className="eyebrow">محتوى البرنامج</p>
            <h2>{program.title}</h2>
          </div>
          <button className="secondary-button" type="button" onClick={onClose}>
            إغلاق
          </button>
        </div>
        {loading ? <Loading label="جارٍ تحميل الدروس…" /> : null}
        <div className="data-list compact-list">
          {lessons.map((lesson, index) => (
            <article className="data-row" key={lesson.lesson_id}>
              <div className="data-main">
                <strong>
                  {index + 1}. {lesson.title}
                </strong>
                <p>
                  {lesson.lesson_type} · {lesson.duration_minutes} دقيقة
                </p>
              </div>
              <button
                className="danger-button"
                type="button"
                disabled={busy}
                onClick={() => remove(lesson)}
              >
                <Trash2 /> حذف
              </button>
            </article>
          ))}
        </div>
        <form className="admin-form nested-form" onSubmit={add}>
          <h3>إضافة درس</h3>
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
            {busy ? <LoaderCircle className="spin" /> : <Plus />} إضافة الدرس
          </button>
        </form>
        <AssessmentEditor programVersionId={program.program_version_id} />
      </section>
    </div>
  );
}

function TeachersAdmin() {
  const [teachers, setTeachers] = useState<AdminTeacher[]>([]);
  const [query, setQuery] = useState("");
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

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return teachers.filter((teacher) =>
      [
        teacher.full_name,
        teacher.subject_name,
        teacher.governorate_name,
        teacher.school_name,
        teacher.phone,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [teachers, query]);

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
    <div className="admin-section">
      <div className="section-toolbar">
        <div>
          <h2>المعلمون</h2>
          <p className="muted">بحث حسب المادة أو المحافظة أو المدرسة.</p>
        </div>
        <input
          className="search-input"
          type="search"
          placeholder="بحث…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {error ? <div className="notice error-notice">{error}</div> : null}
      <div className="data-list">
        {filtered.length === 0 ? <div className="compact-empty">لا توجد نتائج.</div> : null}
        {filtered.map((teacher) => (
          <article className="data-row" key={teacher.user_id}>
            <div className="data-main">
              <div className="data-title-line">
                <strong>{teacher.full_name}</strong>
                <Status
                  live={teacher.status === "ACTIVE"}
                  stopped={teacher.status === "SUSPENDED"}
                />
              </div>
              <p>
                {teacher.subject_name} · {teacher.school_name}
              </p>
              <small>
                {teacher.governorate_name} · <bdi>{teacher.phone}</bdi>
              </small>
            </div>
            <button
              className="secondary-button"
              disabled={busyId === teacher.user_id}
              onClick={() => toggleStatus(teacher)}
            >
              {busyId === teacher.user_id ? <LoaderCircle className="spin" /> : null}
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

  return (
    <div className="admin-section">
      <div className="section-toolbar">
        <div>
          <h2>التقدم والشهادات</h2>
          <p className="muted">ملخص التسجيل والإنجاز لكل معلم.</p>
        </div>
      </div>
      {error ? <div className="notice error-notice">{error}</div> : null}
      <div className="data-list">
        {items.length === 0 ? <div className="compact-empty">لا توجد تسجيلات بعد.</div> : null}
        {items.map((item) => {
          const progress = item.total_lessons
            ? Math.round((item.completed_lessons / item.total_lessons) * 100)
            : 0;
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
                <div className="progress-track">
                  <span style={{ width: `${progress}%` }} />
                </div>
                <small>
                  {item.completed_lessons} من {item.total_lessons} · {progress}%
                </small>
                {item.certificate_code ? (
                  <small>
                    <bdi>{item.certificate_code}</bdi>
                  </small>
                ) : null}
              </div>
              {item.certificate_id && item.certificate_valid ? (
                <button
                  className="danger-button"
                  disabled={busyId === item.certificate_id}
                  onClick={() => revoke(item)}
                >
                  {busyId === item.certificate_id ? <LoaderCircle className="spin" /> : null} إلغاء
                  الشهادة
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

function Status({ live, stopped = false }: { live: boolean; stopped?: boolean }) {
  return (
    <span className={live ? "status live" : stopped ? "status stopped" : "status draft"}>
      {live ? "نشط / منشور" : stopped ? "موقوف" : "مسودة"}
    </span>
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
  const initialTab: AdminTab = capabilities.has("ACADEMY_CATALOG_MANAGE")
    ? "programs"
    : capabilities.has("ACADEMY_TEACHERS_VIEW")
      ? "teachers"
      : "progress";
  const [tab, setTab] = useState<AdminTab>(initialTab);

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">إدارة الأكاديمية</p>
          <h1>لوحة تشغيل مستقلة</h1>
          <p className="muted">لا تمنح أدوار تطبيق الطلاب أي وصول تلقائي إلى هذه المساحة.</p>
        </div>
      </div>
      <div className="admin-tabs" role="tablist" aria-label="أقسام إدارة الأكاديمية">
        {capabilities.has("ACADEMY_CATALOG_MANAGE") ? (
          <button className={tab === "programs" ? "active" : ""} onClick={() => setTab("programs")}>
            <BookOpen /> البرامج
          </button>
        ) : null}
        {capabilities.has("ACADEMY_TEACHERS_VIEW") ? (
          <button className={tab === "teachers" ? "active" : ""} onClick={() => setTab("teachers")}>
            <UserRound /> المعلمون
          </button>
        ) : null}
        {capabilities.has("ACADEMY_PROGRESS_VIEW") ? (
          <button className={tab === "progress" ? "active" : ""} onClick={() => setTab("progress")}>
            <LayoutDashboard /> التقدم
          </button>
        ) : null}
      </div>
      {tab === "programs" && capabilities.has("ACADEMY_CATALOG_MANAGE") ? <ProgramsAdmin /> : null}
      {tab === "teachers" && capabilities.has("ACADEMY_TEACHERS_VIEW") ? <TeachersAdmin /> : null}
      {tab === "progress" && capabilities.has("ACADEMY_PROGRESS_VIEW") ? <ProgressAdmin /> : null}
    </section>
  );
}
