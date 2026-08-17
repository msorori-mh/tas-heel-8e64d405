import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Target, Trophy, Zap } from "lucide-react";
import heroImage from "@/assets/prototype/fm-v2-hero.png";
import featureImage from "@/assets/prototype/fm-v2-feature.png";


/**
 * TAMKEEN_FOCUSED_MOMENTUM_V2_PROTOTYPE_19A — Landing screen (visual only).
 * Compact mobile-first hero, static copy, no data and no auth wiring.
 */
export const Route = createFileRoute("/prototype/19a/landing")({
  head: () => ({
    meta: [
      { title: "تمكين — استعد للثانوية والوزاري بذكاء" },
      {
        name: "description",
        content:
          "راجع دروسك، تدرب على الاختبارات الوزارية، واعرف نقاط ضعفك يومًا بعد يوم مع تمكين.",
      },
      { property: "og:title", content: "تمكين — استعد للثانوية والوزاري بذكاء" },
      {
        property: "og:description",
        content: "منصة تمكين لطلاب الثانوية العامة في اليمن: مراجعة، تدريب، وتحسن يومي.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LandingPrototype,
});

const PILLARS = [
  { icon: BookOpen, label: "تعلم", tone: "text-primary" },
  { icon: Zap, label: "تدرب", tone: "text-secondary" },
  { icon: Target, label: "تحسن", tone: "text-accent" },
  { icon: Trophy, label: "استعد للوزاري", tone: "text-[var(--fm-goal)]" },
];

function LandingPrototype() {
  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 pb-10 pt-4 sm:px-6">
      <header className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="fm-grad grid h-8 w-8 shrink-0 place-items-center rounded-xl text-[13px] font-extrabold text-primary-foreground">
            ت
          </span>
          <span className="truncate text-[16px] font-extrabold text-foreground">تمكين</span>
        </div>
        <button
          type="button"
          className="fm-press rounded-xl border border-border px-3 py-1.5 text-[13px] font-semibold text-primary"
        >
          لدي حساب
        </button>
      </header>

      <section className="grid items-center gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-8">
        <div className="order-2 text-right lg:order-1">
          <h1 className="text-[24px] font-extrabold leading-[1.5] text-foreground sm:text-[30px] lg:text-[38px]">
            استعد للثانوية والوزاري بذكاء
          </h1>
          <p className="mt-2 max-w-[46ch] text-[15px] leading-[1.9] text-muted-foreground sm:text-[16px]">
            راجع دروسك، تدرب على الاختبارات، واعرف نقاط ضعفك يومًا بعد يوم.
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <button
              type="button"
              className="fm-press fm-grad rounded-xl px-5 py-2.5 text-[15px] font-bold text-primary-foreground shadow-sm"
            >
              ابدأ مجانًا
            </button>
            <button
              type="button"
              className="fm-press rounded-xl border border-primary/25 bg-card px-5 py-2.5 text-[15px] font-bold text-primary"
            >
              لدي حساب
            </button>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <img
            src={heroImage}
            alt="طالب يستعد للامتحان الوزاري عبر تطبيق تمكين"
            className="mx-auto h-auto w-[62%] max-w-[240px] rounded-2xl sm:w-[48%] lg:w-full lg:max-w-[420px]"
          />
        </div>
      </section>

      <ul className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {PILLARS.map((p) => {
          const Icon = p.icon;
          return (
            <li key={p.label} className="fm-card flex items-center gap-2 px-3 py-2.5 text-right">
              <Icon className={`h-[18px] w-[18px] shrink-0 ${p.tone}`} aria-hidden />
              <span className="min-w-0 truncate text-[14px] font-bold text-foreground">
                {p.label}
              </span>
            </li>
          );
        })}
      </ul>

      <section className="fm-card mt-5 px-4 py-4 text-right">
        <h2 className="text-[16px] font-bold text-foreground">لماذا تمكين؟</h2>
        <p className="mt-1.5 text-[14.5px] leading-[1.95] text-muted-foreground">
          محتوى الكتاب الوزاري الرسمي داخل التطبيق، نماذج امتحانات سابقة حقيقية، وتحليل يوضح
          مستواك في كل مادة — يعمل حتى مع إنترنت ضعيف.
        </p>
      </section>
    </main>
  );
}
