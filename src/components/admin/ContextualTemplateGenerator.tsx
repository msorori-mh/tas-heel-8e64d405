/**
 * OFFICIAL_CONTENT_CODE_SYSTEM_13B — context-aware template generator.
 *
 * The operator picks Grade → (Tracks) → (Subject → Unit) and downloads a template
 * whose content codes are already allocated by the system (TCS-2).
 * Tracks are availability only — they are never part of a content code.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Loader2, Wand2 } from "lucide-react";
import {
  downloadContextualTemplate,
  getContentCodeRegistry,
} from "@/lib/content-codes/content-codes.functions";
import {
  CONTEXT_TEMPLATE_KEYS,
  type ContextTemplateKey,
} from "@/lib/content-codes/content-codes.types";
import { CONTENT_CODE_SCHEME_VERSION } from "@/lib/content-codes/tcs2";

const TEMPLATE_LABEL: Record<ContextTemplateKey, string> = {
  subjects: "01 — المواد",
  units: "02 — الوحدات",
  lessons: "03 — الدروس",
  book_contents: "04 — محتوى الكتاب",
  explanations: "05 — الشروحات",
  resources: "06 — الموارد",
  assessments: "07 — التقييمات",
  questions: "09 — الأسئلة",
};

const SUBJECT_REQUIRED: ReadonlySet<ContextTemplateKey> = new Set([
  "units",
  "lessons",
  "questions",
]);

const ROW_COUNTS = [5, 10, 20, 50] as const;

function triggerDownload(base64: string, filename: string): void {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function ContextualTemplateGenerator() {
  const fetchRegistry = useServerFn(getContentCodeRegistry);
  const buildTemplate = useServerFn(downloadContextualTemplate);

  const [templateKey, setTemplateKey] = useState<ContextTemplateKey>("subjects");
  const [gradeSlug, setGradeSlug] = useState<string>("");
  const [trackCodes, setTrackCodes] = useState<string[]>([]);
  const [subjectCode, setSubjectCode] = useState<string>("");
  const [unitCode, setUnitCode] = useState<string>("");
  const [rowCount, setRowCount] = useState<number>(20);
  const [subjectMode, setSubjectMode] = useState<"single" | "group">("single");
  const [groupName, setGroupName] = useState<string>("");
  const [branchText, setBranchText] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const branchNames = useMemo(
    () =>
      branchText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    [branchText],
  );


  const registryQuery = useQuery({
    queryKey: ["content-code-registry"],
    queryFn: () => fetchRegistry(),
    staleTime: 60_000,
  });

  const registry = registryQuery.data;

  const subjects = useMemo(
    () =>
      (registry?.subjects ?? []).filter(
        (s) =>
          (!gradeSlug || s.gradeSlug === gradeSlug) &&
          (trackCodes.length === 0 || trackCodes.some((t) => s.trackCodes.includes(t))) &&
          s.isOfficialCode,
      ),
    [registry, gradeSlug, trackCodes],
  );

  const units = useMemo(
    () => (registry?.units ?? []).filter((u) => !subjectCode || u.subjectCode === subjectCode),
    [registry, subjectCode],
  );

  const allocation = useMemo(
    () =>
      (registry?.allocations ?? []).find((a) => a.gradeSlug === gradeSlug),
    [registry, gradeSlug],
  );

  const needsSubject = SUBJECT_REQUIRED.has(templateKey);
  const tracksRequired = templateKey === "subjects";
  const isSubjectsTemplate = templateKey === "subjects";
  const isGroupMode = isSubjectsTemplate && subjectMode === "group";
  const effectiveRowCount = isGroupMode ? branchNames.length : rowCount;
  const canDownload =
    Boolean(gradeSlug) &&
    (!tracksRequired || trackCodes.length > 0) &&
    (!needsSubject || Boolean(subjectCode)) &&
    (!isGroupMode || (groupName.trim().length > 0 && branchNames.length > 0)) &&
    !busy;

  const handleDownload = async () => {
    setBusy(true);
    try {
      const result = await buildTemplate({
        data: {
          templateKey,
          gradeSlug,
          trackCodes,
          ...(subjectCode ? { subjectCode } : {}),
          ...(unitCode ? { unitCode } : {}),
          rowCount: Math.max(1, effectiveRowCount),
          ...(isSubjectsTemplate
            ? {
                subjectMode,
                ...(isGroupMode
                  ? { groupName: groupName.trim(), branchNames }
                  : {}),
              }
            : {}),
        },
      });

      triggerDownload(result.fileBase64, result.filename);
      toast.success(
        result.allocatedCodes.length
          ? `تم توليد ${result.allocatedCodes.length} كوداً رسمياً داخل القالب.`
          : "تم تنزيل القالب مع مرجع الأكواد.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر توليد القالب.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      dir="rtl"
      aria-labelledby="contextual-template-heading"
      className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-4"
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Wand2 className="h-5 w-5 text-primary shrink-0" />
          <h3 id="contextual-template-heading" className="text-base font-semibold text-foreground">
            قالب جاهز بأكواد النظام
          </h3>
          <Badge variant="secondary" className="text-[11px] font-mono">
            {CONTENT_CODE_SCHEME_VERSION}
          </Badge>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          اختر الصف (والمسارات للمواد، والمادة عند الحاجة) وسيولّد النظام الأكواد الرسمية
          ويعبّئها في الملف. الكود لا يحتوي على المسار: المادة المشتركة تُدخل مرة واحدة وتُربط
          بأكثر من مسار.
        </p>
      </div>

      {registryQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">جاري تحميل البيانات المرجعية…</p>
      ) : registryQuery.isError ? (
        <p className="text-sm text-destructive">تعذر تحميل سجل الأكواد.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">القالب</Label>
              <Select
                value={templateKey}
                onValueChange={(v) => setTemplateKey(v as ContextTemplateKey)}
              >
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTEXT_TEMPLATE_KEYS.map((key) => (
                    <SelectItem key={key} value={key}>
                      {TEMPLATE_LABEL[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">الصف</Label>
              <Select value={gradeSlug} onValueChange={setGradeSlug}>
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue placeholder="اختر الصف" />
                </SelectTrigger>
                <SelectContent>
                  {(registry?.grades ?? []).map((g) => (
                    <SelectItem key={g.gradeSlug} value={g.gradeSlug}>
                      {g.nameAr} ({g.gradeShort})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                المسارات{" "}
                {tracksRequired ? (
                  <span className="text-destructive">*</span>
                ) : (
                  <span className="text-muted-foreground">(تصفية فقط)</span>
                )}
              </Label>
              <div className="flex flex-wrap gap-2 pt-1">
                {(registry?.tracks ?? []).map((t) => {
                  const active = trackCodes.includes(t.trackCode);
                  return (
                    <Button
                      key={t.trackCode}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      className="min-h-[36px]"
                      onClick={() =>
                        setTrackCodes((prev) =>
                          prev.includes(t.trackCode)
                            ? prev.filter((c) => c !== t.trackCode)
                            : [...prev, t.trackCode],
                        )
                      }
                    >
                      {t.nameAr}
                    </Button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                اختر كل المسارات التي تتوفر فيها المادة (مشتركة = صنعاء + عدن).
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                المادة {needsSubject ? <span className="text-destructive">*</span> : "(اختياري)"}
              </Label>
              <Select
                value={subjectCode}
                onValueChange={(v) => {
                  setSubjectCode(v);
                  setUnitCode("");
                }}
                disabled={subjects.length === 0}
              >
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue
                    placeholder={subjects.length ? "اختر المادة" : "لا توجد مواد بعد"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.subjectCode} value={s.subjectCode}>
                      {s.name} — {s.subjectCode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">الوحدة (اختياري)</Label>
              <Select
                value={unitCode}
                onValueChange={setUnitCode}
                disabled={templateKey !== "lessons" || units.length === 0}
              >
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue placeholder={units.length ? "اختر الوحدة" : "لا توجد وحدات"} />
                </SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.unitCode} value={u.unitCode}>
                      {u.title} — {u.unitCode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">عدد الصفوف الجاهزة</Label>
              {isGroupMode ? (
                <div className="flex min-h-[44px] items-center rounded-md border border-input bg-muted/40 px-3 text-sm">
                  {branchNames.length} صفاً (محسوب من عدد الفروع)
                </div>
              ) : (
                <Select value={String(rowCount)} onValueChange={(v) => setRowCount(Number(v))}>
                  <SelectTrigger className="min-h-[44px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROW_COUNTS.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} صفاً
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {isSubjectsTemplate && (
            <div className="space-y-3 rounded-lg border border-border bg-background/60 p-3">
              <div className="space-y-1.5">
                <Label className="text-xs">نوع الإدخال</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={subjectMode === "single" ? "default" : "outline"}
                    className="min-h-[36px]"
                    onClick={() => setSubjectMode("single")}
                  >
                    مادة مستقلة
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={subjectMode === "group" ? "default" : "outline"}
                    className="min-h-[36px]"
                    onClick={() => setSubjectMode("group")}
                  >
                    مجموعة مواد / فروع
                  </Button>
                </div>
              </div>

              {isGroupMode && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs" htmlFor="group-name">
                      اسم المجموعة <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="group-name"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      placeholder="مثال: التربية الإسلامية"
                      className="min-h-[44px]"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      يولّد النظام كود مجموعة واحداً (group_code) لكل الفروع.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs" htmlFor="group-branches">
                      أسماء الفروع (سطر لكل فرع) <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="group-branches"
                      value={branchText}
                      onChange={(e) => setBranchText(e.target.value)}
                      rows={5}
                      placeholder={"الإيمان\nالفقه\nالحديث\nالسيرة النبوية"}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      كل فرع مادة مستقلة بكود subject_code خاص — عدد الصفوف ={" "}
                      {branchNames.length} فرعاً.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}


          {allocation && (
            <p className="text-[11px] text-muted-foreground font-mono">
              الحالة: {allocation.subjectCount} مادة في هذا النطاق — الكود التالي للمادة رقم{" "}
              {String(allocation.nextSubjectNo).padStart(3, "0")}
            </p>
          )}

          <Button
            onClick={handleDownload}
            disabled={!canDownload}
            className="min-h-[44px] w-full sm:w-auto gap-2"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            تنزيل القالب بأكواد جاهزة
          </Button>
        </>
      )}
    </section>
  );
}
