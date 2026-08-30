import { createFileRoute } from "@tanstack/react-router";
import {
  BookOpen,
  ClipboardList,
  GraduationCap,
  LineChart,
  MapPin,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import heroStudent from "@/assets/hero-tamkeen.png";
import { PwaInstallHint } from "@/components/pwa/PwaInstallHint";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "تمكين الطالب" },
      {
        name: "description",
        content:
          "منصة تعليمية تساعد طلاب الثانوية على المذاكرة، مراجعة الدروس، حل الاختبارات، والتدرب على نماذج تناسب الصف والمنهج والمحافظة.",
      },
      {
        property: "og:title",
        content: "تمكين الطالب",
      },
      {
        property: "og:description",
        content:
          "منصتك الذكية للاستعداد للثانوية والاختبارات الوزارية — محتوى منظم، تدريب، ومتابعة تقدم.",
      },
      { property: "og:url", content: "https://studentamkeen.com/" },
    ],
    links: [{ rel: "canonical", href: "https://studentamkeen.com/" }],
  }),
  component: LandingPage,
});

const features: {
  icon: typeof BookOpen;
  title: string;
  desc: string;
  cardClass?: string;
  iconClass?: string;
}[] = [
  {
    icon: BookOpen,
    title: "محتوى دراسي منظم",
    desc: "دروس ووحدات مرتبة حسب المادة والصف والمنهج.",
    cardClass: "card-student-quiet",
    iconClass: "edu-lesson",
  },
  {
    icon: ClipboardList,
    title: "اختبارات تدريبية ونماذج وزارية",
    desc: "تدرّب على أسئلة واختبارات تناسب صفك ومنهج محافظتك، مع اهتمام خاص بنماذج الثالث الثانوي الوزارية.",
    cardClass: "card-edu-exam",
    iconClass: "edu-exam",
  },
  {
    icon: GraduationCap,
    title: "مراجعة مركّزة للثالث الثانوي",
    desc: "خطة يومية ومراجعة شاملة للمادة والأخطاء قبل الامتحان النهائي.",
    cardClass: "card-edu-exam",
    iconClass: "edu-exam",
  },
  {
    icon: LineChart,
    title: "متابعة التقدم",
    desc: "اعرف نقاط القوة والضعف وتابع إنجازك خطوة بخطوة.",
    cardClass: "card-edu-progress",
    iconClass: "edu-progress",
  },
  {
    icon: MapPin,
    title: "مناسب للمحافظات والمناهج المختلفة",
    desc: "تراعي المنصة اختلاف نماذج الأسئلة بين منهج صنعاء ومنهج عدن، بحيث يحصل الطالب على تدريب مناسب لنظامه.",
    cardClass: "card-student-quiet",
    iconClass: "edu-lesson",
  },
  {
    icon: Smartphone,
    title: "واجهة سهلة للطلاب",
    desc: "تجربة عربية خفيفة وسهلة الاستخدام من الجوال.",
    cardClass: "card-student-quiet",
  },
];

/**
 * 19D — Landing hero rebuilt on the approved Focused Momentum V2 direction.
 * Presentation only: same routes, same CTAs, same copy intent.
 */
const PILLARS = [
  { icon: BookOpen, label: "تعلم", tone: "text-primary" },
  { icon: ClipboardList, label: "تدرب", tone: "text-secondary" },
  { icon: LineChart, label: "تحسن", tone: "text-accent" },
  { icon: GraduationCap, label: "استعد للاختبار الوزاري", tone: "text-[var(--fm-goal)]" },
];

function HeroSection() {
  return (
    <section className="px-4 pt-5 pb-6 md:pt-8 md:pb-8">
      <div className="container mx-auto max-w-[1100px]">
        <div className="grid items-center gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-8">
          <div className="order-2 text-center lg:order-1 lg:text-right">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-[var(--ds-radius-pill)] bg-primary/15 px-4 py-1.5 text-[14px] font-bold text-primary shadow-sm border border-primary/20">
              <Sparkles className="h-4 w-4" aria-hidden />
              تمكين الطالب
            </div>

            <h1 className="text-[26px] font-extrabold leading-[1.5] text-foreground sm:text-[32px] lg:text-[40px]">
              طريقك المنظم للتفوّق
            </h1>

            <p className="mx-auto mt-2 max-w-[46ch] text-[15px] leading-[1.9] text-muted-foreground lg:mx-0 sm:text-[16px]">
              راجع دروسك، تدرب على اختبارات محاكاة، واعرف نقاط ضعفك يومًا بعد يوم — بمحتوى يناسب
              منهجك الدراسي.
            </p>

            <div className="mt-4 flex flex-wrap justify-center gap-2.5 lg:justify-start">
              <Link to="/auth" search={{ mode: "signup" }}>
                <Button
                  size="lg"
                  className="fm-press fm-grad rounded-xl px-5 py-5 text-[15px] font-bold text-primary-foreground shadow-sm hover:opacity-95"
                >
                  ابدأ الآن
                </Button>
              </Link>
              <Link to="/auth" search={{ mode: "login" }}>
                <Button
                  size="lg"
                  variant="outline"
                  className="fm-press rounded-xl border-primary/25 bg-card px-5 py-5 text-[15px] font-bold text-primary"
                >
                  تسجيل الدخول
                </Button>
              </Link>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <img
              src={heroStudent}
              alt="طالب ثانوي يذاكر عبر منصة تمكين"
              width={1024}
              height={1024}
              className="mx-auto h-auto w-[62%] max-w-[240px] rounded-2xl sm:w-[48%] lg:w-full lg:max-w-[420px]"
            />
          </div>
        </div>

        <ul className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {PILLARS.map((p) => (
            <li key={p.label} className="fm-card flex items-center gap-2 px-3 py-2 text-right">
              <p.icon className={`h-[17px] w-[17px] shrink-0 ${p.tone}`} aria-hidden />
              <span className="min-w-0 truncate text-[13.5px] font-bold text-foreground">
                {p.label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="px-4 py-10 md:py-14">
      <div className="container mx-auto max-w-5xl">
        <div className="mb-6 text-center">
          <h2 className="text-headline text-foreground">لماذا هذه المنصة؟</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl mx-auto">
            محتوى منظم، تدريب واقعي، ومتابعة تقدم — مصممة لرحلة طالب الثانوية
          </p>
        </div>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className={`${f.cardClass ?? "card-student-quiet"} p-4 transition-all hover:-translate-y-0.5 hover:shadow-card-hover`}
            >
              <div className="flex items-start gap-2.5">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${f.iconClass ?? "edu-lesson"}`}
                >
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="min-w-0 text-sm font-bold leading-snug text-card-foreground">
                  {f.title}
                </h3>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function GradeTwelveSection() {
  return (
    <section className="px-4 py-8 md:py-10">
      <div className="container mx-auto max-w-4xl">
        <div className="rounded-2xl border border-primary/15 bg-card p-6 md:p-8 shadow-card card-edu-exam">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl edu-exam">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-headline text-foreground">استعد للاختبارات الوزارية بثقة</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                لطلاب الصف الثالث الثانوي، توفر المنصة مساحة خاصة لمراجعة نماذج الاختبارات الوزارية
                السابقة والتدرب عليها حسب المنهج والمحافظة، مع مراعاة اختلاف نماذج صنعاء وعدن وطبيعة
                الأسئلة في كل نظام.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CurriculumSection() {
  return (
    <section className="px-4 pb-8 md:pb-10">
      <div className="container mx-auto max-w-4xl">
        <div className="rounded-2xl border border-secondary/25 bg-secondary/5 p-6 md:p-8">
          <h2 className="text-headline text-foreground">تدريب يناسب منهجك</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            لا تتعامل المنصة مع جميع الطلاب بنفس النموذج؛ بل تراعي اختلاف المنهج والمحافظة وطبيعة
            الأسئلة، خصوصاً في الاختبارات الوزارية للصف الثالث الثانوي.
          </p>
        </div>
      </div>
    </section>
  );
}

function CTAFooter() {
  return (
    <footer className="border-t border-border bg-card px-4 py-6">
      <div className="container mx-auto max-w-5xl">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-hero-gradient">
              <BookOpen className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-bold text-foreground">تمكين الطالب</span>
          </div>

          <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <a href="#features" className="hover:text-primary">
              المزايا
            </a>
            <Link to="/contact" className="hover:text-primary">
              تواصل معنا
            </Link>
            <Link to="/about" className="hover:text-primary">
              عن المنصة
            </Link>
            <Link to="/privacy" className="hover:text-primary">
              الخصوصية
            </Link>
            <Link to="/terms" className="hover:text-primary">
              الشروط
            </Link>
            <Link to="/data-deletion" className="hover:text-primary">
              حذف البيانات
            </Link>
          </nav>
        </div>

        <p className="mt-4 pt-4 border-t border-border text-center text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} تمكين الطالب — جميع الحقوق محفوظة
        </p>
      </div>
    </footer>
  );
}

function LandingPage() {
  return (
    <div className="ds-v2 min-h-screen text-foreground" dir="rtl">
      <HeroSection />
      <div className="container mx-auto max-w-5xl px-4">
        <PwaInstallHint />
      </div>
      <FeaturesSection />
      <GradeTwelveSection />
      <CurriculumSection />
      <CTAFooter />
    </div>
  );
}
