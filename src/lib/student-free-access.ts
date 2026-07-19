/**
 * Temporary student free-access pivot.
 * Payment/subscription infrastructure remains in the codebase and admin,
 * but student UX treats the app as free while this flag is true.
 *
 * NOTE: Full content unlock still depends on DB RPCs/RLS
 * (can_access_lesson, start_exam_session, grade_unit_practice).
 * UI gates are opened here; a follow-up migration is required for true free access.
 */
export const STUDENT_FREE_ACCESS = true;

export const FREE_ACCESS_BADGE = "متاح مجاناً للطلاب";

export const FREE_ACCESS_SHORT =
  "التطبيق متاح حالياً مجاناً لجميع الطلاب. خدمات الدفع والاشتراكات غير مفعّلة حالياً.";

export const FREE_ACCESS_SUBSCRIPTION_PAGE =
  "حرصاً على إتاحة التعليم لجميع الطلاب، التطبيق متاح حالياً مجاناً. سنعلن لاحقاً عن أي برامج دعم أو رعاية دون التأثير على وصول الطلاب للمحتوى الأساسي.";

export const FREE_ACCESS_WALLET_NOTICE =
  "خدمات شحن المحفظة غير مطلوبة حالياً لأن التطبيق مجاني.";
