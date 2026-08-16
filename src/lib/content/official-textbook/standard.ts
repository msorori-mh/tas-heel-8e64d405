/**
 * TAMKEEN_OFFICIAL_TEXTBOOK_STRUCTURED_CONTENT_STANDARD_20A
 *
 * Single source of truth for the Official Textbook content standard.
 * Pure data + types: no React, no DB, no side effects.
 *
 * Governing rules:
 *  - LAYER A (Official Textbook) is EXACT ministry content. Never paraphrased,
 *    never summarized, never AI-rewritten.
 *  - Tamkeen explanation / summary / enrichment / interactive / assessment are
 *    separate layers and must never be stored inside the official layer.
 */

/* ------------------------------------------------------------------ */
/* Content layers                                                      */
/* ------------------------------------------------------------------ */

export const CONTENT_LAYERS = {
  A_OFFICIAL_TEXTBOOK: "A_OFFICIAL_TEXTBOOK",
  B_TAMKEEN_EXPLANATION: "B_TAMKEEN_EXPLANATION",
  C_ENRICHMENT: "C_ENRICHMENT",
  D_INTERACTIVE: "D_INTERACTIVE",
  E_ASSESSMENT: "E_ASSESSMENT",
  F_SUMMARY: "F_SUMMARY",
  G_ORIGINAL_PDF: "G_ORIGINAL_PDF",
} as const;

export type ContentLayer = (typeof CONTENT_LAYERS)[keyof typeof CONTENT_LAYERS];

export const LAYER_LABELS_AR: Record<ContentLayer, string> = {
  A_OFFICIAL_TEXTBOOK: "محتوى الكتاب",
  B_TAMKEEN_EXPLANATION: "شرح تمكين",
  C_ENRICHMENT: "إثراء إضافي",
  D_INTERACTIVE: "محاكاة وتجربة",
  E_ASSESSMENT: "تقويم",
  F_SUMMARY: "المراجعة السريعة",
  G_ORIGINAL_PDF: "نسخة الكتاب الأصلية",
};

/* ------------------------------------------------------------------ */
/* Transition states (PDF role after 20A)                              */
/* ------------------------------------------------------------------ */

export const PRIMARY_CONTENT_TRANSITION_STATES = [
  "PDF_ONLY_TEMPORARY",
  "STRUCTURED_PRIMARY_WITH_PDF_REFERENCE",
  "STRUCTURED_PRIMARY_NO_PDF",
  "MISSING_PRIMARY_CONTENT",
] as const;

export type PrimaryContentTransitionState =
  (typeof PRIMARY_CONTENT_TRANSITION_STATES)[number];

export function resolveTransitionState(input: {
  hasOfficialStructuredContent: boolean;
  officialContentApproved: boolean;
  hasPrimaryPdf: boolean;
}): PrimaryContentTransitionState {
  const structuredUsable =
    input.hasOfficialStructuredContent && input.officialContentApproved;
  if (structuredUsable) {
    return input.hasPrimaryPdf
      ? "STRUCTURED_PRIMARY_WITH_PDF_REFERENCE"
      : "STRUCTURED_PRIMARY_NO_PDF";
  }
  if (input.hasPrimaryPdf) return "PDF_ONLY_TEMPORARY";
  return "MISSING_PRIMARY_CONTENT";
}

/* ------------------------------------------------------------------ */
/* Semantic block types                                                */
/* ------------------------------------------------------------------ */

export const OFFICIAL_BLOCK_TYPES = [
  "HEADING",
  "SUBHEADING",
  "PARAGRAPH",
  "QURAN_VERSE",
  "HADITH",
  "DEFINITION",
  "RULE",
  "LIST",
  "TABLE",
  "IMAGE",
  "DIAGRAM",
  "FORMULA",
  "EXAMPLE",
  "NOTE",
  "WARNING",
  "EXERCISE",
  "FIGURE_CAPTION",
  "SOURCE_PAGE_MARKER",
] as const;

export type OfficialBlockType = (typeof OFFICIAL_BLOCK_TYPES)[number];

/** The semantic HTML element each block type must be expressed with. */
export const BLOCK_TYPE_ELEMENTS: Record<OfficialBlockType, readonly string[]> = {
  HEADING: ["h2"],
  SUBHEADING: ["h3", "h4"],
  PARAGRAPH: ["p"],
  QURAN_VERSE: ["blockquote"],
  HADITH: ["blockquote"],
  DEFINITION: ["p", "dl", "section"],
  RULE: ["p", "section"],
  LIST: ["ul", "ol"],
  TABLE: ["table", "figure"],
  IMAGE: ["figure", "img"],
  DIAGRAM: ["figure"],
  FORMULA: ["p", "div", "math", "span"],
  EXAMPLE: ["section", "div", "p"],
  NOTE: ["aside", "p", "section"],
  WARNING: ["aside", "p", "section"],
  EXERCISE: ["section", "ol", "ul", "div"],
  FIGURE_CAPTION: ["figcaption"],
  SOURCE_PAGE_MARKER: ["span", "div"],
};

/* ------------------------------------------------------------------ */
/* HTML allowlist                                                      */
/* ------------------------------------------------------------------ */

export const ALLOWED_TAGS = new Set<string>([
  "section",
  "article",
  "div",
  "span",
  "h2",
  "h3",
  "h4",
  "p",
  "blockquote",
  "cite",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "figure",
  "figcaption",
  "img",
  "strong",
  "em",
  "sup",
  "sub",
  "br",
  "hr",
  "aside",
  "small",
  "code",
]);

/** Attributes allowed on any element. */
export const ALLOWED_GLOBAL_ATTRS = new Set<string>([
  "data-block-type",
  "data-block-id",
  "data-source-page",
  "data-layer",
  "dir",
  "lang",
  "id",
]);

/** Per-tag extra attributes. */
export const ALLOWED_TAG_ATTRS: Record<string, Set<string>> = {
  img: new Set(["src", "alt", "width", "height", "loading"]),
  td: new Set(["colspan", "rowspan", "scope"]),
  th: new Set(["colspan", "rowspan", "scope"]),
  ol: new Set(["start", "reversed", "type"]),
};

/** Tags that carry no educational meaning and are dropped, keeping children. */
export const STRIPPED_WRAPPER_TAGS = new Set<string>(["font", "b", "i", "u", "center"]);

/** Hard-forbidden anywhere inside the official layer. */
export const FORBIDDEN_TAGS = new Set<string>([
  "script",
  "style",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "base",
  "link",
  "meta",
  "svg",
  "video",
  "audio",
  "a",
]);

/* ------------------------------------------------------------------ */
/* Image policy                                                        */
/* ------------------------------------------------------------------ */

/** Official images live in managed storage; base64/data URIs are rejected. */
export const ALLOWED_IMAGE_SRC_PREFIXES = [
  "supabase-storage://",
  "lesson-internal://",
] as const;

export function isAllowedOfficialImageSrc(src: string | null | undefined): boolean {
  const value = (src ?? "").trim();
  if (!value) return false;
  if (/^data:/i.test(value)) return false;
  return ALLOWED_IMAGE_SRC_PREFIXES.some((p) => value.startsWith(p));
}

/* ------------------------------------------------------------------ */
/* Root wrapper contract                                               */
/* ------------------------------------------------------------------ */

/**
 * Official structured content is stored in the existing text column
 * (`lesson_book_contents.content`) as a single root element:
 *
 *   <section data-layer="A_OFFICIAL_TEXTBOOK"
 *            data-official-standard="20A"
 *            data-source-book="..." data-source-edition="..."
 *            data-source-page-from="12" data-source-page-to="15"
 *            data-source-file-hash="..." data-extracted-at="..."> ... </section>
 *
 * No new table and no new column are required to carry the standard.
 */
export const OFFICIAL_ROOT_TAG = "section";
export const OFFICIAL_STANDARD_VERSION = "20A";

export const OFFICIAL_ROOT_ATTRS = new Set<string>([
  "data-layer",
  "data-official-standard",
  "data-source-book",
  "data-source-edition",
  "data-source-page-from",
  "data-source-page-to",
  "data-source-file-hash",
  "data-official-content-hash",
  "data-extracted-at",
  "data-reviewed-by",
  "data-reviewed-at",
  "dir",
  "lang",
]);

/** Cheap detector: is this stored content official structured HTML at all? */
export function isOfficialStructuredContent(raw: string | null | undefined): boolean {
  const value = (raw ?? "").trim();
  if (!value.startsWith("<")) return false;
  return /data-layer\s*=\s*["']A_OFFICIAL_TEXTBOOK["']/.test(value);
}
