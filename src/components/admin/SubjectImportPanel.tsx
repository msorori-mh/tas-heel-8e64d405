import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { SubjectImportScope } from "@/lib/import/curriculum-import-scope";
import { ContentImportDryRunPanel } from "./ContentImportDryRunPanel";

interface GradeOption {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
}

interface TrackOption {
  id: string;
  track_name: string;
  track_code: string;
}

export function SubjectImportPanel() {
  const [gradeSlug, setGradeSlug] = useState("");
  const [trackCodes, setTrackCodes] = useState<string[]>([]);
  const options = useQuery({
    queryKey: ["subject-import-scope-options"],
    queryFn: async () => {
      const [grades, tracks] = await Promise.all([
        supabase.from("grades").select("id, name, slug, sort_order").order("sort_order"),
        supabase
          .from("curriculum_tracks")
          .select("id, track_name, track_code")
          .in("track_code", ["sanaa", "aden"])
          .eq("is_active", true)
          .order("track_name"),
      ]);
      if (grades.error) throw grades.error;
      if (tracks.error) throw tracks.error;
      return {
        grades: (grades.data ?? []) as GradeOption[],
        tracks: (tracks.data ?? []) as TrackOption[],
      };
    },
  });
  const scope = useMemo<SubjectImportScope | null>(
    () => (gradeSlug && trackCodes.length ? { gradeSlug, trackCodes } : null),
    [gradeSlug, trackCodes],
  );

  return (
    <section className="space-y-4" aria-labelledby="subjects-import-heading">
      <div className="space-y-1">
        <h2 id="subjects-import-heading" className="flex items-center gap-2 text-lg font-bold">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          1. استيراد المواد وربطها بالمسارات
        </h2>
        <p className="text-sm text-muted-foreground">
          اختر الصف والمسارات أولاً؛ هذا السياق هو المرجع الملزم لكل صف في ملف القالب 01.
        </p>
      </div>

      <div className="grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm font-medium">
          <span>الصف</span>
          <select
            value={gradeSlug}
            onChange={(event) => setGradeSlug(event.target.value)}
            disabled={options.isLoading || options.isError}
            className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">اختر الصف</option>
            {(options.data?.grades ?? []).map((grade) => (
              <option key={grade.id} value={grade.slug}>{grade.name}</option>
            ))}
          </select>
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">المسار أو المسارات</legend>
          <div className="flex min-h-11 flex-wrap gap-2">
            {(options.data?.tracks ?? []).map((track) => {
              const selected = trackCodes.includes(track.track_code);
              return (
                <button
                  key={track.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    setTrackCodes((current) =>
                      selected
                        ? current.filter((code) => code !== track.track_code)
                        : [...current, track.track_code],
                    )
                  }
                  className={`min-h-11 rounded-lg border px-4 py-2 text-sm font-medium ${
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  {track.track_name}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            للمادة المشتركة اختر صنعاء وعدن معًا؛ ينشئ النظام مادة واحدة ويربطها بالمسارين.
          </p>
        </fieldset>
      </div>

      {options.isError ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          تعذّر تحميل الصفوف والمسارات الرسمية. أعد تحميل الصفحة قبل الاستيراد.
        </p>
      ) : null}

      <ContentImportDryRunPanel
        allowedTemplateKeys={["subjects"]}
        initialTemplateKey="subjects"
        heading="استيراد ملف المواد — قالب 01"
        description="نزّل القالب المولّد، اكتب أسماء المواد وترتيبها، ثم نفّذ: فحص ← تجهيز ← تنفيذ."
        idPrefix="subjects-import"
        curriculumScope={scope}
      />
    </section>
  );
}
