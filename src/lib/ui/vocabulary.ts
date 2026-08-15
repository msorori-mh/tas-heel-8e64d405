/**
 * 17A — Unified Arabic vocabulary for Tamkeen.
 *
 * One verb per action across the whole app. Never introduce a second word for
 * an action that already exists here (e.g. "فتح" vs "الدخول" vs "عرض").
 * Presentation-only: no business logic depends on these strings.
 */

/** Primary actions. */
export const ACTION = {
  open: "فتح",
  continue: "متابعة",
  start: "ابدأ",
  retry: "إعادة المحاولة",
  review: "مراجعة",
  save: "حفظ",
  cancel: "إلغاء",
  back: "رجوع",
  next: "التالي",
  prev: "السابق",
  more: "عرض المزيد",
  details: "التفاصيل",
  edit: "تعديل",
  filter: "تصفية",
  clearFilter: "إزالة التصفية",
  download: "تنزيل",
  openExternal: "فتح الملف",
} as const;

/** Shared state / feedback copy. */
export const STATE = {
  loading: "جارٍ التحميل…",
  saving: "جارٍ الحفظ…",
  saved: "تم الحفظ",
  emptyTitle: "لا يوجد محتوى بعد",
  emptyHint: "سيظهر المحتوى هنا فور إضافته لمنهجك.",
  errorTitle: "تعذّر تحميل البيانات",
  errorHint: "تحقق من اتصالك ثم أعد المحاولة.",
  offline: "لا يوجد اتصال بالإنترنت",
  denied: "لا تملك صلاحية الوصول إلى هذه الصفحة.",
  requiresSubscription: "هذا المحتوى يحتاج اشتراكاً فعّالاً.",
} as const;

/** Canonical section names used in navigation, headers and breadcrumbs. */
export const SECTION = {
  home: "الرئيسية",
  subjects: "المواد",
  quickReview: "المراجعة السريعة",
  myMistakes: "دفتر أخطائي",
  performance: "تحليل أدائي",
  ministerial: "النماذج الوزارية",
  results: "النتائج",
  settings: "الإعدادات",
} as const;
