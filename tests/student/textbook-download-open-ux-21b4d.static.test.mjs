/**
 * 21B4D — download & open UX guards for the subject textbooks sheet.
 * Static source contract tests (no DB, no network).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");
const sheet = read("src/components/textbooks/SubjectTextbooksSheet.tsx");
const client = read("src/lib/textbooks/subject-textbook-client.ts");
const registry = read("src/lib/offline/local-textbook-registry.ts");

describe("21B4D state machine", () => {
  it("1. NOT_DOWNLOADED offers a تنزيل CTA", () => {
    expect(sheet).toContain('"NOT_DOWNLOADED"');
    expect(sheet).toContain(">تنزيل");
  });

  it("2. DOWNLOADING shows progress and no competing CTA", () => {
    expect(sheet).toContain('state === "DOWNLOADING"');
    expect(sheet).toContain("جارٍ التنزيل…");
    const block = sheet.slice(sheet.indexOf('{state === "DOWNLOADING" ? ('));
    const stop = block.slice(0, block.indexOf(") : state ==="));
    expect(stop).toContain("إيقاف التنزيل");
    expect(stop).not.toContain("فتح الكتاب");
  });

  it("3. PDF_READY while the reader prepares shows the preparing status", () => {
    expect(sheet).toContain("تم حفظ الملف · جارٍ تجهيز القارئ…");
    expect(sheet).toContain('"PREPARING_READER"');
  });

  it("4. reader preparation failure exposes تجهيز القارئ without re-download", () => {
    expect(sheet).toContain("الملف محفوظ · يحتاج تجهيز القارئ");
    const idx = sheet.lastIndexOf("تجهيز القارئ");
    const retry = sheet.slice(idx - 260, idx);
    expect(retry).toContain("prepareReader");
    expect(retry).not.toContain("onClick={() => void start()}");
  });

  it("5. OFFLINE_READY shows the saved badge and فتح الكتاب as primary", () => {
    expect(sheet).toContain("const offlineReady = pdfReady && readerReady");
    expect(sheet).toContain("محفوظ للاستخدام دون إنترنت");
    expect(sheet).toContain("فتح الكتاب");
  });
});

describe("21B4D delete semantics", () => {
  it("6. delete lives in a secondary menu, not a primary CTA", () => {
    expect(sheet).toContain("DropdownMenuItem");
    expect(sheet).toContain("إزالة التنزيل");
    expect(sheet).not.toContain("حذف من الجهاز");
  });

  it("7. removal only clears the local copy + registry entry", () => {
    expect(sheet).toContain(
      "سيتم حذف النسخة المحفوظة من هذا الجهاز فقط، ويمكنك تنزيلها مرة أخرى لاحقاً.",
    );
    expect(client).toContain("await removeFile(textbookId)");
    expect(client).toContain("await unregisterLocalTextbook(textbookId)");
    expect(client).not.toContain('.delete()');
  });
});

describe("21B4D multi-book, semester isolation", () => {
  it("8. full-year books keep one logical identity across semesters", () => {
    expect(client).toContain("coverage_type.eq.FULL_ACADEMIC_YEAR");
    // cache + registry are keyed by the textbook id only
    expect(sheet).toContain("markLocalTextbookOfflineReady(book.id");
    expect(client).toContain("resourceId: params.textbook.id");
  });

  it("9. semester-specific books stay scoped to their own semester", () => {
    expect(client).toContain("and(coverage_type.eq.SEMESTER_SPECIFIC,semester.eq.${params.semester})");
  });

  it("renders coverage + book type labels per book", () => {
    expect(sheet).toContain("العام الدراسي كامل");
    expect(sheet).toContain("BOOK_TYPE_LABEL[book.bookType]");
  });
});

describe("21B4D offline + native integration", () => {
  it("10. native open only ever crosses a trusted textbookId", () => {
    const plugin = read(
      "android/app/src/main/java/app/studentamkeen/tamkeen/TamkeenPdfViewerPlugin.java",
    );
    expect(plugin).toContain("resolveTrustedBook");
    expect(read("mobile/www/index.html")).toContain("openTextbook({ textbookId: textbookId })");
    expect(registry).toContain("isPrivateRelativePath");
  });

  it("11. a missing local copy surfaces re-download guidance", () => {
    expect(sheet).toContain("النسخة المحفوظة غير مكتملة. أعد تنزيل الكتاب.");
    expect(sheet).toContain("localMissing");
  });

  it("shows practical Arabic errors, never technical exceptions", () => {
    expect(sheet).toContain("تعذر تنزيل الكتاب. تحقق من الاتصال وحاول مرة أخرى.");
    expect(sheet).toContain("تم حفظ الكتاب، لكن تعذر تجهيز القارئ للاستخدام دون إنترنت.");
    expect(sheet).toContain("تعذر فتح الكتاب حالياً.");
  });
});

describe("21B4D mobile + accessibility", () => {
  it("12. RTL sheet, accessible names, mobile touch targets", () => {
    expect(sheet).toContain('dir="rtl"');
    expect(sheet).toContain("aria-label={`خيارات إضافية لكتاب ${book.title}`}");
    expect(sheet).toContain('aria-live="polite"');
    expect(sheet).toContain('role="alert"');
    expect(sheet).toContain("h-10");
    // long titles wrap instead of overflowing
    expect(sheet).toContain("break-words");
  });
});

describe("21B4D regressions", () => {
  it("13. 21B3 readiness contract intact", () => {
    const runtime = read("src/lib/pdf/reader-runtime.ts");
    expect(runtime).toContain('renderer === "ANDROID_NATIVE"');
    expect(runtime).not.toContain("downloadTextbook");
    expect(sheet).toContain("ensureReaderReady");
  });

  it("14. 21B4B registry contract intact", () => {
    expect(client).toContain("registerLocalTextbook");
    expect(client).toContain("offlineReady: isReaderReady()");
    expect(registry).toContain("REGISTRY_PATH");
  });
});
