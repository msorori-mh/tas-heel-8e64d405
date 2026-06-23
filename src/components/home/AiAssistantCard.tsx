import { Link } from "@tanstack/react-router";
import { Bot, Sparkles } from "lucide-react";

const SUGGESTIONS = [
  { label: "ما خطة مذاكرتي اليوم؟", to: "/app" as const },
  { label: "كيف أحسّن نتائج الاختبارات؟", to: "/exams/history" as const },
  { label: "أحتاج مساعدة في درس", to: "/contact" as const },
];

export function AiAssistantCard() {
  return (
    <section aria-label="المساعد الذكي">
      <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/5 via-card to-blue-500/5 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-foreground">اسأل مساعدك الذكي</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              اقتراحات سريعة لمساعدتك في التخطيط والمراجعة.
            </p>
          </div>
          <Sparkles className="h-4 w-4 shrink-0 text-primary/60" aria-hidden />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <Link
              key={s.label}
              to={s.to}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
