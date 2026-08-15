import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CheckCircle2, X, ArrowLeftRight, Clock } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { chunkSummary, estimateReadMinutes, reviewPercent } from "@/lib/review/review-format";

/**
 * Generic, data-agnostic flashcard reader (extracted from Mufadala
 * QuickReview.tsx:237-534 Focus Mode). Knows nothing about the database:
 * it renders whatever `items` it is given, so 15B (My Mistakes) can reuse it.
 *
 * RTL semantics: swipe-left = next, ChevronRight = back/previous.
 */

export type FocusReaderItem = {
  id: string;
  title: string;
  body: string;
  subtitle?: string | null;
  points?: string[];
  tip?: string | null;
  isCompleted?: boolean;
};

const HINT_KEY = "tamkeen.focusReader.swipeHintShown";
const FOLLOW_LIMIT = 120;
const COMMIT_THRESHOLD = 50;

export function FocusReader({
  items,
  startIndex = 0,
  open,
  onClose,
  onOpenItem,
  openItemLabel = "افتح الدرس الكامل",
}: {
  items: FocusReaderItem[];
  startIndex?: number;
  open: boolean;
  onClose: () => void;
  onOpenItem?: (item: FocusReaderItem) => void;
  openItemLabel?: string;
}) {
  const [index, setIndex] = useState(startIndex);
  const [dx, setDx] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const startRef = useRef<{ x: number; y: number; axis: "none" | "x" | "y" } | null>(null);
  const historyPushedRef = useRef(false);

  useEffect(() => {
    if (open) setIndex(Math.min(Math.max(startIndex, 0), Math.max(items.length - 1, 0)));
  }, [open, startIndex, items.length]);

  const total = items.length;
  const item = items[index];

  const goNext = useCallback(() => {
    setIndex((i) => Math.min(i + 1, total - 1));
  }, [total]);
  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  // Android hardware back closes the overlay instead of leaving the page.
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    window.history.pushState({ focusReader: true }, "");
    historyPushedRef.current = true;
    const onPop = () => {
      historyPushedRef.current = false;
      onClose();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Pop our sentinel so closing programmatically leaves no stale entry.
      if (historyPushedRef.current) {
        historyPushedRef.current = false;
        window.history.back();
      }
    };
  }, [open, onClose]);

  // Keyboard navigation (RTL-correct).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") goPrev();
      else if (e.key === "ArrowLeft") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, goNext, goPrev]);

  // Body scroll lock, restoring the previous value.
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // First-run swipe hint.
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    try {
      if (window.sessionStorage.getItem(HINT_KEY)) return;
      window.sessionStorage.setItem(HINT_KEY, "1");
    } catch {
      /* private mode — show the hint anyway */
    }
    setShowHint(true);
    const t = window.setTimeout(() => setShowHint(false), 2200);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open || !item) return null;

  const chunks = chunkSummary(item.body);
  const minutes = estimateReadMinutes(item.body);
  const percent = reviewPercent(index + 1, total);

  return (
    <div
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label="وضع التركيز"
      className="fixed inset-0 z-[60] flex flex-col bg-background"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق وضع التركيز"
          className="flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-center text-xs tabular-nums text-muted-foreground">
            {index + 1} من {total}
          </p>
          <Progress value={percent} className="mt-1.5 h-1.5" />
        </div>
        <span className="inline-flex h-11 items-center gap-1 rounded-xl px-2 text-[11px] tabular-nums text-muted-foreground">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          {minutes} د
        </span>
      </div>

      <div
        className="flex-1 overflow-y-auto px-4 py-5"
        onTouchStart={(e) => {
          const t = e.touches[0];
          startRef.current = { x: t.clientX, y: t.clientY, axis: "none" };
        }}
        onTouchMove={(e) => {
          const s = startRef.current;
          if (!s) return;
          const t = e.touches[0];
          const deltaX = t.clientX - s.x;
          const deltaY = t.clientY - s.y;
          if (s.axis === "none") {
            s.axis = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
          }
          if (s.axis !== "x") return;
          setDx(Math.max(-FOLLOW_LIMIT, Math.min(FOLLOW_LIMIT, deltaX)));
        }}
        onTouchEnd={() => {
          const s = startRef.current;
          const delta = dx;
          startRef.current = null;
          setDx(0);
          if (!s || s.axis !== "x") return;
          // RTL: swipe left → next, swipe right → previous.
          if (delta <= -COMMIT_THRESHOLD) goNext();
          else if (delta >= COMMIT_THRESHOLD) goPrev();
        }}
      >
        <article
          className="mx-auto max-w-2xl space-y-4"
          style={{ transform: `translateX(${dx}px)` }}
        >
          <header className="space-y-1">
            {item.subtitle && (
              <p className="truncate text-[11px] text-muted-foreground">{item.subtitle}</p>
            )}
            <h2 className="text-base font-bold text-foreground">{item.title}</h2>
            {item.isCompleted && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                مكتمل
              </span>
            )}
          </header>

          {chunks.map((chunk, i) => (
            <p
              key={i}
              className="rounded-2xl border border-border bg-card p-4 text-sm leading-loose text-foreground shadow-card"
            >
              {chunk}
            </p>
          ))}

          {item.points && item.points.length > 0 && (
            <ul className="space-y-1.5 rounded-2xl border border-border bg-muted/40 p-4 text-sm text-foreground">
              {item.points.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-primary">•</span>
                  <span className="min-w-0 flex-1">{p}</span>
                </li>
              ))}
            </ul>
          )}

          {item.tip && (
            <p className="rounded-2xl border border-accent/30 bg-accent/10 p-4 text-xs leading-relaxed text-foreground">
              {item.tip}
            </p>
          )}

          {onOpenItem && (
            <Button variant="outline" size="sm" onClick={() => onOpenItem(item)}>
              {openItemLabel}
            </Button>
          )}

          {index === total - 1 && (
            <p className="pt-2 text-center text-sm font-semibold text-primary">تم 🎉</p>
          )}
        </article>
      </div>

      {showHint && (
        <p className="pointer-events-none absolute inset-x-0 bottom-28 mx-auto w-fit rounded-full bg-foreground/85 px-3 py-1.5 text-[11px] text-background">
          <ArrowLeftRight className="ml-1 inline h-3.5 w-3.5" aria-hidden />
          اسحب لليسار للبطاقة التالية
        </p>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <Button
          variant="outline"
          className="h-12 flex-1"
          onClick={goPrev}
          disabled={index === 0}
          aria-label="البطاقة السابقة"
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
          السابق
        </Button>
        {total <= 12 && (
          <div className="flex items-center gap-1" aria-hidden>
            {items.map((it, i) => (
              <span
                key={it.id}
                className={[
                  "h-1.5 w-1.5 rounded-full",
                  i === index ? "bg-primary" : "bg-muted-foreground/30",
                ].join(" ")}
              />
            ))}
          </div>
        )}
        <Button
          className="h-12 flex-1"
          onClick={goNext}
          disabled={index >= total - 1}
          aria-label="البطاقة التالية"
        >
          التالي
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
