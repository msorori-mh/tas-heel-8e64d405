import { describe, expect, it } from "vitest";
import {
  evaluateArabicMathPreview,
  insertMathToken,
  keysForScienceProfile,
  mathContextHint,
  scienceInputProfile,
  shouldOfferMathKeyboard,
} from "./math-input/math-keyboard";

describe("science math keyboard", () => {
  it("detects the supported scientific subjects", () => {
    expect(scienceInputProfile("الرياضيات")).toBe("math");
    expect(scienceInputProfile("فيزياء 3 ثانوي")).toBe("physics");
    expect(scienceInputProfile("الكيمياء")).toBe("chemistry");
    expect(scienceInputProfile("الأحياء")).toBe("biology");
    expect(scienceInputProfile("اللغة العربية")).toBeNull();
  });

  it("offers the keyboard for mathematical prompts even without subject metadata", () => {
    expect(shouldOfferMathKeyboard({ questionText: "أوجد حل المعادلة س² - 4 = 0" })).toBe(true);
    expect(
      shouldOfferMathKeyboard({
        questionText: "اشرح الفكرة بأسلوبك",
        subjectName: "اللغة العربية",
      }),
    ).toBe(false);
  });

  it("inserts symbols at the caret and keeps template caret inside placeholders", () => {
    expect(
      insertMathToken({
        value: "س",
        start: 1,
        end: 1,
        key: { insert: "²" },
      }),
    ).toEqual({ value: "س²", cursor: 2 });

    expect(
      insertMathToken({
        value: "س=",
        start: 2,
        end: 2,
        key: { insert: "√()", cursorOffset: -1 },
      }),
    ).toEqual({ value: "س=√()", cursor: 4 });
  });

  it("replaces a selection and obeys max length", () => {
    expect(
      insertMathToken({
        value: "س+ص",
        start: 2,
        end: 3,
        key: { insert: "π" },
      }),
    ).toEqual({ value: "س+π", cursor: 3 });

    expect(
      insertMathToken({
        value: "1234",
        start: 4,
        end: 4,
        key: { insert: "²" },
        maxLength: 4,
      }),
    ).toEqual({ value: "1234", cursor: 4 });
  });

  it("provides Arabic school notation including inequalities and delimiters", () => {
    const labels = keysForScienceProfile("math").map((key) => key.label);
    for (const label of ["<", ">", "≤", "≥", "[", "]", "{", "}", "−∞"]) {
      expect(labels).toContain(label);
    }
    expect(labels).toContain("جا");
    expect(labels).toContain("جتا");
    expect(labels).toContain("ظا");
    expect(labels).toContain("لو");
    expect(labels).toContain("نها");
  });

  it("shows immediate degree-mode results for Arabic trig input", () => {
    expect(evaluateArabicMathPreview("جا(30)")).toBe("0.5");
    expect(evaluateArabicMathPreview("جا(٣٠)")).toBe("0.5");
    expect(evaluateArabicMathPreview("جتا(60)")).toBe("0.5");
    expect(evaluateArabicMathPreview("ظا(45)")).toBe("1");
    expect(evaluateArabicMathPreview("ظا(90)")).toBe("غير معرّف");
  });

  it("turns math delta into the discriminant formula and provides the contextual law", () => {
    const delta = keysForScienceProfile("math").find((key) => key.id === "delta");
    expect(delta?.label).toBe("Δ المميز");
    expect(delta?.insert).toBe("Δ=ب²−٤أج");
    expect(mathContextHint("Δ", "math")).toBe("قانون المميز: Δ = ب² − ٤أج");
    expect(keysForScienceProfile("physics").find((key) => key.id === "delta")?.insert).toBe("Δ");
  });

  it("covers chemistry and biology secondary-school notation", () => {
    const chemistry = keysForScienceProfile("chemistry").map((key) => key.label);
    expect(chemistry).toContain("→");
    expect(chemistry).toContain("⇌");
    expect(chemistry).toContain("₂");
    expect(chemistry).toContain("²⁺");
    expect(chemistry).toContain("(ص)");
    expect(chemistry).toContain("الرقم الهيدروجيني pH");

    const biology = keysForScienceProfile("biology").map((key) => key.label);
    expect(biology).toContain("أنثى ♀");
    expect(biology).toContain("ذكر ♂");
    expect(biology).toContain("DNA");
    expect(biology).toContain("ATP");
  });
});
