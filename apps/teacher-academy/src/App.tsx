import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import {
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  GraduationCap,
  LoaderCircle,
  LogOut,
  Menu,
  School,
  ShieldCheck,
  Target,
  UserRound,
  X,
} from "lucide-react";
import { AdminHome } from "./AdminHome";
import {
  loadCapabilities,
  loadProfileOptions,
  loadTeacherProfile,
  loadVisiblePrograms,
  saveTeacherProfile,
  selfEnroll,
  completeLearningLesson,
  getAssessment,
  getLearningLessons,
  listMyCertificates,
  listMyLearning,
  listProgramLiveSessions,
  submitAssessment,
  verifyCertificate,
} from "./lib/academy-api";
import {
  academyBackendConfigured,
  academyFeatureEnabled,
  academySupabase,
  requireAcademyBackend,
} from "./lib/supabase";
import type {
  AcademyCapability,
  AcademySubject,
  AssessmentQuestion,
  AssessmentResult,
  CatalogProgram,
  Certificate,
  Governorate,
  LearningLesson,
  LearningProgram,
  LessonSectionType,
  LiveSession,
  TeacherProfile,
  VerifiedCertificate,
} from "./types";

const academyBasePath = (() => {
  const configured = import.meta.env.VITE_ACADEMY_BASE_PATH?.trim();
  if (!configured || configured === "/") return "";
  return `/${configured.replace(/^\/+|\/+$/g, "")}`;
})();

function academyUrl(path = "") {
  if (path && !path.startsWith("/")) {
    throw new Error("Academy paths must start with a slash");
  }
  return `${academyBasePath}${path}` || "/";
}

const ACADEMY_OAUTH_RETURN_KEY = "tamkeen:academy-google-return";

type AcademyPortal = "teacher" | "admin" | "verify";
type WorkspaceView = "catalog" | "learning" | "certificates" | "profile" | "admin";

function isGoogleAccount(user: User): boolean {
  const providers = Array.isArray(user.app_metadata.providers) ? user.app_metadata.providers : [];
  return (
    user.app_metadata.provider === "google" ||
    providers.includes("google") ||
    user.identities?.some((identity) => identity.provider === "google") === true
  );
}

function clearAcademyOAuthReturn(): void {
  try {
    window.localStorage.removeItem(ACADEMY_OAUTH_RETURN_KEY);
  } catch {
    // A blocked storage surface cannot retain a stale academy return intent.
  }
}

async function startTeacherGoogleSignIn(): Promise<void> {
  requireAcademyBackend();
  const usesRootCallback = academyBasePath.length > 0;
  const redirectTo = new URL(
    usesRootCallback ? "/auth/callback" : academyUrl(),
    window.location.origin,
  ).toString();
  const { data, error } = await academySupabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error) throw error;
  if (!data.url) throw new Error("تعذّر بدء تسجيل الدخول عبر Google.");

  if (usesRootCallback) {
    window.localStorage.setItem(
      ACADEMY_OAUTH_RETURN_KEY,
      JSON.stringify({ path: academyUrl(), createdAt: Date.now() }),
    );
  }

  const isEmbedded = window.top !== window.self;
  if (isEmbedded) {
    const opened = window.open(data.url, "_blank", "noopener,noreferrer");
    if (!opened) throw new Error("اسمح بفتح نافذة Google ثم حاول مرة أخرى.");
    return;
  }
  window.location.href = data.url;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String(error.message);
  }
  return "حدث خطأ غير متوقع. حاول مرة أخرى.";
}

const LEARNING_SECTION_LABELS: Record<LessonSectionType, string> = {
  OBJECTIVE: "هدف الدرس",
  INTRODUCTION: "تمهيد",
  CONTENT: "الشرح",
  EXAMPLE: "مثال تطبيقي",
  ACTIVITY: "نشاط أو تطبيق",
  SUMMARY: "الخلاصة",
  RESOURCE: "مورد إضافي",
};

type ProgramInformation = {
  summary: string;
  detailed_description: string;
  objectives: string[];
  prerequisites: string[];
  instructions: string[];
  pass_percentage: number | null;
};

function ProgramDetails({
  programVersionId,
  information,
}: {
  programVersionId: string;
  information: ProgramInformation;
}) {
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listProgramLiveSessions(programVersionId)
      .then((items) => active && setSessions(items))
      .catch((error) => active && setSessionsError(getErrorMessage(error)));
    return () => {
      active = false;
    };
  }, [programVersionId]);

  return (
    <div className="program-details-panel">
      <section>
        <h3>عن البرنامج</h3>
        <p>{information.detailed_description}</p>
      </section>
      <div className="program-details-grid">
        <section>
          <h3>
            <Target /> أهداف البرنامج
          </h3>
          <ul>
            {information.objectives.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        {information.prerequisites.length > 0 ? (
          <section>
            <h3>
              <BookOpen /> المتطلبات
            </h3>
            <ul>
              {information.prerequisites.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}
        <section>
          <h3>
            <CheckCircle2 /> تعليمات الدراسة
          </h3>
          <ul>
            {information.instructions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section>
          <h3>
            <Award /> الشهادة
          </h3>
          <p>
            أكمل جميع الدروس ثم اجتز التقييم
            {information.pass_percentage ? ` بنسبة ${information.pass_percentage}% على الأقل` : ""}.
          </p>
        </section>
      </div>
      <section className="live-sessions-teacher">
        <h3>
          <CalendarDays /> المحاضرات المباشرة
        </h3>
        {sessionsError ? <div className="notice error-notice">{sessionsError}</div> : null}
        {sessions.length === 0 ? (
          <p className="muted">لا توجد محاضرة مباشرة مجدولة حاليًا.</p>
        ) : null}
        {sessions.map((session) => (
          <article
            className={
              session.status === "CANCELLED" ? "live-session-card cancelled" : "live-session-card"
            }
            key={session.live_session_id}
          >
            <div>
              <strong>{session.title}</strong>
              <p>
                {new Date(session.starts_at).toLocaleString("ar-YE", {
                  dateStyle: "long",
                  timeStyle: "short",
                })}
                {" · "}
                {session.provider_label}
                {" · "}
                {session.duration_minutes} دقيقة
              </p>
              {session.speaker_name ? <small>المتخصص: {session.speaker_name}</small> : null}
              {session.instructions ? <p>{session.instructions}</p> : null}
            </div>
            {session.status === "SCHEDULED" ? (
              <a
                className="primary-button"
                href={session.meeting_url}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink /> الانضمام للمحاضرة
              </a>
            ) : (
              <span className="status stopped">ملغاة</span>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}

function LoadingScreen() {
  return (
    <main className="centered-page">
      <div className="loading-card" role="status">
        <LoaderCircle className="spin" aria-hidden="true" />
        <p>جارٍ تجهيز أكاديمية تمكين…</p>
      </div>
    </main>
  );
}

function ConfigurationRequired() {
  return (
    <main className="centered-page">
      <section className="auth-card setup-card">
        <div className="brand-mark" aria-hidden="true">
          <GraduationCap />
        </div>
        <p className="eyebrow">إعداد الإطلاق</p>
        <h1>الاتصال الخلفي غير مهيأ</h1>
        <p className="muted">
          لم تُضف متغيرات بيئة Supabase الخاصة بتطبيق الأكاديمية. أُغلقت الواجهة منعًا لعرض بيانات
          تجريبية أو إرسال طلبات إلى وجهة غير صحيحة.
        </p>
        <div className="notice code-notice" dir="ltr">
          VITE_SUPABASE_URL
          <br />
          VITE_SUPABASE_PUBLISHABLE_KEY
        </div>
      </section>
    </main>
  );
}

function AcademyUnavailable() {
  return (
    <main className="centered-page">
      <section className="auth-card setup-card">
        <ShieldCheck className="large-icon" />
        <p className="eyebrow">أكاديمية تمكين</p>
        <h1>الخدمة غير متاحة حاليًا</h1>
        <p className="muted">نعمل على تجهيز تجربة التدريب. حاول مرة أخرى لاحقًا.</p>
      </section>
    </main>
  );
}

function VerifyCertificatePage() {
  const [code, setCode] = useState(
    () => new URLSearchParams(window.location.search).get("code") ?? "",
  );
  const [result, setResult] = useState<VerifiedCertificate | null>(null);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    setSearched(true);
    try {
      setResult(await verifyCertificate(code.trim()));
    } catch (verifyError) {
      setError(getErrorMessage(verifyError));
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const initialCode = new URLSearchParams(window.location.search).get("code")?.trim();
    if (!initialCode) return;
    let active = true;
    setBusy(true);
    setSearched(true);
    verifyCertificate(initialCode)
      .then((certificate) => active && setResult(certificate))
      .catch((verifyError) => active && setError(getErrorMessage(verifyError)))
      .finally(() => active && setBusy(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="centered-page">
      <section className="auth-card verify-card">
        <span className="brand-mark">
          <Award />
        </span>
        <p className="eyebrow">أكاديمية تمكين</p>
        <h1>التحقق من الشهادة</h1>
        <p className="muted">أدخل رمز الشهادة كما يظهر في نسخة المعلم.</p>
        <form onSubmit={verify}>
          <label>
            رمز الشهادة
            <input
              dir="ltr"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
            />
          </label>
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? <LoaderCircle className="spin" /> : <ShieldCheck />} تحقق
          </button>
        </form>
        {error ? <div className="notice error-notice">{error}</div> : null}
        {result ? (
          <div
            className={result.valid ? "verification-result valid" : "verification-result invalid"}
          >
            <strong>{result.valid ? "شهادة صحيحة وسارية" : "شهادة ملغاة"}</strong>
            <span>المعلم: {result.teacher_name}</span>
            <span>البرنامج: {result.program_title}</span>
            <span>تاريخ الإصدار: {new Date(result.issued_at).toLocaleDateString("ar-YE")}</span>
            <bdi>{result.certificate_code}</bdi>
          </div>
        ) : searched && !busy && !error ? (
          <div className="notice error-notice">لم يُعثر على شهادة بهذا الرمز.</div>
        ) : null}
        <a className="text-button link-button" href={academyUrl()}>
          العودة إلى الأكاديمية
        </a>
      </section>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        fill="#4285f4"
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z"
      />
      <path
        fill="#34a853"
        d="M12 22c2.7 0 4.98-.9 6.63-2.36l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.05v2.62A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#fbbc05"
        d="M6.39 13.93A6 6 0 0 1 6.08 12c0-.67.11-1.32.31-1.93V7.45H3.05A10 10 0 0 0 2 12c0 1.64.39 3.2 1.05 4.55l3.34-2.62Z"
      />
      <path
        fill="#ea4335"
        d="M12 5.94c1.47 0 2.79.5 3.82 1.5l2.88-2.88A9.67 9.67 0 0 0 12 2a10 10 0 0 0-8.95 5.45l3.34 2.62C7.18 7.7 9.39 5.94 12 5.94Z"
      />
    </svg>
  );
}

function TeacherAuthPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function continueWithGoogle() {
    setBusy(true);
    setError(null);
    try {
      await startTeacherGoogleSignIn();
    } catch (submitError) {
      clearAcademyOAuthReturn();
      setError(getErrorMessage(submitError));
      setBusy(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-intro">
        <div className="brand-line">
          <span className="brand-mark">
            <GraduationCap />
          </span>
          <strong>أكاديمية تمكين</strong>
        </div>
        <div>
          <p className="eyebrow">بوابة المعلمين</p>
          <h1>تدريب مهني يصل إليك بحسب تخصصك</h1>
          <p>
            استخدم حساب Google لإنشاء حساب المعلم أو العودة إلى برامجك، ثم أكمل ملفك المهني مرة
            واحدة.
          </p>
        </div>
        <ul className="feature-list">
          <li>
            <CheckCircle2 /> برامج عامة وتخصصية بحسب مادتك
          </li>
          <li>
            <CheckCircle2 /> تعلم تدريجي وقياس واضح للتقدم
          </li>
          <li>
            <CheckCircle2 /> شهادات رقمية بعد استيفاء المتطلبات
          </li>
        </ul>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <p className="eyebrow">دخول المعلمين</p>
          <h2>الدخول أو إنشاء حساب</h2>
          <p className="muted">
            حساب Google هو الطريقة الوحيدة المعتمدة لدخول المعلمين وإنشاء حساباتهم.
          </p>
          {error ? <div className="notice error-notice">{error}</div> : null}
          <button
            className="google-button"
            type="button"
            disabled={busy}
            onClick={continueWithGoogle}
          >
            {busy ? <LoaderCircle className="spin" /> : <GoogleMark />}
            المتابعة باستخدام Google
          </button>
          <p className="auth-footnote">لا تحتاج إلى دعوة أو موافقة مسبقة.</p>
          <a className="text-button link-button" href={academyUrl("/admin")}>
            دخول إدارة الأكاديمية
          </a>
        </div>
      </section>
    </main>
  );
}

function AdminAuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      requireAcademyBackend();
      clearAcademyOAuthReturn();
      const result = await academySupabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (result.error) throw result.error;
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-intro">
        <div className="brand-line">
          <span className="brand-mark">
            <GraduationCap />
          </span>
          <strong>أكاديمية تمكين</strong>
        </div>
        <div>
          <p className="eyebrow">بوابة الإدارة</p>
          <h1>إدارة مستقلة للأكاديمية</h1>
          <p>هذه المساحة مخصصة للحسابات التي منحت صلاحيات إدارة الأكاديمية فقط.</p>
        </div>
        <ul className="feature-list">
          <li>
            <CheckCircle2 /> إدارة البرامج والمحتوى التدريبي
          </li>
          <li>
            <CheckCircle2 /> متابعة المعلمين والتقدم والتقارير
          </li>
          <li>
            <CheckCircle2 /> إعدادات وصلاحيات وسجل تدقيق
          </li>
        </ul>
      </section>

      <section className="auth-panel">
        <form className="auth-card" onSubmit={submit}>
          <p className="eyebrow">دخول الإدارة</p>
          <h2>تسجيل دخول المسؤول</h2>
          <p className="muted">استخدم بيانات حساب الإدارة المصرح له.</p>

          <label>
            البريد الإلكتروني
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            كلمة المرور
            <input
              type="password"
              autoComplete="current-password"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {error ? <div className="notice error-notice">{error}</div> : null}

          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? <LoaderCircle className="spin" /> : null}
            دخول الإدارة
          </button>
          <a className="text-button link-button" href={academyUrl()}>
            العودة إلى بوابة المعلمين
          </a>
        </form>
      </section>
    </main>
  );
}

function ProfileForm({
  user,
  existing,
  onSaved,
}: {
  user: User;
  existing: TeacherProfile | null;
  onSaved: (profile: TeacherProfile) => void;
}) {
  const [subjects, setSubjects] = useState<AcademySubject[]>([]);
  const [governorates, setGovernorates] = useState<Governorate[]>([]);
  const [fullName, setFullName] = useState(existing?.full_name ?? "");
  const [subjectId, setSubjectId] = useState(existing?.primary_subject_id ?? "");
  const [governorateId, setGovernorateId] = useState(existing?.governorate_id ?? "");
  const [schoolName, setSchoolName] = useState(existing?.school_name ?? "");
  const [phone, setPhone] = useState(existing?.phone ?? "");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadProfileOptions()
      .then((options) => {
        if (!active) return;
        setSubjects(options.subjects);
        setGovernorates(options.governorates);
      })
      .catch((optionsError) => {
        if (active) setError(getErrorMessage(optionsError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = await saveTeacherProfile(user, {
        full_name: fullName.trim(),
        primary_subject_id: subjectId,
        governorate_id: governorateId,
        school_name: schoolName.trim(),
        phone: phone.trim(),
      });
      onSaved(saved);
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="profile-page">
      <section className="profile-heading">
        <div className="brand-line">
          <span className="brand-mark">
            <GraduationCap />
          </span>
          <strong>أكاديمية تمكين</strong>
        </div>
        <p className="eyebrow">خطوة واحدة فقط</p>
        <h1>{existing ? "تحديث الملف المهني" : "أكمل ملفك المهني"}</h1>
        <p className="muted">
          نستخدم المادة الأساسية لعرض البرامج المناسبة لك. جميع الحقول التالية إلزامية.
        </p>
      </section>

      <form className="profile-form" onSubmit={submit}>
        {loading ? (
          <div className="loading-inline">
            <LoaderCircle className="spin" /> جارٍ تحميل القوائم…
          </div>
        ) : null}
        <div className="form-grid">
          <label>
            الاسم الكامل
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
            />
          </label>
          <label>
            المادة الأساسية
            <select
              value={subjectId}
              onChange={(event) => setSubjectId(event.target.value)}
              required
            >
              <option value="">اختر المادة</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name_ar}
                </option>
              ))}
            </select>
          </label>
          <label>
            المحافظة
            <select
              value={governorateId}
              onChange={(event) => setGovernorateId(event.target.value)}
              required
            >
              <option value="">اختر المحافظة</option>
              {governorates.map((governorate) => (
                <option key={governorate.id} value={governorate.id}>
                  {governorate.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            المدرسة
            <input
              value={schoolName}
              onChange={(event) => setSchoolName(event.target.value)}
              required
            />
          </label>
          <label className="full-field">
            رقم الهاتف
            <input
              type="tel"
              dir="ltr"
              inputMode="tel"
              placeholder="مثال: 777123456"
              pattern="[+0-9][0-9 +()-]{6,19}"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              required
            />
          </label>
        </div>
        {error ? <div className="notice error-notice">{error}</div> : null}
        <button className="primary-button" type="submit" disabled={busy || loading}>
          {busy ? <LoaderCircle className="spin" /> : null}
          حفظ والانتقال إلى البرامج
        </button>
      </form>
    </main>
  );
}

function Catalog({ onChanged }: { onChanged: () => void }) {
  const [programs, setPrograms] = useState<CatalogProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadVisiblePrograms()
      .then((items) => {
        if (active) setPrograms(items);
      })
      .catch((loadError) => {
        if (active) setError(getErrorMessage(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function enroll(program: CatalogProgram) {
    setBusyId(program.program_version_id);
    setError(null);
    try {
      await selfEnroll(program.program_version_id);
      setPrograms((current) =>
        current.map((item) =>
          item.program_version_id === program.program_version_id
            ? { ...item, enrolled: true }
            : item,
        ),
      );
      onChanged();
    } catch (enrollError) {
      setError(getErrorMessage(enrollError));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">كتالوجك المهني</p>
          <h1>البرامج المناسبة لتخصصك</h1>
          <p className="muted">تظهر هنا البرامج العامة وبرامج مادتك الأساسية فقط.</p>
        </div>
      </div>
      {error ? <div className="notice error-notice">{error}</div> : null}
      {loading ? (
        <div className="loading-inline">
          <LoaderCircle className="spin" /> جارٍ تحميل البرامج…
        </div>
      ) : null}
      {!loading && programs.length === 0 ? (
        <div className="empty-state">
          <BookOpen />
          <h2>لا توجد برامج منشورة الآن</h2>
          <p>ستظهر البرامج العامة أو المرتبطة بمادتك هنا فور نشرها.</p>
        </div>
      ) : (
        <div className="program-grid">
          {programs.map((program) => (
            <article className="program-card" key={program.program_version_id}>
              <div className="program-cover">
                <BookOpen />
                <span>{program.subject_name ?? "برنامج عام"}</span>
              </div>
              <div className="program-body">
                <h2>{program.title}</h2>
                <p>{program.summary}</p>
                <div className="program-meta">
                  <span>
                    {Math.max(1, Math.round(program.estimated_minutes / 60))} ساعة تقريبًا
                  </span>
                  <span>{program.lesson_count} درس</span>
                  {program.pass_percentage ? (
                    <span>الاجتياز {program.pass_percentage}%</span>
                  ) : null}
                </div>
                <div className="card-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    aria-expanded={expandedId === program.program_version_id}
                    onClick={() =>
                      setExpandedId((current) =>
                        current === program.program_version_id ? null : program.program_version_id,
                      )
                    }
                  >
                    <BookOpen />{" "}
                    {expandedId === program.program_version_id
                      ? "إخفاء التفاصيل"
                      : "تفاصيل البرنامج"}
                  </button>
                  <button
                    className={program.enrolled ? "secondary-button" : "primary-button"}
                    type="button"
                    disabled={program.enrolled || busyId === program.program_version_id}
                    onClick={() => enroll(program)}
                  >
                    {busyId === program.program_version_id ? (
                      <LoaderCircle className="spin" />
                    ) : program.enrolled ? (
                      <CheckCircle2 />
                    ) : null}
                    {program.enrolled ? "مسجل في البرنامج" : "ابدأ التدريب"}
                  </button>
                </div>
                {expandedId === program.program_version_id ? (
                  <ProgramDetails
                    programVersionId={program.program_version_id}
                    information={program}
                  />
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Learning() {
  const [programs, setPrograms] = useState<LearningProgram[]>([]);
  const [selected, setSelected] = useState<LearningProgram | null>(null);
  const [lessons, setLessons] = useState<LearningLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reloadPrograms() {
    const items = await listMyLearning();
    setPrograms(items);
    if (selected) {
      setSelected(
        items.find((item) => item.program_version_id === selected.program_version_id) ?? null,
      );
    }
  }

  useEffect(() => {
    let active = true;
    listMyLearning()
      .then((items) => active && setPrograms(items))
      .catch((loadError) => active && setError(getErrorMessage(loadError)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  async function openProgram(program: LearningProgram) {
    setSelected(program);
    setLoading(true);
    setError(null);
    try {
      setLessons(await getLearningLessons(program.program_version_id));
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  async function complete(lesson: LearningLesson) {
    setBusyId(lesson.lesson_id);
    setError(null);
    try {
      await completeLearningLesson(lesson.lesson_id);
      setLessons((current) =>
        current.map((item) =>
          item.lesson_id === lesson.lesson_id ? { ...item, completed: true } : item,
        ),
      );
      await reloadPrograms();
    } catch (completeError) {
      setError(getErrorMessage(completeError));
    } finally {
      setBusyId(null);
    }
  }

  async function refreshSelectedProgram() {
    if (!selected) return;
    const [programItems, lessonItems] = await Promise.all([
      listMyLearning(),
      getLearningLessons(selected.program_version_id),
    ]);
    setPrograms(programItems);
    setLessons(lessonItems);
    setSelected(
      programItems.find((item) => item.program_version_id === selected.program_version_id) ?? null,
    );
  }

  if (selected) {
    return (
      <section>
        <button className="text-button inline-text-button" onClick={() => setSelected(null)}>
          العودة إلى برامجي
        </button>
        <div className="page-heading">
          <div>
            <p className="eyebrow">محتوى البرنامج</p>
            <h1>{selected.title}</h1>
            <p className="muted">
              {selected.completed_lessons} من {selected.total_lessons} دروس مكتملة
            </p>
          </div>
        </div>
        {error ? <div className="notice error-notice">{error}</div> : null}
        {loading ? (
          <div className="loading-inline">
            <LoaderCircle className="spin" /> جارٍ التحميل…
          </div>
        ) : null}
        <ProgramDetails programVersionId={selected.program_version_id} information={selected} />
        <div className="lesson-list">
          {lessons.map((lesson, index) => (
            <article
              className={lesson.completed ? "lesson-card completed" : "lesson-card"}
              key={lesson.lesson_id}
            >
              <div className="lesson-number">{index + 1}</div>
              <div className="lesson-main">
                <div className="data-title-line">
                  <h2>{lesson.title}</h2>
                  {lesson.completed ? <span className="status live">مكتمل</span> : null}
                </div>
                <small>{lesson.duration_minutes} دقيقة</small>
                <div className="learning-sections">
                  {lesson.sections.map((section) => (
                    <section
                      className={`learning-section ${section.section_type.toLowerCase()}`}
                      key={section.section_id}
                    >
                      <h3>{section.title ?? LEARNING_SECTION_LABELS[section.section_type]}</h3>
                      <p>{section.content}</p>
                      {section.resource_url ? (
                        <a
                          className="resource-link"
                          href={section.resource_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink /> فتح المورد الإضافي
                        </a>
                      ) : null}
                    </section>
                  ))}
                </div>
                {lesson.resource_url ? (
                  <a
                    className="resource-link"
                    href={lesson.resource_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink /> فتح المورد التدريبي
                  </a>
                ) : null}
              </div>
              <button
                className={lesson.completed ? "secondary-button" : "primary-button"}
                disabled={lesson.completed || busyId === lesson.lesson_id}
                onClick={() => complete(lesson)}
              >
                {busyId === lesson.lesson_id ? <LoaderCircle className="spin" /> : <CheckCircle2 />}
                {lesson.completed ? "تم" : "إكمال الدرس"}
              </button>
            </article>
          ))}
        </div>
        <AssessmentPanel
          programVersionId={selected.program_version_id}
          ready={lessons.length > 0 && lessons.every((lesson) => lesson.completed)}
          onPassed={refreshSelectedProgram}
        />
      </section>
    );
  }

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">مساري</p>
          <h1>برامجي التدريبية</h1>
          <p className="muted">ستظهر هنا البرامج المسجل بها ونسبة تقدمك.</p>
        </div>
      </div>
      {error ? <div className="notice error-notice">{error}</div> : null}
      {loading ? (
        <div className="loading-inline">
          <LoaderCircle className="spin" /> جارٍ التحميل…
        </div>
      ) : null}
      {!loading && programs.length === 0 ? (
        <div className="empty-state">
          <Award />
          <h2>ابدأ من الكتالوج</h2>
          <p>اختر برنامجًا مناسبًا ثم تابع التعلم من هذه الصفحة.</p>
        </div>
      ) : (
        <div className="learning-grid">
          {programs.map((program) => {
            const progress = program.total_lessons
              ? Math.round((program.completed_lessons / program.total_lessons) * 100)
              : 0;
            return (
              <article className="learning-card" key={program.enrollment_id}>
                <div className="data-title-line">
                  <h2>{program.title}</h2>
                  {program.status === "COMPLETED" ? (
                    <span className="status live">مكتمل</span>
                  ) : null}
                </div>
                <div className="progress-track" aria-label={`نسبة الإنجاز ${progress}%`}>
                  <span style={{ width: `${progress}%` }} />
                </div>
                <p>
                  {program.completed_lessons} من {program.total_lessons} · {progress}%
                </p>
                <button className="primary-button" onClick={() => openProgram(program)}>
                  متابعة التعلم
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AssessmentPanel({
  programVersionId,
  ready,
  onPassed,
}: {
  programVersionId: string;
  ready: boolean;
  onPassed: () => Promise<void>;
}) {
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, "a" | "b" | "c" | "d">>({});
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    setLoading(true);
    getAssessment(programVersionId)
      .then((items) => active && setQuestions(items))
      .catch((loadError) => active && setError(getErrorMessage(loadError)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [programVersionId, ready]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const assessmentResult = await submitAssessment(programVersionId, answers);
      setResult(assessmentResult);
      if (assessmentResult.passed) await onPassed();
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <section className="assessment-panel locked-panel">
        <Award />
        <div>
          <h2>التقييم النهائي</h2>
          <p>أكمل جميع الدروس أولًا لفتح التقييم.</p>
        </div>
      </section>
    );
  }

  if (loading)
    return (
      <div className="loading-inline">
        <LoaderCircle className="spin" /> جارٍ تحميل التقييم…
      </div>
    );
  if (questions.length === 0) return null;

  const title = questions[0].title;
  const passPercentage = questions[0].pass_percentage;
  const allAnswered = questions.every((question) => answers[question.question_id]);

  return (
    <section className="assessment-panel">
      <div className="page-heading compact-heading">
        <div>
          <p className="eyebrow">الخطوة الأخيرة</p>
          <h2>{title}</h2>
          <p className="muted">نسبة النجاح المطلوبة {passPercentage}%.</p>
        </div>
      </div>
      {result ? (
        <div className={result.passed ? "notice success-notice" : "notice error-notice"}>
          <strong>{result.passed ? "تم اجتياز التقييم" : "لم تحقق نسبة النجاح بعد"}</strong>
          <span>
            النتيجة: {result.score} من {result.total}
          </span>
          {result.certificate_code ? <bdi>رمز الشهادة: {result.certificate_code}</bdi> : null}
        </div>
      ) : null}
      <form className="assessment-form" onSubmit={submit}>
        {questions.map((question, index) => (
          <fieldset className="assessment-question" key={question.question_id}>
            <legend>
              {index + 1}. {question.question_text}
            </legend>
            {(["a", "b", "c", "d"] as const).map((option) => (
              <label key={option}>
                <input
                  type="radio"
                  name={question.question_id}
                  value={option}
                  checked={answers[question.question_id] === option}
                  onChange={() =>
                    setAnswers((current) => ({ ...current, [question.question_id]: option }))
                  }
                />
                {question[`option_${option}`]}
              </label>
            ))}
          </fieldset>
        ))}
        {error ? <div className="notice error-notice">{error}</div> : null}
        <button className="primary-button" type="submit" disabled={busy || !allAnswered}>
          {busy ? <LoaderCircle className="spin" /> : <CheckCircle2 />} إرسال التقييم
        </button>
      </form>
    </section>
  );
}

function Certificates() {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listMyCertificates()
      .then((items) => active && setCertificates(items))
      .catch((loadError) => active && setError(getErrorMessage(loadError)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">إنجازاتي</p>
          <h1>الشهادات</h1>
          <p className="muted">تصدر الشهادة تلقائيًا بعد اجتياز التقييم النهائي.</p>
        </div>
      </div>
      {error ? <div className="notice error-notice">{error}</div> : null}
      {loading ? (
        <div className="loading-inline">
          <LoaderCircle className="spin" /> جارٍ التحميل…
        </div>
      ) : null}
      {!loading && certificates.length === 0 ? (
        <div className="empty-state">
          <Award />
          <h2>لا توجد شهادات بعد</h2>
          <p>أكمل برنامجًا واجتز تقييمه لتصدر شهادتك.</p>
        </div>
      ) : (
        <div className="certificate-grid">
          {certificates.map((certificate) => (
            <article className="certificate-card" key={certificate.certificate_id}>
              <Award />
              <div>
                <span className={certificate.valid ? "status live" : "status stopped"}>
                  {certificate.valid ? "سارية" : "ملغاة"}
                </span>
                <h2>{certificate.program_title}</h2>
                <p>تاريخ الإصدار: {new Date(certificate.issued_at).toLocaleDateString("ar-YE")}</p>
                <bdi>{certificate.certificate_code}</bdi>
                <a
                  className="resource-link"
                  href={academyUrl(
                    `/verify?code=${encodeURIComponent(certificate.certificate_code)}`,
                  )}
                >
                  <ShieldCheck /> التحقق من الشهادة
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Workspace({
  portal,
  user,
  profile,
  capabilities,
  onProfileChanged,
}: {
  portal: "teacher" | "admin";
  user: User;
  profile: TeacherProfile | null;
  capabilities: Set<AcademyCapability>;
  onProfileChanged: (profile: TeacherProfile) => void;
}) {
  const hasAdminAccess = portal === "admin" && capabilities.size > 0;
  const hasTeacherAccess = portal === "teacher" && profile?.status === "ACTIVE";
  const [view, setView] = useState<WorkspaceView>(() => (portal === "admin" ? "admin" : "catalog"));
  const [menuOpen, setMenuOpen] = useState(false);

  const navigation = useMemo(
    () => [
      ...(hasTeacherAccess
        ? [
            { id: "catalog" as const, label: "البرامج", icon: BookOpen },
            { id: "learning" as const, label: "مساري", icon: Award },
            { id: "certificates" as const, label: "الشهادات", icon: GraduationCap },
            { id: "profile" as const, label: "ملفي المهني", icon: UserRound },
          ]
        : []),
      ...(hasAdminAccess
        ? [{ id: "admin" as const, label: "إدارة الأكاديمية", icon: ShieldCheck }]
        : []),
    ],
    [hasAdminAccess, hasTeacherAccess],
  );

  const displayName =
    portal === "teacher"
      ? (profile?.full_name ?? user.email ?? "معلم")
      : (user.email ?? "مسؤول الأكاديمية");
  const displayMeta = portal === "teacher" ? user.email : "مسؤول الأكاديمية";

  function selectView(nextView: WorkspaceView) {
    setView(nextView);
    setMenuOpen(false);
  }

  return (
    <div className="workspace-shell">
      <header className="mobile-header">
        <div className="brand-line">
          <span className="brand-mark compact">
            <GraduationCap />
          </span>
          <strong>أكاديمية تمكين</strong>
        </div>
        <button className="icon-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="القائمة">
          {menuOpen ? <X /> : <Menu />}
        </button>
      </header>

      <aside className={menuOpen ? "sidebar open" : "sidebar"}>
        <div className="brand-line sidebar-brand">
          <span className="brand-mark">
            <GraduationCap />
          </span>
          <div>
            <strong>أكاديمية تمكين</strong>
            <small>للتدريب والتأهيل</small>
          </div>
        </div>
        <nav>
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={view === item.id ? "nav-item active" : "nav-item"}
                key={item.id}
                onClick={() => selectView(item.id)}
              >
                <Icon /> {item.label}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <span>{displayName.slice(0, 1)}</span>
            <div>
              <strong>{displayName}</strong>
              <small>{displayMeta}</small>
            </div>
          </div>
          <button className="nav-item" onClick={() => academySupabase.auth.signOut()}>
            <LogOut /> تسجيل الخروج
          </button>
        </div>
      </aside>

      {menuOpen ? <button className="menu-backdrop" onClick={() => setMenuOpen(false)} /> : null}

      <main className="workspace-content">
        {view === "catalog" && hasTeacherAccess ? <Catalog onChanged={() => undefined} /> : null}
        {view === "learning" && hasTeacherAccess ? <Learning /> : null}
        {view === "certificates" && hasTeacherAccess ? <Certificates /> : null}
        {view === "profile" && profile && hasTeacherAccess ? (
          <ProfileForm user={user} existing={profile} onSaved={onProfileChanged} />
        ) : null}
        {view === "admin" && hasAdminAccess ? <AdminHome capabilities={capabilities} /> : null}
      </main>
    </div>
  );
}

function PortalMismatch({
  title,
  description,
  destination,
  destinationLabel,
}: {
  title: string;
  description: string;
  destination: string;
  destinationLabel: string;
}) {
  return (
    <main className="centered-page">
      <section className="auth-card setup-card">
        <ShieldCheck className="large-icon" />
        <h1>{title}</h1>
        <p className="muted">{description}</p>
        <a className="text-button link-button" href={destination}>
          {destinationLabel}
        </a>
        <button className="secondary-button" onClick={() => academySupabase.auth.signOut()}>
          <LogOut /> تسجيل الخروج وتبديل الحساب
        </button>
      </section>
    </main>
  );
}

export function App({ portal }: { portal?: AcademyPortal }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  const [capabilities, setCapabilities] = useState<Set<AcademyCapability>>(new Set());
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const activePortal: AcademyPortal =
    portal ??
    (window.location.pathname === academyUrl("/verify")
      ? "verify"
      : window.location.pathname === academyUrl("/admin")
        ? "admin"
        : "teacher");

  useEffect(() => {
    if (!academyFeatureEnabled || !academyBackendConfigured) {
      setLoadingSession(false);
      return;
    }

    academySupabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoadingSession(false);
    });

    const { data } = academySupabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session) {
        setProfile(null);
        setCapabilities(new Set());
      }
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoadingProfile(true);
    setProfileError(null);

    Promise.all([loadTeacherProfile(user.id), loadCapabilities()])
      .then(([loadedProfile, loadedCapabilities]) => {
        if (!active) return;
        setProfile(loadedProfile);
        setCapabilities(loadedCapabilities);
      })
      .catch((error) => {
        if (active) setProfileError(getErrorMessage(error));
      })
      .finally(() => {
        if (active) setLoadingProfile(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  if (!academyFeatureEnabled) return <AcademyUnavailable />;
  if (!academyBackendConfigured) return <ConfigurationRequired />;
  if (activePortal === "verify") return <VerifyCertificatePage />;
  if (loadingSession || loadingProfile) return <LoadingScreen />;
  if (!user) return activePortal === "admin" ? <AdminAuthPage /> : <TeacherAuthPage />;
  if (profileError) {
    return (
      <main className="centered-page">
        <section className="auth-card setup-card">
          <ShieldCheck className="large-icon" />
          <h1>تعذر فتح مساحة الأكاديمية</h1>
          <p className="muted">
            أُغلقت الواجهة لأن مخطط الأكاديمية أو صلاحياته غير جاهزة. لا يؤثر ذلك على تطبيق الطلاب.
          </p>
          <div className="notice error-notice">{profileError}</div>
          <button className="secondary-button" onClick={() => academySupabase.auth.signOut()}>
            <LogOut /> تسجيل الخروج
          </button>
        </section>
      </main>
    );
  }

  if (activePortal === "admin") {
    if (capabilities.size === 0) {
      return (
        <PortalMismatch
          title="لا يملك هذا الحساب صلاحية الإدارة"
          description="هذه الصفحة مخصصة لمسؤولي الأكاديمية. يمكنك العودة إلى بوابة المعلمين أو تبديل الحساب."
          destination={academyUrl()}
          destinationLabel="العودة إلى بوابة المعلمين"
        />
      );
    }
    return (
      <Workspace
        portal="admin"
        user={user}
        profile={null}
        capabilities={capabilities}
        onProfileChanged={setProfile}
      />
    );
  }

  if (!isGoogleAccount(user)) {
    return (
      <PortalMismatch
        title="بوابة المعلمين تتطلب حساب Google"
        description="سجّل الخروج ثم استخدم زر «المتابعة باستخدام Google» للدخول أو إنشاء حساب معلم."
        destination={academyUrl("/admin")}
        destinationLabel="الانتقال إلى دخول الإدارة"
      />
    );
  }
  if (!profile && capabilities.size > 0) {
    return (
      <PortalMismatch
        title="هذا حساب إدارة الأكاديمية"
        description="لم يُنشأ لهذا الحساب ملف معلم. استخدم بوابة الإدارة المنفصلة للوصول إلى صلاحياتك."
        destination={academyUrl("/admin")}
        destinationLabel="فتح بوابة الإدارة"
      />
    );
  }
  if (!profile) {
    return <ProfileForm user={user} existing={null} onSaved={setProfile} />;
  }
  if (profile.status === "SUSPENDED") {
    return (
      <main className="centered-page">
        <section className="auth-card setup-card">
          <School className="large-icon" />
          <h1>الحساب موقوف مؤقتًا</h1>
          <p className="muted">تواصل مع إدارة أكاديمية تمكين لمعرفة التفاصيل.</p>
          <button className="secondary-button" onClick={() => academySupabase.auth.signOut()}>
            <LogOut /> تسجيل الخروج
          </button>
        </section>
      </main>
    );
  }

  return (
    <Workspace
      portal="teacher"
      user={user}
      profile={profile.status === "ACTIVE" ? profile : null}
      capabilities={new Set<AcademyCapability>()}
      onProfileChanged={setProfile}
    />
  );
}
