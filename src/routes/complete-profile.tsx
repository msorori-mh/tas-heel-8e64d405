import { isStudentProfileComplete, withProfileTimeout } from "@/lib/profile-completion";
import { SchoolPicker } from "@/components/schools/SchoolPicker";
import { schoolChoiceFromProfile, schoolProfilePatch } from "@/lib/schools/school-choice";
import { schoolDirectoryApi } from "@/lib/schools/student-school-api";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { translateAuthError } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fetchTracksForGovernorate,
  translateTrackError,
  type CurriculumTrack,
} from "@/lib/curriculum-tracks";

export const Route = createFileRoute("/complete-profile")({
  component: CompleteProfile,
});

type Grade = { id: string; name: string };
type Gov = { id: string; name: string };

function splitName(full: string | null | undefined): [string, string, string] {
  if (!full) return ["", "", ""];
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0) return ["", "", ""];
  if (parts.length === 1) return [parts[0], "", ""];
  if (parts.length === 2) return [parts[0], "", parts[1]];
  const first = parts[0];
  const last = parts[parts.length - 1];
  const middle = parts.slice(1, -1).join(" ");
  return [first, middle, last];
}

function CompleteProfile() {
  const navigate = useNavigate();
  const { user, profile, loading, refreshProfile, profileComplete, signOut } = useAuth();
  const userId = user?.id;
  const [grades, setGrades] = useState<Grade[]>([]);
  const [govs, setGovs] = useState<Gov[]>([]);
  const [firstName, setFirstName] = useState("");
  const [secondName, setSecondName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gradeId, setGradeId] = useState<string>("");
  const [govId, setGovId] = useState<string>("");
  const [school, setSchool] = useState(() => schoolChoiceFromProfile());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const initializedFor = useRef<string | null>(null);
  const saving = useRef(false);
  const attemptedSave = useRef(false);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [optionsAttempt, setOptionsAttempt] = useState(0);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [tracksError, setTracksError] = useState<string | null>(null);
  const [tracksGovernorate, setTracksGovernorate] = useState("");
  const [tracksAttempt, setTracksAttempt] = useState(0);
  const [allowedTracks, setAllowedTracks] = useState<CurriculumTrack[]>([]);
  const [trackId, setTrackId] = useState<string>("");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { mode: "login" }, replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!loading && profileComplete && !attemptedSave.current)
      navigate({ to: "/app", replace: true });
  }, [loading, profileComplete, navigate]);

  useEffect(() => {
    if (!loading && user && initializedFor.current !== user.id) {
      initializedFor.current = user.id;
      attemptedSave.current = false;
      const [f, s, l] = splitName(profile?.full_name);
      setFirstName(f);
      setSecondName(s);
      setLastName(l);
      setGradeId(profile?.grade_uuid || (profile?.grade_id ? String(profile.grade_id) : ""));
      setGovId(profile?.governorate_id ?? "");
      setSchool(schoolChoiceFromProfile(profile));
    }
  }, [loading, profile, user]);

  useEffect(() => {
    if (loading || !userId) return;
    let cancelled = false;
    const controller = new AbortController();
    setOptionsLoading(true);
    setOptionsError(null);
    setGrades([]);
    setGovs([]);
    void withProfileTimeout(async () => {
      const [g, gv] = await Promise.all([
        supabase
          .from("grades")
          .select("id,name")
          .order("sort_order")
          .abortSignal(controller.signal),
        supabase
          .from("governorates")
          .select("id,name")
          .order("sort_order")
          .abortSignal(controller.signal),
      ]);
      if (g.error) throw g.error;
      if (gv.error) throw gv.error;
      if (!g.data?.length || !gv.data?.length) throw new Error("empty_profile_options");
      if (!cancelled && !controller.signal.aborted) {
        setGrades(g.data as Grade[]);
        setGovs(gv.data as Gov[]);
      }
    }, controller)
      .catch(() => {
        if (!cancelled)
          setOptionsError("تعذّر تحميل الصفوف والمحافظات. تحقق من الاتصال ثم أعد المحاولة.");
      })
      .finally(() => {
        if (!cancelled) setOptionsLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [loading, userId, optionsAttempt]);

  // A result belongs only to its governorate; failed reads must not silently choose a default.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setAllowedTracks([]);
    setTrackId("");
    setTracksGovernorate("");
    setTracksError(null);
    if (
      loading ||
      !userId ||
      !govId ||
      optionsLoading ||
      optionsError ||
      !govs.some((g) => g.id === govId)
    ) {
      setTracksLoading(false);
      return;
    }
    setTracksLoading(true);
    void withProfileTimeout(async () => {
      const tracks = await fetchTracksForGovernorate(govId, controller.signal);
      if (!tracks.length) throw new Error("empty_curriculum_tracks");
      if (cancelled || controller.signal.aborted) return;
      setAllowedTracks(tracks);
      setTracksGovernorate(govId);
      const current = profile?.curriculum_track_id ?? "";
      setTrackId(
        tracks.length === 1 ? tracks[0].id : tracks.some((t) => t.id === current) ? current : "",
      );
    }, controller)
      .catch(() => {
        if (!cancelled)
          setTracksError("تعذّر تحميل المناهج لهذه المحافظة. أعد المحاولة قبل الحفظ.");
      })
      .finally(() => {
        if (!cancelled) setTracksLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    loading,
    userId,
    govId,
    govs,
    optionsLoading,
    optionsError,
    tracksAttempt,
    profile?.curriculum_track_id,
  ]);

  const optionsReady = !optionsLoading && !optionsError && grades.length > 0 && govs.length > 0;
  const tracksReady =
    !tracksLoading && !tracksError && tracksGovernorate === govId && allowedTracks.length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || saving.current) return;
    saving.current = true;
    attemptedSave.current = true;
    setBusy(true);
    setErr(null);
    try {
      const fullName = [firstName, secondName, lastName]
        .map((x) => x.trim())
        .filter(Boolean)
        .join(" ");
      if (!firstName.trim() || !lastName.trim()) throw new Error("الاسم الأول واللقب مطلوبان");
      if (!optionsReady) throw new Error("انتظر تحميل الصفوف والمحافظات ثم أعد المحاولة.");
      if (!grades.some((g) => g.id === gradeId)) throw new Error("اختر الصف الدراسي");

      if (!govs.some((g) => g.id === govId)) throw new Error("اختر المحافظة");
      if (!tracksReady) throw new Error("انتظر تحميل المنهج الدراسي ثم أعد المحاولة.");
      if (allowedTracks.length > 1 && !trackId) {
        throw new Error("اختر المنهج الدراسي");
      }

      // Persist the validated track explicitly, including single-track governorates.
      const effectiveTrackId: string | null =
        trackId && allowedTracks.some((t) => t.id === trackId) ? trackId : null;

      if (!effectiveTrackId) throw new Error("اختر المنهج الدراسي");

      const gov = govs.find((x) => x.id === govId);
      const payload = {
        user_id: user.id,
        full_name: fullName,
        grade_id: gradeId,
        grade_uuid: gradeId,
        governorate_id: govId,
        governorate: gov?.name ?? null,
        ...schoolProfilePatch(school, govId, profile),
        ...(effectiveTrackId ? { curriculum_track_id: effectiveTrackId } : {}),
      };
      const controller = new AbortController();
      const { error } = await withProfileTimeout(
        () =>
          supabase
            .from("profiles")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .upsert(payload as any, { onConflict: "user_id" })
            .abortSignal(controller.signal),
        controller,
      );
      if (error) throw error;
      const saved = await withProfileTimeout(() => refreshProfile());
      if (
        !saved ||
        saved.user_id !== user.id ||
        !isStudentProfileComplete(saved) ||
        saved.full_name !== payload.full_name ||
        saved.grade_uuid !== gradeId ||
        saved.governorate_id !== govId ||
        saved.curriculum_track_id !== effectiveTrackId ||
        (saved.school_id ?? null) !== payload.school_id ||
        saved.school_name !== payload.school_name ||
        // Directory-backed schools store missing optional locations as empty strings;
        // manual-school payloads use null. Both represent the same absent value.
        (saved.school_district || null) !== payload.school_district ||
        (saved.school_locality || null) !== payload.school_locality
      ) {
        throw new Error(
          "تعذّر التأكد من اكتمال حفظ بياناتك. بيانات النموذج محفوظة هنا؛ حاول الحفظ مجددًا.",
        );
      }
      navigate({ to: "/app", replace: true });
    } catch (e2) {
      // Distinguish curriculum-track trigger errors for clarity.
      const msg = e2 instanceof Error ? e2.message : "";
      if (msg.includes("curriculum_track")) {
        setErr(translateTrackError(e2));
      } else {
        setErr(e2 instanceof Error ? e2.message : translateAuthError(e2));
      }
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  if (loading || !user) {
    return <div className="min-h-screen flex items-center justify-center">جارٍ التحميل...</div>;
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8" dir="rtl">
      <div className="mx-auto max-w-lg rounded-2xl border bg-card p-6 shadow-card">
        <h1 className="text-2xl font-bold">أكمل بياناتك</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          نحتاج بعض المعلومات لنعرض لك المنهج المناسب.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <fieldset disabled={busy} className="contents">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="fn">الاسم الأول</Label>
                <Input
                  id="fn"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="sn">الاسم الثاني</Label>
                <Input id="sn" value={secondName} onChange={(e) => setSecondName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="ln">اللقب</Label>
                <Input
                  id="ln"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="gr">الصف الدراسي</Label>
              <select
                id="gr"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                disabled={busy || !optionsReady}
                value={gradeId}
                onChange={(e) => setGradeId(e.target.value)}
                required
              >
                <option value="">-- اختر الصف --</option>
                {grades.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="gv">المحافظة</Label>
              <select
                id="gv"
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                disabled={busy || !optionsReady}
                value={govId}
                onChange={(e) => {
                  setGovId(e.target.value);
                  setSchool(schoolChoiceFromProfile());
                }}
                required
              >
                <option value="">-- اختر المحافظة --</option>
                {govs.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            {optionsLoading && (
              <p role="status" className="text-sm text-muted-foreground">
                جارٍ تحميل الصفوف والمحافظات...
              </p>
            )}
            {optionsError && (
              <div role="alert" className="space-y-2 text-sm text-destructive">
                <p>{optionsError}</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOptionsAttempt((n) => n + 1)}
                >
                  إعادة تحميل الصفوف والمحافظات
                </Button>
              </div>
            )}
            {tracksLoading && (
              <p role="status" className="text-sm text-muted-foreground">
                جارٍ تحميل المناهج...
              </p>
            )}
            {tracksError && (
              <div role="alert" className="space-y-2 text-sm text-destructive">
                <p>{tracksError}</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setTracksAttempt((n) => n + 1)}
                >
                  إعادة تحميل المناهج
                </Button>
              </div>
            )}

            <SchoolPicker
              value={school}
              onChange={setSchool}
              governorateId={govId}
              searchSchools={schoolDirectoryApi.search}
              disabled={busy || !optionsReady}
            />

            {allowedTracks.length > 1 && (
              <div>
                <Label htmlFor="tr">المنهج الدراسي</Label>
                <select
                  id="tr"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  disabled={busy || !tracksReady}
                  value={trackId}
                  onChange={(e) => setTrackId(e.target.value)}
                  required
                >
                  <option value="">-- اختر المنهج --</option>
                  {allowedTracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.track_name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  محافظتك يُدرَّس فيها أكثر من منهج. اختر المنهج المعتمد في مدرستك.
                </p>
              </div>
            )}

            {err && (
              <p role="alert" className="text-sm text-destructive">
                {err}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={busy || !optionsReady || !tracksReady}
            >
              {busy ? "جارٍ الحفظ..." : "حفظ ومتابعة"}
            </Button>

            <button
              type="button"
              className="w-full text-sm text-muted-foreground"
              onClick={async () => {
                await signOut();
                navigate({ to: "/auth", search: { mode: "login" } });
              }}
            >
              تسجيل الخروج
            </button>
          </fieldset>
        </form>
      </div>
    </div>
  );
}
