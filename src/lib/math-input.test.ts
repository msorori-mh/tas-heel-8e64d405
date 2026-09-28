import { describe, expect, it } from "vitest";
import {
  insertMathToken,
  keysForScienceProfile,
  scienceInputProfile,
  shouldOfferMathKeyboard,
} from "./math-input/math-keyboard";

describe("science math keyboard", () => {
  it("detects the supported scientific subjects", () => {
    expect(scienceInputProfile("الرياضيات")).toBe("math");
    expect(scienceInputProfile("فيزياء 3 ثانوي")).toBe("physics");
    expect(scienceInputProfile("الكيمياء")).toBe("chemistry");
    expect(scienceInputProfile("اللغة العربية")).toBeNull();
  });

  it("offers the keyboard for mathematical prompts even without subject metadata", () => {
    expect(
      shouldOfferMathKeyboard({ questionText: "أوجد حل المعادلة س² - 4 = 0" }),
    ).toBe(true);
    expect(
      shouldOfferMathKeyboard({ questionText: "اشرح الفكرة بأسلوبك", subjectName: "اللغة العربية" }),
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

  it("provides chemistry-specific notation without dropping common math keys", () => {
    const labels = keysForScienceProfile("chemistry").map((key) => key.label);
    expect(labels).toContain("²");
    expect(labels).toContain("→");
    expect(labels).toContain("⇌");
    expect(labels).toContain("₂");
  });
});
