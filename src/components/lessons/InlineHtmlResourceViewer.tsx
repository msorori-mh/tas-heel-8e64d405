import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, FileText, FlaskConical, Map as MapIcon, ShieldCheck } from "lucide-react";
import {
  buildInlineHtmlDocument,
  inlineHtmlRenderMode,
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
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const interactive = resourceType === "experiment" || resourceType === "mindmap";
  const mode = interactive ? "SANDBOXED_NO_NETWORK" : inlineHtmlRenderMode(htmlResourceType);
  const [contentHeight, setContentHeight] = useState(
    resourceType === "experiment" ? 900 : resourceType === "mindmap" ? 560 : 720,
  );
  const body = (html ?? "").trim();
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
          {mode === "STATIC_NO_SCRIPT" ? "عرض آمن بدون سكربت" : "بيئة معزولة بدون إنترنت"}
        </span>
      </div>

      {!body ? (
        <p className="mt-2 text-xs text-destructive">المحتوى غير متاح حالياً.</p>
      ) : (
        <>
          <iframe
            ref={iframeRef}
            title={title}
            srcDoc={srcDoc}
            sandbox={inlineHtmlSandbox(mode)}
            referrerPolicy="no-referrer"
            loading="lazy"
            style={{ height: expanded ? "90vh" : `${contentHeight}px` }}
            className="mt-2 w-full rounded-lg border border-border bg-white transition-[height]"
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
