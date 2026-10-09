import { Flag } from "lucide-react";
import { useExamCountdown } from "@/hooks/use-exam-countdown";
import { daysBetween, EXAM_KIND_LABEL, examCountdownLabel } from "@/lib/exams/exam-countdown";
import { arabicCount, DAY_FORMS } from "@/lib/i18n/arabic-count";
export function ExamCountdown({ compact = false }: { compact?: boolean }) {
  const { exam, today } = useExamCountdown();
  if (!exam) return null;
  const days = daysBetween(today, exam.starts_on);
  return (
    <section
      aria-label="موعد الاختبار القادم"
      className={`flex items-center gap-3 rounded-[20px] border px-4 py-3 ${days <= 14 ? "border-amber-200 bg-amber-50 text-amber-900" : "border-[#FAD6D0] bg-[#FFF1EE] text-[#993E30]"}`}
    >
      <Flag className="h-5 w-5 shrink-0" aria-hidden />
      {compact ? (
        <p className="text-sm font-semibold">{examCountdownLabel(exam, today)}</p>
      ) : (
        <>
          <div className="min-w-0 flex-1">
            <p className="text-xs">{EXAM_KIND_LABEL[exam.exam_kind]}</p>
            <p className="mt-1 text-xl font-black text-foreground">
              {days > 0 ? `باقي ${arabicCount(days, DAY_FORMS)}` : "جارية — بالتوفيق"}
            </p>
            <p className="mt-1 text-xs">{exam.title}</p>
          </div>
          <p className="max-w-24 text-xs leading-relaxed">ابدأ مبكراً وادخل بثقة</p>
        </>
      )}
    </section>
  );
}
