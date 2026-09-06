/**
 * MINISTERIAL_QUESTION_MEDIA_V1 — ZIP package parser + security contract.
 *
 * Covers: v1 backward compatibility, v2 media resolution (SHA-256, dedup,
 * content-addressed keys), and every fail-closed path of the ZIP hardening
 * (traversal, bombs, size caps, magic bytes, SVG, extension mismatch,
 * duplicate/unused/missing images, unexpected entries, nested folders).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import {
  ADEN_MEDIA_HEADERS,
  ADEN_QUESTION_HEADERS,
  MEDIA_HEADERS,
  MEDIA_README_NAME,
  MINISTERIAL_INDEX_SHEET,
  MINISTERIAL_PACKAGE_CONTRACT_VERSION,
  MINISTERIAL_PACKAGE_CONTRACT_VERSION_V2,
  SANAA_MEDIA_HEADERS,
  SANAA_QUESTION_HEADERS,
  buildMinisterialPackageTemplateZip,
  parseMinisterialPackageFile,
  parseMinisterialPackageWorkbook,
  summarizePackageMedia,
} from "../../src/lib/ministerial/ministerial-package-xlsx.ts";
import {
  MINISTERIAL_MEDIA_LIMITS,
  MINISTERIAL_MEDIA_STORAGE_KEY_RE,
  detectImageMime,
  isSafeZipEntryName,
  ministerialMediaStorageKey,
  sha256HexOf,
} from "../../src/lib/ministerial/ministerial-media-contract.ts";

const SANAA = { trackCode: "sanaa" as const, subjectCode: "sub-g12-013", subjectName: "الكيمياء" };
const ADEN = { trackCode: "aden" as const, subjectCode: "sub-g12-013", subjectName: "الكيمياء" };

// Minimal byte patterns: the parser sniffs magic bytes, it does not decode.
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 1, 2, 3]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 7, 8, 9]);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x1a, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20, 1]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

type Row = Record<string, string | number>;

async function workbookBytes(input: {
  track: "sanaa" | "aden";
  rows: Row[];
  withMediaHeaders?: boolean;
}): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const index = workbook.addWorksheet(MINISTERIAL_INDEX_SHEET);
  index.addRow(["فهرس"]);
  index.addRow([]);
  index.addRow(["اسم النموذج", "رقم النموذج", "السنة", "المادة", "عدد الأسئلة", "منشور", "اسم الورقة"]);
  index.addRow(["نموذج أول", 1, 2025, "الكيمياء", input.rows.length, "لا", "نموذج_1"]);
  const sheet = workbook.addWorksheet("نموذج_1");
  sheet.addRow(["نموذج_1"]);
  sheet.addRow([]);
  sheet.addRow([]);
  const base = input.track === "sanaa" ? SANAA_QUESTION_HEADERS : ADEN_QUESTION_HEADERS;
  const media = input.track === "sanaa" ? SANAA_MEDIA_HEADERS : ADEN_MEDIA_HEADERS;
  const headers = input.withMediaHeaders === false ? [...base] : [...base, ...media];
  sheet.addRow(headers);
  for (const row of input.rows) {
    sheet.addRow(headers.map((header) => row[header] ?? ""));
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function sanaaRow(extra: Row = {}): Row {
  return {
    "نص السؤال": "أي الأشكال الآتية يمثل الرابطة؟",
    "الخيار أ": "أ",
    "الخيار ب": "ب",
    "الخيار ج": "ج",
    "الخيار د": "د",
    "الإجابة الصحيحة": "ب",
    الشرح: "انظر الشكل.",
    "ترتيب العرض": 1,
    ...extra,
  };
}

function adenRow(extra: Row = {}): Row {
  return {
    "نص السؤال": "فسّر الشكل التالي.",
    "الإجابة النموذجية": "يبين تفاعل الحديد.",
    الشرح: "",
    "ترتيب العرض": 1,
    ...extra,
  };
}

type ZipEntry = { name: string; bytes: Uint8Array | string; store?: boolean };

async function zipBytes(entries: ZipEntry[]): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const entry of entries) {
    zip.file(entry.name, entry.bytes, {
      compression: entry.store ? "STORE" : "DEFLATE",
      date: new Date(0),
    });
  }
  return zip.generateAsync({ type: "uint8array" });
}

function asFile(bytes: Uint8Array, name: string): File {
  return new File([bytes], name, { type: "application/octet-stream" });
}

async function rejects(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof Error, "expected an Error");
    assert.match(error.message, pattern);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Backward compatibility
// ---------------------------------------------------------------------------

test("plain XLSX without media columns still parses as the v1 contract", async () => {
  const bytes = await workbookBytes({ track: "sanaa", rows: [sanaaRow()], withMediaHeaders: false });
  const parsed = await parseMinisterialPackageFile(asFile(bytes, "sanaa.xlsx"), SANAA);
  assert.equal(parsed.package.contract_version, MINISTERIAL_PACKAGE_CONTRACT_VERSION);
  assert.equal(parsed.media.length, 0);
  assert.equal(parsed.total_media_bytes, 0);
  assert.equal("media" in parsed.package.models[0]!.questions[0]!, false);
  assert.deepEqual(summarizePackageMedia(parsed.package), { questions_with_media: 0, media_refs: 0 });
  const legacy = await parseMinisterialPackageWorkbook(asFile(bytes, "sanaa.xlsx"), SANAA);
  assert.deepEqual(legacy, parsed.package);
});

test("XLSX with empty media columns is still v1 (columns are optional)", async () => {
  const bytes = await workbookBytes({ track: "aden", rows: [adenRow()] });
  const parsed = await parseMinisterialPackageFile(asFile(bytes, "aden.xlsx"), ADEN);
  assert.equal(parsed.package.contract_version, MINISTERIAL_PACKAGE_CONTRACT_VERSION);
  assert.equal(parsed.media.length, 0);
});

test("XLSX that references an image without a ZIP fails closed", async () => {
  const bytes = await workbookBytes({
    track: "sanaa",
    rows: [sanaaRow({ [MEDIA_HEADERS.QUESTION.file]: "q1.png" })],
  });
  await rejects(parseMinisterialPackageFile(asFile(bytes, "sanaa.xlsx"), SANAA), /ارفع حزمة ZIP/);
  await rejects(parseMinisterialPackageWorkbook(asFile(bytes, "sanaa.xlsx"), SANAA), /ارفع حزمة ZIP/);
});

test("legacy workbook entry point refuses ZIP files", async () => {
  await rejects(parseMinisterialPackageWorkbook(asFile(PNG, "x.zip"), SANAA), /XLSX فقط/);
});

test("unknown extensions and empty files are rejected before any parsing", async () => {
  await rejects(parseMinisterialPackageFile(asFile(PNG, "x.csv"), SANAA), /XLSX أو حزمة ZIP/);
  await rejects(parseMinisterialPackageFile(asFile(new Uint8Array(0), "x.zip"), SANAA), /فارغ/);
});

// ---------------------------------------------------------------------------
// v2 media resolution
// ---------------------------------------------------------------------------

test("ZIP with XLSX + media/ yields v2 with SHA-256, content-addressed keys and dedup", async () => {
  const xlsx = await workbookBytes({
    track: "sanaa",
    rows: [
      sanaaRow({
        [MEDIA_HEADERS.QUESTION.file]: "q1.png",
        [MEDIA_HEADERS.QUESTION.alt]: "شكل الرابطة",
        [MEDIA_HEADERS.OPTION_B.file]: "opt-b.jpg",
        [MEDIA_HEADERS.SOLUTION.file]: "media/solution.webp",
      }),
      sanaaRow({
        "ترتيب العرض": 2,
        // Same bytes as q1.png under a different name → one storage object.
        [MEDIA_HEADERS.QUESTION.file]: "q2.png",
      }),
    ],
  });
  const zip = await zipBytes([
    { name: "sanaa.xlsx", bytes: xlsx },
    { name: "media/q1.png", bytes: PNG },
    { name: "media/q2.png", bytes: PNG },
    { name: "media/opt-b.jpg", bytes: JPEG },
    { name: "media/solution.webp", bytes: WEBP },
    { name: MEDIA_README_NAME, bytes: "ignored" },
    { name: "__MACOSX/._sanaa.xlsx", bytes: "junk" },
    { name: ".DS_Store", bytes: "junk" },
  ]);
  const parsed = await parseMinisterialPackageFile(asFile(zip, "sanaa-package.zip"), SANAA);

  assert.equal(parsed.package.contract_version, MINISTERIAL_PACKAGE_CONTRACT_VERSION_V2);
  assert.equal(parsed.package.source_sha256, await sha256HexOf(zip));
  assert.equal(parsed.media.length, 3, "q1/q2 share one object; opt-b and solution add two more");
  assert.equal(parsed.total_media_bytes, PNG.byteLength + JPEG.byteLength + WEBP.byteLength);

  const pngFile = parsed.media.find((file) => file.mime_type === "image/png")!;
  assert.equal(pngFile.sha256, await sha256HexOf(PNG));
  assert.equal(pngFile.storage_key, ministerialMediaStorageKey(pngFile.sha256, "image/png"));
  assert.match(pngFile.storage_key, MINISTERIAL_MEDIA_STORAGE_KEY_RE);
  assert.deepEqual([...pngFile.file_names].sort(), ["q1.png", "q2.png"]);
  for (const file of parsed.media) assert.match(file.storage_key, MINISTERIAL_MEDIA_STORAGE_KEY_RE);

  const [first, second] = parsed.package.models[0]!.questions;
  assert.deepEqual(
    first!.media!.map((item) => item.placement),
    ["QUESTION", "OPTION_B", "SOLUTION"],
    "media are sorted by placement",
  );
  assert.equal(first!.media![0]!.alt_text_ar, "شكل الرابطة");
  assert.equal(first!.media![1]!.alt_text_ar, "صورة الخيار ب", "missing alt falls back to the Arabic label");
  assert.equal(first!.media![2]!.file_name, "solution.webp", "media/ prefix is normalised away");
  assert.equal(first!.media![2]!.mime_type, "image/webp");
  assert.equal(second!.media![0]!.sha256, first!.media![0]!.sha256);
  assert.deepEqual(summarizePackageMedia(parsed.package), { questions_with_media: 2, media_refs: 4 });
  // Question content never carries bytes or storage paths — only the manifest.
  assert.equal(JSON.stringify(parsed.package).includes("storage_path"), false);
});

test("a single desktop wrapper folder is tolerated", async () => {
  const xlsx = await workbookBytes({
    track: "aden",
    rows: [adenRow({ [MEDIA_HEADERS.QUESTION.file]: "شكل.png" })],
  });
  const zip = await zipBytes([
    { name: "حزمة/aden.xlsx", bytes: xlsx },
    { name: "حزمة/media/شكل.png", bytes: PNG },
  ]);
  const parsed = await parseMinisterialPackageFile(asFile(zip, "aden.zip"), ADEN);
  assert.equal(parsed.package.contract_version, MINISTERIAL_PACKAGE_CONTRACT_VERSION_V2);
  assert.equal(parsed.media.length, 1);
});

test("Aden sheets only accept question and solution images", async () => {
  const xlsx = await workbookBytes({
    track: "aden",
    rows: [adenRow({ [MEDIA_HEADERS.QUESTION.file]: "q.png", [MEDIA_HEADERS.SOLUTION.file]: "s.png" })],
  });
  const zip = await zipBytes([
    { name: "aden.xlsx", bytes: xlsx },
    { name: "media/q.png", bytes: PNG },
    { name: "media/s.png", bytes: JPEG.length ? PNG : PNG },
  ]);
  const parsed = await parseMinisterialPackageFile(asFile(zip, "aden.zip"), ADEN);
  assert.deepEqual(
    parsed.package.models[0]!.questions[0]!.media!.map((item) => item.placement),
    ["QUESTION", "SOLUTION"],
  );
  assert.equal(ADEN_MEDIA_HEADERS.length, 4);
  assert.equal(SANAA_MEDIA_HEADERS.length, 12);
  assert.equal(ADEN_MEDIA_HEADERS.includes(MEDIA_HEADERS.OPTION_A.file), false);
});

// ---------------------------------------------------------------------------
// Fail-closed ZIP hardening
// ---------------------------------------------------------------------------

async function zipWithMedia(mediaEntries: ZipEntry[], rowExtra: Row = {}, track: "sanaa" | "aden" = "sanaa") {
  const row = track === "sanaa" ? sanaaRow(rowExtra) : adenRow(rowExtra);
  const xlsx = await workbookBytes({ track, rows: [row] });
  return zipBytes([{ name: `${track}.xlsx`, bytes: xlsx }, ...mediaEntries]);
}

test("path traversal entries are rejected (by the name guard or as stray files)", async () => {
  // jszip ≥3.10 already collapses `..` segments on load (CVE-2022-48285); the
  // parser keeps its own guard for other readers and must still fail closed on
  // whatever survives normalisation, so the traversal payload never lands.
  const zip = await zipWithMedia(
    [
      { name: "media/q.png", bytes: PNG },
      { name: "../evil.png", bytes: PNG },
      { name: "media/../../etc/passwd.png", bytes: PNG },
    ],
    { [MEDIA_HEADERS.QUESTION.file]: "q.png" },
  );
  await rejects(parseMinisterialPackageFile(asFile(zip, "p.zip"), SANAA), /اسم ملف غير آمن|ملف غير متوقع/);
  assert.equal(isSafeZipEntryName("../evil.png"), false);
  assert.equal(isSafeZipEntryName("media/../../etc/passwd"), false);
  assert.equal(isSafeZipEntryName("./media/q.png"), false);
  assert.equal(isSafeZipEntryName("/abs.png"), false);
  assert.equal(isSafeZipEntryName("C:\\win.png"), false);
  assert.equal(isSafeZipEntryName("media\\q.png"), false);
  assert.equal(isSafeZipEntryName("media/q\u0000.png"), false);
  assert.equal(isSafeZipEntryName("media//q.png"), false);
  assert.equal(isSafeZipEntryName(""), false);
  assert.equal(isSafeZipEntryName("media/"), true);
  assert.equal(isSafeZipEntryName("media/q.png"), true);
});

test("cell references cannot escape media/ with paths", async () => {
  const zip = await zipWithMedia([{ name: "media/q.png", bytes: PNG }], {
    [MEDIA_HEADERS.QUESTION.file]: "../q.png",
  });
  await rejects(parseMinisterialPackageFile(asFile(zip, "p.zip"), SANAA), /بدون مسارات/);
});

test("SVG (and any non-image) disguised as PNG is rejected by magic bytes", async () => {
  const zip = await zipWithMedia([{ name: "media/q.png", bytes: SVG }], {
    [MEDIA_HEADERS.QUESTION.file]: "q.png",
  });
  await rejects(parseMinisterialPackageFile(asFile(zip, "p.zip"), SANAA), /SVG غير مقبولة/);
  assert.equal(detectImageMime(SVG), null);
  assert.equal(detectImageMime(PNG), "image/png");
  assert.equal(detectImageMime(JPEG), "image/jpeg");
  assert.equal(detectImageMime(WEBP), "image/webp");
  assert.equal(detectImageMime(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])), null, "GIF is not allowed");
});

test("an .svg file name is never accepted inside media/", async () => {
  const zip = await zipWithMedia([{ name: "media/q.svg", bytes: SVG }], {
    [MEDIA_HEADERS.QUESTION.file]: "q.svg",
  });
  await rejects(parseMinisterialPackageFile(asFile(zip, "p.zip"), SANAA), /PNG\/JPG\/WebP|PNG أو JPG أو WebP/);
});

test("extension must match the sniffed content", async () => {
  const zip = await zipWithMedia([{ name: "media/q.jpg", bytes: PNG }], {
    [MEDIA_HEADERS.QUESTION.file]: "q.jpg",
  });
  await rejects(parseMinisterialPackageFile(asFile(zip, "p.zip"), SANAA), /لا يطابق محتواها/);
});

test("duplicate image names are rejected case-insensitively", async () => {
  const zip = await zipWithMedia(
    [{ name: "media/Q.PNG", bytes: PNG }, { name: "media/q.png", bytes: PNG }],
    { [MEDIA_HEADERS.QUESTION.file]: "q.png" },
  );
  await rejects(parseMinisterialPackageFile(asFile(zip, "p.zip"), SANAA), /مكرر داخل media/);
});

test("images not referenced by any question are rejected", async () => {
  const zip = await zipWithMedia(
    [{ name: "media/q.png", bytes: PNG }, { name: "media/orphan.png", bytes: PNG }],
    { [MEDIA_HEADERS.QUESTION.file]: "q.png" },
  );
  await rejects(parseMinisterialPackageFile(asFile(zip, "p.zip"), SANAA), /غير مستخدمة/);
  const noRefs = await zipWithMedia([{ name: "media/orphan.png", bytes: PNG }]);
  await rejects(parseMinisterialPackageFile(asFile(noRefs, "p.zip"), SANAA), /لا يوجد أي سؤال يشير إليها/);
});

test("a referenced image missing from media/ is rejected", async () => {
  const zip = await zipWithMedia([], { [MEDIA_HEADERS.QUESTION.file]: "missing.png" });
  await rejects(parseMinisterialPackageFile(asFile(zip, "p.zip"), SANAA), /غير موجودة داخل مجلد media/);
});

test("alt text without a file, and over-long alt text, are rejected", async () => {
  const altOnly = await zipWithMedia([], { [MEDIA_HEADERS.QUESTION.alt]: "وصف بدون صورة" });
  await rejects(parseMinisterialPackageFile(asFile(altOnly, "p.zip"), SANAA), /مذكور بدون/);
  const tooLong = await zipWithMedia([{ name: "media/q.png", bytes: PNG }], {
    [MEDIA_HEADERS.QUESTION.file]: "q.png",
    [MEDIA_HEADERS.QUESTION.alt]: "و".repeat(MINISTERIAL_MEDIA_LIMITS.maxAltTextChars + 1),
  });
  await rejects(parseMinisterialPackageFile(asFile(tooLong, "p.zip"), SANAA), /يتجاوز 500 حرفًا/);
});

test("nested folders inside media/ and unexpected files are rejected", async () => {
  const nested = await zipWithMedia([{ name: "media/sub/q.png", bytes: PNG }], {
    [MEDIA_HEADERS.QUESTION.file]: "q.png",
  });
  await rejects(parseMinisterialPackageFile(asFile(nested, "p.zip"), SANAA), /مجلدات فرعية/);
  const stray = await zipWithMedia(
    [{ name: "media/q.png", bytes: PNG }, { name: "notes.txt", bytes: "x" }],
    { [MEDIA_HEADERS.QUESTION.file]: "q.png" },
  );
  await rejects(parseMinisterialPackageFile(asFile(stray, "p.zip"), SANAA), /ملف غير متوقع/);
  const script = await zipWithMedia(
    [{ name: "media/q.png", bytes: PNG }, { name: "media/run.js", bytes: "alert(1)" }],
    { [MEDIA_HEADERS.QUESTION.file]: "q.png" },
  );
  await rejects(parseMinisterialPackageFile(asFile(script, "p.zip"), SANAA), /اسم صورة غير مقبول/);
});

test("ZIP must contain exactly one top-level XLSX", async () => {
  const none = await zipBytes([{ name: "media/q.png", bytes: PNG }]);
  await rejects(parseMinisterialPackageFile(asFile(none, "p.zip"), SANAA), /لا تحتوي ملف XLSX/);
  const xlsx = await workbookBytes({ track: "sanaa", rows: [sanaaRow()] });
  const two = await zipBytes([
    { name: "a.xlsx", bytes: xlsx },
    { name: "b.xlsx", bytes: xlsx },
  ]);
  await rejects(parseMinisterialPackageFile(asFile(two, "p.zip"), SANAA), /واحدًا فقط/);
});

test("images above 8MB are rejected even when stored uncompressed", async () => {
  const big = new Uint8Array(MINISTERIAL_MEDIA_LIMITS.maxImageBytes + 1);
  big.set(PNG, 0);
  const zip = await zipWithMedia([{ name: "media/big.png", bytes: big, store: true }], {
    [MEDIA_HEADERS.QUESTION.file]: "big.png",
  });
  await rejects(parseMinisterialPackageFile(asFile(zip, "p.zip"), SANAA), /تتجاوز الحد الأقصى/);
});

test("a highly compressible entry (zip bomb signature) is rejected before inflation", async () => {
  const bomb = new Uint8Array(4 * 1024 * 1024); // deflates to a few KB → ratio ≫ 60
  bomb.set(PNG, 0);
  const zip = await zipWithMedia([{ name: "media/bomb.png", bytes: bomb }], {
    [MEDIA_HEADERS.QUESTION.file]: "bomb.png",
  });
  await rejects(parseMinisterialPackageFile(asFile(zip, "p.zip"), SANAA), /نسبة ضغط مريبة/);
});

test("total media budget of 50MB is enforced from declared sizes", async () => {
  // Seven distinct 7.5MB images (unique first bytes → distinct SHA) exceed 50MB together.
  const size = Math.floor(7.5 * 1024 * 1024);
  const entries: ZipEntry[] = [];
  const row: Row = {};
  const placements = ["QUESTION", "OPTION_A", "OPTION_B", "OPTION_C", "OPTION_D", "SOLUTION"] as const;
  for (let index = 0; index < 7; index += 1) {
    const bytes = new Uint8Array(size);
    bytes.set(PNG, 0);
    for (let offset = PNG.length; offset < size; offset += 1) bytes[offset] = (offset * 31 + index) & 0xff;
    entries.push({ name: `media/img${index}.png`, bytes, store: true });
  }
  for (const [index, placement] of placements.entries()) {
    row[MEDIA_HEADERS[placement].file] = `img${index}.png`;
  }
  const zip = await zipWithMedia(entries, row);
  await rejects(parseMinisterialPackageFile(asFile(zip, "p.zip"), SANAA), /إجمالي حجم الصور/);
});

test("corrupted ZIP payloads fail closed (CRC is verified)", async () => {
  const zip = await zipWithMedia([{ name: "media/q.png", bytes: PNG, store: true }], {
    [MEDIA_HEADERS.QUESTION.file]: "q.png",
  });
  const corrupted = new Uint8Array(zip);
  // Flip bytes inside the first local file entry's data region.
  const marker = new TextEncoder().encode("media/q.png");
  const index = corrupted.findIndex((_, offset) =>
    marker.every((byte, position) => corrupted[offset + position] === byte),
  );
  assert.ok(index > 0);
  corrupted[index + marker.length + 2] ^= 0xff;
  await rejects(parseMinisterialPackageFile(asFile(corrupted, "p.zip"), SANAA), /تعذرت قراءة ملف ZIP|تعذر فك ضغط|ليست PNG/);
});

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

test("ZIP template ships the XLSX, the media/ folder and an Arabic README", async () => {
  const bytes = await buildMinisterialPackageTemplateZip(SANAA);
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files).sort();
  assert.ok(names.includes(MEDIA_README_NAME));
  assert.ok(names.some((name) => /^ministerial-sanaa-sub-g12-013\.xlsx$/.test(name)));
  const readme = await zip.file(MEDIA_README_NAME)!.async("string");
  assert.match(readme, /PNG أو JPG أو WebP/);
  assert.match(readme, /8MB/);
  assert.match(readme, /50MB/);
  for (const header of SANAA_MEDIA_HEADERS) assert.ok(readme.includes(header), header);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await zip.file(/\.xlsx$/)[0]!.async("uint8array"));
  const sheet = workbook.worksheets.find((candidate) => candidate.name !== MINISTERIAL_INDEX_SHEET)!;
  const headerValues = (sheet.getRow(4).values as unknown[]).slice(1).map(String);
  for (const header of [...SANAA_QUESTION_HEADERS, ...SANAA_MEDIA_HEADERS]) {
    assert.ok(headerValues.includes(header), `template header ${header}`);
  }

  const adenZip = await JSZip.loadAsync(await buildMinisterialPackageTemplateZip(ADEN));
  const adenReadme = await adenZip.file(MEDIA_README_NAME)!.async("string");
  assert.equal(adenReadme.includes(MEDIA_HEADERS.OPTION_A.file), false);
  assert.ok(adenReadme.includes(MEDIA_HEADERS.SOLUTION.file));
});
