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
      <div className="flex h-full flex-col rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/5 via-card to-blue-500/5 p-5 shadow-sm lg:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Lightbulb className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-foreground">اقتراحات سريعة</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              اختصارات عملية تساعدك على بدء المذاكرة ومراجعة أدائك.
            </p>
          </div>
          <Sparkles className="h-4 w-4 shrink-0 text-primary/60" aria-hidden />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <Link
              key={s.label}
              to={s.to}
              className="rounded-full border border-border bg-background px-3.5 py-2 text-sm text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
