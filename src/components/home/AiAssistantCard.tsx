import { Link } from "@tanstack/react-router";
import { Lightbulb, Sparkles } from "lucide-react";

const SUGGESTIONS = [
  { label: "ابدأ أول درس", to: "/semesters" as const },
  { label: "راجع أخطاءك السابقة", to: "/my-mistakes" as const },
  { label: "تواصل مع فريق الدعم", to: "/contact" as const },
];

export function AiAssistantCard() {
  return (
    <section aria-label="اقتراحات سريعة" className="flex h-full flex-col">
      <div className="flex h-full flex-col rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/5 via-card to-accent/5 p-4 shadow-sm sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Lightbulb className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-black text-foreground">اقتراحات سريعة</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              اختصارات عملية تساعدك على بدء المذاكرة ومراجعة أدائك.
            </p>
          </div>
          <Sparkles className="h-4 w-4 shrink-0 text-primary/60" aria-hidden />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <Link
              key={s.label}
              to={s.to}
              className="inline-flex min-h-11 items-center rounded-full border border-border bg-background px-3.5 py-2 text-[13px] font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
