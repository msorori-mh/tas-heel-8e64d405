import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";

/** Scales the frame from outside its opaque origin; never changes its document or sandbox. */
export function LessonContentZoom({
  children,
  height,
  contentKey,
}: {
  children: ReactNode;
  height: string;
  contentKey: string;
}) {
  const [scale, setScale] = useState(1);
  const pinchId = useId();
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setScale(1);
    if (viewport.current) {
      viewport.current.scrollLeft = 0;
      viewport.current.scrollTop = 0;
    }
  }, [contentKey]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    let active = false;
    const pinch = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.phase === "start") active = true;
      else if (detail?.phase === "end") active = false;
      else if (
        active &&
        detail?.phase === "scale" &&
        Number.isFinite(detail.factor) &&
        detail.factor > 0
      ) {
        setScale((current) => Math.max(1, Math.min(3, current * detail.factor)));
      }
    };
    element.addEventListener("tamkeen:lesson-pinch", pinch);
    return () => element.removeEventListener("tamkeen:lesson-pinch", pinch);
  }, [contentKey]);
  const buttonClass =
    "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border px-2 text-primary disabled:opacity-40";
  return (
    <div className="min-w-0">
      <div
        className="flex flex-wrap items-center gap-2 py-2"
        role="group"
        aria-label="تكبير محتوى الدرس"
        dir="rtl"
      >
        <button
          type="button"
          className={buttonClass}
          aria-label="تكبير المحتوى"
          disabled={scale >= 3}
          onClick={() => setScale((s) => Math.min(3, s + 0.25))}
        >
          <ZoomIn className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={buttonClass}
          aria-label="تصغير المحتوى"
          disabled={scale <= 1}
          onClick={() => setScale((s) => Math.max(1, s - 0.25))}
        >
          <ZoomOut className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={buttonClass}
          aria-label="إعادة الحجم الأصلي"
          onClick={() => {
            setScale(1);
            if (viewport.current) {
              viewport.current.scrollLeft = 0;
              viewport.current.scrollTop = 0;
            }
          }}
        >
          100%
        </button>
        <output className="text-xs text-muted-foreground" aria-live="polite">
          {Math.round(scale * 100)}%
        </output>
      </div>
      <div
        ref={viewport}
        id={pinchId}
        data-lesson-zoom=""
        className="w-full overflow-auto"
        style={{ height }}
        dir="rtl"
        tabIndex={0}
        aria-label="محتوى الدرس القابل للتمرير"
      >
        <div style={{ width: `${scale * 100}%`, height: `calc(${height} * ${scale})` }}>
          <div
            style={{
              width: `${100 / scale}%`,
              height,
              transform: `scale(${scale})`,
              transformOrigin: "top right",
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
