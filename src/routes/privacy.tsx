import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "سياسة الخصوصية — تنوير" },
      { name: "description", content: "كيف تجمع منصة تنوير بيانات طلاب الثانوية في اليمن وتحميها، وحقوقك في الوصول والحذف." },
      { property: "og:title", content: "سياسة الخصوصية — تنوير" },
      { property: "og:description", content: "كيف تجمع منصة تنوير بيانات طلاب الثانوية في اليمن وتحميها، وحقوقك في الوصول والحذف." },
      { property: "og:url", content: "https://tas-heel.lovable.app/privacy" },
    ],
    links: [{ rel: "canonical", href: "https://tas-heel.lovable.app/privacy" }],
  }),
  component: () => (
    <article className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-3xl prose-rtl">
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
  ),
});
