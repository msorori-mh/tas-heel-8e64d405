import { Link } from "@tanstack/react-router";
import { ChevronLeft, Loader2 } from "lucide-react";
import type { ContinueItem } from "@/hooks/use-home-dashboard";

export function ContinueLearningCard({
  items,
  loading,
}: {
  items: ContinueItem[];
  loading: boolean;
}) {
  const next = items.find((i) => !i.completed) ?? items[0];
  const shell =
    "subject-card-accent relative flex h-full min-w-0 flex-col overflow-hidden rounded-[20px] !bg-primary p-5 !text-white shadow-sm before:!hidden lg:p-6";
  const button =
    "mt-4 inline-flex min-h-11 h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-white px-4 text-base font-bold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary";
  if (loading)
    return (
      <section aria-label="أكمل تعلمك" aria-busy className={shell}>
        <p className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          جارٍ التحضير…
        </p>
      </section>
    );
  if (!next)
    return (
      <section aria-label="أكمل تعلمك" className={shell}>
        <p className="text-xs font-bold text-[#91E3DF]">خطوتك التالية</p>
        <h2 className="mt-2 text-2xl font-black">ابدأ أول درس</h2>
        <p className="mt-3 text-sm leading-relaxed text-white/90">
          اختر الفصل والمادة، وسنفتح لك أول درس مناسب لمنهجك.
        </p>
        <ol className="mt-4 flex items-center gap-3 text-sm text-white/90">
          {["الفصل", "المادة", "الدرس"].map((step, index) => (
            <li key={step} className="flex items-center gap-2">
              <span
                className={`grid h-7 w-7 place-items-center rounded-full ${index === 0 ? "bg-[#27CBC4] font-bold text-primary" : "border border-white/50"}`}
              >
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
        <Link to="/semesters" className={button}>
          ابدأ الآن
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Link>
      </section>
    );
  const pct = next.completed
    ? 100
    : next.quizScore != null
      ? Math.max(0, Math.min(100, next.quizScore))
      : 35;
  return (
    <section aria-label="أكمل تعلمك" className={shell}>
      <p className="text-xs font-bold text-[#91E3DF]">أكمل من حيث توقفت</p>
      <h2 className="mt-2 min-w-0 truncate text-xl font-black">
        {next.subjectName} · {next.lessonTitle}
      </h2>
      <p className="mt-2 text-sm text-white/90">
        {next.semester === 2 ? "الفصل الثاني" : "الفصل الأول"}
      </p>
      <div className="mt-4 flex justify-between text-xs text-white/90">
        <span>التقدم في الدرس</span>
        <span>{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-label="التقدم في الدرس"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="mt-2 h-2 overflow-hidden rounded-full bg-white/15"
      >
        <div className="h-full rounded-full bg-[#27CBC4]" style={{ width: `${pct}%` }} />
      </div>
      <Link to="/lessons/$lessonId" params={{ lessonId: next.lessonId }} className={button}>
        متابعة الدرس
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  );
}
