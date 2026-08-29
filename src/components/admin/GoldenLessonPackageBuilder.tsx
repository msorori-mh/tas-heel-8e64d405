import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Download,
  Eye,
  Loader2,
  Trash2,
  UploadCloud,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  createLessonComponentV2Upload,
  publishLessonComponentV2,
  verifyLessonComponentV2Upload,
  type LessonComponentV2Publication,
} from "@/lib/content-factory/lesson-component-publishing-v2.functions";
import {
  lessonComponentPublishErrorMessage,
  type LessonComponentPublishErrorMessage,
} from "@/lib/content-factory/lesson-component-publishing-v2-errors";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  type GoldenCapability,
} from "@/lib/content-factory/golden-lesson-contract";
import {
  GOLDEN_CHEMISTRY_V1,
  GOLDEN_QURAN_V1,
  getGoldenLessonProfile,
} from "@/lib/content-factory/golden-lesson-profiles";
import type { GoldenLessonValidationResult } from "@/lib/content-factory/golden-lesson-validator";
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
  officialBookContent: "محتوى الكتاب",
  tamkeenExplanationHtml: "شرح تمكين",
  lessonSummaryHtml: "ملخص الدرس",
  mindMapHtml: "الخريطة الذهنية",
  labExperimentHtml: "التجربة المعملية",
  officialBookQuestions: "أسئلة الكتاب",
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
      // REQUIRED_ARTIFACT_MISSING no longer exists: no component is mandatory, so a missing
      // file is simply a component not uploaded yet and never a finding.
      const text = `${label} — ${finding.messageAr}${hint ? ` (${hint})` : ""}`;
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

interface UploadedArtifact {
  fileName: string;
  displayName: string;
  sha256: string;
  file: File;
  rowCount?: number;
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
    <div className="flex min-h-[44px] min-w-0 items-center gap-2 rounded-md border bg-background px-2 py-1.5">
      {/* A plain input, not the shared <Input>. That component composes its classes through
          cn(), which does not treat `sr-only` as conflicting with its own `w-full h-9 px-3`,
          and Tailwind emits `sr-only` before the sizing utilities -- so the "hidden" field
          kept position:absolute but rendered at full width and pushed the page sideways.
          It stays focusable and labelled, so the keyboard and screen-reader path is intact. */}
      <input
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

/** يحوّل رموز مخالفات المعيار إلى جمل تصحيحية واضحة للمستخدم. */
const ARTIFACT_FIX_HINTS: Record<string, string> = {
  RTL_DIRECTION_MISSING: 'الملف لا يحتوي dir="rtl" — أضِف السمة إلى وسم <html> ثم أعد الرفع.',
  RESPONSIVE_VIEWPORT_MISSING:
    'وسم viewport مفقود — أضِف <meta name="viewport" content="width=device-width, initial-scale=1"> داخل <head>.',
  JS_NOT_ALLOWED_IN_STATIC_PROFILE:
    "الملف يحتوي كود JavaScript — الشرح والملخص والخريطة الذهنية يجب أن تكون HTML ثابتًا بلا وسم <script>.",
  INLINE_EVENT_HANDLER_FORBIDDEN:
    "الملف يحتوي معالجات أحداث مضمّنة مثل onclick — احذفها من الوسوم.",
  EXTERNAL_RESOURCE_FORBIDDEN:
    "الملف يشير إلى مصدر خارجي على الإنترنت (خط أو مكتبة أو صورة برابط https) — ضمِّن الأنماط والصور داخل ملف HTML نفسه.",
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

type AnswerSets = Partial<
  Record<"selfTest" | "officialBookQuestions", Array<Record<string, unknown>>>
>;

/**
 * The companion carries the server-only answer layer for the question templates in one
 * batch, and only those. Publishing "اختبر فهمك" on its own must not ship the book
 * questions' answers along with it, so the subset that is being published decides what
 * goes in -- never everything the operator happens to have loaded.
 */
async function buildAnswersCompanion(
  answerSets: AnswerSets,
  subset: GoldenCapability[] | null,
): Promise<UploadedArtifact | null> {
  const answers = (
    Object.entries(answerSets) as Array<[GoldenCapability, Array<Record<string, unknown>>]>
  )
    .filter(([capability]) => subset === null || subset.includes(capability))
    .flatMap(([, rows]) => rows ?? []);
  if (answers.length === 0) return null;
  const file = new File(
    [JSON.stringify({ reveal: "SERVER_CONTROLLED_REVEAL_ONLY", answers })],
    "answers.server-only.json",
    { type: "application/json" },
  );
  return {
    fileName: file.name,
    displayName: "يُنشأ آليًا من القالبين 09 و10",
    sha256: await sha256Hex(file),
    file,
  };
}

function componentUploadContentType(file: File): string {
  if (/\.html$/i.test(file.name)) return "text/html";
  if (/\.json$/i.test(file.name)) return "application/json";
  throw new Error(`LCPV2_FILE_TYPE_UNSUPPORTED:${file.name}`);
}

const LOCAL_DRAFT_DB = "tamkeen-lesson-import-drafts-v1";
const LOCAL_DRAFT_STORE = "drafts";
const LAST_CONTEXT_KEY = "tamkeen:last-lesson-import-context";

interface LocalLessonDraft {
  lessonCode: string;
  uploads: Partial<Record<GoldenCapability, UploadedArtifact>>;
  answerSets: Partial<Record<"selfTest" | "officialBookQuestions", Array<Record<string, unknown>>>>;
  answersCompanion: UploadedArtifact | null;
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
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error("LOCAL_DRAFT_WRITE_FAILED"));
    };
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
  const [answerSets, setAnswerSets] = useState<
    Partial<Record<"selfTest" | "officialBookQuestions", Array<Record<string, unknown>>>>
  >({});
  const [answersCompanion, setAnswersCompanion] = useState<UploadedArtifact | null>(null);
  const [hashing, setHashing] = useState<GoldenCapability | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [capabilityErrors, setCapabilityErrors] = useState<
    Partial<Record<GoldenCapability, string[]>>
  >({});
  const [templateBusy, setTemplateBusy] = useState<GoldenCapability | null>(null);
  const [validation, setValidation] = useState<GoldenLessonValidationResult | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  const [capabilityPublishBusy, setCapabilityPublishBusy] = useState<GoldenCapability | null>(null);
  const [capabilityPublishStage, setCapabilityPublishStage] = useState<
    Partial<Record<GoldenCapability, string>>
  >({});
  const [capabilityPublishError, setCapabilityPublishError] = useState<
    Partial<Record<GoldenCapability, LessonComponentPublishErrorMessage>>
  >({});
  const [capabilityPublication, setCapabilityPublication] = useState<
    Partial<Record<GoldenCapability, LessonComponentV2Publication>>
  >({});

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
    return () => {
      active = false;
    };
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
    () =>
      (registry?.tracks ?? []).filter(
        (track) => track.trackCode === "sanaa" || track.trackCode === "aden",
      ),
    [registry],
  );
  const subjects = useMemo(
    () =>
      (registry?.subjects ?? []).filter(
        (subject) =>
          (!gradeSlug || subject.gradeSlug === gradeSlug) &&
          (selectedTrackCodes.length === 0 ||
            selectedTrackCodes.every((code) => subject.trackCodes.includes(code))) &&
          subject.isOfficialCode,
      ),
    [registry, gradeSlug, selectedTrackCodes],
  );
  const units = useMemo(
    () => (registry?.units ?? []).filter((unit) => unit.subjectCode === selectedSubjectCode),
    [registry, selectedSubjectCode],
  );
  const lessons = useMemo(
    () =>
      (registry?.lessons ?? []).filter(
        (lesson) =>
          lesson.subjectCode === selectedSubjectCode &&
          (selectedUnitCode ? lesson.unitCode === selectedUnitCode : lesson.unitCode === null),
      ),
    [registry, selectedSubjectCode, selectedUnitCode],
  );
  const selectedSubject =
    subjects.find((subject) => subject.subjectCode === selectedSubjectCode) ?? null;
  const selectedLesson = lessons.find((lesson) => lesson.lessonCode === selectedLessonCode) ?? null;
  const profileId = selectedSubject
    ? /قرآن/.test(selectedSubject.name)
      ? GOLDEN_QURAN_V1.id
      : GOLDEN_CHEMISTRY_V1.id
    : "";
  const profile = getGoldenLessonProfile(profileId);
  // System-owned codes arrive lowercase (TCS-2). The package contract requires
  // stable uppercase Latin identifiers, so normalize here instead of asking the
  // operator to retype anything.
  const toContractCode = (value: string) =>
    value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const rawLessonCode = selectedLesson?.lessonCode ?? "";
  const subjectCode = toContractCode(selectedSubjectCode);
  const lessonCode = toContractCode(rawLessonCode);
  // Legacy lesson rows may not have these operational fields yet. Derive stable
  // intake values locally so the operator is never sent to another page mid-flow.
  const semester = String(selectedLesson?.semester ?? 1);
  const selectedLessonIndex = lessons.findIndex(
    (lesson) => lesson.lessonCode === selectedLessonCode,
  );
  const existingSortOrder = selectedLesson?.sortOrder ?? 0;
  const sortOrder = String(
    existingSortOrder > 0 ? existingSortOrder : Math.max(1, selectedLessonIndex + 1),
  );
  const canonicalIdentityComplete = Boolean(
    profile &&
    selectedSubject &&
    selectedLesson &&
    gradeSlug &&
    selectedTrackCodes.length > 0 &&
    semester &&
    sortOrder,
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
        setAnswerSets(draft.answerSets);
        setAnswersCompanion(draft.answersCompanion);
        setDraftMessage(
          `تمت استعادة المسودة المحفوظة تلقائيًا في ${new Date(draft.savedAt).toLocaleString("ar-YE")}.`,
        );
      })
      .catch(() => {
        if (active)
          setDraftMessage("تعذر استعادة المسودة المحلية؛ يمكنك متابعة الرفع بصورة طبيعية.");
      })
      .finally(() => {
        if (active) setDraftReady(true);
      });
    return () => {
      active = false;
    };
  }, [selectedLessonCode]);

  const uploadedCount = GOLDEN_CAPABILITIES.filter((capability) => uploads[capability]).length;
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
    const duplicate =
      Object.entries(uploads).some(
        ([key, item]) => key !== capability && item?.fileName === file.name,
      ) || answersCompanion?.fileName === file.name;
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
      if (
        (capability === "labExperimentHtml" || capability === "mindMapHtml") &&
        /\.zip$/i.test(file.name)
      ) {
        try {
          const converted = await convertHtml5ActivityZip(file);
          artifactFile = converted.htmlFile;
          displayName = `${file.name} (HTML5)`;
        } catch (zipError) {
          throw new Error(
            `تعذّر استخراج حزمة ZIP: ${zipError instanceof Error ? zipError.message : "ملف غير صالح"} — يجب أن تحتوي الحزمة ملف index.html في جذرها.`,
          );
        }
      }
      if (capability === "officialBookQuestions" || capability === "selfTest") {
        try {
          const converted = await convertQuestionWorkbook(capability, file, {
            expectedSubjectCode: subjectCode,
            expectedLessonCode: lessonCode,
            requireApproved: true,
            requireFourChoices: capability === "selfTest",
          });
          const otherQuestionCodes = new Set(
            Object.entries(answerSets)
              .filter(([key]) => key !== capability)
              .flatMap(([, answers]) => answers ?? [])
              .map((answer) =>
                String(answer.question_id ?? "")
                  .trim()
                  .toUpperCase(),
              )
              .filter(Boolean),
          );
          const crossTemplateDuplicates = converted.answers
            .map((answer) => String(answer.question_id ?? "").trim())
            .filter((code) => code && otherQuestionCodes.has(code.toUpperCase()));
          if (crossTemplateDuplicates.length) {
            throw new Error(
              `أكواد أسئلة مستخدمة في القالب الآخر: ${Array.from(new Set(crossTemplateDuplicates)).join("، ")}. يجب أن يكون question_code فريدًا بين القالبين 09 و10.`,
            );
          }
          artifactFile = converted.publicFile;
          displayName = file.name;
          rowCount = converted.rowCount;
          convertedAnswers = converted.answers;
        } catch (excelError) {
          const detail = excelError instanceof Error ? excelError.message : "ملف غير صالح";
          setCapabilityError(capability, [
            ...detail
              .split(" | ")
              .map((part) => part.trim())
              .filter(Boolean),
            "نزّل القالب المعتمد أعلاه ولا تغيّر أسماء الأعمدة أو اسم الورقة.",
          ]);
          return;
        }
      }

      if (artifactFile.size > MAX_FILE_BYTES) {
        throw new Error("حجم الملف بعد التحويل والتضمين أكبر من 5 ميجابايت.");
      }

      const bytes = new Uint8Array(await artifactFile.arrayBuffer());
      const artifactValidation = validateGoldenLessonArtifactBytes(
        capability,
        artifactFile.name,
        bytes,
      );
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
      if (convertedAnswers) {
        const nextAnswerSets = { ...answerSets, [capability]: convertedAnswers };
        setAnswerSets(nextAnswerSets);
        setAnswersCompanion(await buildAnswersCompanion(nextAnswerSets, null));
      }
      setUploads((current) => ({
        ...current,
        [capability]: {
          fileName: artifactFile.name,
          displayName,
          sha256,
          file: artifactFile,
          rowCount,
        },
      }));
    } catch (error) {
      setCapabilityError(capability, [error instanceof Error ? error.message : "تعذر فحص الملف."]);
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
    if (capability === "selfTest" || capability === "officialBookQuestions") {
      const nextAnswerSets = { ...answerSets };
      delete nextAnswerSets[capability];
      setAnswerSets(nextAnswerSets);
      setAnswersCompanion(await buildAnswersCompanion(nextAnswerSets, null));
    }
    setValidation(null);
    setFileError(null);
    setCapabilityError(capability, null);
  };

  const hasSelectedFiles = Object.keys(uploads).length > 0 || Boolean(answersCompanion);

  const clearSelectedFiles = () => {
    setUploads({});
    setAnswerSets({});
    setAnswersCompanion(null);
    setValidation(null);
    setFileError(null);
    setCapabilityErrors({});
    setCapabilityPublication({});
    setCapabilityPublishError({});
    setCapabilityPublishStage({});
    setDraftMessage(null);
  };

  const allowContextChange = () =>
    !hasSelectedFiles ||
    window.confirm("تغيير الدرس سيزيل الملفات المختارة من المسودة الحالية. هل تريد المتابعة؟");

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
    window.localStorage.setItem(
      LAST_CONTEXT_KEY,
      JSON.stringify({
        gradeSlug,
        trackCodes: selectedTrackCodes,
        subjectCode: selectedSubjectCode,
        unitCode: selectedUnitCode,
        lessonCode: value,
      }),
    );
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
        answerSets,
        answersCompanion,
        savedAt: new Date().toISOString(),
      })
        .then(() => setDraftMessage("تم حفظ المسودة تلقائيًا على هذا الجهاز."))
        .catch(() => setDraftMessage("تعذر الحفظ التلقائي؛ لا تغادر الصفحة قبل الاستيراد."));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draftReady, selectedLessonCode, uploads, answerSets, answersCompanion]);

  const runValidation = async () => {
    if (!profile) {
      setFileError("اختر الدرس من هيكل المنهج أولًا.");
      return;
    }
    setFileError(null);
    const findings: GoldenLessonValidationResult["findings"] = [];
    const artifactInputs: Partial<
      Record<GoldenCapability, { fileName: string; bytes: Uint8Array }>
    > = {};
    for (const capability of GOLDEN_CAPABILITIES) {
      const upload = uploads[capability];
      if (!upload) continue;
      const bytes = new Uint8Array(await upload.file.arrayBuffer());
      const artifactValidation = validateGoldenLessonArtifactBytes(
        capability,
        upload.fileName,
        bytes,
      );
      for (const finding of artifactValidation.findings) {
        findings.push({
          code: finding.code,
          severity: "ERROR",
          field: `artifacts.${capability}`,
          messageAr: finding.messageAr,
        });
      }
      if (capability === "officialBookQuestions" || capability === "selfTest") {
        artifactInputs[capability] = {
          fileName: upload.fileName,
          bytes,
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
    for (const finding of coverage.findings) {
      findings.push({
        code: finding.code,
        severity: "ERROR",
        field: "answers",
        messageAr: finding.messageAr,
      });
    }
    setValidation({
      valid: findings.length === 0,
      writesPerformed: 0,
      findings,
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
  }, [canonicalIdentityComplete, uploads, answersCompanion, selectedLessonCode]);

  /** Upload, verify and atomically publish exactly one component. */
  const publishCapabilityNow = async (capability: GoldenCapability) => {
    const source = uploads[capability];
    if (!source || !selectedLessonCode) return;
    setCapabilityPublishBusy(capability);
    setCapabilityPublishStage((current) => ({ ...current, [capability]: "جارٍ رفع الملف…" }));
    setCapabilityPublishError((current) => {
      const next = { ...current };
      delete next[capability];
      return next;
    });
    try {
      const answers = await buildAnswersCompanion(answerSets, [capability]);
      const slot = await createLessonComponentV2Upload({
        data: {
          lessonCode: selectedLessonCode,
          capability,
          source: {
            fileName: source.fileName,
            sha256: source.sha256,
            bytes: source.file.size,
            mimeType: componentUploadContentType(source.file),
          },
          ...(answers
            ? {
                answers: {
                  fileName: answers.fileName,
                  sha256: answers.sha256,
                  bytes: answers.file.size,
                  mimeType: "application/json",
                },
              }
            : {}),
        },
      });
      for (const upload of slot.uploads) {
        const file = upload.kind === "source" ? source.file : answers?.file;
        if (!file) throw new Error("LCPV2_DECLARED_FILE_MISSING");
        const result = await supabase.storage
          .from(slot.bucket)
          .uploadToSignedUrl(upload.storagePath, upload.token, file, {
            contentType: componentUploadContentType(file),
          });
        if (result.error) throw new Error(`LCPV2_UPLOAD_FAILED: ${result.error.message}`);
      }
      setCapabilityPublishStage((current) => ({ ...current, [capability]: "جارٍ فحص الملف…" }));
      await verifyLessonComponentV2Upload({ data: { intakeId: slot.intakeId } });
      setCapabilityPublishStage((current) => ({ ...current, [capability]: "جارٍ نشر المكوّن…" }));
      const publication = await publishLessonComponentV2({ data: { intakeId: slot.intakeId } });
      setCapabilityPublication((current) => ({
        ...current,
        [capability]: publication,
      }));
    } catch (error) {
      setCapabilityPublishError((current) => ({
        ...current,
        [capability]: lessonComponentPublishErrorMessage(error),
      }));
    } finally {
      setCapabilityPublishBusy(null);
      setCapabilityPublishStage((current) => {
        const next = { ...current };
        delete next[capability];
        return next;
      });
    }
  };

  return (
    <section
      dir="rtl"
      aria-labelledby="golden-package-builder-heading"
      className="rounded-2xl border border-primary/25 bg-card p-5 shadow-card space-y-5"
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 id="golden-package-builder-heading" className="text-lg font-semibold">
            استيراد محتويات الدرس السبعة
          </h2>
          <Badge variant="secondary">نشر مباشر</Badge>
        </div>
        <p className="text-sm text-muted-foreground max-w-3xl">
          ارفع كل محتوى في مكانه. لا يوجد ملف ZIP للدرس، ولا PDF للدرس، ولا ملف توثيق مصدر. «أسئلة
          الكتاب» و«اختبر فهمك» يستخدمان قالبي Excel المعتمدين 09 و10، وتُفصل الإجابات والتعليلات
          آليًا في الطبقة الخادمية المحمية.
        </p>
      </div>

      <section
        aria-labelledby="lesson-context-heading"
        className="rounded-xl border bg-muted/20 p-4 space-y-4"
      >
        <div className="space-y-1">
          <h3 id="lesson-context-heading" className="font-semibold">
            1. اختيار الدرس
          </h3>
          <p className="text-xs text-muted-foreground">
            اختر الدرس من الهيكل الرسمي؛ ينشئ النظام الأكواد والربط والإصدار تلقائيًا.
          </p>
        </div>
        {registryLoading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري تحميل هيكل المنهج…
          </p>
        ) : registryError ? (
          <p role="alert" className="text-sm text-destructive">
            {registryError}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="lesson-import-grade">الصف</Label>
              <Select value={gradeSlug ?? ""} onValueChange={chooseGrade}>
                <SelectTrigger id="lesson-import-grade" className="min-h-[44px]">
                  <SelectValue placeholder="اختر الصف" />
                </SelectTrigger>
                <SelectContent>
                  {(registry?.grades ?? []).map((grade) => (
                    <SelectItem key={grade.gradeSlug} value={grade.gradeSlug}>
                      {grade.nameAr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <fieldset className="space-y-1.5" disabled={!gradeSlug}>
              <legend className="text-sm font-medium">المسار (اختيار متعدد)</legend>
              <div
                id="lesson-import-track"
                className="flex min-h-[44px] flex-wrap items-center gap-2 rounded-md border bg-background px-2 py-1.5"
              >
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
              <p className="text-[11px] text-muted-foreground">
                اختر صنعاء وعدن معًا عندما تكون المادة أو الكتاب مشتركًا بين المسارين.
              </p>
            </fieldset>
            <div className="space-y-1.5">
              <Label htmlFor="lesson-import-subject">المادة</Label>
              <Select
                value={selectedSubjectCode ?? ""}
                onValueChange={chooseSubject}
                disabled={selectedTrackCodes.length === 0}
              >
                <SelectTrigger id="lesson-import-subject" className="min-h-[44px]">
                  <SelectValue placeholder="اختر المادة" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((subject) => (
                    <SelectItem key={subject.subjectCode} value={subject.subjectCode}>
                      {subject.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lesson-import-unit">الوحدة (اختيارية)</Label>
              <Select
                value={selectedUnitCode || "__NO_UNIT__"}
                onValueChange={chooseUnit}
                disabled={!selectedSubjectCode}
              >
                <SelectTrigger id="lesson-import-unit" className="min-h-[44px]">
                  <SelectValue placeholder="اختر الوحدة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__NO_UNIT__">
                    لا توجد وحدة — الدرس مرتبط بالمادة مباشرة
                  </SelectItem>
                  {units
                    .filter((unit) => Boolean(unit.unitCode))
                    .map((unit) => (
                      <SelectItem key={unit.unitCode} value={unit.unitCode}>
                        {unit.title}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {selectedSubjectCode && units.length === 0 && (
                <p className="text-[11px] text-amber-700">
                  لا توجد وحدات مسجلة لهذه المادة. يمكنك إضافة وحدة أو إبقاء الدرس مرتبطًا بالمادة
                  مباشرة.
                </p>
              )}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="lesson-import-lesson">الدرس</Label>
              <Select
                value={selectedLessonCode ?? ""}
                onValueChange={chooseLesson}
                disabled={!selectedSubjectCode}
              >
                <SelectTrigger id="lesson-import-lesson" className="min-h-[44px]">
                  <SelectValue placeholder="اختر الدرس" />
                </SelectTrigger>
                <SelectContent>
                  {lessons.map((lesson) => (
                    <SelectItem key={lesson.lessonCode} value={lesson.lessonCode}>
                      {lesson.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        {selectedLesson && (
          <div
            className={`rounded-lg border p-3 text-sm ${canonicalIdentityComplete ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/40 bg-amber-500/10"}`}
          >
            <p className="font-medium">
              {selectedSubject?.name} ← {selectedLesson.title}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              الفصل {semester} · الترتيب {sortOrder}
              {selectedLesson.unitCode
                ? ` · الوحدة: ${units.find((unit) => unit.unitCode === selectedLesson.unitCode)?.title ?? selectedLesson.unitCode}`
                : " · مرتبط بالمادة مباشرة"}
              {!selectedLesson.semester || (selectedLesson.sortOrder ?? 0) <= 0
                ? " · استكمل النظام البيانات التشغيلية تلقائيًا"
                : ""}
            </p>
          </div>
        )}
      </section>

      {draftMessage && (
        <p
          role="status"
          className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
        >
          {draftMessage}
        </p>
      )}

      {!selectedLesson && (
        <div
          role="status"
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
        >
          أكمل اختيار الصف والمسار والمادة والدرس قبل رفع الملفات.
        </div>
      )}

      {canonicalIdentityComplete && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>المكوّنات المرفوعة في هذه الدفعة</span>
            <span className="font-semibold">{uploadedCount} من 7</span>
          </div>
          <p className="text-xs text-muted-foreground">
            لا يوجد مكوّن إلزامي. ارفع ما جهز الآن وانشره؛ يظهر للطالب وحده دون انتظار بقية
            المكوّنات، وتستطيع العودة لاحقًا لرفع الباقي.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {canonicalIdentityComplete &&
          GOLDEN_CAPABILITIES.map((capability) => {
            const applicability = profile?.applicability[capability] ?? "NA";
            const authority = GOLDEN_CAPABILITY_AUTHORITY[capability];
            const upload = uploads[capability];
            const fileContract = GOLDEN_ARTIFACT_FILE_CONTRACTS[capability];
            return (
              <div
                key={capability}
                id={`golden-capability-${capability}`}
                className={`scroll-mt-24 rounded-xl border p-4 space-y-3 ${capability === "labExperimentHtml" ? "border-dashed bg-muted/15" : "bg-background"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {CAPABILITY_NUMBER[capability]}. {CAPABILITY_LABEL[capability]}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Badge variant={authority === "OFFICIAL" ? "default" : "secondary"}>
                      {authority === "OFFICIAL" ? "رسمي" : "تمكين"}
                    </Badge>
                    <Badge variant="outline">
                      {/* Each component publishes on its own; the only state worth showing
                          here is whether this one is part of the batch being prepared. */}
                      {uploads[capability] ? "جاهز للنشر" : "لم يُرفع بعد"}
                    </Badge>
                  </div>
                </div>
                {applicability !== "NA" && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      المطلوب:{" "}
                      {fileContract.sourceExpectedAr ??
                        (capability === "labExperimentHtml" || capability === "mindMapHtml"
                          ? "HTML تفاعلي أو حزمة HTML5/ZIP تحتوي index.html"
                          : fileContract.expectedAr)}
                    </p>

                    {fileContract.formats.includes("HTML") && (
                      <ul className="list-disc space-y-0.5 pe-4 text-[11px] leading-relaxed text-muted-foreground">
                        <li>يجب أن يحتوي وسم html على dir="rtl".</li>
                        <li>
                          بدون روابط خارجية (خطوط أو مكتبات على الإنترنت) — ضمِّن الأنماط داخل
                          الملف.
                        </li>
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
                          const filename =
                            capability === "selfTest"
                              ? "10_self_test_questions_template.xlsx"
                              : "09_official_book_questions_template.xlsx";
                          setTemplateBusy(capability);
                          void downloadTemplateFile(
                            contentImportTemplateDownloadUrl(filename),
                            filename,
                          )
                            .catch(() => {
                              window.open(
                                contentImportTemplateDownloadUrl(filename),
                                "_blank",
                                "noopener",
                              );
                            })
                            .finally(() => setTemplateBusy(null));
                        }}
                      >
                        {templateBusy === capability ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        تنزيل القالب المعتمد
                      </Button>
                    )}
                    <ArabicFilePicker
                      id={`golden-artifact-${capability}`}
                      accept={
                        fileContract.sourceAccept ??
                        (capability === "labExperimentHtml" || capability === "mindMapHtml"
                          ? ".html,.zip,text/html,application/zip"
                          : ".html,text/html")
                      }
                      disabled={hashing !== null}
                      fileName={upload?.displayName}
                      onFile={(file) => handleCapabilityFile(capability, file)}
                    />
                    {hashing === capability && (
                      <p className="text-xs text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        جارٍ فحص الملف…
                      </p>
                    )}
                    {capabilityErrors[capability]?.length ? (
                      <div
                        role="alert"
                        className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs"
                      >
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
                            <CheckCircle2 className="inline h-4 w-4 ms-1" />
                            تم التحقق من الملف: {upload.displayName}
                            {upload.rowCount ? ` — ${upload.rowCount} سؤال` : ""}
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 shrink-0 gap-1 text-destructive"
                            onClick={() => void removeCapabilityFile(capability)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            إزالة
                          </Button>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {/* Each component has its own publish button. Nothing here reads
                              the state of the other six: this one goes out on its own. */}
                          <Button
                            type="button"
                            size="sm"
                            className="h-9 min-h-[44px] gap-1 sm:min-h-0"
                            disabled={!canonicalIdentityComplete || capabilityPublishBusy !== null}
                            onClick={() => void publishCapabilityNow(capability)}
                          >
                            <UploadCloud className="h-3.5 w-3.5" />
                            {capabilityPublishBusy === capability
                              ? capabilityPublishStage[capability]
                              : "نشر هذا المكوّن"}
                          </Button>
                          {upload.fileName.endsWith(".html") && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1"
                              onClick={() => previewArtifact(upload)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              معاينة
                            </Button>
                          )}
                          <span className="text-[11px] text-muted-foreground">
                            {Math.max(1, Math.round(upload.file.size / 1024))} كيلوبايت
                          </span>
                        </div>
                        {capabilityPublication[capability] && (
                          <div
                            role="status"
                            className="mt-2 rounded-md border border-emerald-500/30 bg-background/60 p-2 text-[11px] text-emerald-700 dark:text-emerald-400"
                          >
                            {capabilityPublication[capability]!.steps.map((step) => (
                              <p key={step.key}>
                                ✓ {step.label}: {step.detail}
                              </p>
                            ))}
                            <p>
                              الإصدار {capabilityPublication[capability]!.publicationVersion}
                              {capabilityPublication[capability]!.idempotent
                                ? " — دون تكرار الكتابة"
                                : ""}
                            </p>
                          </div>
                        )}
                        {capabilityPublishError[capability] && (
                          <div
                            role="alert"
                            className="mt-2 space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-[11px] text-destructive"
                          >
                            <p className="font-medium">
                              {capabilityPublishError[capability]!.message}
                            </p>
                            <p>{capabilityPublishError[capability]!.action}</p>
                            <details className="text-muted-foreground">
                              <summary className="cursor-pointer">تفاصيل تقنية</summary>
                              <code className="mt-1 block break-all" dir="ltr">
                                {capabilityPublishError[capability]!.technicalDetail}
                              </code>
                            </details>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
                {applicability === "NA" && (
                  <p className="text-xs text-muted-foreground">
                    هذه القدرة غير منطبقة على نوع الدرس المختار.
                    {capability === "labExperimentHtml"
                      ? " لرفع تجربة معملية اختر نوع الدرس «الكيمياء»."
                      : ""}
                  </p>
                )}
              </div>
            );
          })}
      </div>

      {/* The separate image picker is gone. A lesson has seven components, not eight, and
          this looked like a mandatory eighth one. Images belong inside the HTML file that
          references them — embed them there and the component travels as one unit. */}

      {answersCompanion && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs">
          تم فصل الإجابات والتعليلات آليًا عن حمولة الطالب وربطها بالطبقة الخادمية المحمية.
        </div>
      )}

      {fileError && (
        <p role="alert" className="text-sm text-destructive flex gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          {fileError}
        </p>
      )}

      {canonicalIdentityComplete && (
        <div className="rounded-xl border bg-muted/20 p-3 space-y-1 text-xs">
          <p className="font-medium text-sm">قائمة المكوّنات قبل الفحص</p>
          {GOLDEN_CAPABILITIES.filter(
            (capability) => (profile?.applicability[capability] ?? "NA") !== "NA",
          ).map((capability) => {
            const done = Boolean(uploads[capability]);
            return (
              <p
                key={capability}
                className={
                  done ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"
                }
              >
                {done ? "✓" : "•"} ({CAPABILITY_NUMBER[capability]}) {CAPABILITY_LABEL[capability]}{" "}
                — {CAPABILITY_FORMAT_HINT[capability] ?? "HTML"}
                {done ? " — مرفوع" : " — بانتظار الملف"}
              </p>
            );
          })}
        </div>
      )}

      {validation && (
        <div
          className={`rounded-xl border p-4 space-y-3 ${
            validation.valid
              ? "border-emerald-500/30 bg-emerald-500/10"
              : "border-destructive/30 bg-destructive/5"
          }`}
        >
          {/* The local file check, and nothing else. A server refusal now belongs to the
              component that was being published and is shown on its row. */}
          <p className="font-medium">
            {validation.valid ? "فحص الملفات المحلي ناجح" : "الملفات تحتاج تصحيحًا"}
          </p>
          {validation.findings.length > 0 &&
            (() => {
              const friendly = toFriendlyFindings(validation.findings, Boolean(selectedLesson));
              const errors = friendly.filter((item) => item.severity === "ERROR");
              const warnings = friendly.filter((item) => item.severity === "WARNING");
              const renderItem = (item: FriendlyFinding) => (
                <li
                  key={item.key}
                  className="flex flex-wrap items-center gap-2 rounded-lg border bg-background/70 px-3 py-2"
                >
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
