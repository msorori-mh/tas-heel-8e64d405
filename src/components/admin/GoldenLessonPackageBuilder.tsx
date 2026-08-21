import JSZip from "jszip";
import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Download, FileArchive, Loader2, ShieldCheck, Trash2, UploadCloud } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  createGoldenLessonBundleUpload,
  verifyAndStageGoldenLessonBundle,
} from "@/lib/content-factory/golden-lesson-bundle.functions";

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
  GOLDEN_ASSET_MAX_BYTES,
  GOLDEN_ASSET_MIN_BYTES,
  assetMagicMatches,
  isAllowedAssetMime,
  isSafeAssetLeaf,
  type GoldenLessonAsset,
} from "@/lib/content-factory/golden-lesson-assets";
import {
  GOLDEN_CHEMISTRY_V1,
  GOLDEN_QURAN_V1,
  getGoldenLessonProfile,
} from "@/lib/content-factory/golden-lesson-profiles";
import {
  validateGoldenLessonPackage,
  type GoldenLessonValidationResult,
} from "@/lib/content-factory/golden-lesson-validator";
import {
  GOLDEN_ARTIFACT_FILE_CONTRACTS,
  validateGoldenLessonAnswerCoverage,
  validateGoldenLessonArtifactBytes,
} from "@/lib/content-factory/golden-lesson-file-contract";

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

type BundleIntakeResult = Awaited<ReturnType<typeof verifyAndStageGoldenLessonBundle>>;

interface UploadedArtifact {
  fileName: string;
  sha256: string;
  file: File;
}

interface UploadedSupplementalAsset extends GoldenLessonAsset {
  file: File;
}

interface ArabicFilePickerProps {
  id: string;
  accept: string;
  disabled: boolean;
  fileName?: string | null;
  onFile: (file?: File) => void | Promise<void>;
}

function ArabicFilePicker({ id, accept, disabled, fileName, onFile }: ArabicFilePickerProps) {
  return (
    <div className="flex min-h-[44px] items-center gap-2 rounded-md border bg-background px-2 py-1.5">
      <Input
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          void onFile(file);
        }}
      />
      <Label
        htmlFor={id}
        className="inline-flex min-h-[36px] cursor-pointer items-center rounded-md border px-3 text-sm font-medium hover:bg-accent"
      >
        اختيار ملف
      </Label>
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {fileName || "لم يتم اختيار ملف"}
      </span>
    </div>
  );
}

function ArabicMultiFilePicker({
  id,
  accept,
  disabled,
  selectedCount,
  onFiles,
}: {
  id: string;
  accept: string;
  disabled: boolean;
  selectedCount: number;
  onFiles: (files?: FileList) => void | Promise<void>;
}) {
  return (
    <div className="flex min-h-[44px] items-center gap-2 rounded-md border bg-background px-2 py-1.5">
      <Input
        id={id}
        type="file"
        accept={accept}
        multiple
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          const files = event.currentTarget.files ?? undefined;
          void onFiles(files);
          event.currentTarget.value = "";
        }}
      />
      <Label htmlFor={id} className="inline-flex min-h-[36px] cursor-pointer items-center rounded-md border px-3 text-sm font-medium hover:bg-accent">
        اختيار ملفات
      </Label>
      <span className="text-xs text-muted-foreground">
        {selectedCount > 0 ? `تم اختيار ${selectedCount} ملف` : "لم يتم اختيار ملفات"}
      </span>
    </div>
  );
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
  supplementalAssets: UploadedSupplementalAsset[],
): Promise<Blob> {
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(pkg, null, 2));
  for (const item of [...Object.values(uploads), ...Object.values(provenance)]) {
    if (item) zip.file(item.fileName, item.file);
  }
  if (answersCompanion) zip.file(answersCompanion.fileName, answersCompanion.file);
  for (const asset of supplementalAssets) zip.file(asset.path, asset.file);
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

async function downloadPackageBundle(
  pkg: GoldenLessonPackage,
  uploads: Partial<Record<GoldenCapability, UploadedArtifact>>,
  provenance: Partial<Record<GoldenCapability, UploadedArtifact>>,
  answersCompanion: UploadedArtifact | null,
  supplementalAssets: UploadedSupplementalAsset[],
): Promise<void> {
  const blob = await buildPackageZipBlob(pkg, uploads, provenance, answersCompanion, supplementalAssets);
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
  const [profileId, setProfileId] = useState("");
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
  const [supplementalAssets, setSupplementalAssets] = useState<UploadedSupplementalAsset[]>([]);
  const [hashing, setHashing] = useState<GoldenCapability | `provenance:${GoldenCapability}` | "answers" | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [validation, setValidation] = useState<GoldenLessonValidationResult | null>(null);
  const [intake, setIntake] = useState<BundleIntakeResult | null>(null);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [intakeBusy, setIntakeBusy] = useState(false);

  const profile = getGoldenLessonProfile(profileId);

  const artifacts = useMemo<GoldenLessonArtifact[]>(
    () =>
      GOLDEN_CAPABILITIES.map((capability) => ({
        capability,
        applicability: profile?.applicability[capability] ?? "NA",
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
      profileId: profile?.id ?? "",
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
      assets: supplementalAssets.map(({ file: _file, ...asset }) => asset),
      lifecycle: { initialStatus: "DRAFT", allowDirectReady: false },
      security: {
        productionApply: false,
        publicPayloadContainsAnswers: false,
        answersCompanionPath: answersCompanion?.fileName ?? null,
        answersCompanionSha256: answersCompanion?.sha256 ?? null,
        htmlNetworkAccess: "NONE",
      },
    }),
    [profile, packageCode, gradeCode, trackCodes, subjectCode, lessonCode, lessonSlug, unitCode, semester, sortOrder, artifacts, answersCompanion, supplementalAssets],
  );

  const requiredCapabilities = profile
    ? GOLDEN_CAPABILITIES.filter((capability) => profile.applicability[capability] === "REQUIRED")
    : [];
  const completedRequired = requiredCapabilities.filter((capability) => uploads[capability]).length;
  const completion = requiredCapabilities.length
    ? Math.round((completedRequired / requiredCapabilities.length) * 100)
    : 0;
  const identityExample = profile?.subjectFamily === "SCIENCE"
    ? {
        packageCode: "CHEM-G12-IRON-FE-PKG",
        gradeCode: "GRADE-12",
        trackCodes: "sanaa,aden",
        subjectCode: "SUB-G12-012",
        lessonCode: "CHEM-G12-IRON-FE",
        lessonSlug: "الحديد-fe",
      }
    : {
        packageCode: "QURAN-G10-L01-PKG",
        gradeCode: "GRADE-10",
        trackCodes: "sanaa",
        subjectCode: "QURAN-G10",
        lessonCode: "QURAN-G10-L01",
        lessonSlug: "مكانة-القرآن",
      };

  const handleCapabilityFile = async (capability: GoldenCapability, file?: File) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setFileError(`الملف ${file.name} أكبر من 5MB.`);
      return;
    }
    const duplicate = Object.entries(uploads).some(
      ([key, item]) => key !== capability && item?.fileName === file.name,
    ) || Object.values(provenance).some((item) => item?.fileName === file.name) ||
      answersCompanion?.fileName === file.name || supplementalAssets.some((item) => item.path === file.name);
    if (duplicate) {
      setFileError(`اسم الملف ${file.name} مستخدم مسبقًا داخل الحزمة؛ استخدم اسمًا فريدًا لكل محتوى.`);
      return;
    }
    setFileError(null);
    setValidation(null);
    setHashing(capability);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const artifactValidation = validateGoldenLessonArtifactBytes(capability, file.name, bytes);
      if (!artifactValidation.valid) {
        setUploads((current) => {
          const next = { ...current };
          delete next[capability];
          return next;
        });
        const visible = artifactValidation.findings.slice(0, 3).map((item) => item.messageAr).join(" — ");
        const remaining = artifactValidation.findings.length - 3;
        setFileError(
          `${CAPABILITY_LABEL[capability]}: ${visible}${remaining > 0 ? ` — و${remaining} مشكلة أخرى` : ""}`,
        );
        return;
      }
      const sha256 = await sha256Hex(file);
      setUploads((current) => ({ ...current, [capability]: { fileName: file.name, sha256, file } }));
    } finally {
      setHashing(null);
    }
  };

  const removeCapabilityFile = (capability: GoldenCapability) => {
    setUploads((current) => {
      const next = { ...current };
      delete next[capability];
      return next;
    });
    setProvenance((current) => {
      const next = { ...current };
      delete next[capability];
      return next;
    });
    setValidation(null);
    setFileError(null);
  };

  const handleProfileChange = (value: string) => {
    const hasSelectedFiles = Object.keys(uploads).length > 0 || Object.keys(provenance).length > 0 ||
      supplementalAssets.length > 0 || Boolean(answersCompanion);
    if (hasSelectedFiles && !window.confirm("تغيير نمط الدرس سيزيل جميع الملفات المختارة. هل تريد المتابعة؟")) {
      return;
    }
    setProfileId(value);
    setUploads({});
    setProvenance({});
    setAnswersCompanion(null);
    setSupplementalAssets([]);
    setValidation(null);
    setFileError(null);
  };

  const handleProvenanceFile = async (capability: GoldenCapability, file?: File) => {
    if (!file) return;
    if (!/\.(json|txt|md)$/i.test(file.name)) {
      setFileError("ملف توثيق المصدر يجب أن يكون JSON أو TXT أو MD.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileError(`ملف التوثيق ${file.name} أكبر من 5MB.`);
      return;
    }
    const duplicate = Object.values(uploads).some((item) => item?.fileName === file.name) ||
      Object.entries(provenance).some(([key, item]) => key !== capability && item?.fileName === file.name) ||
      answersCompanion?.fileName === file.name || supplementalAssets.some((item) => item.path === file.name);
    if (duplicate) {
      setFileError(`اسم الملف ${file.name} مستخدم مسبقًا داخل الحزمة.`);
      return;
    }
    setFileError(null);
    setValidation(null);
    const target = `provenance:${capability}` as const;
    setHashing(target);
    try {
      const textValue = await file.text();
      if (!textValue.trim()) {
        setFileError("ملف توثيق المصدر فارغ.");
        return;
      }
      if (file.name.toLowerCase().endsWith(".json")) {
        try {
          JSON.parse(textValue);
        } catch {
          setFileError("ملف توثيق المصدر JSON غير صالح.");
          return;
        }
      }
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
    const duplicate = Object.values(uploads).some((item) => item?.fileName === file.name) ||
      Object.values(provenance).some((item) => item?.fileName === file.name) ||
      supplementalAssets.some((item) => item.path === file.name);
    if (duplicate) {
      setFileError(`اسم الملف ${file.name} مستخدم مسبقًا داخل الحزمة.`);
      return;
    }
    setFileError(null);
    setHashing("answers");
    try {
      try {
        JSON.parse(await file.text());
      } catch {
        setFileError("ملف الإجابات الخادمي JSON غير صالح.");
        return;
      }
      const sha256 = await sha256Hex(file);
      setAnswersCompanion({ fileName: file.name, sha256, file });
    } finally {
      setHashing(null);
    }
  };

  const handleSupplementalAssets = async (files?: FileList) => {
    if (!files?.length) return;
    setFileError(null);
    setValidation(null);
    try {
      const htmlSources = await Promise.all(
        GOLDEN_CAPABILITIES.map(async (capability) => {
          const upload = uploads[capability];
          return upload?.fileName.endsWith(".html")
            ? { capability, html: await upload.file.text() }
            : null;
        }),
      );
      const next: UploadedSupplementalAsset[] = [];
      for (const file of Array.from(files)) {
        if (!isSafeAssetLeaf(file.name)) throw new Error(`اسم الأصل غير آمن: ${file.name}`);
        if (!isAllowedAssetMime(file.type)) throw new Error(`نوع الأصل غير مسموح: ${file.name}`);
        if (file.size < GOLDEN_ASSET_MIN_BYTES || file.size > GOLDEN_ASSET_MAX_BYTES) {
          throw new Error(`حجم الأصل خارج النطاق المسموح: ${file.name}`);
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!assetMagicMatches(file.type, bytes)) throw new Error(`توقيع الملف لا يطابق نوعه: ${file.name}`);

        const referencedBy: GoldenCapability[] = [];
        let altTextAr = "";
        for (const source of htmlSources) {
          if (!source) continue;
          const document = new DOMParser().parseFromString(source.html, "text/html");
          const matchingImage = Array.from(document.querySelectorAll("img"))
            .find((image) => image.getAttribute("src") === file.name);
          const matchingLink = Array.from(document.querySelectorAll("[href], [src]"))
            .some((element) => element.getAttribute("href") === file.name || element.getAttribute("src") === file.name);
          if (matchingImage || matchingLink) {
            referencedBy.push(source.capability);
            altTextAr ||= matchingImage?.getAttribute("alt")?.trim() ?? "";
          }
        }
        if (referencedBy.length === 0) throw new Error(`الأصل غير مشار إليه من أي ملف HTML: ${file.name}`);
        if (altTextAr.length < 3) throw new Error(`النص البديل العربي مفقود في HTML للأصل: ${file.name}`);

        const stem = file.name.replace(/\.[^.]+$/, "").toUpperCase()
          .replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        const assetCode = (stem.length >= 3 ? stem : `ASSET-${stem || "FILE"}`).slice(0, 64);
        next.push({
          assetCode,
          path: file.name,
          mimeType: file.type,
          sha256: await sha256Hex(file),
          bytes: file.size,
          referencedBy,
          altTextAr,
          file,
        });
      }
      setSupplementalAssets((current) => {
        const replacing = new Set(next.map((asset) => asset.path));
        return [...current.filter((asset) => !replacing.has(asset.path)), ...next];
      });
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "ASSET_UPLOAD_FAILED");
    }
  };

  const runValidation = async () => {
    if (!profile) {
      setFileError("اختر نوع الدرس أولًا؛ لا يوجد نمط افتراضي للاستيراد.");
      return;
    }
    setFileError(null);
    const manifestValidation = validateGoldenLessonPackage(packageDraft);
    const artifactInputs: Partial<Record<GoldenCapability, { fileName: string; bytes: Uint8Array }>> = {};
    for (const capability of ["officialBookQuestions", "selfTest"] as const) {
      const upload = uploads[capability];
      if (upload) {
        artifactInputs[capability] = {
          fileName: upload.fileName,
          bytes: new Uint8Array(await upload.file.arrayBuffer()),
        };
      }
    }
    const coverage = validateGoldenLessonAnswerCoverage(
      artifactInputs,
      answersCompanion
        ? {
            fileName: answersCompanion.fileName,
            bytes: new Uint8Array(await answersCompanion.file.arrayBuffer()),
          }
        : null,
    );
    const coverageFindings = coverage.findings.map((finding) => ({
      code: finding.code,
      severity: "ERROR" as const,
      field: "security.answersCompanionPath",
      messageAr: finding.messageAr,
    }));
    setValidation({
      ...manifestValidation,
      valid: manifestValidation.valid && coverage.valid,
      findings: [...manifestValidation.findings, ...coverageFindings],
    });
  };

  /**
   * CF11 intake: uploads the exact ZIP the factory produced, then asks the server to download it,
   * recompute every hash from the stored bytes and bind the attestation to the existing package
   * version idempotently. The client never sends a hash, so an attestation cannot be forged here.
   */
  const uploadAndVerifyBundle = async () => {
    setIntakeBusy(true);
    setIntakeError(null);
    setIntake(null);
    try {
      const blob = await buildPackageZipBlob(packageDraft, uploads, provenance, answersCompanion, supplementalAssets);
      const slot = await createGoldenLessonBundleUpload();
      const uploaded = await supabase.storage
        .from(slot.bucket)
        .uploadToSignedUrl(slot.path, slot.token, blob, { contentType: "application/zip" });
      if (uploaded.error) throw new Error(uploaded.error.message);
      const verified = await verifyAndStageGoldenLessonBundle({ data: { path: slot.path } });
      setIntake(verified);
    } catch (error) {
      setIntakeError(error instanceof Error ? error.message : "BUNDLE_INTAKE_FAILED");
    } finally {
      setIntakeBusy(false);
    }
  };

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
          <Label>نوع الدرس <span className="text-destructive">*</span></Label>
          <Select value={profileId || undefined} onValueChange={handleProfileChange}>
            <SelectTrigger className="min-h-[44px]"><SelectValue placeholder="اختر نوع الدرس أولًا" /></SelectTrigger>
            <SelectContent>
              {[GOLDEN_QURAN_V1, GOLDEN_CHEMISTRY_V1].map((item) => (
                <SelectItem key={item.id} value={item.id}>{item.labelAr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {[
          ["رمز الحزمة", packageCode, setPackageCode, identityExample.packageCode],
          ["رمز الصف", gradeCode, setGradeCode, identityExample.gradeCode],
          ["المسارات (بفاصلة)", trackCodes, setTrackCodes, identityExample.trackCodes],
          ["رمز المادة", subjectCode, setSubjectCode, identityExample.subjectCode],
          ["رمز الدرس", lessonCode, setLessonCode, identityExample.lessonCode],
          ["رابط الدرس", lessonSlug, setLessonSlug, identityExample.lessonSlug],
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

      {!profile && (
        <div role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          يجب اختيار نوع الدرس قبل رفع أي ملف. لا يعتمد المركز الآن نمط القرآن افتراضيًا.
        </div>
      )}
      {profile && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm space-y-1">
          <p className="font-medium">العقد المختار: {profile.labelAr}</p>
          {profile.notesAr.map((note) => <p key={note} className="text-xs text-muted-foreground">• {note}</p>)}
        </div>
      )}

      {profile && <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span>اكتمال الملفات الإلزامية</span>
          <span className="font-semibold">{completedRequired}/{requiredCapabilities.length} — {completion}%</span>
        </div>
        <Progress value={completion} />
      </div>}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {profile && GOLDEN_CAPABILITIES.map((capability) => {
          const applicability = profile.applicability[capability];
          const authority = GOLDEN_CAPABILITY_AUTHORITY[capability];
          const upload = uploads[capability];
          const fileContract = GOLDEN_ARTIFACT_FILE_CONTRACTS[capability];
          return (
            <div key={capability} className={`rounded-xl border p-4 space-y-3 ${applicability === "NA" ? "bg-muted/40 opacity-75" : "bg-background"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{CAPABILITY_LABEL[capability]}</p>
                  <p className="text-[11px] font-mono text-muted-foreground">{capability}</p>
                </div>
                <div className="flex gap-1">
                  <Badge variant={authority === "OFFICIAL" ? "default" : "secondary"}>{authority === "OFFICIAL" ? "رسمي" : "تمكين"}</Badge>
                  <Badge variant="outline">
                    {applicability === "REQUIRED" ? "إلزامي" : applicability === "OPTIONAL" ? "اختياري" : "غير منطبق"}
                  </Badge>
                </div>
              </div>
              {applicability !== "NA" && (
                <>
                  <p className="text-xs text-muted-foreground">المطلوب: {fileContract.expectedAr}</p>
                  <ArabicFilePicker
                    id={`golden-artifact-${capability}`}
                    accept={fileContract.accept}
                    disabled={hashing !== null}
                    fileName={upload?.fileName}
                    onFile={(file) => handleCapabilityFile(capability, file)}
                  />
                  {hashing === capability && <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />حساب SHA-256…</p>}
                  {upload && (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 break-all text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="inline h-4 w-4 ms-1" />تم التحقق من الملف: {upload.fileName}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 shrink-0 gap-1 text-destructive"
                          onClick={() => removeCapabilityFile(capability)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />إزالة
                        </Button>
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground">{upload.sha256}</span>
                    </div>
                  )}
                  {authority === "OFFICIAL" && upload && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">ملف توثيق المصدر الرسمي</Label>
                      <ArabicFilePicker
                        id={`golden-provenance-${capability}`}
                        accept=".json,.txt,.md,application/json,text/plain,text/markdown"
                        disabled={hashing !== null}
                        fileName={provenance[capability]?.fileName}
                        onFile={(file) => handleProvenanceFile(capability, file)}
                      />
                      {hashing === `provenance:${capability}` && <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />حساب بصمة التوثيق…</p>}
                      {provenance[capability] && <p className="text-[10px] break-all font-mono text-muted-foreground">{provenance[capability]?.fileName}<br/>{provenance[capability]?.sha256}</p>}
                    </div>
                  )}
                </>
              )}
              {applicability === "NA" && (
                <p className="text-xs text-muted-foreground">
                  هذه القدرة غير منطبقة على نوع الدرس المختار.
                  {capability === "labExperimentHtml" ? " لرفع تجربة معملية اختر نوع الدرس «الكيمياء»." : ""}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 space-y-2">
        <Label>الصور والأصول المساندة المشار إليها داخل HTML</Label>
        <ArabicMultiFilePicker
          id="golden-supplemental-assets"
          accept="image/png,image/jpeg,image/webp"
          disabled={hashing !== null || !profile}
          selectedCount={supplementalAssets.length}
          onFiles={handleSupplementalAssets}
        />
        <p className="text-xs text-muted-foreground">تُستخرج القدرة والنص البديل من HTML، وتُحسب البصمة محليًا، ثم يتحقق الخادم من البايتات مرة أخرى.</p>
        {supplementalAssets.map((asset) => (
          <p key={asset.path} className="text-xs break-all text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="inline h-4 w-4 ms-1" />{asset.path} — {asset.assetCode}
            <br/><span className="font-mono text-[10px]">{asset.sha256}</span>
          </p>
        ))}
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
        <Label>ملف الإجابات الخادمي</Label>
        <ArabicFilePicker
          id="golden-answers-companion"
          accept=".server-only.json,.json,application/json"
          disabled={hashing !== null || !profile}
          fileName={answersCompanion?.fileName}
          onFile={handleAnswersFile}
        />
        <p className="text-xs text-muted-foreground">
          يصبح إلزاميًا عند رفع أسئلة الكتاب أو «اختبر فهمك». يجب أن ينتهي الاسم بـ
          <span className="font-mono"> .server-only.json</span>، ولا يدخل في الحمولة العامة.
        </p>
        {answersCompanion && (
          <div className="flex items-start justify-between gap-2 text-xs text-emerald-700 dark:text-emerald-400">
            <p className="break-all">تم تثبيت: {answersCompanion.fileName}<br/><span className="font-mono text-[10px]">{answersCompanion.sha256}</span></p>
            <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 text-destructive" onClick={() => { setAnswersCompanion(null); setValidation(null); }}>
              <Trash2 className="h-3.5 w-3.5" />إزالة
            </Button>
          </div>
        )}
      </div>

      {fileError && <p role="alert" className="text-sm text-destructive flex gap-2"><AlertCircle className="h-4 w-4 mt-0.5" />{fileError}</p>}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void runValidation()} disabled={hashing !== null || !profile} className="min-h-[44px] gap-2"><ShieldCheck className="h-4 w-4" />فحص الحزمة</Button>
        <Button type="button" variant="outline" disabled={!validation?.valid} onClick={() => downloadJson(packageDraft, `${packageDraft.packageCode || "golden-lesson"}.manifest.json`)} className="min-h-[44px] gap-2"><Download className="h-4 w-4" />تنزيل Manifest</Button>
        <Button type="button" variant="outline" disabled={!validation?.valid} onClick={() => void downloadPackageBundle(packageDraft, uploads, provenance, answersCompanion, supplementalAssets)} className="min-h-[44px] gap-2"><FileArchive className="h-4 w-4" />تنزيل حزمة ZIP</Button>
        <Button type="button" disabled={!validation?.valid || intakeBusy} onClick={() => void uploadAndVerifyBundle()} className="min-h-[44px] gap-2">
          {intakeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          رفع الحزمة والتحقق على الخادم
        </Button>
      </div>

      {intakeError && <p role="alert" className="text-sm text-destructive flex gap-2"><AlertCircle className="h-4 w-4 mt-0.5" />{intakeError}</p>}

      {intake && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-1 text-sm">
          <p className="font-medium flex gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5" />تم التحقق من الحزمة على الخادم وربطها بالإصدار</p>
          <p className="text-xs">الإصدار: {intake.version} — الحالة: {intake.status}{intake.idempotent ? " (إعادة تنفيذ بلا كتابة جديدة)" : ""}</p>
          <p className="text-xs break-all font-mono">bundle sha256: {intake.verifiedBundleSha256}</p>
          <p className="text-xs">عدد الملفات: {intake.verifiedFileCount} — كتابات المحتوى: {intake.domainWritesPerformed}</p>
        </div>
      )}

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
