export type ArabicCountForms = {
  one: string;
  two: string;
  few: string;
  many: string;
  zero?: string;
};
/** Complete, readable Arabic count phrase; callers supply the case appropriate to their sentence. */
export function arabicCount(n: number, forms: ArabicCountForms): string {
  const count = Math.max(0, Math.trunc(Number.isFinite(n) ? n : 0));
  if (count === 0) return forms.zero ?? `لا ${forms.few} بعد`;
  if (count === 1) return forms.one;
  if (count === 2) return forms.two;
  return `${count} ${count >= 3 && count <= 10 ? forms.few : forms.many}`;
}
export const DAY_FORMS = { one: "يوم واحد", two: "يومان", few: "أيام", many: "يوماً" };
export const STUDENT_FORMS = {
  one: "طالب واحد",
  two: "طالبان",
  few: "طلاب",
  many: "طالبًا",
  zero: "لا طلاب",
};
export const TEACHER_FORMS = {
  one: "معلم واحد",
  two: "معلمان",
  few: "معلمين",
  many: "معلمًا",
  zero: "لا معلمين",
};
export const FILE_FORMS = {
  one: "ملف واحد",
  two: "ملفان",
  few: "ملفات",
  many: "ملفًا",
  zero: "لا ملفات",
};
export const SCHOOL_FORMS = {
  one: "مدرسة واحدة",
  two: "مدرستان",
  few: "مدارس",
  many: "مدرسة",
  zero: "لا مدارس",
};
