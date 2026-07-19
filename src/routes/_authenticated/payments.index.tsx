// src/routes/_authenticated/payments.index.tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  FREE_ACCESS_SHORT,
  STUDENT_FREE_ACCESS,
} from "@/lib/student-free-access";

export const Route = createFileRoute("/_authenticated/payments/")({
  component: MyPaymentRequestsPage,
});

function MyPaymentRequestsPage() {
  if (STUDENT_FREE_ACCESS) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-4" dir="rtl">
        <nav className="text-xs text-muted-foreground">
          <Link to="/app" className="hover:text-primary">
            موادي
          </Link>
          <span className="mx-1">/</span>
          <span className="text-foreground">طلبات الدفع</span>
        </nav>
        <header>
          <h1 className="text-lg font-bold text-foreground">الدفع</h1>
        </header>
        <div className="rounded-2xl border border-border bg-muted/30 p-5 text-sm leading-relaxed text-foreground">
          {FREE_ACCESS_SHORT}
        </div>
        <Button asChild>
          <Link to="/app">العودة إلى موادي</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4" dir="rtl">
      <nav className="text-xs text-muted-foreground">
        <Link to="/app" className="hover:text-primary">
          موادي
        </Link>
        <span className="mx-1">/</span>
        <span className="text-foreground">طلبات الدفع</span>
      </nav>
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        خدمات الدفع غير مفعّلة حالياً.
      </div>
    </div>
  );
}
