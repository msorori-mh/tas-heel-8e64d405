import { createFileRoute, Link } from "@tanstack/react-router";
import { Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FREE_ACCESS_SUBSCRIPTION_PAGE,
  STUDENT_FREE_ACCESS,
} from "@/lib/student-free-access";

export const Route = createFileRoute("/_authenticated/subscription")({
  component: SubscriptionPage,
});

function SubscriptionPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4" dir="rtl">
      <nav className="text-xs text-muted-foreground">
        <Link to="/app" className="hover:text-primary">
          الرئيسية
        </Link>
        <span className="mx-1">/</span>
        <span className="text-foreground">الاشتراك</span>
      </nav>

      <header>
        <h1 className="text-lg font-bold text-foreground">الوصول إلى المحتوى</h1>
        <p className="text-xs text-muted-foreground">
          معلومات حول إتاحة التطبيق للطلاب.
        </p>
      </header>

      {STUDENT_FREE_ACCESS ? (
        <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 shadow-card space-y-3">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
            <Gift className="h-5 w-5 shrink-0" aria-hidden />
            <h2 className="text-sm font-semibold">متاح مجاناً للطلاب</h2>
          </div>
          <p className="text-sm leading-relaxed text-foreground">
            {FREE_ACCESS_SUBSCRIPTION_PAGE}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            التطبيق متاح حالياً مجاناً لجميع الطلاب. خدمات الدفع والاشتراكات غير
            مفعّلة حالياً.
          </p>
          <Button asChild className="w-full sm:w-auto">
            <Link to="/app">العودة إلى موادي</Link>
          </Button>
        </section>
      ) : null}
    </div>
  );
}
