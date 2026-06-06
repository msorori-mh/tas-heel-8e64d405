import { createFileRoute } from "@tanstack/react-router";
import {
  BookOpen,
  FileText,
  HelpCircle,
  WifiOff,
  MapPin,
  LineChart,
  Smartphone,
  Sparkles,
  CalendarDays,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import heroStudent from "@/assets/hero-student.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "تنوير — مذاكرتك صارت أوضح" },
      {
        name: "description",
        content: "دروسك، ملخصاتك، وأسئلتك في مكان واحد — حسب صفك ومحافظتك.",
      },
      { property: "og:title", content: "تنوير — مذاكرتك صارت أوضح" },
      {
        property: "og:description",
        content: "دروسك، ملخصاتك، وأسئلتك في مكان واحد — حسب صفك ومحافظتك.",
      },
    ],
  }),
  component: LandingPage,
});

const startHref = "/auth";

const HeroSection = () => (
  <section className="relative overflow-hidden px-4 pt-8 pb-10 md:pt-12 md:pb-14">
    <div className="absolute inset-0 pointer-events-none" aria-hidden>
      <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-accent/15 blur-3xl" />
    </div>

    <div className="container relative mx-auto max-w-5xl">
      <div className="grid items-center gap-6 md:grid-cols-2 md:gap-10">
        <div className="text-center md:text-right order-2 md:order-1">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card/80 backdrop-blur-sm px-3 py-1 mb-4 text-xs text-primary shadow-card">
            <Sparkles className="h-3.5 w-3.5" />
            منصة مذاكرة لطلاب الثانوية في اليمن
          </div>

          <h1 className="mb-3 text-2xl font-extrabold leading-tight text-foreground sm:text-3xl md:text-4xl">
            مذاكرتك صارت أوضح
            <span className="block mt-1 text-primary text-xl sm:text-2xl md:text-3xl">
              من أول درس إلى آخر مراجعة
            </span>
          </h1>

          <p className="mx-auto md:mx-0 mb-5 max-w-md text-sm leading-relaxed text-muted-foreground md:text-base">
            دروسك، ملخصاتك، وأسئلتك في مكان واحد — حسب صفك ومحافظتك.
          </p>

          <a href={startHref} className="inline-block w-full sm:w-auto">
            <Button
              size="lg"
              className="w-full sm:w-auto gap-2 text-base px-8 py-5 bg-accent text-accent-foreground hover:bg-accent/90 shadow-card"
            >
              <BookOpen className="h-5 w-5" />
              ابدأ الآن
            </Button>
          </a>

          <p className="mt-3 text-xs text-muted-foreground">
            دقيقة واحدة لاختيار صفك والبدء.
          </p>
        </div>

        <div className="order-1 md:order-2 flex justify-center">
          <div className="relative w-full max-w-[280px] sm:max-w-xs md:max-w-sm">
            <div
              className="absolute inset-0 bg-hero-gradient opacity-15 blur-3xl rounded-full"
              aria-hidden
            />
            <img
              src={heroStudent}
              alt="طالب يذاكر مع تنوير"
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

const features = [
  { icon: Layers, title: "مرتب حسب صفك", desc: "محتوى يطابق منهجك." },
  { icon: FileText, title: "ملخصات سريعة", desc: "أهم النقاط بدون تشتيت." },
  { icon: HelpCircle, title: "5 أسئلة مراجعة", desc: "اختبر فهمك بدقيقتين." },
  { icon: LineChart, title: "تابع تقدمك", desc: "اعرف وين وصلت." },
  { icon: CalendarDays, title: "مذاكرة يومية", desc: "ليس فقط قبل الاختبار." },
  { icon: WifiOff, title: "خفيف على النت", desc: "يعمل مع الإنترنت الضعيف." },
  { icon: Smartphone, title: "يعمل على الجوال", desc: "تجربة مريحة دائمًا." },
  { icon: MapPin, title: "يراعي محافظتك", desc: "قريب من واقع منهجك." },
];

const FeaturesSection = () => (
  <section id="features" className="px-4 py-10 md:py-14 bg-secondary/40">
    <div className="container mx-auto max-w-5xl">
      <div className="mb-6 text-center">
        <h2 className="text-xl font-bold text-foreground md:text-2xl">ليش تنوير؟</h2>
        <p className="mt-1 text-sm text-muted-foreground">تجربة مذاكرة أبسط وأذكى</p>
      </div>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {features.map((f) => (
          <div
            key={f.title}
            className="rounded-xl border border-border bg-card p-3 sm:p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-hover"
          >
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <f.icon className="h-4 w-4 text-primary" />
            </div>
            <h3 className="text-sm font-bold text-card-foreground leading-tight">
              {f.title}
            </h3>
            <p className="mt-1 text-xs leading-snug text-muted-foreground">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const CTAFooter = () => (
  <>
    <section className="px-4 py-8 md:py-10">
      <div className="container mx-auto max-w-4xl">
        <div className="relative overflow-hidden rounded-2xl bg-hero-gradient p-5 md:p-7 shadow-card-hover flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-right">
          <div className="flex-1">
            <h2 className="text-lg md:text-xl font-bold text-primary-foreground">
              جاهز تبدأ مذاكرة أوضح؟
            </h2>
            <p className="mt-1 text-sm text-primary-foreground/90">
              اختر صفك وافتح درس اليوم.
            </p>
          </div>
          <a href={startHref} className="w-full sm:w-auto">
            <Button
              size="lg"
              className="w-full sm:w-auto px-8 py-5 text-base gap-2 bg-accent text-accent-foreground hover:bg-accent/90 shadow-card"
            >
              <BookOpen className="h-5 w-5" />
              ابدأ الآن
            </Button>
          </a>
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
            <div className="text-sm">
              <span className="font-bold text-foreground">تنوير</span>
              <span className="text-muted-foreground mx-1">·</span>
              <span className="text-xs text-muted-foreground">studentamkeen.com</span>
            </div>
          </div>

          <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <a href="#features" className="hover:text-primary">المزايا</a>
            <a
              href="mailto:support@studentamkeen.com"
              className="hover:text-primary"
            >
              support@studentamkeen.com
            </a>
          </nav>
        </div>

        <p className="mt-4 pt-4 border-t border-border text-center text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} تنوير — جميع الحقوق محفوظة
        </p>
      </div>
    </footer>
  </>
);

function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <HeroSection />
      <FeaturesSection />
      <CTAFooter />
    </div>
  );
}
