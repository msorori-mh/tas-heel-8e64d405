import { useState } from "react";
import { ImageOff, RefreshCw, ZoomIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useMinisterialMediaUrl } from "@/hooks/use-ministerial-media-url";
import { cn } from "@/lib/utils";

type Props = {
  mediaId: string;
  /** Session that pins this media; omit for staff preview. */
  sessionId?: string | null;
  alt: string;
  caption?: string | null;
  /**
   * `block`  = full-width question figure with zoom.
   * `inline` = small thumbnail with zoom (staff lists).
   * `option` = image rendered INSIDE an answer button: no nested interactive
   *            elements and only phrasing content (`span`), so the markup stays valid.
   */
  variant?: "block" | "inline" | "option";
  className?: string;
};

/**
 * RTL-friendly, responsive image for ministerial questions. Bytes come through
 * the authenticated media route; the component never receives a storage URL.
 */
export function MinisterialMediaImage({
  mediaId,
  sessionId = null,
  alt,
  caption = null,
  variant = "block",
  className,
}: Props) {
  const [retry, setRetry] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const state = useMinisterialMediaUrl(mediaId, sessionId, retry);
  const isInline = variant === "inline";
  const isOption = variant === "option";

  if (state.status === "loading") {
    return (
      <Skeleton
        aria-label="جارٍ تحميل الصورة"
        className={cn(
          isInline
            ? "h-20 w-28 rounded-md"
            : isOption
              ? "h-32 w-full max-w-xs rounded-lg"
              : "h-44 w-full rounded-xl",
          className,
        )}
      />
    );
  }

  if (state.status === "error") {
    if (isOption) {
      // Inside a <button>: no nested controls; the parent answer button still works.
      return (
        <span
          role="img"
          aria-label={alt}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground",
            className,
          )}
        >
          <ImageOff className="h-4 w-4 shrink-0" aria-hidden />
          {state.error}
        </span>
      );
    }
    return (
      <div
        role="img"
        aria-label={alt}
        className={cn(
          "flex items-center justify-between gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground",
          isInline ? "max-w-xs" : "w-full",
          className,
        )}
      >
        <span className="flex items-center gap-1.5">
          <ImageOff className="h-4 w-4 shrink-0" aria-hidden />
          {state.error}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          onClick={() => setRetry((value) => value + 1)}
        >
          <RefreshCw className="ms-1 h-3.5 w-3.5" aria-hidden />
          إعادة
        </Button>
      </div>
    );
  }

  if (isOption) {
    return (
      <span className={cn("block w-full max-w-xs", className)} dir="rtl">
        <span className="block overflow-hidden rounded-lg border border-border bg-card">
          <img
            src={state.url}
            alt={alt}
            loading="lazy"
            decoding="async"
            draggable={false}
            className="block h-auto max-h-48 w-full object-contain"
          />
        </span>
        {caption && <span className="mt-1 block text-xs text-muted-foreground">{caption}</span>}
      </span>
    );
  }

  return (
    <>
      <figure className={cn("m-0", isInline ? "inline-block" : "w-full", className)} dir="rtl">
        <button
          type="button"
          onClick={() => setZoomed(true)}
          className={cn(
            "group relative block overflow-hidden rounded-xl border border-border bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isInline ? "max-h-28 max-w-[10rem]" : "w-full",
          )}
          aria-label={`تكبير: ${alt}`}
        >
          <img
            src={state.url}
            alt={alt}
            loading="lazy"
            decoding="async"
            draggable={false}
            className={cn(
              "block h-auto w-full object-contain",
              isInline ? "max-h-28" : "max-h-[60vh] sm:max-h-[420px]",
            )}
          />
          <span className="pointer-events-none absolute bottom-1.5 start-1.5 rounded-md bg-background/80 p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <ZoomIn className="h-3.5 w-3.5" aria-hidden />
          </span>
        </button>
        {caption && !isInline && (
          <figcaption className="mt-1 text-xs text-muted-foreground">{caption}</figcaption>
        )}
      </figure>
      <Dialog open={zoomed} onOpenChange={setZoomed}>
        <DialogContent className="max-w-[96vw] p-2 sm:max-w-3xl" dir="rtl">
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          <img
            src={state.url}
            alt={alt}
            className="mx-auto block max-h-[85vh] w-auto max-w-full object-contain"
          />
          {caption && <p className="mt-1 text-center text-xs text-muted-foreground">{caption}</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}
