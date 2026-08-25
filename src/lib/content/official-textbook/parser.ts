/**
 * TAMKEEN_OFFICIAL_TEXTBOOK_STRUCTURED_CONTENT_STANDARD_20A
 *
 * Structural parser + validator for Layer A (Official Textbook) HTML.
 * Produces a safe node tree that the student renderer walks directly, so no
 * component ever needs `dangerouslySetInnerHTML`.
 */

import * as htmlparser2 from "htmlparser2";
import {
  ALLOWED_GLOBAL_ATTRS,
  ALLOWED_TAG_ATTRS,
  ALLOWED_TAGS,
  FORBIDDEN_TAGS,
  OFFICIAL_BLOCK_TYPES,
  OFFICIAL_ROOT_ATTRS,
  OFFICIAL_STANDARD_VERSION,
  STRIPPED_WRAPPER_TAGS,
  isAllowedOfficialImageSrc,
  type OfficialBlockType,
} from "./standard.ts";

export type OfficialNode =
  | { kind: "text"; text: string }
  | {
      kind: "element";
      tag: string;
      attrs: Record<string, string>;
      children: OfficialNode[];
    };

export interface OfficialBlock {
  blockId: string | null;
  blockType: OfficialBlockType | null;
  sourcePage: string | null;
  tag: string;
  /** Plain text of the block, whitespace-normalized. */
  text: string;
  node: Extract<OfficialNode, { kind: "element" }>;
}

export interface OfficialProvenance {
  sourceBook: string | null;
  sourceEdition: string | null;
  sourcePageFrom: string | null;
  sourcePageTo: string | null;
  sourceFileHash: string | null;
  officialContentHash: string | null;
  extractedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  standardVersion: string | null;
}

export interface OfficialIssue {
  code: string;
  message: string;
  tag?: string;
  blockId?: string | null;
}

export interface OfficialParseResult {
  ok: boolean;
  root: Extract<OfficialNode, { kind: "element" }> | null;
  blocks: OfficialBlock[];
  provenance: OfficialProvenance;
  errors: OfficialIssue[];
  warnings: OfficialIssue[];
}

const VOID_TAGS = new Set(["img", "br", "hr"]);
const BLOCK_TYPES = new Set<string>(OFFICIAL_BLOCK_TYPES);

/** Generic HTML void tags — used only for source-position slicing below. */
const GENERIC_VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "source", "track", "wbr",
]);

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * 21H: locate the inner element carrying data-layer="A_OFFICIAL_TEXTBOOK" inside
 * a (possibly full) HTML document and return its exact source slice. Only that
 * subtree is ever validated or rendered. Returns null when no marked section
 * exists, so the caller keeps rejecting the input fail-closed.
 */
export function extractOfficialSectionHtml(html: string): string | null {
  const src = html ?? "";
  if (!src) return null;
  let start = -1;
  let end = -1;
  let depth = 0;
  const parser = new htmlparser2.Parser(
    {
      onopentag(name, attrs) {
        const tag = name.toLowerCase();
        if (start === -1) {
          if ((attrs["data-layer"] ?? "") === "A_OFFICIAL_TEXTBOOK") {
            start = parser.startIndex;
            depth = 1;
          }
          return;
        }
        if (end !== -1) return;
        if (!GENERIC_VOID_TAGS.has(tag)) depth += 1;
      },
      onclosetag(name) {
        const tag = name.toLowerCase();
        if (start === -1 || end !== -1) return;
        if (GENERIC_VOID_TAGS.has(tag)) return;
        depth -= 1;
        if (depth === 0) end = parser.endIndex + 1;
      },
    },
    { decodeEntities: false, lowerCaseTags: true, lowerCaseAttributeNames: true },
  );
  parser.write(src);
  parser.end();
  if (start === -1 || end <= start) return null;
  return src.slice(start, end);
}

export function nodeText(node: OfficialNode): string {
  if (node.kind === "text") return node.text;
  if (node.tag === "br") return " ";
  return node.children.map(nodeText).join("");
}

/**
 * Parse and validate official structured HTML.
 * Fail-closed: any forbidden tag, disallowed attribute, inline event handler,
 * data: image, or external link produces an error and `ok === false`.
 *
 * 21H: when the stored value is a full HTML document, only the inner marked
 * official section is extracted and validated — document chrome (<head>,
 * <style>, <title>, layout wrappers) never reaches the validator or renderer.
 * Content without the official markers keeps failing closed as before.
 */
export function parseOfficialContent(html: string): OfficialParseResult {
  const source = html ?? "";
  const extracted = extractOfficialSectionHtml(source);
  const input = extracted !== null && extracted.trim() !== source.trim() ? extracted : source;
  const errors: OfficialIssue[] = [];
  const warnings: OfficialIssue[] = [];
  const rootChildren: OfficialNode[] = [];
  const stack: Extract<OfficialNode, { kind: "element" }>[] = [];
  /** Depth of dropped subtrees (forbidden elements) currently open. */
  let dropDepth = 0;

  const push = (node: OfficialNode) => {
    if (stack.length === 0) rootChildren.push(node);
    else stack[stack.length - 1].children.push(node);
  };

  const parser = new htmlparser2.Parser(
    {
      onopentag(name, rawAttrs) {
        const tag = name.toLowerCase();

        if (dropDepth > 0) {
          if (!VOID_TAGS.has(tag)) dropDepth += 1;
          return;
        }

        if (FORBIDDEN_TAGS.has(tag)) {
          errors.push({
            code: "OFFICIAL_FORBIDDEN_TAG",
            message: `العنصر <${tag}> غير مسموح داخل محتوى الكتاب الرسمي.`,
            tag,
          });
          if (!VOID_TAGS.has(tag)) dropDepth += 1;
          return;
        }

        const isRoot = stack.length === 0;
        const attrs: Record<string, string> = {};

        for (const [rawKey, rawValue] of Object.entries(rawAttrs)) {
          const key = rawKey.toLowerCase();
          const value = String(rawValue ?? "");

          if (key.startsWith("on")) {
            errors.push({
              code: "OFFICIAL_INLINE_EVENT_HANDLER",
              message: `معالج أحداث مضمّن (${key}) مرفوض داخل المحتوى الرسمي.`,
              tag,
            });
            continue;
          }
          if (key === "style") {
            warnings.push({
              code: "OFFICIAL_INLINE_STYLE_DROPPED",
              message: "تم تجاهل تنسيق مضمّن (style) — التنسيق يأتي من التطبيق.",
              tag,
            });
            continue;
          }

          const allowed =
            ALLOWED_GLOBAL_ATTRS.has(key) ||
            ALLOWED_TAG_ATTRS[tag]?.has(key) === true ||
            (isRoot && OFFICIAL_ROOT_ATTRS.has(key));

          if (!allowed) {
            warnings.push({
              code: "OFFICIAL_ATTRIBUTE_DROPPED",
              message: `تم تجاهل السمة غير المسموحة "${key}" على <${tag}>.`,
              tag,
            });
            continue;
          }
          attrs[key] = value;
        }

        if (tag === "img" && !isAllowedOfficialImageSrc(attrs["src"])) {
          errors.push({
            code: "OFFICIAL_IMAGE_SRC_INVALID",
            message:
              "مصدر الصورة غير مسموح — الصور الرسمية تُخزَّن في التخزين المُدار (لا base64 ولا روابط خارجية).",
            tag,
          });
        }
        if (tag === "img" && !normalize(attrs["alt"] ?? "")) {
          warnings.push({
            code: "OFFICIAL_IMAGE_ALT_MISSING",
            message: "صورة تعليمية بدون نص بديل (alt).",
            tag,
          });
        }

        const declaredType = attrs["data-block-type"];
        if (declaredType && !BLOCK_TYPES.has(declaredType)) {
          errors.push({
            code: "OFFICIAL_UNKNOWN_BLOCK_TYPE",
            message: `نوع كتلة غير معروف: ${declaredType}`,
            tag,
          });
        }

        if (STRIPPED_WRAPPER_TAGS.has(tag)) {
          warnings.push({
            code: "OFFICIAL_PRESENTATIONAL_TAG",
            message: `تم تجاهل عنصر تنسيقي بلا معنى تعليمي: <${tag}>.`,
            tag,
          });
        }

        if (!ALLOWED_TAGS.has(tag) && !STRIPPED_WRAPPER_TAGS.has(tag)) {
          errors.push({
            code: "OFFICIAL_TAG_NOT_ALLOWED",
            message: `العنصر <${tag}> خارج قائمة العناصر المسموحة للمعيار 20A.`,
            tag,
          });
          if (!VOID_TAGS.has(tag)) dropDepth += 1;
          return;
        }

        const element: Extract<OfficialNode, { kind: "element" }> = {
          kind: "element",
          tag,
          attrs,
          children: [],
        };
        push(element);
        if (!VOID_TAGS.has(tag)) stack.push(element);
      },

      ontext(text) {
        if (dropDepth > 0) return;
        if (!text) return;
        push({ kind: "text", text });
      },

      onclosetag(name) {
        const tag = name.toLowerCase();
        if (dropDepth > 0) {
          if (!VOID_TAGS.has(tag)) dropDepth -= 1;
          return;
        }
        if (VOID_TAGS.has(tag)) return;
        stack.pop();
      },

      oncomment() {
        /* comments are dropped silently */
      },
    },
    { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true },
  );

  parser.write(html ?? "");
  parser.end();

  const elements = rootChildren.filter(
    (n): n is Extract<OfficialNode, { kind: "element" }> => n.kind === "element",
  );

  let root: Extract<OfficialNode, { kind: "element" }> | null = null;
  if (elements.length === 1 && elements[0].tag === "section") {
    root = elements[0];
  } else if (elements.length > 0) {
    root = { kind: "element", tag: "section", attrs: {}, children: rootChildren };
    warnings.push({
      code: "OFFICIAL_ROOT_WRAPPER_SYNTHESIZED",
      message: "لا يوجد عنصر جذر واحد <section data-layer=\"A_OFFICIAL_TEXTBOOK\"> — تم تغليف المحتوى.",
    });
  } else {
    errors.push({
      code: "OFFICIAL_CONTENT_EMPTY",
      message: "لا يوجد محتوى رسمي قابل للعرض.",
    });
  }

  const rootAttrs = root?.attrs ?? {};
  if (root && rootAttrs["data-layer"] !== "A_OFFICIAL_TEXTBOOK") {
    errors.push({
      code: "OFFICIAL_LAYER_MARKER_MISSING",
      message: 'الجذر يجب أن يحمل data-layer="A_OFFICIAL_TEXTBOOK".',
    });
  }

  const provenance: OfficialProvenance = {
    sourceBook: rootAttrs["data-source-book"] ?? null,
    sourceEdition: rootAttrs["data-source-edition"] ?? null,
    sourcePageFrom: rootAttrs["data-source-page-from"] ?? null,
    sourcePageTo: rootAttrs["data-source-page-to"] ?? null,
    sourceFileHash: rootAttrs["data-source-file-hash"] ?? null,
    officialContentHash: rootAttrs["data-official-content-hash"] ?? null,
    extractedAt: rootAttrs["data-extracted-at"] ?? null,
    reviewedBy: rootAttrs["data-reviewed-by"] ?? null,
    reviewedAt: rootAttrs["data-reviewed-at"] ?? null,
    standardVersion: rootAttrs["data-official-standard"] ?? null,
  };

  if (root && provenance.standardVersion !== OFFICIAL_STANDARD_VERSION) {
    warnings.push({
      code: "OFFICIAL_STANDARD_VERSION_MISSING",
      message: `يفضّل تحديد data-official-standard="${OFFICIAL_STANDARD_VERSION}".`,
    });
  }
  if (!provenance.sourceBook || !provenance.sourcePageFrom) {
    warnings.push({
      code: "OFFICIAL_PROVENANCE_INCOMPLETE",
      message: "بيانات المصدر (الكتاب/الصفحات) غير مكتملة.",
    });
  }

  const blocks: OfficialBlock[] = [];
  const seenIds = new Set<string>();
  for (const child of root?.children ?? []) {
    if (child.kind !== "element") continue;
    const blockId = child.attrs["data-block-id"] ?? null;
    if (blockId) {
      if (seenIds.has(blockId)) {
        errors.push({
          code: "OFFICIAL_DUPLICATE_BLOCK_ID",
          message: `معرّف كتلة مكرر: ${blockId}`,
          blockId,
        });
      }
      seenIds.add(blockId);
    }
    blocks.push({
      blockId,
      blockType: (child.attrs["data-block-type"] as OfficialBlockType) ?? null,
      sourcePage: child.attrs["data-source-page"] ?? null,
      tag: child.tag,
      text: normalize(nodeText(child)),
      node: child,
    });
  }

  return {
    ok: errors.length === 0,
    root,
    blocks,
    provenance,
    errors,
    warnings,
  };
}

/** Plain reading text of the whole official layer, block by block. */
export function officialPlainText(result: OfficialParseResult): string {
  return result.blocks
    .map((b) => normalize(b.text))
    .filter(Boolean)
    .join("\n");
}
