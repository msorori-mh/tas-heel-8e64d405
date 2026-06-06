import { createFileRoute, Link } from "@tanstack/react-router";
import PublicFooter from "@/components/PublicFooter";

export const Route = createFileRoute("/privacy-policy")({
  head: () => ({
    meta: [
      { title: "سياسة الخصوصية — تنوير" },
      { name: "description", content: "سياسة الخصوصية لمنصة تنوير التعليمية. نحترم خصوصيتك ونوضح البيانات التي نجمعها وكيف نحميها." },
      { property: "og:title", content: "سياسة الخصوصية — تنوير" },
      { property: "og:description", content: "سياسة الخصوصية لمنصة تنوير التعليمية. نحترم خصوصيتك ونوضح البيانات التي نجمعها وكيف نحميها." },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "/privacy-policy" }],
  }),
  component: () => (
    <div className="min-h-screen bg-background flex flex-col">
      <article className="flex-1 px-4 py-10">
        <div className="mx-auto max-w-3xl">
          <Link to="/" className="text-sm text-muted-foreground">→ الرئيسية</Link>
          <h1 className="mt-3 text-3xl font-bold">سياسة الخصوصية</h1>
          <p className="mt-4 text-muted-foreground">
            نحن في "تنوير" نحترم خصوصية مستخدمينا. نجمع فقط البيانات اللازمة لتقديم
            الخدمة: الاسم، البريد، الصف، المحافظة، وسجل الدراسة. لا نشارك بياناتك مع
            أطراف خارجية لأغراض تسويقية.
          </p>
          <h2 className="mt-6 text-xl font-semibold">البيانات التي نجمعها</h2>
          <ul className="mt-2 list-disc pr-6 space-y-1 text-muted-foreground">
            <li>بيانات الحساب: الاسم، البريد، كلمة المرور المشفّرة.</li>
            <li>البيانات الأكاديمية: الصف، المحافظة، تقدّم الدروس والاختبارات.</li>
            <li>بيانات الدفع: سجل الاشتراك وطلبات الدفع.</li>
          </ul>
          <h2 className="mt-6 text-xl font-semibold">حقوقك</h2>
          <p className="mt-2 text-muted-foreground">
            يمكنك طلب حذف حسابك في أي وقت من صفحة <Link to="/data-deletion" className="text-primary">حذف البيانات</Link>،
            أو التواصل معنا على{" "}
            <a href="mailto:support@studentamkeen.com" className="text-primary">support@studentamkeen.com</a>.
          </p>
        </div>
      </article>
      <PublicFooter />
    </div>
  ),
});
