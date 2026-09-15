import { useEffect, useRef, useState } from "react";
import { fetchTracksForGovernorate, type CurriculumTrack } from "@/lib/curriculum-tracks";
import { loadProfileSetup, saveStudentProfile, type ProfileDraft } from "./profile";

export function ProfileEditor({
  ownerId,
  online,
  onSaved,
  onClose,
}: {
  ownerId: string;
  online: boolean;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [setup, setSetup] = useState<Awaited<ReturnType<typeof loadProfileSetup>> | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>({
    fullName: "",
    gradeId: "",
    governorateId: "",
    trackId: "",
    school: "",
  });
  const [tracks, setTracks] = useState<CurriculumTrack[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const lifetime = useRef(new AbortController());
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!online || setup) return;
    const controller = new AbortController();
    setError("");
    void loadProfileSetup(ownerId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setSetup(result);
          setDraft(result.draft);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("تعذر تحميل بياناتك. تحقق من الاتصال ثم أعد المحاولة.");
      });
    return () => controller.abort();
  }, [ownerId, retry, online, setup]);

  useEffect(() => {
    let cancelled = false;
    setTracks([]);
    if (!draft.governorateId || !online) return;
    setLoadingTracks(true);
    void fetchTracksForGovernorate(draft.governorateId)
      .then((items) => {
        if (cancelled) return;
        setTracks(items);
        setDraft((current) => ({
          ...current,
          trackId: items.some((item) => item.id === current.trackId)
            ? current.trackId
            : items.length === 1
              ? items[0].id
              : "",
        }));
        if (!items.length) setError("لا يوجد منهج متاح لهذه المحافظة حاليًا.");
      })
      .catch(() => {
        if (!cancelled) setError("تعذر تحميل المناهج. أعد المحاولة قبل الحفظ.");
      })
      .finally(() => {
        if (!cancelled) setLoadingTracks(false);
      });
    return () => {
      cancelled = true;
    };
  }, [draft.governorateId, retry, online]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!setup || !online || busy) return;
    setBusy(true);
    setError("");
    const signal = lifetime.current.signal;
    try {
      await saveStudentProfile(ownerId, draft, setup, signal);
      if (!signal.aborted) onSaved();
    } catch {
      if (!signal.aborted)
        setError("لم يتم تأكيد حفظ البيانات. تحقق من الاختيارات والاتصال ثم أعد المحاولة.");
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>بياناتك الدراسية</h2>
      <p>
        اختر صفك ومحافظتك ومنهجك لعرض المواد المناسبة. حفظ هذه البيانات يحتاج اتصالًا بالإنترنت.
      </p>
      {!online && <p className="notice">أنت دون اتصال. يمكنك العودة إلى المواد المحفوظة.</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!setup && online && !error && <p role="status">جارٍ تحميل البيانات…</p>}
      {setup && (
        <form onSubmit={(event) => void submit(event)}>
          <fieldset disabled={busy || !online} className="profile-fields">
            <label>
              الاسم الكامل
              <input
                required
                maxLength={160}
                autoComplete="name"
                value={draft.fullName}
                onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
              />
            </label>
            <label>
              الصف
              <select
                aria-label="الصف"
                required
                value={draft.gradeId}
                onChange={(e) => setDraft({ ...draft, gradeId: e.target.value })}
              >
                <option value="">اختر الصف</option>
                {setup.grades.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              المحافظة
              <select
                aria-label="المحافظة"
                required
                value={draft.governorateId}
                onChange={(e) => {
                  setError("");
                  setDraft({ ...draft, governorateId: e.target.value, trackId: "" });
                }}
              >
                <option value="">اختر المحافظة</option>
                {setup.governorates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              المنهج الدراسي
              <select
                aria-label="المنهج الدراسي"
                required
                disabled={loadingTracks || !tracks.length}
                value={draft.trackId}
                onChange={(e) => setDraft({ ...draft, trackId: e.target.value })}
              >
                <option value="">{loadingTracks ? "جارٍ تحميل المناهج…" : "اختر المنهج"}</option>
                {tracks.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.track_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              المدرسة (اختياري)
              <input
                maxLength={240}
                value={draft.school}
                onChange={(e) => setDraft({ ...draft, school: e.target.value })}
              />
            </label>
            <button className="primary" disabled={loadingTracks || !draft.trackId} type="submit">
              {busy ? "جارٍ الحفظ…" : "حفظ البيانات وعرض المواد"}
            </button>
          </fieldset>
        </form>
      )}
      <div className="row">
        {error && (
          <button disabled={!online || busy} onClick={() => setRetry(retry + 1)}>
            إعادة المحاولة
          </button>
        )}
        <button disabled={busy} onClick={onClose}>
          العودة إلى المواد
        </button>
      </div>
    </section>
  );
}
