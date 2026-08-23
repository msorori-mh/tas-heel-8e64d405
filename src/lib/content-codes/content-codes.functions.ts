/**
 * OFFICIAL_CONTENT_CODE_SYSTEM_13B — authenticated server functions.
 *
 * Template generation remains read-only. Curriculum-unit creation is the
 * single guarded write here so the TCS-2 code is always system generated.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireContentStaffAuth } from "@/integrations/supabase/auth-middleware";
import {
  CONTEXT_TEMPLATE_KEYS,
  type ContentCodeRegistry,
  type ContextTemplateResponse,
} from "./content-codes.types";

const CreateCurriculumUnitInput = z.object({
  subjectId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(100000),
  isFree: z.boolean(),
});

const CreateCurriculumLessonInput = z.object({
  subjectId: z.string().uuid(),
  unitId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  duration: z.string().trim().max(100).nullable().optional(),
  sortOrder: z.number().int().min(0).max(100000),
  isFree: z.boolean(),
});

const SaveCurriculumSubjectInput = z.object({
  subjectId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(160),
  gradeId: z.string().uuid(),
  trackIds: z.array(z.string().uuid()).min(1).max(2),
  sortOrder: z.number().int().min(0).max(100000),
  icon: z.string().trim().max(80).nullable().optional(),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  groupCode: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .nullable()
    .optional(),
  groupName: z.string().trim().max(160).nullable().optional(),
});

const ContextTemplateInput = z.object({
  templateKey: z.enum(CONTEXT_TEMPLATE_KEYS),
  gradeSlug: z.string().min(1).max(32),
  trackCodes: z.array(z.string().min(1).max(32)).max(8).default([]),
  subjectCode: z.string().max(64).optional(),
  unitCode: z.string().max(64).optional(),
  rowCount: z.number().int().min(1).max(200).default(20),
  subjectMode: z.enum(["single", "group"]).default("single"),
  groupName: z.string().trim().max(120).optional(),
  branchNames: z.array(z.string().trim().min(1).max(120)).max(50).optional(),

});

/** Master data + already-allocated codes, for the admin code-registry UI. */
export const getContentCodeRegistry = createServerFn({ method: "GET" })
  .middleware([requireContentStaffAuth])
  .handler(async ({ context }): Promise<ContentCodeRegistry> => {
    const { loadContentCodeRegistry } = await import("./content-code-registry.server");
    return loadContentCodeRegistry(context.supabase);
  });

/** Context-aware template with system-owned codes already filled in. */
export const downloadContextualTemplate = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => ContextTemplateInput.parse(input))
  .handler(async ({ data, context }): Promise<ContextTemplateResponse> => {
    const { loadContentCodeRegistry, loadQuestionCodes, loadLessonChildCodes } = await import(
      "./content-code-registry.server"
    );
    const { buildContextualTemplate } = await import("./contextual-template.server");

    const registry = await loadContentCodeRegistry(context.supabase);

    let extraExistingCodes: string[] = [];
    if (data.templateKey === "questions") {
      extraExistingCodes = await loadQuestionCodes(context.supabase);
    } else if (
      data.templateKey === "explanations" ||
      data.templateKey === "resources" ||
      data.templateKey === "assessments"
    ) {
      extraExistingCodes = await loadLessonChildCodes(context.supabase, data.templateKey);
    }

    return buildContextualTemplate({ ...data, registry, extraExistingCodes });
  });

/**
 * Save a subject through the database-owned atomic boundary.
 * TCS-2 identity is generated on create; availability accepts only Sanaa/Aden.
 */
export const saveCurriculumSubjectAdmin = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => SaveCurriculumSubjectInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: saved, error } = await (context.supabase as any).rpc(
      "admin_save_curriculum_subject",
      {
        _subject_id: data.subjectId ?? null,
        _name: data.name,
        _grade_id: data.gradeId,
        _track_ids: Array.from(new Set(data.trackIds)),
        _sort_order: data.sortOrder,
        _icon: data.icon?.trim() || null,
        _color: data.color?.trim() || null,
        _group_code: data.groupCode?.trim() || null,
        _group_name: data.groupName?.trim() || null,
      },
    );
    if (error) {
      if (error.message?.includes("SUBJECT_TRACK_DETACH_REQUIRES_IMPACT_REVIEW")) {
        throw new Error("إزالة مسار قائم تتطلب مراجعة أثر مستقلة؛ يمكنك إضافة المسار الآخر فقط من هنا.");
      }
      throw new Error(`تعذر حفظ المادة: ${error.message}`);
    }
    return saved as { id: string; code: string; track_ids: string[]; created: boolean };
  });

/**
 * Create one curriculum unit with a server-owned TCS-2 code.
 *
 * The operator never types the code. A subject without a valid official code
 * is rejected, and the database unique constraint closes concurrent races.
 */
export const createCurriculumUnitAdmin = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => CreateCurriculumUnitInput.parse(input))
  .handler(async ({ data, context }) => {
    const { buildUnitCode, nextAllocatedNumber, parseTcs2Code } = await import("./tcs2");

    const { data: subject, error: subjectError } = await context.supabase
      .from("subjects")
      .select("id, code, grade_id")
      .eq("id", data.subjectId)
      .maybeSingle();

    if (subjectError) {
      throw new Error(`تعذر قراءة المادة: ${subjectError.message}`);
    }
    if (!subject?.grade_id) {
      throw new Error("المادة غير موجودة أو غير مرتبطة بصف دراسي.");
    }

    const parsedSubject = parseTcs2Code((subject.code ?? "").trim());
    if (!parsedSubject || parsedSubject.kind !== "subject") {
      throw new Error("لا يمكن إنشاء الوحدة: المادة لا تحمل كود TCS-2 رسميًا.");
    }

    const { data: grade, error: gradeError } = await context.supabase
      .from("grades")
      .select("slug")
      .eq("id", subject.grade_id)
      .maybeSingle();

    if (gradeError) {
      throw new Error(`تعذر قراءة الصف الدراسي: ${gradeError.message}`);
    }
    if (!grade?.slug || grade.slug !== parsedSubject.gradeSlug) {
      throw new Error("بيانات الصف وكود المادة غير متطابقة.");
    }

    const { data: existingUnits, error: unitsError } = await context.supabase
      .from("units")
      .select("code")
      .eq("subject_id", subject.id)
      .limit(1000);

    if (unitsError) {
      throw new Error(`تعذر قراءة أكواد الوحدات: ${unitsError.message}`);
    }

    const existingCodes = (existingUnits ?? [])
      .map((row) => (row.code ?? "").trim())
      .filter(Boolean);
    const subjectNo = parsedSubject.numbers[0];
    if (!subjectNo) {
      throw new Error("تعذر استخراج رقم المادة من كود TCS-2.");
    }

    const scope = { gradeSlug: grade.slug };
    const unitNo = nextAllocatedNumber(existingCodes, "unit", scope, [subjectNo]);
    const code = buildUnitCode(scope, subjectNo, unitNo);

    const { data: created, error: createError } = await context.supabase
      .from("units")
      .insert({
        code,
        title: data.title,
        subject_id: data.subjectId,
        sort_order: data.sortOrder,
        is_free: data.isFree,
        description: data.description?.trim() || null,
      })
      .select("id, code, title, subject_id, sort_order, is_free, description")
      .single();

    if (createError) {
      if (createError.code === "23505") {
        throw new Error("تعذر حجز كود الوحدة بسبب إنشاء متزامن. أعد المحاولة.");
      }
      throw new Error(`تعذر إنشاء الوحدة: ${createError.message}`);
    }

    return created;
  });

/** Create a lesson with a server-owned TCS-2 code; unitId is deliberately nullable. */
export const createCurriculumLessonAdmin = createServerFn({ method: "POST" })
  .middleware([requireContentStaffAuth])
  .inputValidator((input) => CreateCurriculumLessonInput.parse(input))
  .handler(async ({ data, context }) => {
    const { buildLessonCode, nextAllocatedNumber, parseTcs2Code } = await import("./tcs2");

    const { data: subject, error: subjectError } = await context.supabase
      .from("subjects")
      .select("id, code, grade_id")
      .eq("id", data.subjectId)
      .maybeSingle();
    if (subjectError) throw new Error(`تعذر قراءة المادة: ${subjectError.message}`);
    if (!subject?.grade_id) throw new Error("المادة غير موجودة أو غير مرتبطة بصف دراسي.");

    const parsedSubject = parseTcs2Code((subject.code ?? "").trim());
    if (!parsedSubject || parsedSubject.kind !== "subject") {
      throw new Error("لا يمكن إنشاء الدرس: المادة لا تحمل كود TCS-2 رسميًا.");
    }

    const { data: grade, error: gradeError } = await context.supabase
      .from("grades")
      .select("slug")
      .eq("id", subject.grade_id)
      .maybeSingle();
    if (gradeError) throw new Error(`تعذر قراءة الصف الدراسي: ${gradeError.message}`);
    if (!grade?.slug || grade.slug !== parsedSubject.gradeSlug) {
      throw new Error("بيانات الصف وكود المادة غير متطابقة.");
    }

    const unitId = data.unitId ?? null;
    if (unitId) {
      const { data: unit, error: unitError } = await context.supabase
        .from("units")
        .select("id, subject_id")
        .eq("id", unitId)
        .maybeSingle();
      if (unitError) throw new Error(`تعذر قراءة الوحدة: ${unitError.message}`);
      if (!unit || unit.subject_id !== subject.id) {
        throw new Error("الوحدة المختارة لا تنتمي إلى المادة المحددة.");
      }
    }

    const { data: existingLessons, error: lessonsError } = await context.supabase
      .from("lessons")
      .select("slug")
      .eq("subject_id", subject.id)
      .limit(2000);
    if (lessonsError) throw new Error(`تعذر قراءة أكواد الدروس: ${lessonsError.message}`);

    const existingCodes = (existingLessons ?? [])
      .map((row) => (row.slug ?? "").trim())
      .filter(Boolean);
    const subjectNo = parsedSubject.numbers[0];
    if (!subjectNo) throw new Error("تعذر استخراج رقم المادة من كود TCS-2.");
    const scope = { gradeSlug: grade.slug };
    const lessonNo = nextAllocatedNumber(existingCodes, "lesson", scope, [subjectNo]);
    const slug = buildLessonCode(scope, subjectNo, lessonNo);

    const { data: created, error: createError } = await context.supabase
      .from("lessons")
      .insert({
        subject_id: subject.id,
        unit_id: unitId,
        slug,
        title: data.title,
        duration: data.duration?.trim() || null,
        sort_order: data.sortOrder,
        is_free: data.isFree,
      })
      .select("id, slug, title, subject_id, unit_id, sort_order, duration, is_free")
      .single();
    if (createError) {
      if (createError.code === "23505") {
        throw new Error("تعذر حجز كود الدرس بسبب إنشاء متزامن. أعد المحاولة.");
      }
      throw new Error(`تعذر إنشاء الدرس: ${createError.message}`);
    }
    return created;
  });
