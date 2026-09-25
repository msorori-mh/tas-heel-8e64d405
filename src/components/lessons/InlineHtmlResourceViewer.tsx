import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, FileText, FlaskConical, Map as MapIcon, ShieldCheck, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import {
  buildInlineHtmlDocument,
  inlineHtmlRenderModeForBody,
  inlineHtmlSandbox,
} from "@/lib/lessons/inline-html-resource";

interface Props {
  title: string;
  /** The HTML body stored in `lesson_resources.description` (same payload the snapshot hashes). */
  html: string | null;
  /** `lesson_resources.html_resource_type` — current mind maps and experiments are INTERACTIVE. */
  htmlResourceType: string | null;
  resourceType: string;
}

/**
 * CF10-R4b safe renderer for inline lesson HTML (`lesson-internal://html/<code>`).
 * Fail-closed: an empty body renders an explicit unavailable state, never a blank frame.
 */
export function InlineHtmlResourceViewer({ title, html, htmlResourceType, resourceType }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const interactive = resourceType === "experiment" || resourceType === "mindmap";
  const body = (html ?? "").trim();
  const mode = interactive
    ? inlineHtmlRenderModeForBody("INTERACTIVE", body)
    : inlineHtmlRenderModeForBody(htmlResourceType, body);
  const [contentHeight, setContentHeight] = useState(
    resourceType === "experiment" ? 900 : resourceType === "mindmap" ? 560 : 720,
  );
  const srcDoc = useMemo(() => (body ? buildInlineHtmlDocument(body, mode) : ""), [body, mode]);

  useEffect(() => {
    if (!interactive) return;
    const receiveHeight = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type !== "tamkeen:inline-height") return;
      const next = Number(event.data.height);
      if (!Number.isFinite(next)) return;
      setContentHeight(Math.max(320, Math.min(1600, Math.ceil(next + 16))));
    };
    window.addEventListener("message", receiveHeight);
    return () => window.removeEventListener("message", receiveHeight);
  }, [interactive]);

  const applyZoom = (next: number) => {
    const value = Math.max(1, Math.min(3, Math.round(next * 10) / 10));
    setZoom(value);
    iframeRef.current?.contentWindow?.postMessage(
      { type: "tamkeen:inline-zoom", scale: value },
      "*",
    );
  };

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {resourceType === "experiment" ? (
            <FlaskConical className="h-4 w-4 text-primary" />
          ) : resourceType === "official" ? (
            <BookOpen className="h-4 w-4 text-primary" />
          ) : resourceType === "summary" || resourceType === "explanation" ? (
            <FileText className="h-4 w-4 text-primary" />
          ) : (
            <MapIcon className="h-4 w-4 text-primary" />
          )}
          <span className="truncate text-sm font-semibold text-foreground">{title}</span>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3 w-3" />
          {mode === "STATIC_NO_SCRIPT"
            ? "عرض آمن بدون سكربت"
            : mode === "SANDBOXED_PHET"
              ? "تجربة PhET — تتطلب الإنترنت"
              : "بيئة معزولة بدون إنترنت"}
        </span>
      </div>

      {!body ? (
        <p className="mt-2 text-xs text-destructive">المحتوى غير متاح حالياً.</p>
      ) : (
        <>
          {interactive && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/30 p-2">
              <button
                type="button"
                onClick={() => applyZoom(zoom + 0.2)}
                className="inline-flex min-h-10 items-center gap-1 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground"
                aria-label="تكبير المحتوى"
              >
                <ZoomIn className="h-4 w-4" />
                تكبير
              </button>
              <button
                type="button"
                onClick={() => applyZoom(zoom - 0.2)}
                disabled={zoom <= 1}
                className="inline-flex min-h-10 items-center gap-1 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground disabled:opacity-50"
                aria-label="تصغير المحتوى"
              >
                <ZoomOut className="h-4 w-4" />
                تصغير
              </button>
              <button
                type="button"
                onClick={() => applyZoom(1)}
                className="inline-flex min-h-10 items-center gap-1 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground"
                aria-label="إعادة حجم العرض"
              >
                <RotateCcw className="h-4 w-4" />
                {Math.round(zoom * 100)}%
              </button>
              <span className="text-[11px] text-muted-foreground">
                ويمكنك التكبير بإصبعين داخل المحتوى.
              </span>
            </div>
          )}
          <div className="max-w-full overflow-x-auto">
          <iframe
            ref={iframeRef}
            title={title}
            srcDoc={srcDoc}
            sandbox={inlineHtmlSandbox(mode)}
            referrerPolicy="no-referrer"
            loading="lazy"
            style={{ height: expanded ? "90vh" : `${contentHeight}px` }}
            className="mt-2 block w-full max-w-full touch-auto rounded-lg border border-border bg-white transition-[height]"
          />
          </div>
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
