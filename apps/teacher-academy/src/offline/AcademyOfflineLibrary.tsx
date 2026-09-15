import { useEffect, useRef, useState, useCallback } from "react";
import { Download, RefreshCw, Trash2 } from "lucide-react";
import { listMyLearning } from "../lib/academy-api";
import type { LearningProgram } from "../types";
import {
  activeOwner,
  deleteDownloads,
  hashBlob,
  queue,
  readAll,
  readFile,
  type Entry,
  type Pack,
} from "./store";
import { downloadProgram, syncAcademy } from "./service";

function SavedResource({ owner, url }: { owner: string; url: string }) {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    setHref(null);
    let active = true;
    let objectUrl: string | undefined;
    void readFile(owner, url)
      .then(async (file) => {
        if (!file || (await hashBlob(file.blob)) !== file.sha256) return;
        if (!active) return;
        objectUrl = URL.createObjectURL(file.blob);
        setHref(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [owner, url]);
  return href ? (
    <a className="resource-link" href={href} target="_blank" rel="noreferrer">
      فتح الملف المحفوظ
    </a>
  ) : (
    <span className="muted">هذا المورد غير محمّل؛ يحتاج اتصالًا بالإنترنت.</span>
  );
}
export function AcademyOfflineLibrary({ owner }: { owner: string }) {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [programs, setPrograms] = useState<LearningProgram[]>([]);
  const [pending, setPending] = useState<Entry[]>([]);
  const [notes, setNotes] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const operation = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const refresh = useCallback(async () => {
    const [p, e, n] = await Promise.all([
      readAll("packs", owner),
      readAll("events", owner),
      readAll("notes", owner),
    ]);
    if (alive.current && activeOwner() === owner) {
      setPacks(p);
      setPending(e);
      setNotes(n);
    }
  }, [owner]);
  const sync = useCallback(async () => {
    setError("");
    try {
      await syncAcademy(owner);
      await refresh();
      if (alive.current) setMessage("اكتملت محاولة المزامنة؛ راجع عدد العناصر المنتظرة أدناه.");
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "تعذرت المزامنة");
    }
  }, [owner, refresh]);
  useEffect(() => {
    alive.current = true;
    void refresh().catch(() => setError("تعذر فتح التخزين المحلي."));
    if (navigator.onLine) {
      void listMyLearning()
        .then((p) => {
          if (alive.current) setPrograms(p);
        })
        .catch(() => undefined);
      void sync();
    }
    const changed = () => {
      void refresh().catch(() => undefined);
    };
    const online = () => void sync();
    const timer = window.setInterval(() => {
      if (navigator.onLine)
        void readAll("events", owner)
          .then((entries) => {
            if (alive.current && entries.length) void sync();
          })
          .catch(() => undefined);
    }, 30000);
    window.addEventListener("online", online);
    window.addEventListener("academy-offline-change", changed);
    return () => {
      window.clearInterval(timer);
      alive.current = false;
      operation.current?.abort();
      window.removeEventListener("online", online);
      window.removeEventListener("academy-offline-change", changed);
    };
  }, [owner, refresh, sync]);
  async function download(program: LearningProgram, refreshFiles = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    const c = new AbortController();
    operation.current = c;
    try {
      const p = await downloadProgram(
        owner,
        program,
        c.signal,
        (s) => alive.current && setMessage(s),
        refreshFiles,
      );
      if (alive.current)
        setMessage(
          p.omitted.length
            ? `حُفظت الدروس، وبقي ${p.omitted.length} موارد تحتاج الإنترنت أو إعادة التنزيل.`
            : "المحتوى جاهز دون إنترنت.",
        );
      await refresh();
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "تعذر التنزيل");
    } finally {
      if (alive.current) setBusy(false);
      operation.current = null;
    }
  }
  async function complete(lessonId: string) {
    try {
      if (activeOwner() !== owner) throw new Error("تغير الحساب");
      await queue({
        owner,
        id: `complete:${lessonId}`,
        lessonId,
        kind: "complete",
        createdAt: new Date().toISOString(),
      });
      await refresh();
      if (navigator.onLine) void sync();
    } catch {
      setError("تعذر حفظ التقدم على الجهاز.");
    }
  }
  const pack = packs.find((p) => p.id === selected);
  return (
    <section className="page-stack" dir="rtl">
      <a className="secondary-button" href="/academy/">
        العودة إلى الأكاديمية عند الاتصال
      </a>
      <header className="page-heading">
        <h1>المحتوى دون إنترنت</h1>
        <p className="muted">
          نزّل برنامجك أثناء الاتصال. تُحفظ القراءة والتقدم والملاحظات على هذا الجهاز، وتُزامن عند
          فتح الأكاديمية بوجود شبكة.
        </p>
      </header>
      <div className="notice">
        {packs.length} برامج محفوظة · {pending.length} تغييرات بانتظار المزامنة. الاختبارات المعتمدة
        والشهادات واللقاءات تحتاج الإنترنت.
      </div>
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="notice error-notice">
          {error}
        </p>
      )}
      <div className="actions">
        <button className="secondary-button" onClick={() => void sync()} disabled={busy}>
          <RefreshCw /> مزامنة الآن
        </button>
        <button
          className="secondary-button"
          onClick={() => setConfirmDelete(true)}
          disabled={busy || !packs.length}
        >
          <Trash2 /> حذف التنزيلات
        </button>
      </div>
      {confirmDelete && (
        <div role="alertdialog" aria-label="تأكيد حذف التنزيلات" className="notice">
          <p>حذف الدروس والملفات من الجهاز؟ ستبقى الملاحظات والتغييرات المنتظرة محفوظة.</p>
          <button className="secondary-button" onClick={() => setConfirmDelete(false)}>
            إلغاء
          </button>
          <button
            className="secondary-button"
            onClick={() =>
              void deleteDownloads(owner)
                .then(() => {
                  setConfirmDelete(false);
                  return refresh();
                })
                .catch(() => setError("تعذر حذف التنزيلات"))
            }
          >
            تأكيد الحذف
          </button>
        </div>
      )}
      {busy && (
        <button className="secondary-button" onClick={() => operation.current?.abort()}>
          إيقاف التنزيل
        </button>
      )}
      {!pack ? (
        <>
          {programs.map((p) => (
            <article className="lesson-card" key={p.program_version_id}>
              <div>
                <h2>{p.title}</h2>
                <p>
                  {p.total_lessons} دروس. تتضمن الدروس النصية والملفات المباشرة القابلة للتنزيل حتى
                  25 ميجابايت للملف؛ قد تبقى الروابط الخارجية والفيديو بحاجة إلى شبكة.
                </p>
                <button className="primary-button" disabled={busy} onClick={() => void download(p)}>
                  <Download />{" "}
                  {packs.some((s) => s.id === p.program_version_id)
                    ? "استكمال التنزيل"
                    : "تحميل البرنامج"}
                </button>
                {packs.some((s) => s.id === p.program_version_id) && (
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => void download(p, true)}
                  >
                    إعادة تحميل أحدث الملفات
                  </button>
                )}
              </div>
            </article>
          ))}
          {packs.map((p) => (
            <article className="lesson-card" key={p.id}>
              <div>
                <h2>{p.program.title}</h2>
                <p>
                  {p.lessons.length} دروس محفوظة
                  {p.omitted.length ? ` · ${p.omitted.length} موارد غير محمّلة` : ""}
                </p>
                <button className="secondary-button" onClick={() => setSelected(p.id)}>
                  فتح المحتوى المحفوظ
                </button>
              </div>
            </article>
          ))}
          {!packs.length && !programs.length && (
            <p>لا توجد برامج محفوظة. اتصل بالإنترنت وسجّل في برنامج ثم حمّله من هنا.</p>
          )}
        </>
      ) : (
        <>
          <button className="secondary-button" onClick={() => setSelected(null)}>
            العودة للبرامج
          </button>
          <h2>{pack.program.title}</h2>
          {pack.lessons.map((l) => {
            const queued = pending.some((e) => e.kind === "complete" && e.lessonId === l.lesson_id);
            return (
              <article className="lesson-card" key={l.lesson_id}>
                <div className="lesson-main">
                  <h3>{l.title}</h3>
                  <p style={{ whiteSpace: "pre-wrap" }}>{l.content}</p>
                  {l.sections.map((s) => (
                    <section className="learning-section" key={s.section_id}>
                      <h4>{s.title}</h4>
                      <p style={{ whiteSpace: "pre-wrap" }}>{s.content}</p>
                      {s.resource_url && <SavedResource owner={owner} url={s.resource_url} />}
                    </section>
                  ))}
                  {l.resource_url && <SavedResource owner={owner} url={l.resource_url} />}
                  <button
                    className="secondary-button"
                    disabled={l.completed || queued}
                    onClick={() => void complete(l.lesson_id)}
                  >
                    {queued
                      ? "إكمال محفوظ — بانتظار المزامنة"
                      : l.completed
                        ? "مكتمل"
                        : "إكمال الدرس"}
                  </button>
                  <LessonNotes
                    owner={owner}
                    lessonId={l.lesson_id}
                    notes={notes.filter((n) => n.lessonId === l.lesson_id)}
                    onSaved={async () => {
                      await refresh();
                      if (navigator.onLine) void sync();
                    }}
                  />
                </div>
              </article>
            );
          })}
        </>
      )}
    </section>
  );
}
function LessonNotes({
  owner,
  lessonId,
  notes,
  onSaved,
}: {
  owner: string;
  lessonId: string;
  notes: Entry[];
  onSaved: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <section>
      <label>
        ملاحظة جديدة
        <textarea value={text} maxLength={10000} onChange={(e) => setText(e.target.value)} />
      </label>
      <button
        className="secondary-button"
        disabled={!text.trim() || saving}
        onClick={async () => {
          setSaving(true);
          setError("");
          try {
            if (activeOwner() !== owner) throw Error();
            await queue({
              owner,
              id: crypto.randomUUID(),
              lessonId,
              kind: "note",
              text: text.trim(),
              createdAt: new Date().toISOString(),
            });
            setText("");
            await onSaved();
          } catch {
            setError("لم تُحفظ الملاحظة. حاول مجددًا.");
          } finally {
            setSaving(false);
          }
        }}
      >
        حفظ الملاحظة
      </button>
      {error && <p role="alert">{error}</p>}
      {notes.map((n) => (
        <p key={n.id} style={{ whiteSpace: "pre-wrap" }}>
          {n.text}
          <small> — {n.synced ? "تمت المزامنة" : "محفوظة على الجهاز"}</small>
        </p>
      ))}
    </section>
  );
}
