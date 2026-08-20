import JSZip from "jszip";
import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Download, FileArchive, Loader2, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GOLDEN_CAPABILITIES,
  GOLDEN_CAPABILITY_AUTHORITY,
  GOLDEN_LESSON_SCHEMA,
  type GoldenCapability,
  type GoldenLessonArtifact,
  type GoldenLessonPackage,
} from "@/lib/content-factory/golden-lesson-contract";
import {
  GOLDEN_CHEMISTRY_V1,
  GOLDEN_QURAN_V1,
  getGoldenLessonProfile,
} from "@/lib/content-factory/golden-lesson-profiles";
import {
  validateGoldenLessonPackage,
  type GoldenLessonValidationResult,
} from "@/lib/content-factory/golden-lesson-validator";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const CAPABILITY_LABEL: Record<GoldenCapability, string> = {
  officialBookContent: "محتوى الكتاب الرسمي",
  tamkeenExplanationHtml: "شرح تمكين",
  lessonSummaryHtml: "ملخص الدرس",
  mindMapHtml: "الخريطة الذهنية",
  labExperimentHtml: "التجربة / النشاط التفاعلي",
  officialBookQuestions: "أسئلة الكتاب الرسمية",
  selfTest: "اختبر نفسك",
};

interface UploadedArtifact {
  fileName: string;
  sha256: string;
  file: File;
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function buildPackageZipBlob(
  pkg: GoldenLessonPackage,
  uploads: Partial<Record<GoldenCapability, UploadedArtifact>>,
  provenance: Partial<Record<GoldenCapability, UploadedArtifact>>,
  answersCompanion: UploadedArtifact | null,
): Promise<Blob> {
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(pkg, null, 2));
  for (const item of [...Object.values(uploads), ...Object.values(provenance)]) {
    if (item) zip.file(item.fileName, item.file);
  }
  if (answersCompanion) zip.file(answersCompanion.fileName, answersCompanion.file);
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

async function downloadPackageBundle(
  pkg: GoldenLessonPackage,
  uploads: Partial<Record<GoldenCapability, UploadedArtifact>>,
  provenance: Partial<Record<GoldenCapability, UploadedArtifact>>,
  answersCompanion: UploadedArtifact | null,
): Promise<void> {
  const blob = await buildPackageZipBlob(pkg, uploads, provenance, answersCompanion);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${pkg.packageCode || "golden-lesson"}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadJson(value: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function GoldenLessonPackageBuilder() {
  const [profileId, setProfileId] = useState(GOLDEN_QURAN_V1.id);
  const [packageCode, setPackageCode] = useState("");
  const [gradeCode, setGradeCode] = useState("");
  const [trackCodes, setTrackCodes] = useState("sanaa");
  const [subjectCode, setSubjectCode] = useState("");
  const [lessonCode, setLessonCode] = useState("");
  const [lessonSlug, setLessonSlug] = useState("");
  const [unitCode, setUnitCode] = useState("");
  const [semester, setSemester] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const [uploads, setUploads] = useState<Partial<Record<GoldenCapability, UploadedArtifact>>>({});
  const [provenance, setProvenance] = useState<Partial<Record<GoldenCapability, UploadedArtifact>>>({});
  const [answersCompanion, setAnswersCompanion] = useState<UploadedArtifact | null>(null);
  const [hashing, setHashing] = useState<GoldenCapability | `provenance:${GoldenCapability}` | "answers" | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [validation, setValidation] = useState<GoldenLessonValidationResult | null>(null);
  const [intake, setIntake] = useState<BundleIntakeResult | null>(null);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [intakeBusy, setIntakeBusy] = useState(false);

  const profile = getGoldenLessonProfile(profileId) ?? GOLDEN_QURAN_V1;

  const artifacts = useMemo<GoldenLessonArtifact[]>(
    () =>
      GOLDEN_CAPABILITIES.map((capability) => ({
        capability,
        applicability: profile.applicability[capability],
        authority: GOLDEN_CAPABILITY_AUTHORITY[capability],
        sourcePath: uploads[capability]?.fileName ?? null,
        sha256: uploads[capability]?.sha256 ?? null,
        provenancePath: provenance[capability]?.fileName ?? null,
        provenanceSha256: provenance[capability]?.sha256 ?? null,
      })),
    [profile, uploads, provenance],
  );

  const packageDraft = useMemo<GoldenLessonPackage>(
    () => ({
      schema: GOLDEN_LESSON_SCHEMA,
      profileId: profile.id,
      packageCode: packageCode.trim(),
      identity: {
        gradeCode: gradeCode.trim().toUpperCase(),
        curriculumTrackCodes: trackCodes.split(",").map((code) => code.trim().toLowerCase()).filter(Boolean),
        subjectCode: subjectCode.trim().toUpperCase(),
        lessonCode: lessonCode.trim().toUpperCase(),
        lessonSlug: lessonSlug.trim(),
        unitCode: unitCode.trim() || null,
        semester: semester ? Number(semester) : null,
        sortOrder: sortOrder ? Number(sortOrder) : null,
      },
      capabilityOrder: [...GOLDEN_CAPABILITIES],
      artifacts,
      lifecycle: { initialStatus: "DRAFT", allowDirectReady: false },
      security: {
        productionApply: false,
        publicPayloadContainsAnswers: false,
        answersCompanionPath: answersCompanion?.fileName ?? null,
        answersCompanionSha256: answersCompanion?.sha256 ?? null,
        htmlNetworkAccess: "NONE",
      },
    }),
    [profile, packageCode, gradeCode, trackCodes, subjectCode, lessonCode, lessonSlug, unitCode, semester, sortOrder, artifacts, answersCompanion],
  );

  const requiredCapabilities = GOLDEN_CAPABILITIES.filter(
    (capability) => profile.applicability[capability] === "REQUIRED",
  );
  const completedRequired = requiredCapabilities.filter((capability) => uploads[capability]).length;
  const completion = requiredCapabilities.length
    ? Math.round((completedRequired / requiredCapabilities.length) * 100)
    : 100;

  const handleCapabilityFile = async (capability: GoldenCapability, file?: File) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setFileError(`الملف ${file.name} أكبر من 5MB.`);
      return;
    }
    setFileError(null);
    setValidation(null);
    setHashing(capability);
    try {
      const sha256 = await sha256Hex(file);
      setUploads((current) => ({ ...current, [capability]: { fileName: file.name, sha256, file } }));
    } finally {
      setHashing(null);
    }
  };

  const handleProvenanceFile = async (capability: GoldenCapability, file?: File) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setFileError(`ملف التوثيق ${file.name} أكبر من 5MB.`);
      return;
    }
    setFileError(null);
    setValidation(null);
    const target = `provenance:${capability}` as const;
    setHashing(target);
    try {
      const sha256 = await sha256Hex(file);
      setProvenance((current) => ({ ...current, [capability]: { fileName: file.name, sha256, file } }));
    } finally {
      setHashing(null);
    }
  };

  const handleAnswersFile = async (file?: File) => {
    if (!file) return;
    if (!file.name.endsWith(".server-only.json")) {
      setFileError("ملف الإجابات يجب أن ينتهي بـ .server-only.json");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileError(`الملف ${file.name} أكبر من 5MB.`);
      return;
    }
    setFileError(null);
    setHashing("answers");
    try {
      const sha256 = await sha256Hex(file);
      setAnswersCompanion({ fileName: file.name, sha256, file });
    } finally {
      setHashing(null);
    }
  };

  const runValidation = () => setValidation(validateGoldenLessonPackage(packageDraft));

  return (
    <section dir="rtl" aria-labelledby="golden-package-builder-heading" className="rounded-2xl border border-primary/25 bg-card p-5 shadow-card space-y-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <FileArchive className="h-5 w-5 text-primary" />
          <h2 id="golden-package-builder-heading" className="text-lg font-semibold">مصنع حزمة الدرس الذهبي</h2>
          <Badge variant="secondary">صفر كتابة</Badge>
        </div>
        <p className="text-sm text-muted-foreground max-w-3xl">
          جهّز الدرس كاملًا، احسب بصمات ملفاته محليًا، ثم نزّل manifest للمراجعة. لا تُرسل الملفات أو البيانات إلى الخادم في هذه الخطوة.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label>نمط الدرس</Label>
          <Select value={profileId} onValueChange={(value) => { setProfileId(value); setUploads({}); setProvenance({}); setValidation(null); }}>
            <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[GOLDEN_QURAN_V1, GOLDEN_CHEMISTRY_V1].map((item) => (
                <SelectItem key={item.id} value={item.id}>{item.labelAr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {[
          ["رمز الحزمة", packageCode, setPackageCode, "QURAN-G10-L01-PKG"],
          ["رمز الصف", gradeCode, setGradeCode, "GRADE-10"],
          ["المسارات (بفاصلة)", trackCodes, setTrackCodes, "sanaa,aden"],
          ["رمز المادة", subjectCode, setSubjectCode, "QURAN-G10"],
          ["رمز الدرس", lessonCode, setLessonCode, "QURAN-G10-L01"],
          ["رابط الدرس", lessonSlug, setLessonSlug, "مكانة-القرآن"],
          ["رمز الوحدة (اختياري)", unitCode, setUnitCode, ""],
          ["الفصل (اختياري)", semester, setSemester, "1"],
          ["الترتيب (اختياري)", sortOrder, setSortOrder, "1"],
        ].map(([label, value, setter, placeholder]) => (
          <div key={label as string} className="space-y-1.5">
            <Label>{label as string}</Label>
            <Input value={value as string} onChange={(event) => (setter as (value: string) => void)(event.target.value)} placeholder={placeholder as string} className="min-h-[44px]" />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span>اكتمال الملفات الإلزامية</span>
          <span className="font-semibold">{completedRequired}/{requiredCapabilities.length} — {completion}%</span>
        </div>
        <Progress value={completion} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {GOLDEN_CAPABILITIES.map((capability) => {
          const applicability = profile.applicability[capability];
          const authority = GOLDEN_CAPABILITY_AUTHORITY[capability];
          const upload = uploads[capability];
          return (
            <div key={capability} className={`rounded-xl border p-4 space-y-3 ${applicability === "NA" ? "bg-muted/40 opacity-75" : "bg-background"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{CAPABILITY_LABEL[capability]}</p>
                  <p className="text-[11px] font-mono text-muted-foreground">{capability}</p>
                </div>
                <div className="flex gap-1">
                  <Badge variant={authority === "OFFICIAL" ? "default" : "secondary"}>{authority === "OFFICIAL" ? "رسمي" : "تمكين"}</Badge>
                  <Badge variant="outline">{applicability}</Badge>
                </div>
              </div>
              {applicability !== "NA" && (
                <>
                  <Input type="file" accept=".json,.html,.zip" disabled={hashing !== null} onChange={(event) => void handleCapabilityFile(capability, event.target.files?.[0])} className="min-h-[44px]" />
                  {hashing === capability && <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />حساب SHA-256…</p>}
                  {upload && <p className="text-xs break-all"><CheckCircle2 className="inline h-4 w-4 text-emerald-600 ms-1" />{upload.fileName}<br/><span className="font-mono text-[10px] text-muted-foreground">{upload.sha256}</span></p>}
                  {authority === "OFFICIAL" && upload && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">ملف توثيق المصدر الرسمي</Label>
                      <Input type="file" accept=".json,.txt,.md" disabled={hashing !== null} onChange={(event) => void handleProvenanceFile(capability, event.target.files?.[0])} className="min-h-[44px]" />
                      {hashing === `provenance:${capability}` && <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />حساب بصمة التوثيق…</p>}
                      {provenance[capability] && <p className="text-[10px] break-all font-mono text-muted-foreground">{provenance[capability]?.fileName}<br/>{provenance[capability]?.sha256}</p>}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
        <Label>ملف الإجابات الخادمي (اختياري في هذه المرحلة)</Label>
        <Input type="file" accept=".json" disabled={hashing !== null} onChange={(event) => void handleAnswersFile(event.target.files?.[0])} className="min-h-[44px]" />
        <p className="text-xs text-muted-foreground">يجب أن ينتهي الاسم بـ <span className="font-mono">.server-only.json</span>، ولا يدخل في الحمولة العامة.</p>
        {answersCompanion && <p className="text-xs break-all text-emerald-700 dark:text-emerald-400">تم تثبيت: {answersCompanion.fileName}<br/><span className="font-mono text-[10px]">{answersCompanion.sha256}</span></p>}
      </div>

      {fileError && <p role="alert" className="text-sm text-destructive flex gap-2"><AlertCircle className="h-4 w-4 mt-0.5" />{fileError}</p>}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={runValidation} disabled={hashing !== null} className="min-h-[44px] gap-2"><ShieldCheck className="h-4 w-4" />فحص الحزمة</Button>
        <Button type="button" variant="outline" disabled={!validation?.valid} onClick={() => downloadJson(packageDraft, `${packageDraft.packageCode || "golden-lesson"}.manifest.json`)} className="min-h-[44px] gap-2"><Download className="h-4 w-4" />تنزيل Manifest</Button>
        <Button type="button" variant="outline" disabled={!validation?.valid} onClick={() => void downloadPackageBundle(packageDraft, uploads, provenance, answersCompanion)} className="min-h-[44px] gap-2"><FileArchive className="h-4 w-4" />تنزيل حزمة ZIP</Button>
      </div>

      {validation && (
        <div className={`rounded-xl border p-4 space-y-3 ${validation.valid ? "border-emerald-500/30 bg-emerald-500/10" : "border-destructive/30 bg-destructive/5"}`}>
          <p className="font-medium">{validation.valid ? "الحزمة مكتملة وجاهزة للمراجعة" : "الحزمة تحتاج تصحيحًا"}</p>
          <p className="text-xs text-muted-foreground">الكتابات المنفذة: {validation.writesPerformed}</p>
          {validation.findings.length > 0 && (
            <ul className="space-y-1 text-sm">
              {validation.findings.map((finding, index) => (
                <li key={`${finding.code}-${index}`} className="rounded-lg border bg-background/70 px-3 py-2">
                  <Badge variant={finding.severity === "ERROR" ? "destructive" : "outline"} className="ms-2">{finding.severity === "ERROR" ? "خطأ" : "تنبيه"}</Badge>
                  {finding.messageAr} <span className="font-mono text-[10px] text-muted-foreground">({finding.field})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
