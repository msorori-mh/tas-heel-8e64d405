import {
  ADEN_MEDIA_PLACEMENTS,
  MEDIA_FILE_NAME_RE,
  MEDIA_FOLDER,
  MEDIA_PLACEMENT_LABEL_AR,
  MEDIA_PLACEMENT_SORT_ORDER,
  MINISTERIAL_MEDIA_LIMITS,
  MINISTERIAL_MEDIA_PLACEMENTS,
  defaultAltText,
  detectImageMime,
  formatMediaBytes,
  isSafeZipEntryName,
  mimeForExtension,
  ministerialMediaStorageKey,
  normalizeMediaFileName,
  sha256HexOf,
  type MinisterialImageMimeType,
  type MinisterialMediaPlacement,
  type MinisterialPackageMedia,
} from "./ministerial-media-contract";

export const MINISTERIAL_PACKAGE_CONTRACT_VERSION = "ministerial_track_package_v1" as const;
/** v2 = v1 + optional per-question `media` (images shipped inside a ZIP). */
export const MINISTERIAL_PACKAGE_CONTRACT_VERSION_V2 = "ministerial_track_package_v2" as const;
export type MinisterialPackageContractVersion =
  | typeof MINISTERIAL_PACKAGE_CONTRACT_VERSION
  | typeof MINISTERIAL_PACKAGE_CONTRACT_VERSION_V2;

export type MinisterialPackageTrack = "sanaa" | "aden";

export type MinisterialPackageQuestion = {
  question_text: string;
  options: Array<{ option_code: "A" | "B" | "C" | "D"; body: string }>;
  correct_option_code: "A" | "B" | "C" | "D" | null;
  model_answer: string;
  explanation: string;
  display_order: number;
  marks: number;
  /**
   * Present ONLY when the question carries images. Packages without media keep
   * the exact v1 JSON shape so existing draft fingerprints still match (SKIP).
   */
  media?: MinisterialPackageMedia[];
};

export type MinisterialPackageModel = {
  model_label: string;
  academic_year: number;
  variant_code: string;
  worksheet_name: string;
  declared_question_count: number;
  questions: MinisterialPackageQuestion[];
};

export type MinisterialTrackPackage = {
  contract_version: MinisterialPackageContractVersion;
  track_code: MinisterialPackageTrack;
  subject_code: string;
  subject_name: string;
  source_filename: string;
  source_sha256: string;
  models: MinisterialPackageModel[];
};

/** One de-duplicated image extracted from the ZIP, ready for content-addressed upload. */
export type MinisterialMediaFile = {
  sha256: string;
  mime_type: MinisterialImageMimeType;
  file_size: number;
  storage_key: string;
  bytes: Uint8Array;
  file_names: string[];
};

export type MinisterialParsedPackage = {
  package: MinisterialTrackPackage;
  media: MinisterialMediaFile[];
  total_media_bytes: number;
};

export const MINISTERIAL_INDEX_SHEET = "📋 الفهرس";
export const MINISTERIAL_INDEX_HEADERS = [
  "اسم النموذج",
  "رقم النموذج",
  "السنة",
  "المادة",
  "عدد الأسئلة",
  "منشور",
  "اسم الورقة",
] as const;

export const SANAA_QUESTION_HEADERS = [
  "نص السؤال",
  "الخيار أ",
  "الخيار ب",
  "الخيار ج",
  "الخيار د",
  "الإجابة الصحيحة",
  "الشرح",
  "ترتيب العرض",
] as const;

export const ADEN_QUESTION_HEADERS = [
  "نص السؤال",
  "الإجابة النموذجية",
  "الشرح",
  "ترتيب العرض",
] as const;

/** Optional media columns (file name under media/ + Arabic alt text). */
export const MEDIA_HEADERS: Record<MinisterialMediaPlacement, { file: string; alt: string }> = {
  QUESTION: { file: "صورة السؤال", alt: "وصف صورة السؤال" },
  OPTION_A: { file: "صورة الخيار أ", alt: "وصف صورة الخيار أ" },
  OPTION_B: { file: "صورة الخيار ب", alt: "وصف صورة الخيار ب" },
  OPTION_C: { file: "صورة الخيار ج", alt: "وصف صورة الخيار ج" },
  OPTION_D: { file: "صورة الخيار د", alt: "وصف صورة الخيار د" },
  SOLUTION: { file: "صورة الحل", alt: "وصف صورة الحل" },
};

export const SANAA_MEDIA_HEADERS = MINISTERIAL_MEDIA_PLACEMENTS.flatMap((placement) => [
  MEDIA_HEADERS[placement].file,
  MEDIA_HEADERS[placement].alt,
]);

export const ADEN_MEDIA_HEADERS = ADEN_MEDIA_PLACEMENTS.flatMap((placement) => [
  MEDIA_HEADERS[placement].file,
  MEDIA_HEADERS[placement].alt,
]);

const MAX_MODELS = 50;
const MAX_QUESTIONS_PER_MODEL = 500;
const MAX_TOTAL_QUESTIONS = 5_000;
const MAX_TEXT_LENGTH = 20_000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** ZIP container = XLSX (≤25MB) + media (≤50MB) + zip overhead. */
const MAX_ZIP_BYTES = 60 * 1024 * 1024;

const IGNORED_ZIP_ENTRY_RE =
  /(?:(?:^|\/)(?:__MACOSX\/|\.DS_Store$|Thumbs\.db$|desktop\.ini$))|(?:^(?:[^/]+\/)?media\/README\.txt$)/i;

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    const rich = value as {
      text?: unknown;
      richText?: Array<{ text?: unknown }>;
      result?: unknown;
    };
    if (typeof rich.text === "string") return rich.text.trim();
    if (Array.isArray(rich.richText)) {
      return rich.richText
        .map((part) => String(part.text ?? ""))
        .join("")
        .trim();
    }
    if (rich.result !== undefined) return String(rich.result).trim();
  }
  return String(value).trim();
}

function normalizeHeader(value: unknown): string {
  return cellText(value)
    .replace(/\*/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedArabic(value: string): string {
  return value
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parsePositiveInteger(value: unknown, label: string, context: string): number {
  const parsed = Number(cellText(value));
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${context}: «${label}» يجب أن يكون عددًا صحيحًا موجبًا.`);
  }
  return parsed;
}

function normalizeCorrectOption(value: unknown, context: string): "A" | "B" | "C" | "D" {
  const normalized = cellText(value).trim().toUpperCase();
  const aliases: Record<string, "A" | "B" | "C" | "D"> = {
    A: "A",
    أ: "A",
    ا: "A",
    "1": "A",
    B: "B",
    ب: "B",
    "2": "B",
    C: "C",
    ج: "C",
    "3": "C",
    D: "D",
    د: "D",
    "4": "D",
  };
  const option = aliases[normalized];
  if (!option) {
    throw new Error(`${context}: الإجابة الصحيحة يجب أن تكون أ أو ب أو ج أو د.`);
  }
  return option;
}

function assertText(value: string, label: string, context: string): string {
  if (!value) throw new Error(`${context}: «${label}» إلزامي.`);
  if (value.length > MAX_TEXT_LENGTH) {
    throw new Error(`${context}: «${label}» يتجاوز الحد الأقصى (${MAX_TEXT_LENGTH} حرف).`);
  }
  return value;
}

type WorksheetLike = {
  rowCount: number;
  columnCount: number;
  getRow: (row: number) => { getCell: (column: number) => { value: unknown } };
};

function findHeaderRow(
  worksheet: WorksheetLike,
  requiredHeaders: readonly string[],
): { rowNumber: number; columns: Map<string, number>; duplicates: string[] } {
  const scanUntil = Math.min(worksheet.rowCount, 12);
  for (let rowNumber = 1; rowNumber <= scanUntil; rowNumber += 1) {
    const columns = new Map<string, number>();
    const duplicates: string[] = [];
    for (let column = 1; column <= worksheet.columnCount; column += 1) {
      const header = normalizeHeader(worksheet.getRow(rowNumber).getCell(column).value);
      if (!header) continue;
      if (columns.has(header)) duplicates.push(header);
      else columns.set(header, column);
    }
    if (requiredHeaders.every((header) => columns.has(header))) {
      return { rowNumber, columns, duplicates };
    }
  }
  throw new Error(`لم يُعثر على صف الأعمدة المعتمد: ${requiredHeaders.join("، ")}.`);
}

function rowValue(
  worksheet: { getRow: (row: number) => { getCell: (column: number) => { value: unknown } } },
  rowNumber: number,
  columns: Map<string, number>,
  header: string,
): string {
  const column = columns.get(header);
  return column ? cellText(worksheet.getRow(rowNumber).getCell(column).value) : "";
}

function assertAllowedHeaders(
  header: { columns: Map<string, number>; duplicates: string[] },
  requiredHeaders: readonly string[],
  optionalHeaders: readonly string[],
  context: string,
) {
  const allowed = new Set<string>([...requiredHeaders, ...optionalHeaders]);
  const unexpected = [...header.columns.keys()].filter((name) => !allowed.has(name));
  if (unexpected.length > 0 || header.duplicates.length > 0) {
    const detail =
      unexpected.length > 0 ? unexpected.join("، ") : `تكرار: ${header.duplicates.join("، ")}`;
    throw new Error(`${context}: يجب استخدام أعمدة القالب فقط. الأعمدة غير المعتمدة: ${detail}.`);
  }
}

async function excelModule() {
  const module = await import("exceljs");
  return (
    "Workbook" in module ? module : (module as { default: typeof module }).default
  ) as typeof module;
}

async function zipModule() {
  const module = await import("jszip");
  return ("default" in module ? module.default : module) as typeof import("jszip");
}

// ---------------------------------------------------------------------------
// ZIP container (XLSX + media/)
// ---------------------------------------------------------------------------

/**
 * `internalStream` is a public runtime method of JSZipObject (documented in
 * jszip's `ZipObject#internalStream`) that the bundled typings omit.
 */
type ZipEntryLike = import("jszip").JSZipObject & {
  _data?: { uncompressedSize?: number; compressedSize?: number };
  internalStream: (type: "uint8array") => import("jszip").JSZipStreamHelper<Uint8Array>;
};

type MediaEntry = { name: string; bareName: string; entry: ZipEntryLike; declaredSize: number };

type OpenedPackage = {
  xlsxBytes: Uint8Array;
  xlsxName: string;
  /** Lower-cased bare file name → entry. */
  mediaEntries: Map<string, MediaEntry>;
};

function declaredSizes(entry: ZipEntryLike): { uncompressed: number; compressed: number } {
  const uncompressed = Number(entry._data?.uncompressedSize ?? -1);
  const compressed = Number(entry._data?.compressedSize ?? -1);
  return {
    uncompressed: Number.isFinite(uncompressed) ? uncompressed : -1,
    compressed: Number.isFinite(compressed) ? compressed : -1,
  };
}

/**
 * Inflate one entry while counting bytes; aborts as soon as the output exceeds
 * `maxBytes` so a lying central directory cannot turn into a memory bomb.
 */
function readEntryBounded(
  entry: ZipEntryLike,
  maxBytes: number,
  label: string,
): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let total = 0;
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const stream = entry.internalStream("uint8array");
    stream
      .on("data", (chunk: Uint8Array) => {
        if (settled) return;
        total += chunk.byteLength;
        if (total > maxBytes) {
          try {
            stream.pause();
          } catch {
            /* stream already finished */
          }
          fail(
            new Error(
              `«${label}» يتجاوز الحد الأقصى المسموح (${formatMediaBytes(maxBytes)}) بعد فك الضغط.`,
            ),
          );
          return;
        }
        chunks.push(chunk);
      })
      .on("error", (error: Error) => fail(new Error(`تعذر فك ضغط «${label}»: ${error.message}`)))
      .on("end", () => {
        if (settled) return;
        settled = true;
        const out = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          out.set(chunk, offset);
          offset += chunk.byteLength;
        }
        resolve(out);
      })
      .resume();
  });
}

async function openPackageZip(bytes: Uint8Array): Promise<OpenedPackage> {
  const JSZip = await zipModule();
  let zip: import("jszip");
  try {
    zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  } catch (error) {
    throw new Error(
      `تعذرت قراءة ملف ZIP (${error instanceof Error ? error.message : "ملف غير صالح"}).`,
    );
  }

  const rawEntries = Object.values(zip.files) as ZipEntryLike[];
  if (rawEntries.length > MINISTERIAL_MEDIA_LIMITS.maxZipEntries) {
    throw new Error(
      `حزمة ZIP تحتوي عددًا كبيرًا من الملفات (الحد ${MINISTERIAL_MEDIA_LIMITS.maxZipEntries}).`,
    );
  }

  const files = rawEntries.filter((entry) => !entry.dir);
  for (const entry of files) {
    if (!isSafeZipEntryName(entry.name)) {
      throw new Error(`اسم ملف غير آمن داخل الحزمة: «${entry.name}».`);
    }
  }

  // Tolerate a single wrapper folder (common when a folder is zipped on desktop).
  const meaningful = files.filter((entry) => !IGNORED_ZIP_ENTRY_RE.test(entry.name));
  let prefix = "";
  const firstSlash = meaningful[0]?.name.indexOf("/") ?? -1;
  if (firstSlash > 0) {
    const candidate = meaningful[0]!.name.slice(0, firstSlash + 1);
    if (
      candidate.toLowerCase() !== MEDIA_FOLDER &&
      meaningful.every((entry) => entry.name.startsWith(candidate))
    ) {
      prefix = candidate;
    }
  }

  const xlsxCandidates: ZipEntryLike[] = [];
  const mediaEntries = new Map<string, MediaEntry>();
  let declaredMediaTotal = 0;

  for (const entry of meaningful) {
    const relative = entry.name.slice(prefix.length);
    const sizes = declaredSizes(entry);
    if (sizes.uncompressed < 0 || sizes.compressed < 0) {
      throw new Error(`تعذر قراءة بيانات الحجم للملف «${relative}» داخل الحزمة.`);
    }
    if (
      sizes.compressed > 0 &&
      sizes.uncompressed / sizes.compressed > MINISTERIAL_MEDIA_LIMITS.maxCompressionRatio
    ) {
      throw new Error(`نسبة ضغط مريبة للملف «${relative}» — رُفضت الحزمة.`);
    }

    if (/\.xlsx$/i.test(relative) && !relative.includes("/")) {
      if (sizes.uncompressed > MAX_FILE_BYTES) {
        throw new Error("حجم ملف XLSX داخل الحزمة يتجاوز 25MB.");
      }
      xlsxCandidates.push(entry);
      continue;
    }

    if (relative.toLowerCase().startsWith(MEDIA_FOLDER)) {
      const bareName = relative.slice(MEDIA_FOLDER.length);
      if (!bareName) continue;
      if (bareName.includes("/")) {
        throw new Error(`لا يُسمح بمجلدات فرعية داخل media/: «${relative}».`);
      }
      if (!MEDIA_FILE_NAME_RE.test(bareName)) {
        throw new Error(
          `اسم صورة غير مقبول «${bareName}». يُسمح بـ PNG أو JPG أو WebP فقط وبأسماء بسيطة.`,
        );
      }
      if (sizes.uncompressed > MINISTERIAL_MEDIA_LIMITS.maxImageBytes) {
        throw new Error(
          `الصورة «${bareName}» تتجاوز الحد الأقصى (${formatMediaBytes(MINISTERIAL_MEDIA_LIMITS.maxImageBytes)}).`,
        );
      }
      const key = bareName.toLowerCase();
      if (mediaEntries.has(key)) {
        throw new Error(`اسم الصورة «${bareName}» مكرر داخل media/ (الأسماء يجب أن تكون فريدة).`);
      }
      declaredMediaTotal += sizes.uncompressed;
      if (declaredMediaTotal > MINISTERIAL_MEDIA_LIMITS.maxTotalBytes) {
        throw new Error(
          `إجمالي حجم الصور يتجاوز الحد الأقصى (${formatMediaBytes(MINISTERIAL_MEDIA_LIMITS.maxTotalBytes)}).`,
        );
      }
      mediaEntries.set(key, { name: relative, bareName, entry, declaredSize: sizes.uncompressed });
      continue;
    }

    throw new Error(
      `ملف غير متوقع داخل الحزمة: «${relative}». يجب أن تحتوي الحزمة على ملف XLSX واحد ومجلد media/ فقط.`,
    );
  }

  if (xlsxCandidates.length !== 1) {
    throw new Error(
      xlsxCandidates.length === 0
        ? "حزمة ZIP لا تحتوي ملف XLSX في المستوى الأعلى."
        : "حزمة ZIP يجب أن تحتوي ملف XLSX واحدًا فقط.",
    );
  }
  const xlsxEntry = xlsxCandidates[0]!;
  const xlsxBytes = await readEntryBounded(xlsxEntry, MAX_FILE_BYTES, xlsxEntry.name);
  return { xlsxBytes, xlsxName: xlsxEntry.name.slice(prefix.length), mediaEntries };
}

// ---------------------------------------------------------------------------
// Media reference resolution
// ---------------------------------------------------------------------------

type MediaRef = {
  placement: MinisterialMediaPlacement;
  fileName: string;
  altText: string;
  context: string;
};

function readMediaRefs(
  worksheet: WorksheetLike,
  rowNumber: number,
  columns: Map<string, number>,
  placements: readonly MinisterialMediaPlacement[],
  context: string,
): MediaRef[] {
  const refs: MediaRef[] = [];
  for (const placement of placements) {
    const headers = MEDIA_HEADERS[placement];
    const rawName = rowValue(worksheet, rowNumber, columns, headers.file);
    const altText = rowValue(worksheet, rowNumber, columns, headers.alt);
    if (!rawName) {
      if (altText) {
        throw new Error(`${context}: «${headers.alt}» مذكور بدون «${headers.file}».`);
      }
      continue;
    }
    const fileName = normalizeMediaFileName(rawName);
    if (fileName.includes("/") || !MEDIA_FILE_NAME_RE.test(fileName)) {
      throw new Error(
        `${context}: «${headers.file}» يجب أن يكون اسم ملف صورة (PNG/JPG/WebP) داخل مجلد media/ بدون مسارات.`,
      );
    }
    if (altText.length > MINISTERIAL_MEDIA_LIMITS.maxAltTextChars) {
      throw new Error(
        `${context}: «${headers.alt}» يتجاوز ${MINISTERIAL_MEDIA_LIMITS.maxAltTextChars} حرفًا.`,
      );
    }
    refs.push({ placement, fileName, altText: altText || defaultAltText(placement), context });
  }
  return refs;
}

async function resolveMedia(
  entries: Map<string, MediaEntry>,
  refs: Iterable<MediaRef>,
): Promise<{
  byName: Map<string, MinisterialMediaFile>;
  files: MinisterialMediaFile[];
  total: number;
}> {
  const byName = new Map<string, MinisterialMediaFile>();
  const bySha = new Map<string, MinisterialMediaFile>();
  const referenced = new Set<string>();
  let total = 0;

  for (const ref of refs) {
    const key = ref.fileName.toLowerCase();
    referenced.add(key);
    if (byName.has(key)) continue;
    const entry = entries.get(key);
    if (!entry) {
      throw new Error(`${ref.context}: الصورة «${ref.fileName}» غير موجودة داخل مجلد media/.`);
    }
    const bytes = await readEntryBounded(
      entry.entry,
      MINISTERIAL_MEDIA_LIMITS.maxImageBytes,
      entry.bareName,
    );
    if (bytes.byteLength === 0) throw new Error(`الصورة «${entry.bareName}» فارغة.`);
    const sniffed = detectImageMime(bytes);
    if (!sniffed) {
      throw new Error(
        `الصورة «${entry.bareName}» ليست PNG أو JPEG أو WebP صالحة (فحص محتوى الملف). ملفات SVG غير مقبولة.`,
      );
    }
    const byExtension = mimeForExtension(entry.bareName);
    if (byExtension !== sniffed) {
      throw new Error(`امتداد الصورة «${entry.bareName}» لا يطابق محتواها الفعلي (${sniffed}).`);
    }
    const sha256 = await sha256HexOf(bytes);
    let file = bySha.get(sha256);
    if (!file) {
      file = {
        sha256,
        mime_type: sniffed,
        file_size: bytes.byteLength,
        storage_key: ministerialMediaStorageKey(sha256, sniffed),
        bytes,
        file_names: [],
      };
      bySha.set(sha256, file);
      total += bytes.byteLength;
      if (total > MINISTERIAL_MEDIA_LIMITS.maxTotalBytes) {
        throw new Error(
          `إجمالي حجم الصور يتجاوز الحد الأقصى (${formatMediaBytes(MINISTERIAL_MEDIA_LIMITS.maxTotalBytes)}).`,
        );
      }
    }
    file.file_names.push(entry.bareName);
    byName.set(key, file);
  }

  const unreferenced = [...entries.values()].filter(
    (entry) => !referenced.has(entry.bareName.toLowerCase()),
  );
  if (unreferenced.length > 0) {
    throw new Error(
      `صور داخل media/ غير مستخدمة في أي سؤال: ${unreferenced
        .slice(0, 5)
        .map((entry) => `«${entry.bareName}»`)
        .join("، ")}${unreferenced.length > 5 ? " …" : ""}.`,
    );
  }

  return { byName, files: [...bySha.values()], total };
}

// ---------------------------------------------------------------------------
// Workbook parsing
// ---------------------------------------------------------------------------

type ParseInput = {
  trackCode: MinisterialPackageTrack;
  subjectCode: string;
  subjectName: string;
};

type PendingQuestion = { question: MinisterialPackageQuestion; refs: MediaRef[] };

async function parseWorkbookBytes(
  bytes: Uint8Array,
  input: ParseInput,
): Promise<{
  models: Array<Omit<MinisterialPackageModel, "questions"> & { questions: PendingQuestion[] }>;
}> {
  if (bytes.byteLength === 0) throw new Error("ملف الاستيراد فارغ.");
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error("حجم ملف الاستيراد يتجاوز 25MB.");

  const ExcelJS = await excelModule();
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch (error) {
    throw new Error(
      `تعذرت قراءة ملف XLSX. تأكد من استخدام القالب المعتمد (${error instanceof Error ? error.message : "ملف غير صالح"}).`,
    );
  }

  const indexSheet = workbook.worksheets.find(
    (sheet) => sheet.name.trim() === MINISTERIAL_INDEX_SHEET,
  );
  if (!indexSheet) throw new Error(`ورقة «${MINISTERIAL_INDEX_SHEET}» مفقودة.`);
  const indexHeader = findHeaderRow(indexSheet, MINISTERIAL_INDEX_HEADERS);
  assertAllowedHeaders(indexHeader, MINISTERIAL_INDEX_HEADERS, [], "ورقة الفهرس");
  const indexRows: Array<{
    rowNumber: number;
    modelLabel: string;
    variantNumber: number;
    year: number;
    worksheetName: string;
    declaredCount: number;
  }> = [];
  const seenSheets = new Set<string>();

  for (
    let rowNumber = indexHeader.rowNumber + 1;
    rowNumber <= indexSheet.rowCount;
    rowNumber += 1
  ) {
    const modelLabel = rowValue(indexSheet, rowNumber, indexHeader.columns, "اسم النموذج");
    const worksheetName = rowValue(indexSheet, rowNumber, indexHeader.columns, "اسم الورقة");
    if (!modelLabel && !worksheetName) continue;
    const context = `الفهرس، الصف ${rowNumber}`;
    assertText(modelLabel, "اسم النموذج", context);
    assertText(worksheetName, "اسم الورقة", context);
    const variantNumber = parsePositiveInteger(
      rowValue(indexSheet, rowNumber, indexHeader.columns, "رقم النموذج"),
      "رقم النموذج",
      context,
    );
    if (variantNumber > 99) throw new Error(`${context}: رقم النموذج يجب أن يكون بين 1 و99.`);
    const subjectName = rowValue(indexSheet, rowNumber, indexHeader.columns, "المادة");
    if (
      subjectName &&
      normalizedArabic(subjectName) !== normalizedArabic(input.subjectName) &&
      subjectName.trim().toLowerCase() !== input.subjectCode.trim().toLowerCase()
    ) {
      throw new Error(
        `${context}: المادة «${subjectName}» لا تطابق المادة المختارة «${input.subjectName}».`,
      );
    }
    const published = rowValue(indexSheet, rowNumber, indexHeader.columns, "منشور");
    if (published && !["لا", "no", "false", "0"].includes(published.trim().toLowerCase())) {
      throw new Error(`${context}: الاستيراد ينشئ مسودة فقط؛ يجب أن تكون قيمة «منشور» = لا.`);
    }
    const year = parsePositiveInteger(
      rowValue(indexSheet, rowNumber, indexHeader.columns, "السنة"),
      "السنة",
      context,
    );
    if (year < 2000 || year > 2100)
      throw new Error(`${context}: السنة يجب أن تكون بين 2000 و2100.`);
    const declaredCount = parsePositiveInteger(
      rowValue(indexSheet, rowNumber, indexHeader.columns, "عدد الأسئلة"),
      "عدد الأسئلة",
      context,
    );
    if (seenSheets.has(worksheetName))
      throw new Error(`${context}: اسم الورقة «${worksheetName}» مكرر.`);
    seenSheets.add(worksheetName);
    indexRows.push({ rowNumber, modelLabel, variantNumber, year, worksheetName, declaredCount });
  }

  if (indexRows.length === 0) throw new Error("الفهرس لا يحتوي أي نموذج.");
  if (indexRows.length > MAX_MODELS)
    throw new Error(`الملف يتجاوز الحد الأقصى (${MAX_MODELS} نموذجًا).`);

  const seenVariants = new Set<string>();
  for (const row of indexRows) {
    const key = `${row.year}:${row.variantNumber}`;
    if (seenVariants.has(key)) {
      throw new Error(
        `الفهرس، الصف ${row.rowNumber}: رقم النموذج ${row.variantNumber} مكرر في سنة ${row.year}.`,
      );
    }
    seenVariants.add(key);
  }
  const isSanaa = input.trackCode === "sanaa";
  const expectedQuestionHeaders = isSanaa ? SANAA_QUESTION_HEADERS : ADEN_QUESTION_HEADERS;
  const optionalMediaHeaders = isSanaa ? SANAA_MEDIA_HEADERS : ADEN_MEDIA_HEADERS;
  const mediaPlacements: readonly MinisterialMediaPlacement[] = isSanaa
    ? MINISTERIAL_MEDIA_PLACEMENTS
    : ADEN_MEDIA_PLACEMENTS;
  let totalQuestions = 0;
  const models: Array<
    Omit<MinisterialPackageModel, "questions"> & { questions: PendingQuestion[] }
  > = [];

  for (const indexRow of indexRows) {
    const worksheet = workbook.worksheets.find(
      (sheet) => sheet.name.trim() === indexRow.worksheetName.trim(),
    );
    if (!worksheet) {
      throw new Error(`الفهرس يشير إلى ورقة غير موجودة: «${indexRow.worksheetName}».`);
    }
    let header: ReturnType<typeof findHeaderRow>;
    try {
      header = findHeaderRow(worksheet, expectedQuestionHeaders);
      assertAllowedHeaders(
        header,
        expectedQuestionHeaders,
        optionalMediaHeaders,
        `ورقة «${indexRow.worksheetName}»`,
      );
    } catch {
      throw new Error(
        `ورقة «${indexRow.worksheetName}» لا تطابق قالب ${isSanaa ? "صنعاء (اختيار متعدد)" : "عدن (إجابة نصية)"}.`,
      );
    }
    const questions: PendingQuestion[] = [];
    const seenOrders = new Set<number>();
    for (let rowNumber = header.rowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const questionText = rowValue(worksheet, rowNumber, header.columns, "نص السؤال");
      if (!questionText) continue;
      const context = `ورقة «${indexRow.worksheetName}»، الصف ${rowNumber}`;
      assertText(questionText, "نص السؤال", context);
      const displayOrder = parsePositiveInteger(
        rowValue(worksheet, rowNumber, header.columns, "ترتيب العرض"),
        "ترتيب العرض",
        context,
      );
      if (seenOrders.has(displayOrder))
        throw new Error(`${context}: ترتيب العرض ${displayOrder} مكرر.`);
      seenOrders.add(displayOrder);
      const explanation = rowValue(worksheet, rowNumber, header.columns, "الشرح");
      if (explanation.length > MAX_TEXT_LENGTH) throw new Error(`${context}: الشرح طويل جدًا.`);
      const refs = readMediaRefs(worksheet, rowNumber, header.columns, mediaPlacements, context);

      if (isSanaa) {
        const optionTexts = ["الخيار أ", "الخيار ب", "الخيار ج", "الخيار د"].map((label) =>
          assertText(rowValue(worksheet, rowNumber, header.columns, label), label, context),
        );
        const correctOption = normalizeCorrectOption(
          rowValue(worksheet, rowNumber, header.columns, "الإجابة الصحيحة"),
          context,
        );
        questions.push({
          question: {
            question_text: questionText,
            options: optionTexts.map((body, index) => ({
              option_code: (["A", "B", "C", "D"] as const)[index],
              body,
            })),
            correct_option_code: correctOption,
            model_answer: optionTexts[["A", "B", "C", "D"].indexOf(correctOption)],
            explanation,
            display_order: displayOrder,
            marks: 1,
          },
          refs,
        });
      } else {
        const modelAnswer = assertText(
          rowValue(worksheet, rowNumber, header.columns, "الإجابة النموذجية"),
          "الإجابة النموذجية",
          context,
        );
        questions.push({
          question: {
            question_text: questionText,
            options: [],
            correct_option_code: null,
            model_answer: modelAnswer,
            explanation,
            display_order: displayOrder,
            marks: 1,
          },
          refs,
        });
      }
    }
    questions.sort((left, right) => left.question.display_order - right.question.display_order);
    if (questions.length !== indexRow.declaredCount) {
      throw new Error(
        `ورقة «${indexRow.worksheetName}»: عدد الأسئلة الفعلي (${questions.length}) لا يطابق الفهرس (${indexRow.declaredCount}).`,
      );
    }
    if (questions.length > MAX_QUESTIONS_PER_MODEL) {
      throw new Error(`ورقة «${indexRow.worksheetName}» تتجاوز ${MAX_QUESTIONS_PER_MODEL} سؤال.`);
    }
    totalQuestions += questions.length;
    if (totalQuestions > MAX_TOTAL_QUESTIONS) {
      throw new Error(`الحزمة تتجاوز الحد الأقصى (${MAX_TOTAL_QUESTIONS} سؤال).`);
    }
    const variantCode = `m${String(indexRow.variantNumber).padStart(2, "0")}`;
    models.push({
      model_label: indexRow.modelLabel,
      academic_year: indexRow.year,
      variant_code: variantCode,
      worksheet_name: indexRow.worksheetName,
      declared_question_count: indexRow.declaredCount,
      questions,
    });
  }

  return { models };
}

/**
 * Parse an XLSX (no images) or a ZIP (XLSX + media/) package.
 *
 * Backward compatible: a plain XLSX without media columns/values yields the
 * exact v1 contract. A ZIP is required only when at least one image column is
 * filled in.
 */
export async function parseMinisterialPackageFile(
  file: File,
  input: ParseInput,
): Promise<MinisterialParsedPackage> {
  const isZip = /\.zip$/i.test(file.name);
  const isXlsx = /\.xlsx$/i.test(file.name);
  if (!isZip && !isXlsx) throw new Error("يُقبل ملف XLSX أو حزمة ZIP (XLSX + media/) فقط.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("ملف الاستيراد فارغ.");
  if (isZip && bytes.byteLength > MAX_ZIP_BYTES) {
    throw new Error(`حجم حزمة ZIP يتجاوز ${formatMediaBytes(MAX_ZIP_BYTES)}.`);
  }
  if (isXlsx && bytes.byteLength > MAX_FILE_BYTES) {
    throw new Error("حجم ملف الاستيراد يتجاوز 25MB.");
  }

  const opened = isZip ? await openPackageZip(bytes) : null;
  const parsed = await parseWorkbookBytes(opened ? opened.xlsxBytes : bytes, input);

  const allRefs = parsed.models.flatMap((model) => model.questions.flatMap((q) => q.refs));
  if (allRefs.length > 0 && !opened) {
    throw new Error(
      `الملف يشير إلى صور (${allRefs[0]!.context}) — ارفع حزمة ZIP تحتوي ملف XLSX ومجلد media/ بالصور.`,
    );
  }
  if (opened && allRefs.length === 0 && opened.mediaEntries.size > 0) {
    throw new Error("مجلد media/ يحتوي صورًا لكن لا يوجد أي سؤال يشير إليها.");
  }

  const resolved = opened
    ? await resolveMedia(opened.mediaEntries, allRefs)
    : { byName: new Map<string, MinisterialMediaFile>(), files: [], total: 0 };

  const models: MinisterialPackageModel[] = parsed.models.map((model) => ({
    ...model,
    questions: model.questions.map(({ question, refs }) => {
      if (refs.length === 0) return question;
      const media: MinisterialPackageMedia[] = refs
        .map((ref) => {
          const file = resolved.byName.get(ref.fileName.toLowerCase())!;
          return {
            placement: ref.placement,
            file_name: ref.fileName,
            sha256: file.sha256,
            mime_type: file.mime_type,
            file_size: file.file_size,
            alt_text_ar: ref.altText,
          };
        })
        .sort(
          (left, right) =>
            MEDIA_PLACEMENT_SORT_ORDER[left.placement] -
            MEDIA_PLACEMENT_SORT_ORDER[right.placement],
        );
      return { ...question, media };
    }),
  }));

  const hasMedia = resolved.files.length > 0;
  return {
    package: {
      contract_version: hasMedia
        ? MINISTERIAL_PACKAGE_CONTRACT_VERSION_V2
        : MINISTERIAL_PACKAGE_CONTRACT_VERSION,
      track_code: input.trackCode,
      subject_code: input.subjectCode.trim().toLowerCase(),
      subject_name: input.subjectName.trim(),
      source_filename: file.name,
      source_sha256: await sha256HexOf(bytes),
      models,
    },
    media: resolved.files,
    total_media_bytes: resolved.total,
  };
}

/**
 * Legacy entry point (XLSX only, no images). Kept for callers and tests that
 * predate the ZIP contract; fails closed when the sheet references images.
 */
export async function parseMinisterialPackageWorkbook(
  file: File,
  input: ParseInput,
): Promise<MinisterialTrackPackage> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error("يُقبل ملف XLSX فقط.");
  const parsed = await parseMinisterialPackageFile(file, input);
  return parsed.package;
}

/** Summary counters used by the importer UI. */
export function summarizePackageMedia(pkg: MinisterialTrackPackage): {
  questions_with_media: number;
  media_refs: number;
} {
  let questionsWithMedia = 0;
  let mediaRefs = 0;
  for (const model of pkg.models) {
    for (const question of model.questions) {
      if (question.media && question.media.length > 0) {
        questionsWithMedia += 1;
        mediaRefs += question.media.length;
      }
    }
  }
  return { questions_with_media: questionsWithMedia, media_refs: mediaRefs };
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function applyHeaderStyle(row: {
  eachCell: (
    cb: (cell: { font: unknown; fill: unknown; alignment: unknown; border: unknown }) => void,
  ) => void;
}) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF253B80" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFD7DBE8" } },
      left: { style: "thin", color: { argb: "FFD7DBE8" } },
      bottom: { style: "thin", color: { argb: "FFD7DBE8" } },
      right: { style: "thin", color: { argb: "FFD7DBE8" } },
    };
  });
}

function applyMediaHeaderStyle(
  row: {
    getCell: (column: number) => { font: unknown; fill: unknown };
    cellCount: number;
  },
  fromColumn: number,
) {
  for (let column = fromColumn; column <= row.cellCount; column += 1) {
    const cell = row.getCell(column);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6B7A99" } };
  }
}

function columnLetter(index: number): string {
  let out = "";
  let n = index;
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export async function buildMinisterialPackageTemplate(input: {
  trackCode: MinisterialPackageTrack;
  subjectCode: string;
  subjectName: string;
}): Promise<Uint8Array> {
  const ExcelJS = await excelModule();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "تمكين الطالب";
  workbook.subject = `استيراد نماذج وزارية — ${input.trackCode === "sanaa" ? "صنعاء" : "عدن"}`;
  workbook.created = new Date(0);
  workbook.modified = new Date(0);

  const isSanaa = input.trackCode === "sanaa";
  const baseHeaders = isSanaa ? SANAA_QUESTION_HEADERS : ADEN_QUESTION_HEADERS;
  const mediaHeaders = isSanaa ? SANAA_MEDIA_HEADERS : ADEN_MEDIA_HEADERS;
  const lastColumn = columnLetter(baseHeaders.length + mediaHeaders.length);

  const index = workbook.addWorksheet(MINISTERIAL_INDEX_SHEET, { views: [{ rightToLeft: true }] });
  index.addRow([`قالب استيراد — اختبارات مسار ${isSanaa ? "صنعاء" : "عدن"}`]);
  index.mergeCells("A1:G1");
  index.getRow(1).height = 28;
  index.getCell("A1").font = { bold: true, size: 15, color: { argb: "FF17203B" } };
  index.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  index.addRow([]);
  const indexHeader = index.addRow([...MINISTERIAL_INDEX_HEADERS]);
  applyHeaderStyle(indexHeader);
  index.addRow(["نموذج تجريبي 1", 1, 2025, input.subjectName, 2, "لا", "نموذج_1"]);
  index.columns = [
    { width: 32 },
    { width: 14 },
    { width: 12 },
    { width: 24 },
    { width: 14 },
    { width: 12 },
    { width: 22 },
  ];
  index.autoFilter = "A3:G3";
  index.views = [{ state: "frozen", ySplit: 3, rightToLeft: true }];

  const questions = workbook.addWorksheet("نموذج_1", { views: [{ rightToLeft: true }] });
  questions.addRow(["اسم النموذج: نموذج تجريبي"]);
  questions.mergeCells(`A1:${lastColumn}1`);
  questions.addRow([
    `المسار: ${isSanaa ? "صنعاء" : "عدن"} | المادة: ${input.subjectName} (${input.subjectCode}) | الحالة: مسودة | أعمدة الصور اختيارية: اكتب اسم الملف كما هو داخل مجلد media/ (PNG/JPG/WebP، حتى 8MB للصورة)`,
  ]);
  questions.mergeCells(`A2:${lastColumn}2`);
  questions.addRow([]);
  const emptyMedia = mediaHeaders.map(() => "");
  if (isSanaa) {
    const header = questions.addRow([...SANAA_QUESTION_HEADERS, ...mediaHeaders]);
    applyHeaderStyle(header);
    applyMediaHeaderStyle(header, SANAA_QUESTION_HEADERS.length + 1);
    questions.addRow([
      "مثال: 2 + 2 = ؟",
      "3",
      "4",
      "5",
      "6",
      "ب",
      "الإجابة الصحيحة هي 4.",
      1,
      ...emptyMedia,
    ]);
    questions.addRow([
      "اكتب السؤال الثاني هنا",
      "الخيار الأول",
      "الخيار الثاني",
      "الخيار الثالث",
      "الخيار الرابع",
      "أ",
      "شرح اختياري",
      2,
      ...emptyMedia,
    ]);
    questions.columns = [
      { width: 48 },
      { width: 25 },
      { width: 25 },
      { width: 25 },
      { width: 25 },
      { width: 18 },
      { width: 44 },
      { width: 14 },
      ...mediaHeaders.map((_, position) => ({ width: position % 2 === 0 ? 24 : 30 })),
    ];
    for (let rowNumber = 5; rowNumber <= 504; rowNumber += 1) {
      questions.getCell(rowNumber, 6).dataValidation = {
        type: "list",
        allowBlank: false,
        formulae: ['"أ,ب,ج,د"'],
      };
    }
  } else {
    const header = questions.addRow([...ADEN_QUESTION_HEADERS, ...mediaHeaders]);
    applyHeaderStyle(header);
    applyMediaHeaderStyle(header, ADEN_QUESTION_HEADERS.length + 1);
    questions.addRow([
      "اكتب السؤال الأول هنا",
      "اكتب الإجابة النموذجية هنا",
      "شرح اختياري",
      1,
      ...emptyMedia,
    ]);
    questions.addRow([
      "اكتب السؤال الثاني هنا",
      "اكتب الإجابة النموذجية هنا",
      "شرح اختياري",
      2,
      ...emptyMedia,
    ]);
    questions.columns = [
      { width: 58 },
      { width: 58 },
      { width: 44 },
      { width: 14 },
      ...mediaHeaders.map((_, position) => ({ width: position % 2 === 0 ? 24 : 30 })),
    ];
  }
  questions.getRow(1).font = { bold: true, size: 14 };
  questions.getRow(2).font = { color: { argb: "FF5C647A" } };
  questions.views = [{ state: "frozen", ySplit: 4, rightToLeft: true }];
  questions.eachRow((row, rowNumber) => {
    if (rowNumber >= 5) row.alignment = { vertical: "top", wrapText: true, horizontal: "right" };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

export const MEDIA_README_NAME = "media/README.txt" as const;

export function buildMediaReadme(trackCode: MinisterialPackageTrack): string {
  const placements: readonly MinisterialMediaPlacement[] =
    trackCode === "sanaa" ? MINISTERIAL_MEDIA_PLACEMENTS : ADEN_MEDIA_PLACEMENTS;
  return [
    "مجلد الصور — حزمة استيراد النماذج الوزارية",
    "",
    "1) ضع صور الأسئلة داخل هذا المجلد (media/) مباشرة بدون مجلدات فرعية.",
    "2) الصيغ المقبولة: PNG أو JPG أو WebP فقط (لا SVG). الحد الأقصى 8MB للصورة و50MB للحزمة.",
    "3) يجب أن يكون اسم كل ملف فريدًا، ويُكتب كما هو في عمود الصورة المناسب داخل ملف XLSX.",
    "4) أعمدة الوصف اختيارية وتُستخدم كنص بديل للطلاب ضعاف البصر (حتى 500 حرف).",
    "5) أعمدة الصور المتاحة لهذا المسار:",
    ...placements.map(
      (placement) =>
        `   - ${MEDIA_HEADERS[placement].file} / ${MEDIA_HEADERS[placement].alt} (${MEDIA_PLACEMENT_LABEL_AR[placement]})`,
    ),
    "",
    "يمكنك ترك ملف README.txt هذا كما هو؛ يتم تجاهله عند الاستيراد.",
  ].join("\n");
}

/** ZIP template = XLSX at the root + media/README.txt describing the image contract. */
export async function buildMinisterialPackageTemplateZip(input: {
  trackCode: MinisterialPackageTrack;
  subjectCode: string;
  subjectName: string;
}): Promise<Uint8Array> {
  const xlsx = await buildMinisterialPackageTemplate(input);
  const JSZip = await zipModule();
  const zip = new JSZip();
  const xlsxName = `ministerial-${input.trackCode}-${input.subjectCode}.xlsx`;
  zip.file(xlsxName, xlsx, { date: new Date(0) });
  zip.folder("media");
  zip.file(MEDIA_README_NAME, buildMediaReadme(input.trackCode), { date: new Date(0) });
  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}
