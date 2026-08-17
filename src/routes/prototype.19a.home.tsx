import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  BarChart3,
  Brain,
  ChevronLeft,
  Flame,
  GraduationCap,
  Play,
  
  Zap,
} from "lucide-react";
import { Bar, BottomNav, SectionTitle } from "@/components/prototype/fm-v2/primitives";
import continueImage from "@/assets/prototype/fm-v2-continue.png";
import firstStepImage from "@/assets/prototype/fm-v2-first-step.png";
import ministerialImage from "@/assets/prototype/fm-v2-ministerial.png";


/**
 * TAMKEEN_FOCUSED_MOMENTUM_V2_PROTOTYPE_19A — Student Home as a personal
 * learning feed. Visual prototype only: static content, no queries.
 */
export const Route = createFileRoute("/prototype/19a/home")({
  head: () => ({
    meta: [
      { title: "رئيسية الطالب | تمكين" },
      {
        name: "description",
        content: "واصل من حيث توقفت، تابع هدف اليوم، وراجع المواد التي تحتاج انتباهك في تمكين.",
      },
      { property: "og:title", content: "رئيسية الطالب | تمكين" },
      {
        property: "og:description",
        content: "تجربة تعلم شخصية يومية لطلاب الثانوية العامة في تمكين.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HomePrototype,
});

const QUICK_ACTIONS = [
  { label: "مراجعة سريعة", icon: Zap, tone: "text-secondary" },
  { label: "أخطائي", icon: AlertTriangle, tone: "text-[var(--fm-goal)]" },
  { label: "مستواي", icon: BarChart3, tone: "text-primary" },
  { label: "الوزاري", icon: GraduationCap, tone: "text-success" },
];

const NEEDS_ATTENTION = [
  { subject: "الفيزياء", topic: "الحركة الدائرية", value: 42 },
  { subject: "الرياضيات", topic: "النهايات", value: 55 },
];

const SUBJECTS = [
  { name: "القرآن الكريم", value: 78 },
  { name: "الفيزياء", value: 42 },
  { name: "الرياضيات", value: 55 },
  { name: "الأحياء", value: 66 },
];

function HomePrototype() {
  return (
    <div className="mx-auto w-full max-w-[880px] px-[14px] pt-4 sm:px-5">
      <header className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <p className="truncate text-[17px] font-extrabold text-foreground">مرحبًا محمد</p>
          <p className="truncate text-[13px] text-muted-foreground">الثالث الثانوي — علمي</p>
        </div>
        <span className="fm-press inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--fm-goal-soft)] px-3 py-1.5 text-[13px] font-bold text-[#92400E]">
          <Flame className="h-4 w-4" aria-hidden />5 أيام
        </span>
      </header>

      {/* Continue learning — strongest visual element */}
      <section className="fm-grad fm-press mb-4 rounded-2xl p-[1.5px] shadow-sm">
        <div className="rounded-[calc(1rem-1px)] bg-card px-4 py-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-bold text-secondary">واصل من حيث توقفت</p>
              <h2 className="mt-1 text-[17px] font-extrabold leading-[1.7] text-foreground sm:text-[19px]">
                مكانة القرآن الكريم وكمال قدرة الله
              </h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                القرآن الكريم — الوحدة الأولى
              </p>
            </div>
            <img
              src={continueImage}
              alt="استكمال الدرس من حيث توقفت"
              loading="lazy"
              width={816}
              height={816}
              className="h-12 w-12 shrink-0 sm:h-14 sm:w-14"
            />
          </div>

          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0">
              <Bar value={62} />
              <p className="mt-1 text-[12px] text-muted-foreground">أنجزت 62%</p>
            </div>
            <Link
              to="/prototype/19a/lesson"
              className="fm-press fm-grad inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-[14px] font-bold text-primary-foreground"
            >
              <Play className="h-4 w-4" aria-hidden />
              أكمل
            </Link>
          </div>
        </div>
      </section>

      {/* Daily goal */}
      <section className="fm-card mb-4 px-4 py-3.5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <h2 className="min-w-0 truncate text-[15px] font-bold text-foreground">هدف اليوم</h2>
          <span className="shrink-0 text-[13px] font-bold text-[var(--fm-goal)]">2 / 3 دروس</span>
        </div>
        <Bar className="mt-2" value={66} tone="goal" />
        <p className="mt-1.5 text-[13px] text-muted-foreground">درس واحد فقط ويكتمل يومك</p>
      </section>

      {/* Quick actions */}
      <section className="mb-4">
        <SectionTitle>أدوات سريعة</SectionTitle>
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {QUICK_ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <li key={a.label}>
                <button
                  type="button"
                  className="fm-card fm-press flex w-full items-center gap-2 px-3 py-3 text-right"
                >
                  <Icon className={`h-[18px] w-[18px] shrink-0 ${a.tone}`} aria-hidden />
                  <span className="min-w-0 truncate text-[14px] font-bold text-foreground">
                    {a.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Needs attention */}
      <section className="mb-4">
        <SectionTitle>يحتاج انتباهك</SectionTitle>
        <ul className="space-y-2.5">
          {NEEDS_ATTENTION.map((n) => (
            <li key={n.subject} className="fm-card px-4 py-3">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[14.5px] font-bold text-foreground">{n.subject}</p>
                  <p className="truncate text-[13px] text-muted-foreground">{n.topic}</p>
                </div>
                <button
                  type="button"
                  className="fm-press inline-flex shrink-0 items-center gap-1 rounded-xl bg-destructive/10 px-3 py-2 text-[13px] font-bold text-destructive"
                >
                  <Brain className="h-4 w-4" aria-hidden />
                  راجع الآن
                </button>
              </div>
              <Bar className="mt-2" value={n.value} />
            </li>
          ))}
        </ul>
      </section>

      {/* Ministerial challenge — grade 3 only */}
      <section className="mb-4">
        <div className="fm-card fm-press border-[var(--fm-goal)]/35 bg-[var(--fm-goal-soft)]/50 px-4 py-3.5">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
            <img
              src={ministerialImage}
              alt="الاستعداد للاختبار الوزاري والتقدم في الأداء"
              loading="lazy"
              width={816}
              height={816}
              className="h-10 w-10 shrink-0"
            />
            <div className="min-w-0">
              <p className="truncate text-[14.5px] font-bold text-foreground">تحدي وزاري اليوم</p>
              <p className="truncate text-[13px] text-muted-foreground">
                10 أسئلة من دورة 2023 — الفيزياء
              </p>
            </div>
            <ChevronLeft className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          </div>
        </div>
      </section>

      {/* Subjects */}
      <section className="pb-4">
        <SectionTitle>موادك</SectionTitle>
        <div className="fm-card mb-2.5 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 px-4 py-3">
          <img
            src={firstStepImage}
            alt="اختر مادة وابدأ أول درس"
            loading="lazy"
            width={816}
            height={816}
            className="h-11 w-11 shrink-0"
          />
          <p className="min-w-0 text-[13.5px] leading-[1.8] text-muted-foreground">
            اختر مادة وابدأ أول درس اليوم — خطوة واحدة تكفي للبداية.
          </p>
        </div>
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {SUBJECTS.map((s) => (
            <li key={s.name} className="fm-card fm-press px-4 py-3">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <p className="min-w-0 truncate text-[14.5px] font-bold text-foreground">{s.name}</p>
                <span className="shrink-0 text-[13px] font-bold text-secondary">{s.value}%</span>
              </div>
              <Bar className="mt-2" value={s.value} tone={s.value >= 70 ? "success" : "primary"} />
            </li>
          ))}
        </ul>
      </section>


      <BottomNav active={0} />
    </div>
  );
}
