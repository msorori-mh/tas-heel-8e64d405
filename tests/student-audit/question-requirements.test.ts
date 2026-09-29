import { expect, it } from "vitest";
import {
  assertQuestionFigure,
  refersToAttachedFigure,
} from "@/lib/ministerial/question-requirements";
it.each([
  "سم الأجزاء في الشكل المرفق",
  "اشرح الرسم التوضيحي التالي",
  "ماذا توضح الصُّورة المرفقة؟",
  "اقرأ الجدول المقابل",
])("requires an actual question image: %s", (text) => {
  expect(() => assertQuestionFigure(text, false, "س2")).toThrow("أرفق الصورة");
  expect(() => assertQuestionFigure(text, true, "س2")).not.toThrow();
});
it("does not reject ordinary mentions of biological shapes", () => {
  expect(refersToAttachedFigure("اشرح العلاقة بين الشكل والوظيفة")).toBe(false);
});
