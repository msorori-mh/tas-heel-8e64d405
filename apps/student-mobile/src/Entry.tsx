import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Download,
  GraduationCap,
  LineChart,
  WifiOff,
} from "lucide-react";
import heroStudent from "@/assets/hero-tamkeen.png";
import logo from "../../../mobile/www/student-tamkeen-mark.png";
import type { ConnectedDestination } from "./runtime";

type Props = {
  online: boolean;
  busy: boolean;
  onStudent: () => void;
  onConnected: (destination: ConnectedDestination) => void;
};

export function Brand() {
  return (
    <div className="brand">
      <img src={logo} alt="" width="44" height="44" />
      <div>
        <strong>تمكين الطالب</strong>
        <small lang="en">Student Tamkeen</small>
      </div>
    </div>
  );
}

export function Entry({ online, busy, onStudent, onConnected }: Props) {
  const [student, setStudent] = useState(false);
  return (
    <main className="entry" dir="rtl">
      <header className="entry-header">
        <Brand />
        <span className="offline-hint">
          <WifiOff size={15} />
          {online ? "يدعم التعلّم دون اتصال" : "أنت دون اتصال"}
        </span>
      </header>
      {student ? (
        <section className="auth-card">
          <img src={logo} alt="" width="64" height="64" />
          <p className="eyebrow">مساحة الطلاب</p>
          <h1>مرحبًا بك في تمكين</h1>
          <p className="muted">سجّل بحساب Google وابدأ التعلّم.</p>
          <button className="primary google-button" disabled={!online || busy} onClick={onStudent}>
            <span className="google-mark" aria-hidden="true">
              G
            </span>
            {busy ? "جارٍ فتح Google…" : "المتابعة باستخدام Google"}
          </button>
          {!online && (
            <p className="notice" role="status">
              يلزم الاتصال بالإنترنت لتسجيل الدخول أول مرة.
            </p>
          )}
          <button className="text-button" onClick={() => setStudent(false)}>
            <ArrowRight size={17} />
            العودة لاختيار نوع الحساب
          </button>
          <p className="legal">
            بالمتابعة، أنت توافق على{" "}
            <button onClick={() => onConnected("terms")}>شروط الاستخدام</button> و
            <button onClick={() => onConnected("privacy")}>سياسة الخصوصية</button>.
          </p>
        </section>
      ) : (
        <>
          <section className="landing-hero">
            <img
              className="hero-student"
              src={heroStudent}
              alt="طالب ثانوي يذاكر عبر منصة تمكين"
              width="1024"
              height="1024"
            />
            <div className="hero-copy">
              <span className="brand-pill">تمكين الطالب</span>
              <h1>طريقك المنظم للتفوّق</h1>
              <p>
                راجع دروسك، تدرب على اختبارات محاكاة، واعرف نقاط ضعفك يومًا بعد يوم — بمحتوى يناسب
                منهجك الدراسي.
              </p>
              <div className="entry-actions">
                <button className="primary" onClick={() => setStudent(true)}>
                  <BookOpen size={20} />
                  دخول الطالب
                </button>
                <button
                  className="teacher-button"
                  disabled={!online || busy}
                  onClick={() => onConnected("teacher")}
                >
                  <GraduationCap size={21} />
                  دخول المعلم
                </button>
              </div>
              <p className="account-hint">تطبيق تمكين واحد بمساحتين منفصلتين للطلاب والمعلمين.</p>
              {!online && (
                <p className="notice">تسجيل الدخول وخدمات المعلم تحتاج اتصالاً بالإنترنت.</p>
              )}
            </div>
          </section>
          <ul className="learning-pillars">
            {[
              [BookOpen, "تعلّم"],
              [ClipboardList, "تدرّب"],
              [LineChart, "تحسّن"],
              [GraduationCap, "استعد للاختبار الوزاري"],
            ].map(([Icon, label]) => {
              const Mark = Icon as typeof BookOpen;
              return (
                <li key={String(label)}>
                  <Mark size={19} />
                  <span>{String(label)}</span>
                </li>
              );
            })}
          </ul>
          <section className="entry-features">
            <h2>كل ما تحتاجه في رحلتك الدراسية</h2>
            <div className="feature-grid">
              <article>
                <BookOpen />
                <h3>محتوى دراسي منظم</h3>
                <p>دروس ووحدات مرتبة حسب المادة والصف والمنهج.</p>
              </article>
              <article>
                <ClipboardList />
                <h3>اختبارات ونماذج وزارية</h3>
                <p>تدرّب على الأسئلة وراجع استعدادك للاختبار.</p>
              </article>
              <article>
                <LineChart />
                <h3>تابع تقدمك</h3>
                <p>اعرف نقاط القوة وما يحتاج إلى مراجعة.</p>
              </article>
            </div>
          </section>
        </>
      )}
      <footer className="entry-footer">تمكين الطالب · تعلّم، تدرّب، تحسّن</footer>
    </main>
  );
}

export function StudentHome({
  online,
  busy,
  savedCount,
  onSaved,
  onConnected,
}: {
  online: boolean;
  busy: boolean;
  savedCount: number;
  onSaved: () => void;
  onConnected: Props["onConnected"];
}) {
  return (
    <section className="student-home">
      <div className="home-greeting">
        <p className="eyebrow">مساحة الطالب</p>
        <h1>مرحبًا بك في تمكين</h1>
        <p>خطوة واحدة اليوم تصنع الفرق.</p>
      </div>
      <h2>موادك الدراسية</h2>
      <div className="semester-grid">
        <button disabled={!online || busy} onClick={() => onConnected("semester1")}>
          <BookOpen />
          <strong>الفصل الدراسي الأول</strong>
          <span>تصفح المواد والدروس</span>
        </button>
        <button disabled={!online || busy} onClick={() => onConnected("semester2")}>
          <BookOpen />
          <strong>الفصل الدراسي الثاني</strong>
          <span>واصل رحلتك الدراسية</span>
        </button>
      </div>
      <button className="saved-entry" onClick={onSaved}>
        <span className="saved-icon">
          <Download />
        </span>
        <span>
          <strong>موادي المحفوظة</strong>
          <small>
            {savedCount
              ? `${savedCount} مادة متاحة على هذا الجهاز`
              : "نزّل موادك ثم تعلّم منها دون إنترنت"}
          </small>
        </span>
        <ArrowRight className="arrow-forward" size={20} />
      </button>
      {!online && (
        <p className="notice">
          <WifiOff size={17} /> أنت دون اتصال. افتح موادك المحفوظة لمتابعة التعلّم.
        </p>
      )}
      <h2>أدوات التعلّم</h2>
      <div className="learning-tools">
        <button disabled={!online || busy} onClick={() => onConnected("exams")}>
          <ClipboardList />
          <strong>الاختبارات الوزارية</strong>
          <small>نماذج وتدريب للاختبار</small>
        </button>
        <button disabled={!online || busy} onClick={() => onConnected("student")}>
          <CheckCircle2 />
          <strong>خدماتي ونتائجي</strong>
          <small>متابعة التقدم والخدمات المتصلة</small>
        </button>
      </div>
    </section>
  );
}
