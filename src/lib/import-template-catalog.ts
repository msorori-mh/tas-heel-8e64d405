/** Static metadata for Excel import templates (no file I/O). */
export interface ImportTemplateMeta {
  order: number;
  file: string;
  nameAr: string;
  descriptionAr: string;
  dataType: string;
  sensitive?: boolean;
}

export const IMPORT_TEMPLATE_CATALOG: ImportTemplateMeta[] = [
  {
    order: 1,
    file: "01_curriculum_tracks_template.xlsx",
    nameAr: "المسارات التعليمية",
    descriptionAr: "تعريف المسارات الأساسية للمحتوى.",
    dataType: "إعدادات هيكلية",
  },
  {
    order: 2,
    file: "02_governorates_template.xlsx",
    nameAr: "المحافظات",
    descriptionAr: "قائمة المحافظات المستخدمة في ربط المناهج.",
    dataType: "إعدادات هيكلية",
  },
  {
    order: 3,
    file: "03_governorate_curriculum_map_template.xlsx",
    nameAr: "ربط المحافظات بالمناهج",
    descriptionAr: "تحديد المسار أو المنهج المناسب لكل محافظة.",
    dataType: "ربط هيكلي",
  },
  {
    order: 4,
    file: "04_grades_template.xlsx",
    nameAr: "الصفوف الدراسية",
    descriptionAr: "تعريف الصفوف والمستويات الدراسية.",
    dataType: "إعدادات تعليمية",
  },
  {
    order: 5,
    file: "05_subjects_template.xlsx",
    nameAr: "المواد",
    descriptionAr: "تعريف المواد وربطها بالصف أو المسار.",
    dataType: "محتوى تعليمي",
  },
  {
    order: 6,
    file: "06_units_template.xlsx",
    nameAr: "الوحدات",
    descriptionAr: "تعريف وحدات المواد.",
    dataType: "محتوى تعليمي",
  },
  {
    order: 7,
    file: "07_lessons_template.xlsx",
    nameAr: "الدروس",
    descriptionAr: "تعريف الدروس داخل الوحدات.",
    dataType: "محتوى تعليمي",
  },
  {
    order: 8,
    file: "08_lesson_contents_template.xlsx",
    nameAr: "محتوى الدروس",
    descriptionAr: "محتوى نصي ومنظم للدروس عبر عدة شيتات.",
    dataType: "محتوى تفصيلي",
  },
  {
    order: 9,
    file: "09_questions_template.xlsx",
    nameAr: "الأسئلة",
    descriptionAr: "بنك الأسئلة مع الخيارات والإجابات.",
    dataType: "بيانات حساسة",
    sensitive: true,
  },
  {
    order: 10,
    file: "10_exam_templates_template.xlsx",
    nameAr: "قوالب الاختبارات",
    descriptionAr: "قوالب تكوين الاختبارات والمحاكاة.",
    dataType: "اختبارات",
  },
  {
    order: 11,
    file: "11_subscription_plans_template.xlsx",
    nameAr: "خطط الاشتراك",
    descriptionAr: "تعريف خطط الاشتراك والمدد والأسعار.",
    dataType: "اشتراكات",
  },
  {
    order: 12,
    file: "12_payment_methods_template.xlsx",
    nameAr: "وسائل الدفع",
    descriptionAr: "تعريف وسائل الدفع المتاحة وتعليماتها.",
    dataType: "مدفوعات",
  },
];

export const IMPORT_ORDER_GROUPS = [
  { range: "01–04", label: "الهيكل الأساسي" },
  { range: "05–08", label: "المحتوى التعليمي" },
  { range: "09–10", label: "الأسئلة والاختبارات" },
  { range: "11–12", label: "الاشتراكات والدفع" },
] as const;

export const IMPORT_NOT_ENABLED_YET = [
  "رفع الملفات",
  "المعاينة",
  "التحقق من الأخطاء",
  "التنفيذ داخل قاعدة البيانات",
  "سجل عمليات الاستيراد",
] as const;

export const FINANCIAL_IMPORT_ORDERS = [11, 12] as const;

export const CONTENT_STAFF_IMPORT_ORDERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export function getImportTemplatesForStaff(isFullAdmin: boolean): ImportTemplateMeta[] {
  if (isFullAdmin) return IMPORT_TEMPLATE_CATALOG;
  return IMPORT_TEMPLATE_CATALOG.filter(
    (template) =>
      !FINANCIAL_IMPORT_ORDERS.includes(
        template.order as (typeof FINANCIAL_IMPORT_ORDERS)[number],
      ),
  );
}

export function getImportOrderGroupsForStaff(
  isFullAdmin: boolean,
): readonly (typeof IMPORT_ORDER_GROUPS)[number][] {
  if (isFullAdmin) return IMPORT_ORDER_GROUPS;
  return IMPORT_ORDER_GROUPS.filter((group) => group.range !== "11–12");
}

export function importTemplateDownloadUrl(file: string): string {
  return `/import-templates/${file}`;
}
