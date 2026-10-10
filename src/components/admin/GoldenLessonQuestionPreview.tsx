import { useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { QuestionFigure } from "@/components/lessons/QuestionFigure";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buildQuestionPreview,
  type QuestionPreviewCapability,
  type QuestionPreviewRow,
} from "@/lib/content-factory/golden-lesson-question-preview";

const INTERACTION_LABEL: Record<string, string> = {
  SINGLE_CHOICE: "اختيار من متعدد",
  SHORT_TEXT: "إجابة قصيرة",
  LONG_TEXT: "إجابة مقالية",
};
const GRADING_LABEL: Record<string, string> = {
  AUTO_SINGLE: "تصحيح تلقائي",
  AUTO_TEXT: "تصحيح نصي تلقائي",
  MANUAL: "إجابة نموذجية للمراجعة",
};

export function GoldenLessonQuestionPreview({
  capability,
  file,
  fileName,
  lessonTitle,
  answers,
  onClose,
}: {
  capability: QuestionPreviewCapability;
  file: File;
  fileName: string;
  lessonTitle: string;
  answers: ReadonlyArray<Record<string, unknown>>;
  onClose: () => void;
}) {
  const [questions, setQuestions] = useState<QuestionPreviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let active = true;
    setQuestions(null);
    setError(null);
    void file
      .text()
      .then((raw) => {
        const rows = buildQuestionPreview(capability, JSON.parse(raw), answers);
        if (active) setQuestions(rows);
      })
      .catch(() => {
        if (active) setError("تعذّر عرض معاينة الأسئلة. أعد اختيار ملف Excel قبل النشر.");
      });
    return () => {
      active = false;
    };
  }, [capability, file, answers]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        dir="rtl"
        className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus();
        }}
      >
        <DialogHeader className="ps-6 text-right sm:text-right">
          <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">
            معاينة {capability === "selfTest" ? "اختبر فهمك" : "أسئلة الكتاب"}
          </DialogTitle>
          <DialogDescription>
            راجع الأسئلة والإجابات قبل النشر. لتصحيح أي خطأ، عدّل ملف Excel ثم أعد رفعه.
          </DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-1 rounded-lg bg-muted/40 p-3 text-sm">
          <p className="break-words font-medium">{lessonTitle}</p>
          <p className="break-all text-muted-foreground">{fileName}</p>
          {questions && <p>عدد الأسئلة: {questions.length}</p>}
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : !questions ? (
          <p role="status" className="text-sm text-muted-foreground">
            جارٍ تحميل المعاينة…
          </p>
        ) : (
          <div className="min-w-0 space-y-4">
            {questions.map((question, index) => (
              <article key={question.code} className="min-w-0 space-y-3 rounded-xl border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    السؤال {index + 1} من {questions.length} ·{" "}
                    {INTERACTION_LABEL[question.interactionType] ?? question.interactionType}
                  </span>
                  <span dir="ltr" className="break-all">
                    {question.code}
                  </span>
                </div>
                <p className="whitespace-pre-wrap break-words font-medium">{question.text}</p>
                <QuestionFigure image={question.image} />
                {question.options.length > 0 && (
                  <ol className="space-y-2">
                    {question.options.map((option, optionIndex) => (
                      <li
                        key={optionIndex}
                        className={`min-w-0 rounded-lg border p-2 text-sm ${question.correctIndex === optionIndex + 1 ? "border-emerald-500/40 bg-emerald-500/10" : ""}`}
                      >
                        <p className="whitespace-pre-wrap break-words">
                          {optionIndex + 1}. {option}
                        </p>
                        {question.correctIndex === optionIndex + 1 && (
                          <span className="mt-1 flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="h-4 w-4" />
                            الإجابة الصحيحة
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
                <div className="space-y-2 rounded-lg bg-muted/40 p-3 text-sm">
                  {question.gradingMode && (
                    <p className="text-xs text-muted-foreground">
                      {GRADING_LABEL[question.gradingMode] ?? question.gradingMode}
                    </p>
                  )}
                  {question.modelAnswer && (
                    <div>
                      <p className="font-medium">الإجابة النموذجية</p>
                      <p className="whitespace-pre-wrap break-words">{question.modelAnswer}</p>
                    </div>
                  )}
                  {question.acceptedAnswers.length > 0 && (
                    <div>
                      <p className="font-medium">الإجابات المقبولة</p>
                      <ul className="list-disc space-y-1 ps-5">
                        {question.acceptedAnswers.map((answer, answerIndex) => (
                          <li key={answerIndex} className="whitespace-pre-wrap break-words">
                            {answer}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {question.explanation && (
                    <div>
                      <p className="font-medium">التعليل</p>
                      <p className="whitespace-pre-wrap break-words">{question.explanation}</p>
                    </div>
                  )}
                  {!question.modelAnswer && question.correctIndex === null && (
                    <p role="alert" className="text-destructive">
                      الإجابة غير متاحة في المسودة؛ أعد رفع الملف لمراجعتها قبل النشر.
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
        <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>
          إغلاق المعاينة
        </Button>
      </DialogContent>
    </Dialog>
  );
}
