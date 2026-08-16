/**
 * TAMKEEN_OFFICIAL_TEXTBOOK_STRUCTURED_CONTENT_STANDARD_20A
 * Security + fidelity contract tests for the official textbook layer.
 */
import { describe, it, expect } from "vitest";
import {
  parseOfficialContent,
  officialPlainText,
} from "../../src/lib/content/official-textbook/parser.ts";
import {
  evaluateOfficialFidelity,
  computeOfficialContentHash,
  normalizeArabicForCompare,
} from "../../src/lib/content/official-textbook/fidelity.ts";
import {
  isOfficialStructuredContent,
  resolveTransitionState,
} from "../../src/lib/content/official-textbook/standard.ts";

const SOURCE = "الوحدة الأولى: التوحيد. التوحيد هو إفراد الله بالعبادة. وينقسم إلى ثلاثة أقسام.";

const VALID = `
<section data-layer="A_OFFICIAL_TEXTBOOK" data-official-standard="20A"
  data-source-book="التربية الإسلامية - الصف الأول الثانوي" data-source-edition="2024"
  data-source-page-from="7" data-source-page-to="9" dir="rtl">
  <h2 data-block-type="HEADING" data-block-id="b1" data-source-page="7">الوحدة الأولى: التوحيد</h2>
  <p data-block-type="DEFINITION" data-block-id="b2" data-source-page="7">التوحيد هو إفراد الله بالعبادة.</p>
  <p data-block-type="PARAGRAPH" data-block-id="b3" data-source-page="8">وينقسم إلى ثلاثة أقسام.</p>
</section>`;

describe("20A — structural validation", () => {
  it("accepts a well-formed official section", () => {
    const r = parseOfficialContent(VALID);
    expect(r.ok).toBe(true);
    expect(r.blocks.length).toBe(3);
    expect(r.provenance.sourcePageFrom).toBe("7");
    expect(officialPlainText(r)).toContain("إفراد الله بالعبادة");
  });

  it("rejects scripts, iframes, links and inline handlers", () => {
    for (const bad of [
      `<section data-layer="A_OFFICIAL_TEXTBOOK"><script>alert(1)</script><p>x</p></section>`,
      `<section data-layer="A_OFFICIAL_TEXTBOOK"><iframe src="https://x"></iframe></section>`,
      `<section data-layer="A_OFFICIAL_TEXTBOOK"><a href="https://x">x</a></section>`,
      `<section data-layer="A_OFFICIAL_TEXTBOOK"><p onclick="x()">x</p></section>`,
    ]) {
      const r = parseOfficialContent(bad);
      expect(r.ok).toBe(false);
    }
  });

  it("rejects base64 and external images", () => {
    const r = parseOfficialContent(
      `<section data-layer="A_OFFICIAL_TEXTBOOK"><figure data-block-type="IMAGE"><img src="data:image/png;base64,AAA" alt="ص"></figure></section>`,
    );
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === "OFFICIAL_IMAGE_SRC_INVALID")).toBe(true);
  });

  it("rejects unknown block types and duplicate block ids", () => {
    const unknown = parseOfficialContent(
      `<section data-layer="A_OFFICIAL_TEXTBOOK"><p data-block-type="RANDOM">x</p></section>`,
    );
    expect(unknown.errors.some((e) => e.code === "OFFICIAL_UNKNOWN_BLOCK_TYPE")).toBe(true);

    const dup = parseOfficialContent(
      `<section data-layer="A_OFFICIAL_TEXTBOOK"><p data-block-id="a">1</p><p data-block-id="a">2</p></section>`,
    );
    expect(dup.errors.some((e) => e.code === "OFFICIAL_DUPLICATE_BLOCK_ID")).toBe(true);
  });

  it("drops inline styles as warnings, not errors", () => {
    const r = parseOfficialContent(
      `<section data-layer="A_OFFICIAL_TEXTBOOK"><p style="color:red">نص</p></section>`,
    );
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.code === "OFFICIAL_INLINE_STYLE_DROPPED")).toBe(true);
  });
});

describe("20A — layer detection and transition state", () => {
  it("detects official content vs legacy plain text", () => {
    expect(isOfficialStructuredContent(VALID)).toBe(true);
    expect(isOfficialStructuredContent("نص عادي قديم")).toBe(false);
  });

  it("keeps PDF as temporary primary until structured content is approved", () => {
    expect(
      resolveTransitionState({
        hasOfficialStructuredContent: true,
        officialContentApproved: false,
        hasPrimaryPdf: true,
      }),
    ).toBe("PDF_ONLY_TEMPORARY");
    expect(
      resolveTransitionState({
        hasOfficialStructuredContent: true,
        officialContentApproved: true,
        hasPrimaryPdf: true,
      }),
    ).toBe("STRUCTURED_PRIMARY_WITH_PDF_REFERENCE");
    expect(
      resolveTransitionState({
        hasOfficialStructuredContent: false,
        officialContentApproved: false,
        hasPrimaryPdf: false,
      }),
    ).toBe("MISSING_PRIMARY_CONTENT");
  });
});

describe("20A — fidelity engine", () => {
  it("passes when structured content matches the source exactly", () => {
    const r = evaluateOfficialFidelity(SOURCE, VALID);
    expect(r.status).toBe("PASS");
    expect(r.coverage).toBeGreaterThanOrEqual(0.98);
  });

  it("fails on omission", () => {
    const omitted = VALID.replace(
      '<p data-block-type="PARAGRAPH" data-block-id="b3" data-source-page="8">وينقسم إلى ثلاثة أقسام.</p>',
      "",
    );
    expect(evaluateOfficialFidelity(SOURCE, omitted).status).not.toBe("PASS");
  });

  it("fails on added/paraphrased content", () => {
    const added = VALID.replace(
      "وينقسم إلى ثلاثة أقسام.",
      "وينقسم إلى ثلاثة أقسام، وهذا شرح إضافي من تمكين لم يرد في الكتاب الرسمي إطلاقا ويطيل النص كثيرا جدا هنا.",
    );
    expect(evaluateOfficialFidelity(SOURCE, added).status).not.toBe("PASS");
  });

  it("fails closed when the source text is missing", () => {
    expect(evaluateOfficialFidelity("", VALID).status).toBe("FAIL");
  });

  it("normalizes Arabic for comparison only", () => {
    expect(normalizeArabicForCompare("الْعِبَادَةُ")).toBe(normalizeArabicForCompare("العباده"));
  });

  it("produces a stable canonical hash", async () => {
    const a = await computeOfficialContentHash(VALID);
    const b = await computeOfficialContentHash(VALID.replace(/\n\s+/g, " "));
    expect(a).toBe(b);
    const c = await computeOfficialContentHash(VALID.replace("ثلاثة", "أربعة"));
    expect(c).not.toBe(a);
  });
});
