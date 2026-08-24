import { useEffect, useMemo, useState } from "react";
import { Link2, Loader2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { getContentCodeRegistry } from "@/lib/content-codes/content-codes.functions";
import type { ContentCodeRegistry } from "@/lib/content-codes/content-codes.types";
import type { CurriculumImportScope } from "@/lib/import/curriculum-import-scope";
import { isCompleteCurriculumImportScope } from "@/lib/import/curriculum-import-scope";

interface CurriculumImportScopeFormProps {
  value: CurriculumImportScope | null;
  onChange: (scope: CurriculumImportScope | null) => void;
}

export function CurriculumImportScopeForm({
  value,
  onChange,
}: CurriculumImportScopeFormProps) {
  const [registry, setRegistry] = useState<ContentCodeRegistry | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getContentCodeRegistry()
      .then((next) => {
        if (!active) return;
        setRegistry(next);
        setError(null);
      })
      .catch((reason) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "تعذر تحميل هيكل المنهج.");
      });
    return () => {
      active = false;
    };
  }, []);

  const scope: CurriculumImportScope = value ?? {
    gradeSlug: "",
    trackCodes: [],
    semester: 1,
    subjectCode: "",
  };

  const subjects = useMemo(
    () =>
      (registry?.subjects ?? []).filter(
        (subject) =>
          subject.isOfficialCode &&
          (!scope.gradeSlug || subject.gradeSlug === scope.gradeSlug) &&
          (scope.trackCodes.length === 0 ||
            scope.trackCodes.every((code) => subject.trackCodes.includes(code))),
      ),
    [registry, scope.gradeSlug, scope.trackCodes],
  );
  const selectedSubject =
    subjects.find((subject) => subject.subjectCode === scope.subjectCode) ?? null;

  const update = (patch: Partial<CurriculumImportScope>) => {
    const next = { ...scope, ...patch };
    if (
      patch.gradeSlug !== undefined ||
      patch.trackCodes !== undefined
    ) {
      const stillAvailable = (registry?.subjects ?? []).some(
        (subject) =>
          subject.subjectCode === next.subjectCode &&
          subject.gradeSlug === next.gradeSlug &&
          next.trackCodes.every((code) => subject.trackCodes.includes(code)),
      );
      if (!stillAvailable) next.subjectCode = "";
    }
    onChange(next);
  };

  return (
    <Card className="border-primary/30 bg-card" aria-labelledby="curriculum-import-scope-heading">
      <CardHeader className="pb-3">
        <CardTitle id="curriculum-import-scope-heading" className="flex items-center gap-2 text-base">
          <Link2 className="h-4 w-4 text-primary" />
          سياق استيراد الوحدات والدروس
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
            إلزامي
          </span>
        </CardTitle>
        <CardDescription>
          اختر السياق الرسمي مرة واحدة. هذا الاختيار هو مصدر الربط، أما subject_code داخل Excel
          فيُستخدم للمراجعة فقط ويُستبدل بالكود الرسمي عند التجهيز.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!registry && !error ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري تحميل الصفوف والمسارات والمواد…
          </p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="curriculum-import-grade">الصف</Label>
            <select
              id="curriculum-import-grade"
              value={scope.gradeSlug}
              onChange={(event) => update({ gradeSlug: event.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">اختر الصف</option>
              {(registry?.grades ?? []).map((grade) => (
                <option key={grade.gradeSlug} value={grade.gradeSlug}>
                  {grade.nameAr}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">المسار (اختيار متعدد)</legend>
            <div className="flex min-h-10 flex-wrap items-center gap-3 rounded-md border bg-background px-3 py-2">
              {(registry?.tracks ?? []).map((track) => {
                const checked = scope.trackCodes.includes(track.trackCode);
                return (
                  <label key={track.trackCode} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        update({
                          trackCodes: checked
                            ? scope.trackCodes.filter((code) => code !== track.trackCode)
                            : [...scope.trackCodes, track.trackCode],
                        })
                      }
                    />
                    {track.nameAr}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="curriculum-import-semester">الفصل الدراسي</Label>
            <select
              id="curriculum-import-semester"
              value={scope.semester}
              onChange={(event) => update({ semester: Number(event.target.value) as 1 | 2 })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value={1}>الفصل الأول</option>
              <option value={2}>الفصل الثاني</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="curriculum-import-subject">المادة</Label>
            <select
              id="curriculum-import-subject"
              value={scope.subjectCode}
              disabled={!scope.gradeSlug || scope.trackCodes.length === 0}
              onChange={(event) => update({ subjectCode: event.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">اختر المادة</option>
              {subjects.map((subject) => (
                <option key={subject.subjectCode} value={subject.subjectCode}>
                  {subject.name} — {subject.subjectCode}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            isCompleteCurriculumImportScope(value)
              ? "border-emerald-500/30 bg-emerald-500/10"
              : "border-amber-500/30 bg-amber-500/10"
          }`}
        >
          {isCompleteCurriculumImportScope(value) && selectedSubject ? (
            <p>
              الربط المعتمد: {registry?.grades.find((grade) => grade.gradeSlug === scope.gradeSlug)?.nameAr}
              {" ← "}
              {scope.trackCodes
                .map((code) => registry?.tracks.find((track) => track.trackCode === code)?.nameAr ?? code)
                .join(" + ")}
              {" ← "}
              الفصل {scope.semester}
              {" ← "}
              {selectedSubject.name} ({selectedSubject.subjectCode})
            </p>
          ) : (
            <p>أكمل الصف والمسار والفصل والمادة قبل فحص ملف الوحدات أو الدروس.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
