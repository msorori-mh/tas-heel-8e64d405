const messages: Record<string, string> = {
  PROGRAM_NOT_VISIBLE: "هذا البرنامج غير متاح لحسابك حاليًا.",
  ACTIVE_ENROLLMENT_REQUIRED: "التحق بالبرنامج أولًا للمتابعة.",
  COMPLETE_LESSONS_BEFORE_ASSESSMENT: "أكمل جميع دروس البرنامج قبل فتح التقييم.",
  PREVIOUS_LESSONS_REQUIRED: "أكمل الدروس السابقة أولًا.",
  ASSESSMENT_ALREADY_PASSED: "اجتزت هذا التقييم بالفعل. يمكنك عرض شهادتك من صفحة الشهادات.",
  ASSESSMENT_ATTEMPT_LIMIT:
    "استخدمت المحاولات الثلاث المتاحة خلال 24 ساعة. راجع الدروس ثم حاول لاحقًا.",
  ASSESSMENT_COOLDOWN: "انتظر 15 دقيقة بين المحاولات واستفد من الوقت في مراجعة الدروس.",
  ALL_VALID_ANSWERS_REQUIRED: "أجب عن جميع الأسئلة قبل إرسال التقييم.",
  GOOGLE_TEACHER_AUTH_REQUIRED: "سجّل الدخول بحساب Google الخاص بك للمتابعة.",
  ACTIVE_SUBJECT_REQUIRED: "اختر مادة متاحة من القائمة.",
  GOVERNORATE_REQUIRED: "اختر المحافظة من القائمة.",
  INVALID_TEACHER_PHONE: "أدخل رقم هاتف صحيحًا من 7 إلى 20 خانة.",
  INVALID_TEACHER_NAME: "أدخل اسمًا كاملًا من 3 إلى 160 حرفًا.",
};
export function teacherError(error: unknown): string {
  const message =
    error && typeof error === "object" && "message" in error ? String(error.message) : "";
  for (const [code, text] of Object.entries(messages)) if (message.includes(code)) return text;
  if (/[\u0600-\u06ff]/.test(message) && !/[<>]/.test(message)) return message;
  return "تعذّر إتمام الطلب. تحقّق من الاتصال وحاول مرة أخرى.";
}
export function validateTeacherProfile(
  name: string,
  phone: string,
  subject: string,
  governorate: string,
) {
  if (name.trim().length < 3 || name.trim().length > 160) return messages.INVALID_TEACHER_NAME;
  if (!subject) return messages.ACTIVE_SUBJECT_REQUIRED;
  if (!governorate) return messages.GOVERNORATE_REQUIRED;
  if (phone.trim().length > 20 || !/^\+?[0-9][0-9 ()-]{5,18}[0-9]$/.test(phone.trim()))
    return messages.INVALID_TEACHER_PHONE;
  return null;
}
const units = {
  lesson: ["درس", "درسان", "دروس", "درسًا"],
  minute: ["دقيقة", "دقيقتان", "دقائق", "دقيقة"],
  hour: ["ساعة", "ساعتان", "ساعات", "ساعة"],
  section: ["قسم", "قسمان", "أقسام", "قسمًا"],
  question: ["سؤال", "سؤالان", "أسئلة", "سؤالًا"],
  program: ["برنامج", "برنامجان", "برامج", "برنامجًا"],
} as const;
export function countLabel(count: number, unit: keyof typeof units): string {
  const forms = units[unit];
  if (count === 1) return `${forms[0]} واحد${unit === "minute" || unit === "hour" ? "ة" : ""}`;
  if (count === 2) return forms[1];
  return `${count.toLocaleString("en-US")} ${count === 0 || (count % 100 >= 3 && count % 100 <= 10) ? forms[2] : forms[3]}`;
}
export function durationLabel(minutes: number): string {
  if (minutes < 60) return countLabel(minutes, "minute");
  const hours = Math.floor(minutes / 60),
    rest = minutes % 60;
  return countLabel(hours, "hour") + (rest ? ` و${countLabel(rest, "minute")}` : "");
}

export const OPTIONS = ["a", "b", "c", "d"] as const;
export function shuffledOptions(): Array<(typeof OPTIONS)[number]> {
  const result = [...OPTIONS];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
