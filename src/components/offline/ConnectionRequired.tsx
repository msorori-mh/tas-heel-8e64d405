import { Link } from "@tanstack/react-router";
import { Wifi, BookOpen } from "lucide-react";

export function ConnectionRequired({
  message = "هذه الخدمة تحتاج اتصالًا بالإنترنت. يمكنك متابعة دروسك المحفوظة الآن والعودة إليها عند الاتصال.",
}: {
  message?: string;
}) {
  return (
    <section
      role="status"
      className="rounded-2xl border border-primary/15 bg-card p-6 text-center shadow-sm"
      dir="rtl"
    >
      <Wifi className="mx-auto mb-3 h-8 w-8 text-primary" aria-hidden />
      <h2 className="text-base font-bold">نتابع التعلّم، حتى دون اتصال</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted-foreground">{message}</p>
      <Link
        to="/semesters"
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-2 text-sm font-semibold text-primary"
      >
        <BookOpen className="h-4 w-4" aria-hidden />
        الانتقال إلى موادي
      </Link>
    </section>
  );
}
