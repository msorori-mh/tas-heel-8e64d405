import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookText,
  Brain,
  ChevronRight,
  CircleCheckBig,
  FlaskConical,
  GraduationCap,
  Presentation,
} from "lucide-react";
import { StructuredTextbookReader } from "@/components/lessons/StructuredTextbookReader";
import { PILOT_20A1B_DOCUMENT } from "@/lib/content/official-textbook/structured-blocks";
import officialBookImage from "@/assets/prototype/fm-v2-official-book.png";


/**
 * TAMKEEN_FOCUSED_MOMENTUM_V2_PROTOTYPE_19A — Lesson screen.
 * Renders the approved 20A1B structured document verbatim inside the
 * Focused Momentum V2 shell. Only real capabilities are listed.
 */
export const Route = createFileRoute("/prototype/19a/lesson")({
  head: () => ({
    meta: [
      { title: "مكانة القرآن الكريم وكمال قدرة الله | تمكين" },
      {
        name: "description",
        content:
          "درس مكانة القرآن الكريم وكمال قدرة الله بمحتوى الكتاب الوزاري الرسمي داخل تطبيق تمكين.",
      },
      { property: "og:title", content: "مكانة القرآن الكريم وكمال قدرة الله | تمكين" },
      {
        property: "og:description",
        content: "محتوى الكتاب الرسمي كاملاً مع أنشطة الدرس في تمكين.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LessonPrototype,
});

/** Only capabilities that actually exist for this lesson are rendered. */
const CAPABILITIES = [
  { label: "شرح تمكين", icon: Presentation, tone: "text-primary" },
  { label: "محاكاة", icon: FlaskConical, tone: "text-secondary" },
  { label: "مراجعة", icon: Brain, tone: "text-accent" },
  { label: "اختبر فهمك", icon: CircleCheckBig, tone: "text-success" },
  { label: "اختبار الدرس", icon: GraduationCap, tone: "text-[var(--fm-goal)]" },
];

function LessonPrototype() {
  const doc = PILOT_20A1B_DOCUMENT;
  return (
    <main className="mx-auto w-full max-w-[900px] px-[14px] pb-10 pt-3 sm:px-4">
      <header className="mb-3 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
        <Link
          to="/prototype/19a/home"
          aria-label="رجوع"
          className="fm-press grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-card"
        >
          <ChevronRight className="h-5 w-5 text-foreground" aria-hidden />
        </Link>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-extrabold text-foreground">
            {doc.detected_lesson_title}
          </p>
          <p className="truncate text-[12.5px] text-muted-foreground">
            {doc.detected_subject} — {doc.detected_section}
          </p>
        </div>
      </header>

      <section className="fm-card fm-read py-4">
        <StructuredTextbookReader document={doc} />
      </section>

      <section className="mt-5">
        <h2 className="mb-2 text-[15px] font-bold text-foreground">أنشطة هذا الدرس</h2>
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {CAPABILITIES.map((c) => {
            const Icon = c.icon;
            return (
              <li key={c.label}>
                <button
                  type="button"
                  className="fm-card fm-press flex w-full items-center gap-2 px-3 py-3 text-right"
                >
                  <Icon className={`h-[18px] w-[18px] shrink-0 ${c.tone}`} aria-hidden />
                  <span className="min-w-0 truncate text-[14px] font-bold text-foreground">
                    {c.label}
                  </span>
                </button>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              className="fm-press flex w-full items-center gap-2 rounded-2xl border border-dashed border-border bg-muted/40 px-3 py-3 text-right"
            >
              <BookText className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 truncate text-[14px] font-semibold text-muted-foreground">
                نسخة الكتاب الأصلية
              </span>
            </button>
          </li>
        </ul>
      </section>
    </main>
  );
}
