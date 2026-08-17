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
import heroStudentAsset from "@/assets/prototype/fm-v2-hero-real.png.asset.json";
const heroStudent = heroStudentAsset.url;
import { PwaInstallHint } from "@/components/pwa/PwaInstallHint";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "تمكين طلاب الثانوية — منصتك للاستعداد والتفوّق" },
      {
        name: "description",
        content:
          "منصة تعليمية تساعد طلاب الثانوية على المذاكرة، مراجعة الدروس، حل الاختبارات، والتدرب على نماذج تناسب الصف والمنهج والمحافظة.",
      },
      {
        property: "og:title",
        content: "تمكين طلاب الثانوية — منصتك للاستعداد والتفوّق",
      },
      {
        property: "og:description",
        content:
          "منصتك الذكية للاستعداد للثانوية والاختبارات الوزارية — محتوى منظم، تدريب، ومتابعة تقدم.",
      },
      { property: "og:url", content: "https://tas-heel.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://tas-heel.lovable.app/" }],
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
    title: "مراجعة الثالث الثانوي",
    desc: "مساحة مخصصة لطلاب الصف الثالث الثانوي لمراجعة الاختبارات الوزارية السابقة والتدرب عليها قبل الاختبار النهائي.",
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

function HeroSection() {
  return (
    <section className="relative overflow-hidden px-4 pt-8 pb-10 md:pt-12 md:pb-14">
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-secondary/15 blur-3xl" />
      </div>

      <div className="container relative mx-auto max-w-5xl">
        <div className="relative overflow-hidden rounded-3xl bg-hero-gradient shadow-card-hover grid items-center gap-6 p-6 md:grid-cols-2 md:gap-10 md:p-10">
          <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-white/10 blur-3xl pointer-events-none" aria-hidden />
          <div className="absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-accent/25 blur-3xl pointer-events-none" aria-hidden />

          <div className="relative text-center md:text-right order-2 md:order-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/15 backdrop-blur-sm px-3 py-1 mb-3 text-xs font-medium text-white shadow-card">
              <Sparkles className="h-3.5 w-3.5" />
              تمكين طلاب الثانوية
            </div>

            <p className="mb-4 text-sm font-semibold text-white/90">
              منصتك الذكية للاستعداد للثانوية والاختبارات الوزارية
            </p>

            <h1 className="text-display mb-4 text-white">
              طريقك المنظم للتفوّق في الثانوية
            </h1>

            <p className="text-body-lg mx-auto md:mx-0 mb-6 max-w-lg text-white/85">
              منصة تعليمية تساعد طلاب الثانوية على المذاكرة، مراجعة الدروس، حل
              الاختبارات، والتدرب على نماذج تناسب الصف والمنهج والمحافظة.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center md:justify-start">
              <Link to="/auth" search={{ mode: "signup" }} className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto gap-2 px-6 py-5 bg-accent text-accent-foreground hover:bg-accent/90 shadow-lg">
                  ابدأ الآن
                </Button>
              </Link>
              <Link to="/auth" search={{ mode: "login" }} className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="w-full sm:w-auto gap-2 px-6 py-5 bg-secondary text-secondary-foreground hover:bg-secondary/90 shadow-lg"
                >
                  تسجيل الدخول
                </Button>
              </Link>
            </div>
          </div>


          <div className="relative order-1 md:order-2 flex justify-center">
            <div className="relative w-full max-w-[280px] sm:max-w-xs md:max-w-sm">
              <div
                className="absolute inset-0 bg-white/20 blur-3xl rounded-full"
                aria-hidden
              />

              <img
                src={heroStudent}
                alt="طالب ثانوي يذاكر عبر المنصة"
                width={1024}
                height={1024}
                className="relative w-full h-auto drop-shadow-xl"
              />
            </div>
          </div>
        </div>
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
              <div
                className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${f.iconClass ?? "edu-lesson"}`}
              >
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-card-foreground leading-snug">
                {f.title}
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {f.desc}
              </p>
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
              <h2 className="text-headline text-foreground">
                استعد للاختبارات الوزارية بثقة
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                لطلاب الصف الثالث الثانوي، توفر المنصة مساحة خاصة لمراجعة نماذج
                الاختبارات الوزارية السابقة والتدرب عليها حسب المنهج والمحافظة،
                مع مراعاة اختلاف نماذج صنعاء وعدن وطبيعة الأسئلة في كل نظام.
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
            لا تتعامل المنصة مع جميع الطلاب بنفس النموذج؛ بل تراعي اختلاف المنهج
            والمحافظة وطبيعة الأسئلة، خصوصاً في الاختبارات الوزارية للصف الثالث
            الثانوي.
          </p>
        </div>
      </div>
    </section>
  );
}

function CTAFooter() {
  return (
    <>
      <section className="px-4 py-8 md:py-10">
        <div className="container mx-auto max-w-4xl">
          <div className="relative overflow-hidden rounded-2xl bg-hero-gradient p-5 md:p-7 shadow-card-hover flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-right">
            <div className="flex-1">
              <h2 className="text-lg md:text-xl font-bold text-primary-foreground">
                ابدأ رحلتك الدراسية اليوم
              </h2>
              <p className="mt-1 text-sm text-primary-foreground/90">
                ذاكر بثقة، اختبر بذكاء، وتابع تقدمك يومًا بعد يوم.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Link to="/auth" search={{ mode: "signup" }} className="w-full sm:w-auto">
                <Button size="lg" variant="hero" className="w-full sm:w-auto px-6 py-5">
                  ابدأ الآن
                </Button>
              </Link>
              <Link to="/auth" search={{ mode: "login" }} className="w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="secondary"
                  className="w-full sm:w-auto px-6 py-5 text-base bg-secondary text-secondary-foreground hover:bg-secondary/90"
                >
                  تسجيل الدخول
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-card px-4 py-6">
        <div className="container mx-auto max-w-5xl">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-hero-gradient">
                <BookOpen className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-sm font-bold text-foreground">
                تمكين طلاب الثانوية
              </span>
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
            </nav>
          </div>

          <p className="mt-4 pt-4 border-t border-border text-center text-[11px] text-muted-foreground">
            © {new Date().getFullYear()} تمكين طلاب الثانوية — جميع الحقوق محفوظة
          </p>
        </div>
      </footer>
    </>
  );
}

function LandingPage() {
  return (
    <div className="landing-page-bg min-h-screen text-foreground" dir="rtl">
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
