import { createElement, Fragment, type ReactNode } from "react";
import { BookOpen, ImageOff, ShieldAlert } from "lucide-react";
import {
  parseOfficialContent,
  type OfficialNode,
} from "@/lib/content/official-textbook/parser";
import {
  isOfficialStructuredContent,
  LAYER_LABELS_AR,
} from "@/lib/content/official-textbook/standard";
import { cn } from "@/lib/utils";
import { InlineHtmlResourceViewer } from "@/components/lessons/InlineHtmlResourceViewer";

/**
 * TAMKEEN_OFFICIAL_TEXTBOOK_STRUCTURED_CONTENT_STANDARD_20A
 *
 * Renders Layer A (official ministry textbook) from validated structured HTML.
 * The tree is rebuilt as React elements from an allowlisted parser — the
 * component never uses dangerouslySetInnerHTML.
 */

const TAG_CLASSES: Record<string, string> = {
  h2: "mt-5 mb-2 text-base font-bold text-foreground first:mt-0",
  h3: "mt-4 mb-2 text-sm font-bold text-foreground",
  h4: "mt-3 mb-1.5 text-sm font-semibold text-foreground",
  p: "mb-3 text-sm leading-loose text-card-foreground",
  ul: "mb-3 list-disc space-y-1 pr-5 text-sm leading-loose text-card-foreground",
  ol: "mb-3 list-decimal space-y-1 pr-5 text-sm leading-loose text-card-foreground",
  blockquote:
    "mb-3 rounded-xl border-r-4 border-primary/60 bg-primary/5 px-3 py-2 text-sm leading-loose text-card-foreground",
  table: "mb-3 w-full border-collapse overflow-hidden rounded-lg text-xs",
  th: "border border-border bg-muted/50 px-2 py-1.5 text-right font-semibold",
  td: "border border-border px-2 py-1.5 text-right align-top",
  caption: "mb-1 text-xs text-muted-foreground",
  figure: "mb-3 rounded-xl border border-border bg-background p-2",
  figcaption: "mt-1 text-center text-xs text-muted-foreground",
  aside: "mb-3 rounded-lg bg-accent/10 px-3 py-2 text-xs leading-relaxed text-card-foreground",
  dl: "mb-3 text-sm leading-loose",
  dt: "font-semibold text-foreground",
  dd: "mb-2 pr-4 text-card-foreground",
  hr: "my-4 border-border",
  small: "text-xs text-muted-foreground",
  code: "rounded bg-muted px-1 py-0.5 text-xs",
};

const BLOCK_TYPE_CLASSES: Record<string, string> = {
  QURAN_VERSE:
    "rounded-xl border border-primary/30 bg-primary/5 px-3 py-3 text-center text-base leading-[2.4] font-medium text-foreground",
  HADITH:
    "rounded-xl border border-accent/30 bg-accent/5 px-3 py-3 text-sm leading-[2.2] text-foreground",
  DEFINITION: "rounded-lg border-r-2 border-primary/50 bg-muted/40 px-3 py-2",
  RULE: "rounded-lg border-r-2 border-accent/60 bg-accent/5 px-3 py-2 font-medium",
  WARNING: "rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive",
  NOTE: "rounded-lg bg-muted/50 px-3 py-2",
  EXAMPLE: "rounded-lg border border-border bg-background px-3 py-2",
  EXERCISE: "rounded-lg border border-dashed border-border px-3 py-2",
  FORMULA: "my-2 text-center font-mono text-sm",
};

function renderNode(node: OfficialNode, key: string): ReactNode {
  if (node.kind === "text") return node.text;

  const { tag, attrs, children } = node;
  const blockType = attrs["data-block-type"];
  const className = cn(TAG_CLASSES[tag], blockType ? BLOCK_TYPE_CLASSES[blockType] : undefined);

  if (tag === "br") return <br key={key} />;
  if (tag === "hr") return <hr key={key} className={className} />;

  if (tag === "img") {
    // Official images live in managed storage; until a resolver is wired the
    // alt text is shown so no external/base64 request can ever be issued.
    return (
      <span
        key={key}
        className="my-2 flex items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground"
      >
        <ImageOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {attrs["alt"] || "صورة من الكتاب الرسمي"}
      </span>
    );
  }

  const kids = children.map((child, i) => renderNode(child, `${key}.${i}`));

  return createElement(
    tag,
    {
      key,
      className: className || undefined,
      dir: attrs["dir"],
      lang: attrs["lang"],
      colSpan: attrs["colspan"] ? Number(attrs["colspan"]) : undefined,
      rowSpan: attrs["rowspan"] ? Number(attrs["rowspan"]) : undefined,
      scope: attrs["scope"],
    },
    kids,
  );
}

interface Props {
  /** Raw stored content from lesson_book_contents.content */
  content: string;
  /** Show the "محتوى الكتاب" layer header. */
  showLayerHeader?: boolean;
  className?: string;
}

export function OfficialTextbookContent({ content, showLayerHeader = true, className }: Props) {
  const raw = (content ?? "").trim();

  // Legacy plain-text lessons keep working untouched.
  if (!isOfficialStructuredContent(raw)) {
    return (
      <div className={cn("whitespace-pre-wrap text-sm leading-relaxed text-card-foreground", className)}>
        {raw}
      </div>
    );
  }

  const parsed = parseOfficialContent(raw);

  // Full official documents are authored as self-contained, RTL HTML with
  // embedded textbook styling. Render them verbatim in the static, network-free
  // iframe after the official marker check. Scripts remain disabled and the
  // CSP prevents every external request.
  if (/<html[\s>]|<!doctype/i.test(raw)) {
    return (
      <InlineHtmlResourceViewer
        title="محتوى الكتاب الرسمي"
        html={raw}
        htmlResourceType="STATIC"
        resourceType="official"
      />
    );
  }

  if (!parsed.ok || !parsed.root) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          محتوى الكتاب الرسمي لهذا الدرس لم يجتز التحقق ولن يُعرض. تم إبلاغ فريق المحتوى.
        </span>
      </div>
    );
  }

  const { provenance } = parsed;
  const pages =
    provenance.sourcePageFrom && provenance.sourcePageTo
      ? `ص ${provenance.sourcePageFrom}–${provenance.sourcePageTo}`
      : provenance.sourcePageFrom
        ? `ص ${provenance.sourcePageFrom}`
        : null;

  return (
    <section className={cn("text-right", className)} dir="rtl">
      {showLayerHeader && (
        <header className="mb-3 flex flex-wrap items-center gap-2 border-b border-border pb-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
            <BookOpen className="h-3.5 w-3.5" aria-hidden />
            {LAYER_LABELS_AR.A_OFFICIAL_TEXTBOOK}
          </span>
          <span className="text-[11px] text-muted-foreground">
            نص الكتاب الوزاري الرسمي كما هو
          </span>
          {pages && <span className="text-[11px] text-muted-foreground">• {pages}</span>}
        </header>
      )}

      <div className="official-textbook-body">
        {parsed.root.children.map((child, i) => (
          <Fragment key={i}>{renderNode(child, String(i))}</Fragment>
        ))}
      </div>

      {provenance.sourceBook && (
        <footer className="mt-4 border-t border-border pt-2 text-[11px] text-muted-foreground">
          المصدر: {provenance.sourceBook}
          {provenance.sourceEdition ? ` — ${provenance.sourceEdition}` : ""}
          {pages ? ` — ${pages}` : ""}
        </footer>
      )}
    </section>
  );
}

export default OfficialTextbookContent;
