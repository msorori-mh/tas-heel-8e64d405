export interface LessonComponentPublishErrorMessage {
  message: string;
  action: string;
  technicalDetail: string;
}

const ERROR_MESSAGES: Array<{
  pattern: RegExp;
  message: string;
  action: string;
}> = [
  {
    pattern: /LCPV2_LAB_PUBLISHED_RESOURCE_IMMUTABLE_CONFLICT/i,
    message: "يوجد في هذا الموضع مورد تجربة منشور ببصمة أو عنوان مختلف.",
    action:
      "لم يُعدّل النظام المورد المنشور. حدّث قائمة التجارب من الخادم، ثم أضف التجربة في الموضع التالي أو أرسل التفاصيل للدعم.",
  },
  {
    pattern: /LCPV2_LAB_INSTANCE_(?:INVALID|RANGE_INVALID|FORBIDDEN)/i,
    message: "ترتيب التجارب أو عنوان إحداها غير صالح.",
    action: "احذف التجربة من الدفعة وأضفها مجددًا ليُعاد تثبيت ترتيبها.",
  },
  {
    pattern: /LCPV2_(?:FILE_TYPE_UNSUPPORTED|SOURCE_INVALID)|UNSUPPORTED_FILE/i,
    message: "نوع الملف أو بنيته غير مطابقين لمتطلبات هذا المكوّن.",
    action: "راجع نوع الملف والتعليمات الظاهرة، ثم اختر الملف الصحيح وأعد المحاولة.",
  },
  {
    pattern: /(?:HTML|CSS)_DETACHED_RESOURCE|external|روابط خارجية/i,
    message: "يحتوي ملف HTML على مورد خارجي غير مسموح.",
    action: "ضمّن الصور والأنماط داخل الملف، ثم ارفعه من جديد.",
  },
  {
    pattern: /(?:HASH|SIZE)_MISMATCH/i,
    message: "تغيّر الملف أثناء الرفع أو لم تصل جميع بياناته إلى الخادم.",
    action: "اختر الملف مجددًا وأعد الرفع والفحص.",
  },
  {
    pattern: /ANSWER_(?:FILE_SHAPE|COVERAGE_INVALID)|ANSWERS_(?:REQUIRED|FORBIDDEN)/i,
    message: "ملف الأسئلة أو الإجابات لا يطابق القالب المعتمد.",
    action: "نزّل القالب المعتمد، وصحح الصفوف المطلوبة، ثم أعد الرفع.",
  },
  {
    pattern: /FULL_ADMIN_REQUIRED|NOT_AUTHORIZED|OWNER_MISMATCH/i,
    message: "لا تسمح صلاحيات الجلسة الحالية بإكمال النشر.",
    action: "أعد تسجيل الدخول بحساب مسؤول المحتوى المخوّل ثم أعد المحاولة.",
  },
  {
    pattern: /INTAKE_NOT_VERIFIED/i,
    message: "لم يكتمل فحص الملف على الخادم، لذلك لم يُنشر.",
    action: "أعد رفع الملف ليُفحص قبل النشر.",
  },
  {
    pattern: /COMPONENT_NOT_VISIBLE/i,
    message: "تمت الكتابة لكن بوابة ظهور المكوّن للطالب لم تؤكد الجاهزية.",
    action: "لا تكرر الرفع؛ أرسل التفاصيل التقنية إلى الدعم للتحقق من حالة النشر.",
  },
  {
    pattern: /unsupported lesson_resources\.metadata key|LIFECYCLE_CONFLICT/i,
    message: "رفض الخادم بيانات النشر الداخلية للمكوّن.",
    action: "الملف محفوظ ولم يفشل فحصه؛ أرسل التفاصيل التقنية إلى الدعم ولا تغيّر الملف.",
  },
  {
    pattern: /UPLOAD_FAILED|FILE_DOWNLOAD_FAILED|UPLOAD_TOKEN_MISSING/i,
    message: "تعذّر نقل الملف إلى الخادم.",
    action: "تحقق من الاتصال ثم أعد الرفع.",
  },
];

export function lessonComponentPublishErrorMessage(
  error: unknown,
): LessonComponentPublishErrorMessage {
  const technicalDetail =
    error instanceof Error ? error.message : typeof error === "string" ? error : "UNKNOWN_ERROR";
  const known = ERROR_MESSAGES.find(({ pattern }) => pattern.test(technicalDetail));
  return {
    message: known?.message ?? "تعذّر إكمال نشر هذا المكوّن.",
    action:
      known?.action ?? "أعد المحاولة مرة واحدة. إذا تكرر الخطأ، أرسل التفاصيل التقنية إلى الدعم.",
    technicalDetail,
  };
}
