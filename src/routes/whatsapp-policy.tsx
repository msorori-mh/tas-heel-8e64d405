import { createFileRoute, Link } from "@tanstack/react-router";
import PublicFooter from "@/components/PublicFooter";

export const Route = createFileRoute("/whatsapp-policy")({
  head: () => ({
    meta: [
      { title: "سياسة استخدام واتساب — تنوير" },
      { name: "description", content: "سياسة استخدام واتساب في منصة تنوير. نوضح كيف نتواصل عبر واتساب وكيف تحمي خصوصيتك." },
      { property: "og:title", content: "سياسة استخدام واتساب — تنوير" },
      { property: "og:description", content: "سياسة استخدام واتساب في منصة تنوير. نوضح كيف نتواصل عبر واتساب وكيف تحمي خصوصيتك." },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "/whatsapp-policy" }],
  }),
  component: () => (
    <div className="min-h-screen bg-background flex flex-col">
      <article className="flex-1 px-4 py-10">
        <div className="mx-auto max-w-3xl">
          <Link to="/" className="text-sm text-muted-foreground">→ الرئيسية</Link>
          <h1 className="mt-3 text-3xl font-bold">سياسة استخدام واتساب</h1>
          <p className="mt-4 text-muted-foreground">
            في "تنوير"، نستخدم واتساب كقناة تواصل اختيارية لإرسال إشعارات مهمة للمستخدمين
            — مثل تأكيد الاشتراك، تذكيرات الدراسة، والردود على الاستفسارات. نلتزم
            بسياسات Meta وWhatsApp Business API في جميع رسائلنا.
          </p>

          <h2 className="mt-6 text-xl font-semibold">نوع الرسائل التي نرسلها</h2>
          <ul className="mt-2 list-disc pr-6 space-y-1 text-muted-foreground">
            <li>رسائل تأكيد الاشتراك وتجديده.</li>
            <li>تذكيرات بالدروس والاختبارات المجدولة.</li>
            <li>ردود على استفسارات الدعم الفني.</li>
            <li>إشعارات أمنية (تغيير كلمة المرور، تسجيل دخول جديد).</li>
          </ul>

          <h2 className="mt-6 text-xl font-semibold">الالتزام بسياسات Meta</h2>
          <p className="mt-2 text-muted-foreground">
            لا نرسل رسائل غير مرغوب فيها (Spam). كل رسالة تتعلق باستخدامك المنصة
            مباشرة. نحصل على موافقتك الصريحة قبل إضافة رقمك لقائمة التواصل.
          </p>

          <h2 className="mt-6 text-xl font-semibold">إلغاء الاشتراك في الرسائل</h2>
          <p className="mt-2 text-muted-foreground">
            يمكنك إيقاف رسائل واتساب في أي وقت من إعدادات حسابك داخل المنصة، أو بإرسال
            كلمة "STOP" إلى الرقم الرسمي. سنوقف الرسائل فوراً دون تأخير.
          </p>

          <h2 className="mt-6 text-xl font-semibold">حماية البيانات</h2>
          <p className="mt-2 text-muted-foreground">
            رقم هاتفك يُخزن بشكل آمن ولا يُشارك مع أي طرف ثالث. نستخدمه فقط للتواصل
            المباشر معك عبر المنصة أو واتساب.
          </p>

          <h2 className="mt-6 text-xl font-semibold">أوقات الرد</h2>
          <p className="mt-2 text-muted-foreground">
            نهدف للرد على رسائل الدعم خلال 24 ساعة عمل. الرسائل التلقائية قد تُرسل
            خارج أوقات العمل.
          </p>

          <p className="mt-6 text-muted-foreground">
            للاستفسارات:{" "}
            <a href="mailto:support@studentamkeen.com" className="text-primary">support@studentamkeen.com</a>
          </p>
        </div>
      </article>
      <PublicFooter />
    </div>
  ),
});
