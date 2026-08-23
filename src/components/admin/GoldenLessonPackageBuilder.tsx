import { useEffect, useMemo, useState } from "react";
import { AlertCircle, BookOpen, CheckCircle2, Download, Eye, FileCheck2, Loader2, Trash2, UploadCloud } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  createGoldenLessonDirectUpload,
  verifyAndStageGoldenLessonDirect,
} from "@/lib/content-factory/golden-lesson-direct.functions";

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
import { convertQuestionWorkbook } from "@/lib/content-factory/golden-lesson-xlsx";
import { convertHtml5ActivityZip } from "@/lib/content-factory/golden-lesson-html5";
import { getContentCodeRegistry } from "@/lib/content-codes/content-codes.functions";
import type { ContentCodeRegistry } from "@/lib/content-codes/content-codes.types";
import { contentImportTemplateDownloadUrl } from "@/lib/content-import/content-import-templates";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const CAPABILITY_LABEL: Record<GoldenCapability, string> = {
  officialBookContent: "محتوى الكتاب المدرسي",
  tamkeenExplanationHtml: "شرح تمكين",
  lessonSummaryHtml: "ملخص الدرس",
  mindMapHtml: "الخريطة الذهنية",
  labExperimentHtml: "التجارب المعملية والتطبيقية",
  officialBookQuestions: "أنشطة وأسئلة الدرس",
  selfTest: "اختبر فهمك",
};

const CAPABILITY_NUMBER: Record<GoldenCapability, number> = {
  officialBookContent: 1,
  tamkeenExplanationHtml: 2,
  lessonSummaryHtml: 3,
  mindMapHtml: 4,
  labExperimentHtml: 5,
  officialBookQuestions: 6,
  selfTest: 7,
};

const CAPABILITY_FORMAT_HINT: Partial<Record<GoldenCapability, string>> = {
  officialBookQuestions: "Excel (قالب 09)",
  selfTest: "Excel (قالب 10)",
};

interface FriendlyFinding {
  key: string;
  severity: "ERROR" | "WARNING";
  text: string;
  capability: GoldenCapability | null;
  order: number;
}

function capabilityFromField(field: string): GoldenCapability | null {
  const match = /^artifacts\.([A-Za-z]+)/.exec(field ?? "");
  const candidate = match?.[1] as GoldenCapability | undefined;
  return candidate && candidate in CAPABILITY_LABEL ? candidate : null;
}

function toFriendlyFindings(
  findings: ReadonlyArray<{ code: string; severity: string; field: string; messageAr: string }>,
  hasLesson: boolean,
): FriendlyFinding[] {
  const mapped: FriendlyFinding[] = [];
  let identityNoticeAdded = false;

  findings.forEach((finding, index) => {
    const severity = finding.severity === "ERROR" ? "ERROR" : "WARNING";
    const isIdentity =
      finding.code === "PACKAGE_CODE_INVALID" || finding.field?.startsWith("identity.");

    if (isIdentity && !hasLesson) {
      if (identityNoticeAdded) return;
      identityNoticeAdded = true;
      mapped.push({
        key: "identity-missing",
        severity: "ERROR",
        text: "اختر الصف والمادة والدرس أولاً — رمز الحزمة يُنشأ تلقائيًا بعد الاختيار.",
        capability: null,
        order: -1,
      });
      return;
    }

    const capability = capabilityFromField(finding.field);
    if (capability) {
      const label = `(${CAPABILITY_NUMBER[capability]}) ${CAPABILITY_LABEL[capability]}`;
      const hint = CAPABILITY_FORMAT_HINT[capability];
      const text =
        finding.code === "REQUIRED_ARTIFACT_MISSING"
          ? `${label} — الملف الإلزامي مفقود${hint ? ` (${hint})` : " (HTML)"}.`
          : `${label} — ${finding.messageAr}`;
      mapped.push({
        key: `${finding.code}-${index}`,
        severity,
        text,
        capability,
        order: CAPABILITY_NUMBER[capability],
      });
      return;
    }

    mapped.push({
      key: `${finding.code}-${index}`,
      severity,
      text: finding.messageAr,
      capability: null,
      order: 100,
    });
  });

  return mapped.sort((a, b) => a.order - b.order);
}

function scrollToCapability(capability: GoldenCapability) {
  const node = document.getElementById(`golden-capability-${capability}`);
  if (!node) return;
  node.scrollIntoView({ behavior: "smooth", block: "center" });
  node.classList.add("ring-2", "ring-destructive");
  window.setTimeout(() => node.classList.remove("ring-2", "ring-destructive"), 2000);
}

type DirectIntakeResult = Awaited<ReturnType<typeof verifyAndStageGoldenLessonDirect>>;

interface UploadedArtifact {
  fileName: string;
  displayName: string;
  sha256: string;
  file: File;
  rowCount?: number;
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
        {fileName ? "استبدال الملف" : "اختيار الملف"}
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
  onFiles: (files: File[]) => void | Promise<void>;
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
          // FileList is live: clearing the input would otherwise empty it before
          // the async asset validator reads the selected files.
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          void onFiles(files);
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

/** يحوّل رموز مخالفات المعيار إلى جمل تصحيحية واضحة للمستخدم. */
const ARTIFACT_FIX_HINTS: Record<string, string> = {
  RTL_DIRECTION_MISSING:
    'الملف لا يحتوي dir="rtl" — أضِف السمة إلى وسم <html> ثم أعد الرفع.',
  RESPONSIVE_VIEWPORT_MISSING:
    'وسم viewport مفقود — أضِف <meta name="viewport" content="width=device-width, initial-scale=1"> داخل <head>.',
  JS_NOT_ALLOWED_IN_STATIC_PROFILE:
    "الملف يحتوي كود JavaScript — الشرح والملخص والخريطة الذهنية يجب أن تكون HTML ثابتًا بلا وسم <script>.",
  INLINE_EVENT_HANDLER_FORBIDDEN:
    "الملف يحتوي معالجات أحداث مضمّنة مثل onclick — احذفها من الوسوم.",
  EXTERNAL_RESOURCE_FORBIDDEN:
    "الملف يشير إلى مصدر خارجي على الإنترنت (خط أو مكتبة أو صورة برابط https) — ضمِّن الأنماط داخل الملف وارفع الصور كمرفقات.",
  ANSWER_LEAKAGE_DETECTED:
    "الملف يحتوي إجابات أو تبريرات — يجب ألا تُكتب داخل HTML؛ الإجابات تُرفع عبر قالب الأسئلة فقط.",
  EMPTY_HTML: "الملف فارغ.",
  ARTIFACT_EMPTY: "الملف فارغ.",
  ARTIFACT_UTF8_INVALID: "الملف ليس نصًا بترميز UTF-8 — احفظه بترميز UTF-8 وأعد الرفع.",
  NESTED_ZIP_FORBIDDEN:
    "لا ترفع حزمة ZIP في هذه الخانة — حزمة ZIP مقبولة في «التجارب المعملية» فقط ويجب أن تحتوي index.html.",
  ARTIFACT_EXTENSION_FORBIDDEN: "امتداد الملف غير مسموح لهذا المكوّن.",
};

function friendlyArtifactMessage(finding: { code: string; messageAr: string }): string {
  return ARTIFACT_FIX_HINTS[finding.code] ?? finding.messageAr;
}

/** تنزيل القالب كـ Blob حتى لا يُعرض الملف الثنائي كرموز داخل إطار المعاينة. */
async function downloadTemplateFile(url: string, filename: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`تعذر تنزيل القالب (HTTP ${response.status}).`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function buildSupplementalAssetDeclarations(
  files: File[],
  htmlSources: Array<{ capability: GoldenCapability; html: string }>,
): Promise<UploadedSupplementalAsset[]> {
  const next: UploadedSupplementalAsset[] = [];
  for (const file of files) {
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
  return next;
}

function buildDirectIntakeFiles(
  uploads: Partial<Record<GoldenCapability, UploadedArtifact>>,
  internalProvenance: Partial<Record<GoldenCapability, UploadedArtifact>>,
  answersCompanion: UploadedArtifact | null,
  supplementalAssets: UploadedSupplementalAsset[],
): Map<string, File> {
  const files = new Map<string, File>();
  for (const item of [...Object.values(uploads), ...Object.values(internalProvenance)]) {
    if (item) files.set(item.fileName, item.file);
  }
  if (answersCompanion) files.set(answersCompanion.fileName, answersCompanion.file);
  for (const asset of supplementalAssets) files.set(asset.path, asset.file);
  return files;
}

function directUploadContentType(file: File): string {
  if (/\.html$/i.test(file.name)) return "text/html";
  if (/\.json$/i.test(file.name)) return "application/json";
  if (/\.png$/i.test(file.name)) return "image/png";
  if (/\.jpe?g$/i.test(file.name)) return "image/jpeg";
  if (/\.webp$/i.test(file.name)) return "image/webp";
  throw new Error(`DIRECT_FILE_TYPE_UNSUPPORTED:${file.name}`);
}

const LOCAL_DRAFT_DB = "tamkeen-lesson-import-drafts-v1";
const LOCAL_DRAFT_STORE = "drafts";
const LAST_CONTEXT_KEY = "tamkeen:last-lesson-import-context";

interface LocalLessonDraft {
  lessonCode: string;
  uploads: Partial<Record<GoldenCapability, UploadedArtifact>>;
  internalProvenance: Partial<Record<GoldenCapability, UploadedArtifact>>;
  answerSets: Partial<Record<"selfTest" | "officialBookQuestions", Array<Record<string, unknown>>>>;
  answersCompanion: UploadedArtifact | null;
  supplementalAssets: UploadedSupplementalAsset[];
  savedAt: string;
}

function openLocalDraftDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCAL_DRAFT_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(LOCAL_DRAFT_STORE)) {
        request.result.createObjectStore(LOCAL_DRAFT_STORE, { keyPath: "lessonCode" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("LOCAL_DRAFT_DB_OPEN_FAILED"));
  });
}

async function readLocalLessonDraft(lessonCode: string): Promise<LocalLessonDraft | null> {
  const db = await openLocalDraftDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(LOCAL_DRAFT_STORE, "readonly");
    const request = transaction.objectStore(LOCAL_DRAFT_STORE).get(lessonCode);
    request.onsuccess = () => resolve((request.result as LocalLessonDraft | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("LOCAL_DRAFT_READ_FAILED"));
    transaction.oncomplete = () => db.close();
  });
}

async function writeLocalLessonDraft(draft: LocalLessonDraft): Promise<void> {
  const db = await openLocalDraftDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(LOCAL_DRAFT_STORE, "readwrite");
    transaction.objectStore(LOCAL_DRAFT_STORE).put(draft);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("LOCAL_DRAFT_WRITE_FAILED")); };
  });
}

async function removeLocalLessonDraft(lessonCode: string): Promise<void> {
  const db = await openLocalDraftDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(LOCAL_DRAFT_STORE, "readwrite");
    transaction.objectStore(LOCAL_DRAFT_STORE).delete(lessonCode);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("LOCAL_DRAFT_DELETE_FAILED")); };
  });
}

export function GoldenLessonPackageBuilder() {
  const [registry, setRegistry] = useState<ContentCodeRegistry | null>(null);
  const [registryLoading, setRegistryLoading] = useState(true);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [gradeSlug, setGradeSlug] = useState("");
  const [selectedTrackCodes, setSelectedTrackCodes] = useState<string[]>([]);
  const [selectedSubjectCode, setSelectedSubjectCode] = useState("");
  const [selectedUnitCode, setSelectedUnitCode] = useState("");
  const [selectedLessonCode, setSelectedLessonCode] = useState("");
  const [uploads, setUploads] = useState<Partial<Record<GoldenCapability, UploadedArtifact>>>({});
  const [internalProvenance, setInternalProvenance] = useState<Partial<Record<GoldenCapability, UploadedArtifact>>>({});
  const [answerSets, setAnswerSets] = useState<Partial<Record<"selfTest" | "officialBookQuestions", Array<Record<string, unknown>>>>>({});
  const [answersCompanion, setAnswersCompanion] = useState<UploadedArtifact | null>(null);
  const [supplementalAssets, setSupplementalAssets] = useState<UploadedSupplementalAsset[]>([]);
  const [hashing, setHashing] = useState<GoldenCapability | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [capabilityErrors, setCapabilityErrors] = useState<Partial<Record<GoldenCapability, string[]>>>({});
  const [templateBusy, setTemplateBusy] = useState<GoldenCapability | null>(null);
  const [validation, setValidation] = useState<GoldenLessonValidationResult | null>(null);
  const [intake, setIntake] = useState<DirectIntakeResult | null>(null);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [intakeBusy, setIntakeBusy] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setRegistryLoading(true);
    void getContentCodeRegistry()
      .then((value) => {
        if (!active) return;
        setRegistry(value);
        setRegistryError(null);
      })
      .catch((error) => {
        if (!active) return;
        setRegistryError(error instanceof Error ? error.message : "تعذر تحميل هيكل المنهج.");
      })
      .finally(() => {
        if (active) setRegistryLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!registry) return;
    try {
      const raw = window.localStorage.getItem(LAST_CONTEXT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        gradeSlug?: string;
        trackCode?: string;
        trackCodes?: string[];
        subjectCode?: string;
        unitCode?: string;
        lessonCode?: string;
      };
      if (saved.gradeSlug) setGradeSlug(saved.gradeSlug);
      const restoredTracks = Array.isArray(saved.trackCodes)
        ? saved.trackCodes
        : saved.trackCode
          ? [saved.trackCode]
          : [];
      setSelectedTrackCodes(restoredTracks.filter((code) => code === "sanaa" || code === "aden"));
      if (saved.subjectCode) setSelectedSubjectCode(saved.subjectCode);
      if (saved.unitCode) setSelectedUnitCode(saved.unitCode);
      if (saved.lessonCode) setSelectedLessonCode(saved.lessonCode);
    } catch {
      window.localStorage.removeItem(LAST_CONTEXT_KEY);
    }
  }, [registry]);

  const availableTracks = useMemo(
    () => (registry?.tracks ?? []).filter((track) =>
      track.trackCode === "sanaa" || track.trackCode === "aden"
    ),
    [registry],
  );
  const subjects = useMemo(
    () => (registry?.subjects ?? []).filter((subject) =>
      (!gradeSlug || subject.gradeSlug === gradeSlug) &&
      (selectedTrackCodes.length === 0 ||
        selectedTrackCodes.every((code) => subject.trackCodes.includes(code))) &&
      subject.isOfficialCode
    ),
    [registry, gradeSlug, selectedTrackCodes],
  );
  const units = useMemo(
    () => (registry?.units ?? []).filter((unit) => unit.subjectCode === selectedSubjectCode),
    [registry, selectedSubjectCode],
  );
  const lessons = useMemo(
    () => (registry?.lessons ?? []).filter((lesson) =>
      lesson.subjectCode === selectedSubjectCode &&
      (selectedUnitCode ? lesson.unitCode === selectedUnitCode : lesson.unitCode === null)
    ),
    [registry, selectedSubjectCode, selectedUnitCode],
  );
  const selectedSubject = subjects.find((subject) => subject.subjectCode === selectedSubjectCode) ?? null;
  const selectedLesson = lessons.find((lesson) => lesson.lessonCode === selectedLessonCode) ?? null;
  const profileId = selectedSubject
    ? (/قرآن/.test(selectedSubject.name) ? GOLDEN_QURAN_V1.id : GOLDEN_CHEMISTRY_V1.id)
    : "";
  const profile = getGoldenLessonProfile(profileId);
  const packageCode = selectedLesson ? `${selectedLesson.lessonCode}-PKG` : "";
  const gradeCode = gradeSlug.toUpperCase();
  const trackCodes = selectedTrackCodes;
  const subjectCode = selectedSubjectCode;
  const lessonCode = selectedLesson?.lessonCode ?? "";
  const lessonSlug = lessonCode.toLowerCase();
  const unitCode = selectedLesson?.unitCode ?? "";
  // Legacy lesson rows may not have these operational fields yet. Derive stable
  // intake values locally so the operator is never sent to another page mid-flow.
  const semester = String(selectedLesson?.semester ?? 1);
  const selectedLessonIndex = lessons.findIndex((lesson) => lesson.lessonCode === selectedLessonCode);
  const existingSortOrder = selectedLesson?.sortOrder ?? 0;
  const sortOrder = String(
    existingSortOrder > 0 ? existingSortOrder : Math.max(1, selectedLessonIndex + 1),
  );
  const canonicalIdentityComplete = Boolean(
    profile && selectedSubject && selectedLesson && gradeCode && selectedTrackCodes.length > 0 &&
    semester && sortOrder,
  );

  useEffect(() => {
    if (!selectedLessonCode) {
      setDraftReady(false);
      setDraftMessage(null);
      return;
    }
    let active = true;
    setDraftReady(false);
    void readLocalLessonDraft(selectedLessonCode)
      .then((draft) => {
        if (!active || !draft) return;
        setUploads(draft.uploads);
        setInternalProvenance(draft.internalProvenance);
        setAnswerSets(draft.answerSets);
        setAnswersCompanion(draft.answersCompanion);
        setSupplementalAssets(draft.supplementalAssets);
        setDraftMessage(`تمت استعادة المسودة المحفوظة تلقائيًا في ${new Date(draft.savedAt).toLocaleString("ar-YE")}.`);
      })
      .catch(() => {
        if (active) setDraftMessage("تعذر استعادة المسودة المحلية؛ يمكنك متابعة الرفع بصورة طبيعية.");
      })
      .finally(() => {
        if (active) setDraftReady(true);
      });
    return () => { active = false; };
  }, [selectedLessonCode]);

  const artifacts = useMemo<GoldenLessonArtifact[]>(
    () =>
      GOLDEN_CAPABILITIES.map((capability) => ({
        capability,
        applicability: profile?.applicability[capability] ?? "NA",
        authority: GOLDEN_CAPABILITY_AUTHORITY[capability],
        sourcePath: uploads[capability]?.fileName ?? null,
        sha256: uploads[capability]?.sha256 ?? null,
        provenancePath: internalProvenance[capability]?.fileName ?? null,
        provenanceSha256: internalProvenance[capability]?.sha256 ?? null,
      })),
    [profile, uploads, internalProvenance],
  );

  const packageDraft = useMemo<GoldenLessonPackage>(
    () => ({
      schema: GOLDEN_LESSON_SCHEMA,
      profileId: profile?.id ?? "",
      packageCode: packageCode.trim(),
      identity: {
        gradeCode: gradeCode.trim().toUpperCase(),
        curriculumTrackCodes: trackCodes.map((code) => code.trim().toLowerCase()).filter(Boolean),
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
  const setCapabilityError = (capability: GoldenCapability, messages: string[] | null) => {
    setCapabilityErrors((current) => {
      const next = { ...current };
      if (messages && messages.length) next[capability] = messages;
      else delete next[capability];
      return next;
    });
    if (messages && messages.length) scrollToCapability(capability);
  };

  const handleCapabilityFile = async (capability: GoldenCapability, file?: File) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setCapabilityError(capability, [`الملف ${file.name} أكبر من 5 ميجابايت.`]);
      return;
    }
    const duplicate = Object.entries(uploads).some(
      ([key, item]) => key !== capability && item?.fileName === file.name,
    ) || answersCompanion?.fileName === file.name || supplementalAssets.some((item) => item.path === file.name);
    if (duplicate) {
      setCapabilityError(capability, [
        `اسم الملف ${file.name} مستخدم مسبقًا في مكوّن آخر؛ أعد تسميته باسم فريد ثم أعد الرفع.`,
      ]);
      return;
    }
    setFileError(null);
    setCapabilityError(capability, null);
    setValidation(null);
    setHashing(capability);
    try {
      let artifactFile = file;
      let displayName = file.name;
      let rowCount: number | undefined;
      let convertedAnswers: Array<Record<string, unknown>> | null = null;
      let convertedActivityAssets: File[] = [];
      if ((capability === "labExperimentHtml" || capability === "mindMapHtml") && /\.zip$/i.test(file.name)) {
        try {
          const converted = await convertHtml5ActivityZip(file);
          artifactFile = converted.htmlFile;
          displayName = `${file.name} (HTML5)`;
          convertedActivityAssets = converted.assets;
        } catch (zipError) {
          throw new Error(
            `تعذّر استخراج حزمة ZIP: ${zipError instanceof Error ? zipError.message : "ملف غير صالح"} — يجب أن تحتوي الحزمة ملف index.html في جذرها.`,
          );
        }
      }
      if (capability === "officialBookQuestions" || capability === "selfTest") {
        try {
          const converted = await convertQuestionWorkbook(capability, file);
          artifactFile = converted.publicFile;
          displayName = file.name;
          rowCount = converted.rowCount;
          convertedAnswers = converted.answers;
        } catch (excelError) {
          throw new Error(
            `تعذّرت قراءة ملف Excel: ${excelError instanceof Error ? excelError.message : "ملف غير صالح"} — استخدم القالب المعتمد أعلاه دون تغيير أسماء الأعمدة.`,
          );
        }
      }

      const bytes = new Uint8Array(await artifactFile.arrayBuffer());
      const artifactValidation = validateGoldenLessonArtifactBytes(capability, artifactFile.name, bytes);
      if (!artifactValidation.valid) {
        setUploads((current) => {
          const next = { ...current };
          delete next[capability];
          return next;
        });
        setCapabilityError(
          capability,
          Array.from(new Set(artifactValidation.findings.map(friendlyArtifactMessage))),
        );
        return;
      }
      const sha256 = await sha256Hex(artifactFile);
      if (GOLDEN_CAPABILITY_AUTHORITY[capability] === "OFFICIAL") {
        const provenanceFile = new File(
          [JSON.stringify({
            source: "REGISTERED_SUBJECT_TEXTBOOK",
            gradeCode: gradeCode.trim().toUpperCase(),
            subjectCode: subjectCode.trim().toUpperCase(),
            lessonCode: lessonCode.trim().toUpperCase(),
            artifactSha256: sha256,
          })],
          `${capability}.system-source.json`,
          { type: "application/json" },
        );
        const provenanceSha256 = await sha256Hex(provenanceFile);
        setInternalProvenance((current) => ({
          ...current,
          [capability]: {
            fileName: provenanceFile.name,
            displayName: "مرجع نظامي آلي",
            sha256: provenanceSha256,
            file: provenanceFile,
          },
        }));
      }
      if (convertedActivityAssets.length) {
        const declarations = await buildSupplementalAssetDeclarations(convertedActivityAssets, [
          { capability, html: await artifactFile.text() },
        ]);
        setSupplementalAssets((current) => {
          const replacing = new Set(declarations.map((asset) => asset.path));
          return [...current.filter((asset) => !replacing.has(asset.path)), ...declarations];
        });
      }
      if (convertedAnswers) {
        const nextAnswerSets = { ...answerSets, [capability]: convertedAnswers };
        setAnswerSets(nextAnswerSets);
        const answerFile = new File(
          [JSON.stringify({ reveal: "SERVER_CONTROLLED_REVEAL_ONLY", answers: Object.values(nextAnswerSets).flat() })],
          "answers.server-only.json",
          { type: "application/json" },
        );
        setAnswersCompanion({
          fileName: answerFile.name,
          displayName: "يُنشأ آليًا من القالبين 09 و10",
          sha256: await sha256Hex(answerFile),
          file: answerFile,
        });
      }
      setUploads((current) => ({
        ...current,
        [capability]: { fileName: artifactFile.name, displayName, sha256, file: artifactFile, rowCount },
      }));
    } catch (error) {
      setCapabilityError(capability, [
        error instanceof Error ? error.message : "تعذر فحص الملف.",
      ]);
    } finally {
      setHashing(null);
    }
  };

  const removeCapabilityFile = async (capability: GoldenCapability) => {
    setUploads((current) => {
      const next = { ...current };
      delete next[capability];
      return next;
    });
    setInternalProvenance((current) => {
      const next = { ...current };
      delete next[capability];
      return next;
    });
    if (capability === "selfTest" || capability === "officialBookQuestions") {
      const nextAnswerSets = { ...answerSets };
      delete nextAnswerSets[capability];
      setAnswerSets(nextAnswerSets);
      const combined = Object.values(nextAnswerSets).flat();
      if (combined.length === 0) {
        setAnswersCompanion(null);
      } else {
        const answerFile = new File(
          [JSON.stringify({ reveal: "SERVER_CONTROLLED_REVEAL_ONLY", answers: combined })],
          "answers.server-only.json",
          { type: "application/json" },
        );
        setAnswersCompanion({
          fileName: answerFile.name,
          displayName: "يُنشأ آليًا من القالبين 09 و10",
          sha256: await sha256Hex(answerFile),
          file: answerFile,
        });
      }
    }
    setValidation(null);
    setFileError(null);
    setCapabilityError(capability, null);
  };

  const hasSelectedFiles = Object.keys(uploads).length > 0 ||
    supplementalAssets.length > 0 || Boolean(answersCompanion);

  const clearSelectedFiles = () => {
    setUploads({});
    setInternalProvenance({});
    setAnswerSets({});
    setAnswersCompanion(null);
    setSupplementalAssets([]);
    setValidation(null);
    setFileError(null);
    setCapabilityErrors({});
    setIntake(null);
    setDraftMessage(null);
  };

  const allowContextChange = () =>
    !hasSelectedFiles || window.confirm("تغيير الدرس سيزيل الملفات المختارة من المسودة الحالية. هل تريد المتابعة؟");

  const chooseGrade = (value: string) => {
    if (!allowContextChange()) return;
    clearSelectedFiles();
    window.localStorage.removeItem(LAST_CONTEXT_KEY);
    setGradeSlug(value);
    setSelectedTrackCodes([]);
    setSelectedSubjectCode("");
    setSelectedUnitCode("");
    setSelectedLessonCode("");
  };

  const toggleTrack = (value: string) => {
    if (!allowContextChange()) return;
    clearSelectedFiles();
    window.localStorage.removeItem(LAST_CONTEXT_KEY);
    setSelectedTrackCodes((current) =>
      current.includes(value)
        ? current.filter((code) => code !== value)
        : [...current, value].sort(),
    );
    setSelectedSubjectCode("");
    setSelectedUnitCode("");
    setSelectedLessonCode("");
  };

  const chooseSubject = (value: string) => {
    if (!allowContextChange()) return;
    clearSelectedFiles();
    window.localStorage.removeItem(LAST_CONTEXT_KEY);
    setSelectedSubjectCode(value);
    setSelectedUnitCode("");
    setSelectedLessonCode("");
  };

  const chooseUnit = (value: string) => {
    if (!allowContextChange()) return;
    clearSelectedFiles();
    window.localStorage.removeItem(LAST_CONTEXT_KEY);
    setSelectedUnitCode(value === "__NO_UNIT__" ? "" : value);
    setSelectedLessonCode("");
  };

  const chooseLesson = (value: string) => {
    if (!allowContextChange()) return;
    clearSelectedFiles();
    setDraftReady(false);
    setSelectedLessonCode(value);
    window.localStorage.setItem(LAST_CONTEXT_KEY, JSON.stringify({
      gradeSlug,
      trackCodes: selectedTrackCodes,
      subjectCode: selectedSubjectCode,
      unitCode: selectedUnitCode,
      lessonCode: value,
    }));
  };

  const previewArtifact = (upload: UploadedArtifact) => {
    const url = URL.createObjectURL(upload.file);
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  useEffect(() => {
    if (!draftReady || !selectedLessonCode) return;
    const timer = window.setTimeout(() => {
      void writeLocalLessonDraft({
        lessonCode: selectedLessonCode,
        uploads,
        internalProvenance,
        answerSets,
        answersCompanion,
        supplementalAssets,
        savedAt: new Date().toISOString(),
      })
        .then(() => setDraftMessage("تم حفظ المسودة تلقائيًا على هذا الجهاز."))
        .catch(() => setDraftMessage("تعذر الحفظ التلقائي؛ لا تغادر الصفحة قبل الاستيراد."));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    draftReady,
    selectedLessonCode,
    uploads,
    internalProvenance,
    answerSets,
    answersCompanion,
    supplementalAssets,
  ]);

  const handleSupplementalAssets = async (files: File[]) => {
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
      const next = await buildSupplementalAssetDeclarations(
        files,
        htmlSources.filter((source): source is { capability: GoldenCapability; html: string } => Boolean(source)),
      );
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
      setFileError("اختر الدرس من هيكل المنهج أولًا.");
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

  useEffect(() => {
    if (!canonicalIdentityComplete) {
      setValidation(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void runValidation();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    canonicalIdentityComplete,
    uploads,
    internalProvenance,
    answersCompanion,
    supplementalAssets,
    selectedLessonCode,
  ]);

  /** Each declared file is uploaded directly; no lesson archive is created or uploaded. */
  const uploadAndVerifyDirectIntake = async () => {
    setIntakeBusy(true);
    setIntakeError(null);
    setIntake(null);
    try {
      const files = buildDirectIntakeFiles(
        uploads,
        internalProvenance,
        answersCompanion,
        supplementalAssets,
      );
      const slot = await createGoldenLessonDirectUpload({ data: { manifest: packageDraft } });
      for (const upload of slot.uploads) {
        const file = files.get(upload.logicalPath);
        if (!file) throw new Error(`DIRECT_DECLARED_FILE_MISSING:${upload.logicalPath}`);
        const uploaded = await supabase.storage
          .from(slot.bucket)
          .uploadToSignedUrl(upload.storagePath, upload.token, file, {
            contentType: directUploadContentType(file),
          });
        if (uploaded.error) throw new Error(uploaded.error.message);
      }
      const verified = await verifyAndStageGoldenLessonDirect({
        data: { intakeId: slot.intakeId, manifest: packageDraft },
      });
      setIntake(verified);
      if (selectedLessonCode) {
        await removeLocalLessonDraft(selectedLessonCode).catch(() => undefined);
        setDraftMessage("اكتمل حفظ المسودة على الخادم وحُذفت النسخة المحلية المؤقتة.");
      }
    } catch (error) {
      setIntakeError(error instanceof Error ? error.message : "DIRECT_INTAKE_FAILED");
    } finally {
      setIntakeBusy(false);
    }
  };

  return (
    <section dir="rtl" aria-labelledby="golden-package-builder-heading" className="rounded-2xl border border-primary/25 bg-card p-5 shadow-card space-y-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 id="golden-package-builder-heading" className="text-lg font-semibold">استيراد محتويات الدرس السبعة</h2>
          <Badge variant="secondary">مسودة آمنة</Badge>
        </div>
        <p className="text-sm text-muted-foreground max-w-3xl">
          ارفع كل محتوى في مكانه. لا يوجد ملف ZIP للدرس، ولا PDF للدرس، ولا ملف توثيق مصدر.
           «اختبر فهمك» وحده يستخدم Excel، وتُفصل إجاباته وتعليلاته آليًا في الطبقة الخادمية المحمية.
        </p>
       </div>

      <section aria-labelledby="lesson-context-heading" className="rounded-xl border bg-muted/20 p-4 space-y-4">
        <div className="space-y-1">
          <h3 id="lesson-context-heading" className="font-semibold">1. اختيار الدرس</h3>
          <p className="text-xs text-muted-foreground">
            اختر الدرس من الهيكل الرسمي؛ ينشئ النظام الأكواد والربط والإصدار تلقائيًا.
          </p>
        </div>
        {registryLoading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />جاري تحميل هيكل المنهج…
          </p>
        ) : registryError ? (
          <p role="alert" className="text-sm text-destructive">{registryError}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="lesson-import-grade">الصف</Label>
              <Select value={gradeSlug || undefined} onValueChange={chooseGrade}>
                <SelectTrigger id="lesson-import-grade" className="min-h-[44px]"><SelectValue placeholder="اختر الصف" /></SelectTrigger>
                <SelectContent>{(registry?.grades ?? []).map((grade) => (
                  <SelectItem key={grade.gradeSlug} value={grade.gradeSlug}>{grade.nameAr}</SelectItem>
                ))}</SelectContent>
              </Select>
            </div>
            <fieldset className="space-y-1.5" disabled={!gradeSlug}>
              <legend className="text-sm font-medium">المسار (اختيار متعدد)</legend>
              <div id="lesson-import-track" className="flex min-h-[44px] flex-wrap items-center gap-2 rounded-md border bg-background px-2 py-1.5">
                {availableTracks.map((track) => {
                  const checked = selectedTrackCodes.includes(track.trackCode);
                  return (
                    <label
                      key={track.trackCode}
                      htmlFor={`lesson-import-track-${track.trackCode}`}
                      className={`inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm ${checked ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"}`}
                    >
                      <input
                        id={`lesson-import-track-${track.trackCode}`}
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTrack(track.trackCode)}
                        className="h-4 w-4"
                      />
                      {track.nameAr}
                    </label>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">اختر صنعاء وعدن معًا عندما تكون المادة أو الكتاب مشتركًا بين المسارين.</p>
            </fieldset>
            <div className="space-y-1.5">
              <Label htmlFor="lesson-import-subject">المادة</Label>
              <Select value={selectedSubjectCode || undefined} onValueChange={chooseSubject} disabled={selectedTrackCodes.length === 0}>
                <SelectTrigger id="lesson-import-subject" className="min-h-[44px]"><SelectValue placeholder="اختر المادة" /></SelectTrigger>
                <SelectContent>{subjects.map((subject) => (
                  <SelectItem key={subject.subjectCode} value={subject.subjectCode}>{subject.name}</SelectItem>
                ))}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lesson-import-unit">الوحدة (اختيارية)</Label>
              <Select value={selectedUnitCode || "__NO_UNIT__"} onValueChange={chooseUnit} disabled={!selectedSubjectCode}>
                <SelectTrigger id="lesson-import-unit" className="min-h-[44px]"><SelectValue placeholder="اختر الوحدة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__NO_UNIT__">لا توجد وحدة — الدرس مرتبط بالمادة مباشرة</SelectItem>
                  {units.filter((unit) => Boolean(unit.unitCode)).map((unit) => (
                    <SelectItem key={unit.unitCode} value={unit.unitCode}>{unit.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedSubjectCode && units.length === 0 && (
                <p className="text-[11px] text-amber-700">لا توجد وحدات مسجلة لهذه المادة. يمكنك إضافة وحدة أو إبقاء الدرس مرتبطًا بالمادة مباشرة.</p>
              )}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="lesson-import-lesson">الدرس</Label>
              <Select value={selectedLessonCode || undefined} onValueChange={chooseLesson} disabled={!selectedSubjectCode}>
                <SelectTrigger id="lesson-import-lesson" className="min-h-[44px]"><SelectValue placeholder="اختر الدرس" /></SelectTrigger>
                <SelectContent>{lessons.map((lesson) => (
                  <SelectItem key={lesson.lessonCode} value={lesson.lessonCode}>{lesson.title}</SelectItem>
                ))}</SelectContent>
              </Select>
            </div>
          </div>
        )}
        {selectedLesson && (
          <div className={`rounded-lg border p-3 text-sm ${canonicalIdentityComplete ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/40 bg-amber-500/10"}`}>
            <p className="font-medium">{selectedSubject?.name} ← {selectedLesson.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              الفصل {semester} · الترتيب {sortOrder}
              {selectedLesson.unitCode ? ` · الوحدة: ${units.find((unit) => unit.unitCode === selectedLesson.unitCode)?.title ?? selectedLesson.unitCode}` : " · مرتبط بالمادة مباشرة"}
              {(!selectedLesson.semester || (selectedLesson.sortOrder ?? 0) <= 0) ? " · استكمل النظام البيانات التشغيلية تلقائيًا" : ""}
            </p>
          </div>
        )}
      </section>

      {draftMessage && (
        <p role="status" className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {draftMessage}
        </p>
      )}

      {!selectedLesson && (
        <div role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          أكمل اختيار الصف والمسار والمادة والدرس قبل رفع الملفات.
        </div>
      )}

      {canonicalIdentityComplete && <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span>اكتمال الملفات الإلزامية</span>
          <span className="font-semibold">{completedRequired}/{requiredCapabilities.length} — {completion}%</span>
        </div>
        <Progress value={completion} />
        <p className="text-xs text-muted-foreground">
          المكونات الاختيارية: التجارب المعملية وأنشطة وأسئلة الدرس؛ غيابهما لا يمنع حفظ بقية المحتوى.
        </p>
      </div>}

      <div className="space-y-3">
        {canonicalIdentityComplete && GOLDEN_CAPABILITIES.map((capability) => {
          const applicability = profile?.applicability[capability] ?? "NA";
          const authority = GOLDEN_CAPABILITY_AUTHORITY[capability];
          const upload = uploads[capability];
          const fileContract = GOLDEN_ARTIFACT_FILE_CONTRACTS[capability];
          return (
            <div key={capability} id={`golden-capability-${capability}`} className={`scroll-mt-24 rounded-xl border p-4 space-y-3 ${capability === "labExperimentHtml" ? "border-dashed bg-muted/15" : "bg-background"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{CAPABILITY_NUMBER[capability]}. {CAPABILITY_LABEL[capability]}</p>
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
                   <p className="text-xs text-muted-foreground">
                     المطلوب: {fileContract.sourceExpectedAr
                       ?? (capability === "labExperimentHtml" || capability === "mindMapHtml"
                         ? "HTML تفاعلي أو حزمة HTML5/ZIP تحتوي index.html"
                         : fileContract.expectedAr)}
                  </p>

                  {fileContract.formats.includes("HTML") && (
                    <ul className="list-disc space-y-0.5 pe-4 text-[11px] leading-relaxed text-muted-foreground">
                      <li>يجب أن يحتوي وسم html على dir="rtl".</li>
                      <li>بدون روابط خارجية (خطوط أو مكتبات على الإنترنت) — ضمِّن الأنماط داخل الملف.</li>
                      <li>
                        {capability === "labExperimentHtml" || capability === "mindMapHtml"
                          ? "JavaScript ومعالجات onclick مسموحة داخل المحتوى التفاعلي، وحزمة ZIP مقبولة إذا احتوت index.html في جذرها."
                          : "بدون وسم script أو معالجات onclick — المحتوى ثابت."}
                      </li>
                    </ul>
                  )}
                   {(capability === "selfTest" || capability === "officialBookQuestions") && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="min-h-[40px] gap-2"
                      disabled={templateBusy === capability}
                      onClick={() => {
                        const filename = capability === "selfTest"
                          ? "10_self_test_questions_template.xlsx"
                          : "09_official_book_questions_template.xlsx";
                        setTemplateBusy(capability);
                        void downloadTemplateFile(contentImportTemplateDownloadUrl(filename), filename)
                          .catch(() => {
                            window.open(contentImportTemplateDownloadUrl(filename), "_blank", "noopener");
                          })
                          .finally(() => setTemplateBusy(null));
                      }}
                    >
                      {templateBusy === capability
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Download className="h-4 w-4" />}
                      تنزيل القالب المعتمد
                    </Button>
                  )}
                  <ArabicFilePicker
                    id={`golden-artifact-${capability}`}
                     accept={fileContract.sourceAccept
                       ?? (capability === "labExperimentHtml" || capability === "mindMapHtml"
                         ? ".html,.zip,text/html,application/zip"
                         : ".html,text/html")}


                    disabled={hashing !== null}
                    fileName={upload?.displayName}
                    onFile={(file) => handleCapabilityFile(capability, file)}
                  />
                  {hashing === capability && <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />جارٍ فحص الملف…</p>}
                  {capabilityErrors[capability]?.length ? (
                    <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs">
                      <p className="flex items-center gap-2 font-semibold text-destructive">
                        <AlertCircle className="h-4 w-4" />
                        لم يُقبل الملف — صحّح ما يلي ثم أعد الاختيار:
                      </p>
                      <ul className="mt-2 list-disc space-y-1 pe-4 text-destructive">
                        {capabilityErrors[capability]!.map((message) => (
                          <li key={message}>{message}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {upload && (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 break-all text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="inline h-4 w-4 ms-1" />تم التحقق من الملف: {upload.displayName}
                          {upload.rowCount ? ` — ${upload.rowCount} سؤال` : ""}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 shrink-0 gap-1 text-destructive"
                          onClick={() => void removeCapabilityFile(capability)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />إزالة
                        </Button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {upload.fileName.endsWith(".html") && (
                          <Button type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={() => previewArtifact(upload)}>
                            <Eye className="h-3.5 w-3.5" />معاينة
                          </Button>
                        )}
                        <span className="text-[11px] text-muted-foreground">{Math.max(1, Math.round(upload.file.size / 1024))} كيلوبايت</span>
                      </div>
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

      {canonicalIdentityComplete && Object.values(uploads).some((upload) => upload?.fileName.endsWith(".html")) && <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 space-y-2">
        <Label>الصور والرسومات المشار إليها داخل ملفات HTML</Label>
        <ArabicMultiFilePicker
          id="golden-supplemental-assets"
          accept="image/png,image/jpeg,image/webp"
          disabled={hashing !== null || !canonicalIdentityComplete}
          selectedCount={supplementalAssets.length}
          onFiles={handleSupplementalAssets}
        />
        <p className="text-xs text-muted-foreground">يربط النظام الصور تلقائيًا بالملفات التي تشير إليها، ويرفض الصورة المفقودة أو غير المستخدمة.</p>
        {supplementalAssets.map((asset) => (
          <p key={asset.path} className="text-xs break-all text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="inline h-4 w-4 ms-1" />{asset.path} — {asset.assetCode}
            <br/><span className="font-mono text-[10px]">{asset.sha256}</span>
          </p>
        ))}
      </div>}

      {answersCompanion && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs">
          تم فصل الإجابات والتعليلات آليًا عن حمولة الطالب وربطها بالطبقة الخادمية المحمية.
        </div>
      )}

      {fileError && <p role="alert" className="text-sm text-destructive flex gap-2"><AlertCircle className="h-4 w-4 mt-0.5" />{fileError}</p>}

      {canonicalIdentityComplete && (
        <div className="rounded-xl border bg-muted/20 p-3 space-y-1 text-xs">
          <p className="font-medium text-sm">قائمة المكوّنات قبل الفحص</p>
          {GOLDEN_CAPABILITIES.filter((capability) => (profile?.applicability[capability] ?? "NA") !== "NA").map((capability) => {
            const done = Boolean(uploads[capability]);
            return (
              <p key={capability} className={done ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}>
                {done ? "✓" : "•"} ({CAPABILITY_NUMBER[capability]}) {CAPABILITY_LABEL[capability]} — {CAPABILITY_FORMAT_HINT[capability] ?? "HTML"}
                {done ? " — مرفوع" : " — بانتظار الملف"}
              </p>
            );
          })}
        </div>
      )}

      <div className="sticky bottom-3 z-10 flex flex-wrap gap-2 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
        <Button type="button" onClick={() => void runValidation()} disabled={hashing !== null || !canonicalIdentityComplete} className="min-h-[44px] gap-2"><FileCheck2 className="h-4 w-4" />فحص ومعاينة الملفات</Button>
        <Button type="button" disabled={!validation?.valid || intakeBusy} onClick={() => void uploadAndVerifyDirectIntake()} className="min-h-[44px] gap-2">
          {intakeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          حفظ واستيراد كمسودة
        </Button>
      </div>

      {intakeError && <p role="alert" className="text-sm text-destructive flex gap-2"><AlertCircle className="h-4 w-4 mt-0.5" />{intakeError}</p>}

      {intake && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-1 text-sm">
          <p className="font-medium flex gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5" />تم استيراد ملفات الدرس وربطها بإصدار المسودة</p>
          <p className="text-xs">تم حفظ الإصدار {intake.version} كمسودة آمنة{intake.idempotent ? " دون تكرار الكتابة" : ""}.</p>
          <p className="text-xs">عدد الملفات المتحقق منها: {intake.verifiedFileCount}. المحتوى غير ظاهر للطالب حتى المراجعة والاعتماد.</p>
          <Button asChild type="button" size="sm" variant="outline" className="mt-3">
            <a href="/admin/content-review">فتح مراجعة هذا الدرس</a>
          </Button>
        </div>
      )}

      {validation && (
        <div className={`rounded-xl border p-4 space-y-3 ${validation.valid ? "border-emerald-500/30 bg-emerald-500/10" : "border-destructive/30 bg-destructive/5"}`}>
          <p className="font-medium">{validation.valid ? "الملفات مكتملة وجاهزة للاستيراد" : "الملفات تحتاج تصحيحًا"}</p>
          {validation.findings.length > 0 && (() => {
            const friendly = toFriendlyFindings(validation.findings, Boolean(selectedLesson));
            const errors = friendly.filter((item) => item.severity === "ERROR");
            const warnings = friendly.filter((item) => item.severity === "WARNING");
            const renderItem = (item: FriendlyFinding) => (
              <li key={item.key} className="flex flex-wrap items-center gap-2 rounded-lg border bg-background/70 px-3 py-2">
                <Badge variant={item.severity === "ERROR" ? "destructive" : "outline"}>
                  {item.severity === "ERROR" ? "خطأ" : "تنبيه"}
                </Badge>
                <span className="flex-1">{item.text}</span>
                {item.capability && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-[36px]"
                    onClick={() => scrollToCapability(item.capability!)}
                  >
                    انتقال إلى المكوّن
                  </Button>
                )}
              </li>
            );
            return (
              <div className="space-y-3 text-sm">
                {errors.length > 0 && <ul className="space-y-1">{errors.map(renderItem)}</ul>}
                {warnings.length > 0 && (
                  <details className="rounded-lg border bg-background/50 px-3 py-2">
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      تفاصيل إضافية ({warnings.length})
                    </summary>
                    <ul className="mt-2 space-y-1">{warnings.map(renderItem)}</ul>
                  </details>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </section>
  );
}
