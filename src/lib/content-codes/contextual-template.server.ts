/**
 * SHARED_CURRICULUM_SUBJECT_MAPPING_13C — context-aware template builder (TCS-2).
 *
 * Server-only. Produces an .xlsx workbook where every content code is already
 * allocated by the system (TCS-2) and every parent key is pre-filled from real
 * master data, so the operator only writes Arabic content.
 *
 * Read-only: allocation is computed from existing codes; nothing is persisted.
 */

import ExcelJS from "exceljs";
import {
  templateColumnsForEntity,
  requiredTemplateColumnsForEntity,
} from "../import/import-contract";
import {
  CONTENT_CODE_SCHEME_VERSION,
  TCS2_FORMAT_TABLE,
  TCS2_RULES_AR,
  Tcs2Error,
  allocateTcs2Codes,
  parseTcs2Code,
} from "./tcs2";
import type {
  ContentCodeRegistry,
  ContextTemplateKey,
  ContextTemplateRequest,
  ContextTemplateResponse,
} from "./content-codes.types";

const HEADER_FILL = "FF1F3864";

interface BuildInput extends ContextTemplateRequest {
  registry: ContentCodeRegistry;
  /** Existing codes for the entity being allocated (question / lesson-child). */
  extraExistingCodes?: readonly string[];
}

interface RowPlan {
  rows: Array<Record<string, string>>;
  allocatedCodes: string[];
  prefilledColumns: string[];
  notes: string[];
}

function subjectNoOf(registry: ContentCodeRegistry, subjectCode: string): number {
  const subject = registry.subjects.find((s) => s.subjectCode === subjectCode);
  if (!subject || subject.subjectNo == null) {
    throw new Tcs2Error(
      "TCS2_SUBJECT_NOT_OFFICIAL",
      `المادة «${subjectCode}» غير موجودة أو كودها لا يتبع ${CONTENT_CODE_SCHEME_VERSION}.`,
    );
  }
  return subject.subjectNo;
}

function planRows(input: BuildInput): RowPlan {
  const { registry, templateKey, gradeSlug, subjectCode, unitCode, rowCount } = input;
  const scope = { gradeSlug };
  const trackCodes = (input.trackCodes ?? []).filter(Boolean);
  const extra = input.extraExistingCodes ?? [];

  const subjectCodes = registry.subjects.map((s) => s.subjectCode).filter(Boolean);
  const inScopeLessons = registry.lessons.filter(
    (l) => !subjectCode || l.subjectCode === subjectCode,
  );

  switch (templateKey) {
    case "subjects": {
      const codes = allocateTcs2Codes({
        existingCodes: subjectCodes,
        kind: "subject",
        scope,
        count: rowCount,
      });
      return {
        rows: codes.map((code) => ({
          subject_code: code,
          grade_slug: gradeSlug,
          track_codes: trackCodes.join("|"),
        })),
        allocatedCodes: codes,
        prefilledColumns: ["subject_code", "grade_slug", "track_codes"],
        notes: [
          "املأ فقط: name (وإن كانت المادة متفرعة: group_code / group_name).",
          "لا تعدّل subject_code — النظام هو المالك.",
          "المادة المشتركة تُدخل مرة واحدة: اكتب كل المسارات في track_codes مفصولة بـ | (مثال: sanaa|aden).",
        ],
      };
    }

    case "units": {
      if (!subjectCode) throw new Tcs2Error("TCS2_SUBJECT_REQUIRED", "اختر المادة أولاً لتوليد أكواد الوحدات.");
      const subjectNo = subjectNoOf(registry, subjectCode);
      const codes = allocateTcs2Codes({
        existingCodes: registry.units.map((u) => u.unitCode),
        kind: "unit",
        scope,
        fixed: [subjectNo],
        count: rowCount,
      });
      return {
        rows: codes.map((code, i) => ({
          unit_code: code,
          subject_code: subjectCode,
          sort_order: String(i + 1),
        })),
        allocatedCodes: codes,
        prefilledColumns: ["unit_code", "subject_code", "sort_order"],
        notes: ["املأ فقط: title (وصف الوحدة اختياري)."],
      };
    }

    case "lessons": {
      if (!subjectCode) throw new Tcs2Error("TCS2_SUBJECT_REQUIRED", "اختر المادة أولاً لتوليد أكواد الدروس.");
      const subjectNo = subjectNoOf(registry, subjectCode);
      const codes = allocateTcs2Codes({
        existingCodes: registry.lessons.map((l) => l.lessonCode),
        kind: "lesson",
        scope,
        fixed: [subjectNo],
        count: rowCount,
      });
      return {
        rows: codes.map((code, i) => ({
          lesson_code: code,
          subject_code: subjectCode,
          ...(unitCode ? { unit_code: unitCode } : {}),
          sort_order: String(i + 1),
        })),
        allocatedCodes: codes,
        prefilledColumns: [
          "lesson_code",
          "subject_code",
          ...(unitCode ? ["unit_code"] : []),
          "sort_order",
        ],
        notes: [
          "املأ فقط: title ومحتوى الدرس المطلوب.",
          "كود الدرس لا يعتمد على الوحدة، فنقل الدرس بين الوحدات لا يغيّر الكود.",
        ],
      };
    }

    case "book_contents": {
      const rows = inScopeLessons.map((l) => ({
        subject_code: l.subjectCode,
        lesson_code: l.lessonCode,
      }));
      return {
        rows,
        allocatedCodes: [],
        prefilledColumns: ["subject_code", "lesson_code"],
        notes: [
          rows.length
            ? "الصفوف مولّدة لكل درس موجود فعلياً — احذف الصفوف التي لا تريدها."
            : "لا توجد دروس بعد: استورد القالب 03 أولاً ثم أعد تنزيل هذا القالب.",
        ],
      };
    }

    case "explanations":
    case "resources":
    case "assessments": {
      const kind =
        templateKey === "explanations"
          ? ("explanation" as const)
          : templateKey === "resources"
            ? ("resource" as const)
            : ("assessment" as const);
      const codeColumn =
        templateKey === "explanations"
          ? "explanation_code"
          : templateKey === "resources"
            ? "resource_code"
            : "assessment_code";

      const rows: Array<Record<string, string>> = [];
      const allocated: string[] = [];
      for (const lesson of inScopeLessons) {
        const parsed = parseTcs2Code(lesson.lessonCode);
        if (!parsed || parsed.kind !== "lesson") continue;
        const [lessonSubjectNo, lessonNo] = parsed.numbers;
        const codes = allocateTcs2Codes({
          existingCodes: [...extra, ...allocated],
          kind,
          scope: { gradeSlug: parsed.gradeSlug },
          fixed: [lessonSubjectNo!, lessonNo!],
          count: 1,
        });
        allocated.push(...codes);
        rows.push({
          [codeColumn]: codes[0]!,
          subject_code: lesson.subjectCode,
          lesson_code: lesson.lessonCode,
          sort_order: "1",
        });
      }
      return {
        rows,
        allocatedCodes: allocated,
        prefilledColumns: [codeColumn, "subject_code", "lesson_code", "sort_order"],
        notes: [
          rows.length
            ? "صف واحد جاهز لكل درس. لإضافة أكثر من عنصر للدرس نفسه، كرّر الصف وسيمنحك النظام كوداً جديداً في التنزيل التالي."
            : "لا توجد دروس بعد: استورد القالب 03 أولاً ثم أعد تنزيل هذا القالب.",
        ],
      };
    }

    case "questions": {
      if (!subjectCode) throw new Tcs2Error("TCS2_SUBJECT_REQUIRED", "اختر المادة أولاً لتوليد أكواد الأسئلة.");
      const subjectNo = subjectNoOf(registry, subjectCode);
      const codes = allocateTcs2Codes({
        existingCodes: extra,
        kind: "question",
        scope,
        fixed: [subjectNo],
        count: rowCount,
      });
      return {
        rows: codes.map((code) => ({ question_code: code, subject_code: subjectCode })),
        allocatedCodes: codes,
        prefilledColumns: ["question_code", "subject_code"],
        notes: [
          "كود السؤال ثابت عبر كل المراجعات — لا تعدّله.",
          "lesson_code اختياري: املأه لربط السؤال بدرس محدد.",
        ],
      };
    }
  }
}

function styleHeaderRow(sheet: ExcelJS.Worksheet, requiredSet: Set<string>): void {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
  header.height = 24;
  header.alignment = { vertical: "middle", horizontal: "center" };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    if (requiredSet.has(String(cell.value ?? "").replace(/\s*\*$/, ""))) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF7F1D1D" } };
    }
  });
  header.commit();
}

function addCodeReferenceSheet(
  workbook: ExcelJS.Workbook,
  registry: ContentCodeRegistry,
  request: ContextTemplateRequest,
): void {
  const sheet = workbook.addWorksheet("مرجع الأكواد", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
  });
  sheet.columns = [
    { header: "البند", key: "a", width: 26 },
    { header: "القيمة", key: "b", width: 46 },
    { header: "ملاحظة", key: "c", width: 60 },
  ];
  styleHeaderRow(sheet, new Set());

  sheet.addRow({ a: "إصدار نظام الأكواد", b: CONTENT_CODE_SCHEME_VERSION, c: "أكواد مملوكة للنظام" });
  sheet.addRow({ a: "الصف المختار", b: request.gradeSlug, c: "من البيانات المرجعية الرسمية" });
  sheet.addRow({
    a: "المسارات المختارة",
    b: (request.trackCodes ?? []).join(" | ") || "—",
    c: "التوفر فقط — لا يدخل في الكود",
  });
  if (request.subjectCode) sheet.addRow({ a: "المادة المختارة", b: request.subjectCode, c: "" });
  if (request.unitCode) sheet.addRow({ a: "الوحدة المختارة", b: request.unitCode, c: "" });
  sheet.addRow({});

  sheet.addRow({ a: "صيغ الأكواد", b: "", c: "" }).font = { bold: true };
  for (const row of TCS2_FORMAT_TABLE) {
    sheet.addRow({ a: row.labelAr, b: row.format, c: `مثال: ${row.example}` });
  }
  sheet.addRow({});

  sheet.addRow({ a: "القواعد", b: "", c: "" }).font = { bold: true };
  for (const rule of TCS2_RULES_AR) sheet.addRow({ a: "", b: rule, c: "" });
  sheet.addRow({});

  sheet.addRow({ a: "الصفوف المتاحة", b: "", c: "" }).font = { bold: true };
  for (const g of registry.grades) sheet.addRow({ a: g.gradeShort, b: g.gradeSlug, c: g.nameAr });
  sheet.addRow({});

  sheet.addRow({ a: "المسارات المتاحة (للتوفر فقط)", b: "", c: "" }).font = { bold: true };
  for (const t of registry.tracks) sheet.addRow({ a: t.trackCode, b: t.trackCode, c: t.nameAr });
  sheet.addRow({});

  sheet.addRow({ a: "المواد الموجودة", b: "", c: "" }).font = { bold: true };
  if (registry.subjects.length === 0) {
    sheet.addRow({ a: "—", b: "لا توجد مواد بعد", c: "ابدأ بالقالب 01" });
  } else {
    for (const s of registry.subjects) {
      sheet.addRow({
        a: s.subjectCode,
        b: s.name,
        c: `${s.gradeSlug} / ${s.trackCodes.join(" + ") || "بدون مسار"}`,
      });
    }
  }

  if (registry.units.length) {
    sheet.addRow({});
    sheet.addRow({ a: "الوحدات الموجودة", b: "", c: "" }).font = { bold: true };
    for (const u of registry.units) sheet.addRow({ a: u.unitCode, b: u.title, c: u.subjectCode });
  }

  if (registry.lessons.length) {
    sheet.addRow({});
    sheet.addRow({ a: "الدروس الموجودة", b: "", c: "" }).font = { bold: true };
    for (const l of registry.lessons) {
      sheet.addRow({ a: l.lessonCode, b: l.title, c: `${l.subjectCode} / ${l.unitCode ?? "—"}` });
    }
  }
}

export async function buildContextualTemplate(
  input: BuildInput,
): Promise<ContextTemplateResponse> {
  const plan = planRows(input);
  const columns = templateColumnsForEntity(input.templateKey);
  const required = new Set(requiredTemplateColumnsForEntity(input.templateKey));
  const prefilled = new Set(plan.prefilledColumns);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = `Tamkeen ${CONTENT_CODE_SCHEME_VERSION}`;
  workbook.created = new Date();

  const instructions = workbook.addWorksheet("تعليمات", { views: [{ rightToLeft: true }] });
  instructions.columns = [{ header: "التعليمات", key: "a", width: 110 }];
  styleHeaderRow(instructions, new Set());
  instructions.addRow({ a: `القالب: ${input.templateKey} — إصدار الأكواد ${CONTENT_CODE_SCHEME_VERSION}` });
  instructions.addRow({ a: "الأعمدة المعبأة مسبقاً من النظام (لا تعدّلها):" });
  for (const c of plan.prefilledColumns) instructions.addRow({ a: `   • ${c}` });
  instructions.addRow({ a: "الأعمدة التي تملؤها يدوياً:" });
  for (const c of columns.filter((c) => !prefilled.has(c))) {
    instructions.addRow({ a: `   • ${c}${required.has(c) ? " (مطلوب)" : ""}` });
  }
  for (const note of plan.notes) instructions.addRow({ a: note });
  for (const rule of TCS2_RULES_AR) instructions.addRow({ a: rule });

  addCodeReferenceSheet(workbook, input.registry, input);

  const dataSheet = workbook.addWorksheet("البيانات", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
  });
  dataSheet.columns = columns.map((c) => ({
    header: required.has(c) ? `${c} *` : c,
    key: c,
    width: Math.max(16, Math.min(38, c.length + 8)),
  }));
  styleHeaderRow(dataSheet, required);

  for (const row of plan.rows) {
    const added = dataSheet.addRow(row);
    for (const col of plan.prefilledColumns) {
      const cell = added.getCell(col);
      cell.font = { bold: true, color: { argb: "FF1F3864" } };
      cell.protection = { locked: true };
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  const scopeTag = [input.gradeSlug, ...(input.trackCodes ?? []), input.subjectCode]
    .filter(Boolean)
    .join("_");

  return {
    filename: `tamkeen_${input.templateKey}_${scopeTag}_${stamp}.xlsx`,
    fileBase64: Buffer.from(buffer as ArrayBuffer).toString("base64"),
    allocatedCodes: plan.allocatedCodes,
    prefilledColumns: plan.prefilledColumns,
    manualColumns: columns.filter((c) => !prefilled.has(c)),
    notes: plan.notes,
  };
}

export type { ContextTemplateKey };
