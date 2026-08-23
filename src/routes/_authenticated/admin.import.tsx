import { createFileRoute } from "@tanstack/react-router";
import { FileSpreadsheet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  ContentImportDryRunPanel,
  type ContentImportScope,
} from "@/components/admin/ContentImportDryRunPanel";
import { GoldenLessonPackageBuilder } from "@/components/admin/GoldenLessonPackageBuilder";
import { useRequireAdminSection } from "@/lib/admin-route-access";
import { getContentCodeRegistry } from "@/lib/content-codes/content-codes.functions";
import type { ContentCodeRegistry } from "@/lib/content-codes/content-codes.types";

export const Route = createFileRoute("/_authenticated/admin/import")({
  component: AdminImportPage,
});

const STEPS = [
  { number: 1, label: "الوحدات أو الفصول — اختياري" },
  { number: 2, label: "الدروس" },
  { number: 3, label: "المحتويات السبعة" },
  { number: 4, label: "الفحص والحفظ كمسودة" },
] as const;

function AdminImportPage() {
  const { loading, enabled } = useRequireAdminSection("content");
  const [registry, setRegistry] = useState<ContentCodeRegistry | null>(null);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [gradeSlug, setGradeSlug] = useState("");
  const [trackCodes, setTrackCodes] = useState<string[]>([]);
  const [semester, setSemester] = useState<"" | "1" | "2">("");
  const [subjectCode, setSubjectCode] = useState("");

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void getContentCodeRegistry()
      .then((value) => {
        if (active) setRegistry(value);
      })
      .catch(() => {
        if (active) setScopeError("تعذر تحميل سياق المنهج؛ أعد فتح الصفحة.");
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  const scopedSubjects = useMemo(
    () => (registry?.subjects ?? []).filter((subject) =>
      subject.isOfficialCode &&
      subject.gradeSlug === gradeSlug &&
      trackCodes.length > 0 &&
      trackCodes.every((code) => subject.trackCodes.includes(code)),
    ),
    [gradeSlug, registry, trackCodes],
  );

  const scope: ContentImportScope | null =
    gradeSlug && trackCodes.length > 0 && semester && subjectCode
      ? {
          gradeSlug,
          trackCodes,
          semester: Number(semester) as 1 | 2,
          subjectCode,
        }
      : null;

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
          جاري التحميل…
        </div>
      </AdminLayout>
    );
  }

  if (!enabled) return null;

  return (
    <AdminLayout>
      <main className="mx-auto max-w-5xl space-y-8 pb-24" dir="rtl">
        <header className="space-y-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">استيراد المنهج ومحتويات الدروس</h1>
          </div>
          <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
            هذا هو مكان الاستيراد الموحد لفريق المحتوى: ارفع الوحدات إن كانت المادة
            تحتوي عليها، ثم الدروس، ثم اختر سياقًا ثابتًا وارفع محتويات الدرس بصيغها الصحيحة. إذا كانت المادة بلا
            وحدات فتجاوز الخطوة الأولى واترك <span className="font-mono">unit_code</span> فارغًا
            في ملف الدروس.
          </p>
          <ol aria-label="خطوات الاستيراد الموحد" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <li key={step.number} className="flex min-h-[58px] items-center gap-3 rounded-xl border bg-card px-4 py-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {step.number}
                </span>
                <span className="text-sm font-medium">{step.label}</span>
              </li>
            ))}
          </ol>
        </header>

        <section aria-labelledby="import-scope-heading" className="space-y-3 rounded-2xl border bg-card p-4">
          <div>
            <h2 id="import-scope-heading" className="text-lg font-bold">
              تثبيت سياق الاستيراد
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              اختر السياق مرة واحدة: الصف ← المسار/المسارات ← الفصل ← المادة.
              تُربط الوحدات والدروس بهذه الأكواد، وليس بالأسماء المكتوبة داخل Excel.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1 text-sm">
              الصف
              <select
                id="curriculum-import-grade"
                value={gradeSlug}
                onChange={(event) => {
                  setGradeSlug(event.target.value);
                  setTrackCodes([]);
                  setSemester("");
                  setSubjectCode("");
                }}
                className="flex min-h-[44px] w-full rounded-md border bg-background px-3"
              >
                <option value="">اختر الصف</option>
                {(registry?.grades ?? []).map((grade) => (
                  <option key={grade.gradeSlug} value={grade.gradeSlug}>{grade.nameAr}</option>
                ))}
              </select>
            </label>
            <fieldset className="space-y-1" disabled={!gradeSlug}>
              <legend className="text-sm">المسار/المسارات</legend>
              <div className="flex min-h-[44px] items-center gap-3 rounded-md border px-3">
                {(registry?.tracks ?? [])
                  .filter((track) => track.trackCode === "sanaa" || track.trackCode === "aden")
                  .map((track) => (
                    <label key={track.trackCode} className="flex items-center gap-1 text-sm">
                      <input
                        id={`curriculum-import-track-${track.trackCode}`}
                        type="checkbox"
                        checked={trackCodes.includes(track.trackCode)}
                        onChange={() => {
                          setTrackCodes((current) =>
                            current.includes(track.trackCode)
                              ? current.filter((code) => code !== track.trackCode)
                              : [...current, track.trackCode].sort(),
                          );
                          setSemester("");
                          setSubjectCode("");
                        }}
                      />
                      {track.nameAr}
                    </label>
                  ))}
              </div>
            </fieldset>
            <label className="space-y-1 text-sm">
              الفصل
              <select
                id="curriculum-import-semester"
                value={semester}
                disabled={trackCodes.length === 0}
                onChange={(event) => {
                  setSemester(event.target.value as "" | "1" | "2");
                  setSubjectCode("");
                }}
                className="flex min-h-[44px] w-full rounded-md border bg-background px-3"
              >
                <option value="">اختر الفصل</option>
                <option value="1">الفصل الأول</option>
                <option value="2">الفصل الثاني</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              المادة
              <select
                id="curriculum-import-subject"
                value={subjectCode}
                disabled={!semester}
                onChange={(event) => setSubjectCode(event.target.value)}
                className="flex min-h-[44px] w-full rounded-md border bg-background px-3"
              >
                <option value="">اختر المادة</option>
                {scopedSubjects.map((subject) => (
                  <option key={subject.subjectCode} value={subject.subjectCode}>{subject.name}</option>
                ))}
              </select>
            </label>
          </div>
          {scopeError && <p role="alert" className="text-sm text-destructive">{scopeError}</p>}
          <p aria-label="مسار الربط المحدد" className="text-sm font-medium">
            {scope
              ? `${scope.gradeSlug} ← ${scope.trackCodes.join(" + ")} ← الفصل ${scope.semester} ← ${scope.subjectCode}`
              : "أكمل الحقول الأربعة لتفعيل فحص ملفات الوحدات والدروس."}
          </p>
        </section>

        <section className="space-y-3" aria-labelledby="units-import-heading">
          <div>
            <h2 id="units-import-heading" className="text-lg font-bold">
              1. استيراد الوحدات أو الفصول
              <span className="mr-2 rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                اختياري
              </span>
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              استخدم هذه الخطوة فقط للمواد المقسمة إلى وحدات أو فصول. المواد الأخرى
              تنتقل مباشرة إلى استيراد الدروس.
            </p>
          </div>
          <ContentImportDryRunPanel
            allowedTemplateKeys={["units"]}
            initialTemplateKey="units"
            heading="استيراد ملف الوحدات"
            description="ارفع ملف Excel الخاص بالوحدات، ثم نفّذ: فحص ← تجهيز ← تنفيذ."
            idPrefix="units-import"
            requireScope
            scope={scope}
          />
        </section>

        <section className="space-y-3" aria-labelledby="lessons-import-heading">
          <div>
            <h2 id="lessons-import-heading" className="text-lg font-bold">
              2. استيراد الدروس
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              يقبل الدروس المرتبطة بوحدة، كما يقبل الدروس المرتبطة بالمادة مباشرة.
              يبدأ ترتيب الدرس من 1.
            </p>
          </div>
          <ContentImportDryRunPanel
            allowedTemplateKeys={["lessons"]}
            initialTemplateKey="lessons"
            heading="استيراد ملف الدروس"
            description="ارفع ملف Excel الخاص بالدروس. اترك unit_code فارغًا للمادة التي لا تحتوي وحدات."
            idPrefix="lessons-import"
            requireScope
            scope={scope}
          />
        </section>

        <section className="space-y-3" aria-labelledby="contents-import-heading">
          <div>
            <h2 id="contents-import-heading" className="text-lg font-bold">
              3. استيراد محتويات الدروس السبعة
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              ثبّت الصف والمسار/المسارات والفصل والمادة، ثم الوحدة الاختيارية والدرس.
              المحتويات 1–5 ملفات HTML، وأسئلة الكتاب و«اختبر فهمك» فقط بصيغة XLSX.
              تُحفظ النتائج كمسودات ولا تظهر للطالب قبل الاعتماد.
            </p>
          </div>
          <GoldenLessonPackageBuilder />
        </section>
      </main>
    </AdminLayout>
  );
}
