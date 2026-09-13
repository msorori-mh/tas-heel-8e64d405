import { useMemo, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { parseQuestionImage } from "@/lib/lessons/question-image";

export function QuestionFigure({ image }: { image?: unknown }) {
  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const parsed = useMemo(() => {
    try {
      return { image: parseQuestionImage(image), error: false };
    } catch {
      return { image: null, error: true };
    }
  }, [image]);
  if (parsed.error || (parsed.image && failedSrc === parsed.image.src))
    return (
      <p role="alert" className="my-3 text-sm text-destructive">
        تعذّر عرض صورة السؤال. أعد تحميل الدرس قبل الإجابة.
      </p>
    );
  if (!parsed.image) return null;
  const figure = parsed.image;
  return (
    <figure className="my-3 min-w-0" dir="rtl">
      <button
        type="button"
        className="block min-h-11 w-full rounded-lg border bg-white p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        aria-label={`تكبير صورة السؤال: ${figure.alt}`}
        onClick={() => {
          setScale(1);
          setOpen(true);
        }}
      >
        <img
          src={figure.src}
          alt={figure.alt}
          className="mx-auto block h-auto max-h-72 max-w-full object-contain"
          onError={() => setFailedSrc(figure.src)}
        />
        <span className="mt-2 flex min-h-11 items-center justify-center gap-2 text-sm text-slate-700">
          <ZoomIn className="h-4 w-4" aria-hidden />
          تكبير الصورة
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[95dvh] max-w-[95vw] overflow-hidden" dir="rtl">
          <DialogTitle>صورة السؤال</DialogTitle>
          <DialogDescription>{figure.alt}</DialogDescription>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="زيادة تكبير الصورة"
              disabled={scale >= 4}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-md border disabled:opacity-40"
              onClick={() => setScale((s) => Math.min(4, s + 0.5))}
            >
              <ZoomIn aria-hidden />
            </button>
            <button
              type="button"
              aria-label="تقليل تكبير الصورة"
              disabled={scale <= 1}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-md border disabled:opacity-40"
              onClick={() => setScale((s) => Math.max(1, s - 0.5))}
            >
              <ZoomOut aria-hidden />
            </button>
            <output aria-live="polite">{Math.round(scale * 100)}%</output>
          </div>
          <div
            className="max-h-[65dvh] overflow-auto rounded-md border bg-white p-2"
            dir="ltr"
            style={{ touchAction: "pan-x pan-y pinch-zoom" }}
          >
            <img
              src={figure.src}
              alt={figure.alt}
              className="block h-auto max-w-none"
              style={{ width: `${scale * 100}%` }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </figure>
  );
}
