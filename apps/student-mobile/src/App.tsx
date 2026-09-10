import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  deviceOfflineStateRepository as repository,
  emptyOfflineState,
  readableOfflinePacks,
  setActiveOfflineOwner,
  type OfflineStateSnapshot,
} from "@/lib/offline/offline-state-store";
import {
  downloadOfflineSubjectPack,
  type OfflinePackDownloadProgress,
} from "@/lib/offline/offline-pack-downloader";
import {
  readOfflineLessonContent,
  type OfflineLessonContent,
} from "@/lib/offline/offline-lesson-content";
import {
  readOfflineLessonAssessment,
  type OfflineLessonAssessment,
  type OfflineStudentQuestion,
} from "@/lib/offline/offline-assessment-engine";
import {
  saveOfflineOfficialQuestionNote,
  recordOfflineSelfTestAttempt,
} from "@/lib/offline/offline-learning-journal";
import { OfflineSyncBridge } from "@/components/offline/OfflineSyncBridge";
import {
  assertOwner,
  attachNativeAuth,
  subjectCatalog,
  signIn,
  openSavedPdf,
  removeSavedPack,
} from "./runtime";
import "./styles.css";
import logo from "../../../mobile/www/student-tamkeen-mark.png";

function Question({
  question,
  assessment,
  ownerId,
  lessonId,
  selfTest,
}: {
  question: OfflineStudentQuestion;
  assessment: OfflineLessonAssessment;
  ownerId: string;
  lessonId: string;
  selfTest: boolean;
}) {
  const [answer, setAnswer] = useState(question.selectedOptionId ?? question.savedAnswer ?? "");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (!answer.trim()) {
      setError("أدخل محاولتك أولاً.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await assertOwner(ownerId);
      if (selfTest) {
        const result = assessment.checkSelfTestAnswer(question.id, question.revisionId, answer);
        await recordOfflineSelfTestAttempt({
          ownerId,
          lessonId,
          questionId: question.id,
          revisionId: question.revisionId,
          selectedOptionId: answer,
          isCorrect: result.isCorrect,
        });
        await assertOwner(ownerId);
        setFeedback(
          [
            result.isCorrect ? "إجابة صحيحة" : "إجابة غير صحيحة",
            result.explanation,
            result.correction,
            "حُفظت محاولتك على الجهاز.",
          ]
            .filter(Boolean)
            .join("\n\n"),
        );
      } else {
        const result = assessment.revealOfficialAnswer(question.id, question.revisionId, answer);
        await saveOfflineOfficialQuestionNote({
          ownerId,
          lessonId,
          questionId: question.id,
          revisionId: question.revisionId,
          answerText: answer,
        });
        await assertOwner(ownerId);
        setFeedback(
          [
            "الإجابة النموذجية: " + result.modelAnswer,
            result.explanation,
            "حُفظت إجابتك على الجهاز.",
          ]
            .filter(Boolean)
            .join("\n\n"),
        );
      }
    } catch {
      setError("تعذر حفظ الإجابة. أبقِ الصفحة مفتوحة وأعد المحاولة.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <p>{question.questionText}</p>
      {question.options.length ? (
        <div className="options" role="group" aria-label="اختر إجابة">
          {question.options.map((option) => (
            <button
              key={option.id}
              disabled={busy}
              className={answer === option.id ? "selected" : ""}
              aria-pressed={answer === option.id}
              onClick={() => {
                setAnswer(option.id);
                setFeedback("");
              }}
            >
              {option.text}
            </button>
          ))}
        </div>
      ) : (
        <textarea
          aria-label="إجابتك"
          value={answer}
          maxLength={64000}
          onChange={(event) => {
            setAnswer(event.target.value);
            setFeedback("");
          }}
        />
      )}
      <button className="primary" disabled={busy} onClick={() => void submit()}>
        {busy ? "جارٍ الحفظ…" : selfTest ? "تحقق من الإجابة" : "حفظ وعرض الإجابة النموذجية"}
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {feedback && (
        <p role="status" className="answer">
          {feedback}
        </p>
      )}
    </section>
  );
}

function ContentFrame({
  title,
  body,
  laboratory,
  online,
}: {
  title: string;
  body: string;
  laboratory?: boolean;
  online: boolean;
}) {
  const needsNetwork = /(?:https?:)?\/\/[^\s"'<>]+/i.test(body);
  const [allowNetwork, setAllowNetwork] = useState(false);
  const html = /<[a-z][\s\S]*>/i.test(body)
    ? body
    : "<pre style='white-space:pre-wrap;font:16px system-ui'>" +
      body.replace(/&/g, "&amp;").replace(/</g, "&lt;") +
      "</pre>";
  const policy =
    "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; " +
    (laboratory ? "script-src 'unsafe-inline'; " : "script-src 'none'; ") +
    (laboratory && online && allowNetwork
      ? "frame-src https://phet.colorado.edu; "
      : "frame-src 'none'; ") +
    "connect-src 'none'; base-uri 'none'; form-action 'none';";
  return (
    <section className="card">
      <h3>{title}</h3>
      {needsNetwork && laboratory && (
        <p className="notice">
          تحتوي هذه التجربة على موارد خارجية. محاكاة PhET تحتاج اتصالاً بالإنترنت.
          {online && <button onClick={() => setAllowNetwork(true)}>تشغيل المحاكاة المتصلة</button>}
        </p>
      )}
      <iframe
        className="content"
        title={title}
        sandbox={laboratory ? "allow-scripts" : ""}
        referrerPolicy="no-referrer"
        srcDoc={
          '<!doctype html><html dir="rtl"><head><meta http-equiv="Content-Security-Policy" content="' +
          policy +
          '"></head><body>' +
          html +
          "</body></html>"
        }
      />
    </section>
  );
}

export default function App() {
  const [snapshot, setSnapshot] = useState<OfflineStateSnapshot>(emptyOfflineState());
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [session, setSession] = useState<Session | null>(null);
  const [message, setMessage] = useState("");
  const [catalog, setCatalog] = useState<Array<{ id: string; name: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<OfflinePackDownloadProgress | null>(null);
  const [download, setDownload] = useState<AbortController | null>(null);
  const [lesson, setLesson] = useState<{
    id: string;
    ownerId: string;
    content: OfflineLessonContent;
    assessment: OfflineLessonAssessment;
  } | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const ownerId = snapshot.activeOwnerId;
  const packs = readableOfflinePacks(snapshot).filter((pack) => pack.ownerId === ownerId);
  const pending = snapshot.outbox.filter(
    (record) => record.ownerId === ownerId && record.status !== "delivered",
  ).length;

  useEffect(() => {
    let disposed = false;
    const refresh = () => {
      void repository
        .read()
        .then((next) => {
          if (!disposed) {
            setSnapshot((current) => (next.revision >= current.revision ? next : current));
            setLoaded(true);
          }
        })
        .catch(() => {
          if (!disposed) {
            setLoaded(true);
            setMessage("تعذر قراءة البيانات المحفوظة. لم تُحذف إجاباتك؛ أعد فتح التطبيق.");
          }
        });
    };
    refresh(); // First paint and saved lessons never wait for Auth or a server.
    if (!Capacitor.isNativePlatform() && "serviceWorker" in navigator && import.meta.env.PROD) {
      void navigator.serviceWorker.register("./sw.js").catch(() => {
        if (!disposed)
          setMessage("تعذر تجهيز فتح التطبيق دون اتصال في المتصفح. أعد فتحه مع توفر الإنترنت.");
      });
    }
    window.addEventListener("tamkeen-offline-state", refresh);
    const connectivity = () => setOnline(navigator.onLine);
    window.addEventListener("online", connectivity);
    window.addEventListener("offline", connectivity);
    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      if (disposed) return;
      setSession(next);
      // Defer repository work outside the Auth callback lock.
      setTimeout(() => {
        if (disposed) return;
        if (next)
          void setActiveOfflineOwner(next.user.id).catch(() =>
            setMessage("تعذر حفظ الحساب على الجهاز."),
          );
        else if (event === "SIGNED_OUT") void setActiveOfflineOwner(null);
      }, 0);
    });
    const native = attachNativeAuth(() => setMessage("تعذر إكمال تسجيل الدخول. أعد المحاولة."));
    return () => {
      disposed = true;
      listener.subscription.unsubscribe();
      void native.then((remove) => remove());
      window.removeEventListener("tamkeen-offline-state", refresh);
      window.removeEventListener("online", connectivity);
      window.removeEventListener("offline", connectivity);
    };
  }, []);
  useEffect(() => {
    setLesson(null);
    setCatalog([]);
    setPdfUrl(null);
  }, [ownerId]);
  useEffect(
    () => () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    },
    [pdfUrl],
  );
  useEffect(() => () => download?.abort(), [download]);

  async function action(work: () => Promise<unknown>) {
    setMessage("");
    setBusy(true);
    try {
      await work();
    } catch (error) {
      setMessage(
        error instanceof Error && error.message === "OFFLINE_PROFILE_INCOMPLETE"
          ? "أكمل الصف والمسار في ملفك الشخصي على تمكين، ثم حدّث قائمة المواد."
          : "تعذر إكمال العملية. المحتوى السابق وإجاباتك المحفوظة باقية؛ تحقق من الاتصال ومساحة الجهاز ثم أعد المحاولة.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function openLesson(id: string) {
    if (!ownerId) return;
    const [content, assessment] = await Promise.all([
      readOfflineLessonContent(ownerId, id),
      readOfflineLessonAssessment(ownerId, id),
    ]);
    await assertOwner(ownerId);
    setLesson({ id, ownerId, content, assessment });
    window.scrollTo(0, 0);
  }
  async function downloadSubject(subjectId: string) {
    if (!ownerId || session?.user.id !== ownerId) throw new Error("OFFLINE_UNAUTHENTICATED");
    const controller = new AbortController();
    setDownload(controller);
    setProgress(null);
    try {
      if (!Capacitor.isNativePlatform()) await navigator.storage?.persist?.();
      await downloadOfflineSubjectPack({
        subjectId,
        expectedOwnerId: ownerId,
        signal: controller.signal,
        onProgress: setProgress,
      });
      await assertOwner(ownerId);
      setMessage("اكتمل تنزيل المادة والتحقق من ملفاتها. يمكنك فتحها دون إنترنت.");
    } finally {
      setDownload(null);
      setProgress(null);
    }
  }
  async function logout() {
    download?.abort();
    setLesson(null);
    setPdfUrl(null);
    setCatalog([]);
    await setActiveOfflineOwner(null);
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;
  }
  if (!loaded)
    return (
      <main>
        <h1>تمكين</h1>
        <p role="status">جارٍ فتح المواد المحفوظة…</p>
      </main>
    );
  const visibleLesson = lesson?.ownerId === ownerId ? lesson : null;
  return (
    <main>
      <OfflineSyncBridge />
      <header>
        <img src={logo} alt="" width="54" height="54" />
        <div>
          <h1>تمكين</h1>
          <small>تعلّم من موادك المحفوظة في أي وقت</small>
        </div>
        <span className="status">{online ? "متصل" : "دون اتصال"}</span>
      </header>
      <div className="row">
        {ownerId && (
          <small role="status">
            {pending ? pending + " عملية محفوظة تنتظر المزامنة" : "لا توجد إجابات تنتظر المزامنة"}
          </small>
        )}
        {ownerId && (
          <button disabled={busy} onClick={() => void action(logout)}>
            تسجيل الخروج
          </button>
        )}
        {(!session || session.user.id !== ownerId) && (
          <button
            disabled={!online || busy}
            className="primary"
            onClick={() => void action(signIn)}
          >
            تسجيل الدخول بحساب Google
          </button>
        )}
      </div>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {!ownerId && (
        <section className="card">
          <h2>مرحبًا بك</h2>
          <p>سجّل الدخول أول مرة مع توفر الإنترنت، ثم نزّل المواد التي تريد دراستها دون اتصال.</p>
        </section>
      )}
      {visibleLesson ? (
        <>
          <button onClick={() => setLesson(null)}>العودة إلى المواد</button>
          <h2>{visibleLesson.content.lessonTitle ?? "الدرس المحفوظ"}</h2>
          {[
            visibleLesson.content.officialBook,
            ...visibleLesson.content.explanations,
            ...visibleLesson.content.summaries,
            ...visibleLesson.content.mindMaps,
          ]
            .filter((item) => item !== null)
            .map((item) => (
              <ContentFrame
                key={item.artifactId}
                title={item.title}
                body={item.body}
                online={online}
              />
            ))}
          {visibleLesson.content.experiments.map((item) => (
            <ContentFrame
              key={item.artifactId}
              title={item.title}
              body={item.body}
              laboratory
              online={online}
            />
          ))}
          {visibleLesson.assessment.officialQuestions.length > 0 && <h2>أسئلة الكتاب</h2>}
          {visibleLesson.assessment.officialQuestions.map((question) => (
            <Question
              key={question.id + question.revisionId}
              question={question}
              assessment={visibleLesson.assessment}
              ownerId={ownerId!}
              lessonId={visibleLesson.id}
              selfTest={false}
            />
          ))}
          {visibleLesson.assessment.selfTestQuestions.length > 0 && <h2>اختبر فهمك</h2>}
          {visibleLesson.assessment.selfTestQuestions.map((question) => (
            <Question
              key={question.id + question.revisionId}
              question={question}
              assessment={visibleLesson.assessment}
              ownerId={ownerId!}
              lessonId={visibleLesson.id}
              selfTest
            />
          ))}
        </>
      ) : (
        ownerId && (
          <>
            <h2>موادك المحفوظة</h2>
            {!packs.length && <p>لا توجد مواد مكتملة التنزيل لهذا الحساب بعد.</p>}
            {packs.map((pack) => {
              const lessons = [
                ...new Map(
                  pack.manifest.artifacts
                    .filter((artifact) => artifact.lessonId)
                    .map((artifact) => [
                      artifact.lessonId!,
                      artifact.lessonTitle ?? artifact.title,
                    ]),
                ).entries(),
              ];
              const pdfs = pack.manifest.artifacts.filter((artifact) =>
                artifact.kind.endsWith("-pdf"),
              );
              return (
                <section className="card" key={pack.manifest.packId}>
                  <h3>{pack.manifest.scope.subjectTitle ?? "مادة محفوظة"}</h3>
                  <p className="muted">
                    {lessons.length} درس · {(pack.downloadedBytes / 1048576).toFixed(1)} م.ب · إصدار{" "}
                    {pack.manifest.revision}
                  </p>
                  <div className="lessons">
                    {lessons.map(([id, title]) => (
                      <button
                        key={id}
                        disabled={busy}
                        onClick={() => void action(() => openLesson(id))}
                      >
                        {title}
                      </button>
                    ))}
                  </div>
                  <div className="row">
                    {pdfs.map((artifact) => (
                      <button
                        key={artifact.artifactId}
                        disabled={busy}
                        onClick={() =>
                          void action(async () => setPdfUrl(await openSavedPdf(ownerId, artifact)))
                        }
                      >
                        {artifact.title}
                      </button>
                    ))}
                  </div>
                  <div className="row">
                    {pack.manifest.scope.subjectId && (
                      <button
                        disabled={!online || busy}
                        onClick={() =>
                          void action(() => downloadSubject(pack.manifest.scope.subjectId!))
                        }
                      >
                        تحديث المادة
                      </button>
                    )}
                    <button
                      className="danger"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm("حذف ملفات هذه المادة من الجهاز؟ ستبقى إجاباتك المحفوظة.")
                        ) {
                          void action(() => removeSavedPack(ownerId, pack.manifest.packId));
                        }
                      }}
                    >
                      إزالة التنزيل
                    </button>
                  </div>
                </section>
              );
            })}
            <section className="card">
              <h2>تنزيل المواد</h2>
              <p>
                نزّل المادة مرة واحدة مع توفر الإنترنت. إذا انقطع التنزيل، أعد المحاولة لاستكمال
                الملفات الناقصة.
              </p>
              <button
                disabled={!online || busy || !session}
                onClick={() => void action(async () => setCatalog(await subjectCatalog(ownerId)))}
              >
                عرض مواد صفي
              </button>
              {catalog.map((subject) => (
                <div key={subject.id} className="row">
                  <p>{subject.name}</p>
                  <button
                    disabled={!online || busy}
                    onClick={() => void action(() => downloadSubject(subject.id))}
                  >
                    تنزيل المادة
                  </button>
                </div>
              ))}
              {progress && (
                <div role="status">
                  <progress max={progress.totalBytes} value={progress.loadedBytes} />
                  <p>
                    جارٍ التنزيل والتحقق:{" "}
                    {Math.round((progress.loadedBytes * 100) / Math.max(1, progress.totalBytes))}%
                  </p>
                </div>
              )}
              {download && <button onClick={() => download.abort()}>إيقاف التنزيل مؤقتًا</button>}
            </section>
          </>
        )
      )}
      {pdfUrl && (
        <section className="card">
          <button onClick={() => setPdfUrl(null)}>إغلاق الكتاب</button>
          <iframe className="content" title="الكتاب المحفوظ" src={pdfUrl} />
        </section>
      )}
    </main>
  );
}
