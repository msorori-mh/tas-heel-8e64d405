import { useMemo, useState } from "react";
import { FlaskConical, Map as MapIcon, ShieldCheck } from "lucide-react";
import {
  buildInlineHtmlDocument,
  inlineHtmlRenderMode,
  inlineHtmlSandbox,
} from "@/lib/lessons/inline-html-resource";

interface Props {
  title: string;
  /** The HTML body stored in `lesson_resources.description` (same payload the snapshot hashes). */
  html: string | null;
  /** `lesson_resources.html_resource_type` — STATIC (mind map) or INTERACTIVE (experiment). */
  htmlResourceType: string | null;
  resourceType: string;
}

/**
 * CF10-R4b safe renderer for inline lesson HTML (`lesson-internal://html/<code>`).
 * Fail-closed: an empty body renders an explicit unavailable state, never a blank frame.
 */
export function InlineHtmlResourceViewer({ title, html, htmlResourceType, resourceType }: Props) {
  const [expanded, setExpanded] = useState(false);
  const mode = inlineHtmlRenderMode(htmlResourceType);
  const body = (html ?? "").trim();
  const srcDoc = useMemo(() => (body ? buildInlineHtmlDocument(body, mode) : ""), [body, mode]);

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {resourceType === "experiment" ? (
            <FlaskConical className="h-4 w-4 text-primary" />
          ) : (
            <MapIcon className="h-4 w-4 text-primary" />
          )}
          <span className="truncate text-sm font-semibold text-foreground">{title}</span>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3 w-3" />
          {mode === "STATIC_NO_SCRIPT" ? "عرض آمن بدون سكربت" : "بيئة معزولة بدون إنترنت"}
        </span>
      </div>

      {!body ? (
        <p className="mt-2 text-xs text-destructive">المحتوى غير متاح حالياً.</p>
      ) : (
        <>
          <iframe
            title={title}
            srcDoc={srcDoc}
            sandbox={inlineHtmlSandbox(mode)}
            referrerPolicy="no-referrer"
            loading="lazy"
            className={`mt-2 w-full rounded-lg border border-border bg-white ${
              expanded ? "h-[70vh]" : "h-64"
            }`}
          />
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 text-xs font-medium text-primary hover:underline"
          >
            {expanded ? "تصغير" : "توسيع"}
          </button>
        </>
      )}
    </div>
  );
}
