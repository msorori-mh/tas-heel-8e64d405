import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "سياسة الخصوصية — تمكين" },
      {
        name: "description",
        content:
          "كيف تجمع منصة تمكين بيانات طلاب الثانوية في اليمن وتحميها، ومزودو الخدمات، وحقوق الوصول والحذف.",
      },
      { property: "og:title", content: "سياسة الخصوصية — تمكين" },
      {
        property: "og:description",
        content:
          "كيف تجمع منصة تمكين بيانات طلاب الثانوية في اليمن وتحميها، ومزودو الخدمات، وحقوق الوصول والحذف.",
      },
      { property: "og:url", content: "https://studentamkeen.com/privacy" },
    ],
    links: [{ rel: "canonical", href: "https://studentamkeen.com/privacy" }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <article className="min-h-screen bg-background px-4 py-10" dir="rtl">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link to="/" className="text-sm text-muted-foreground">
          → الرئيسية
        </Link>
        <header>
          <h1 className="text-3xl font-bold">سياسة الخصوصية</h1>
          <p className="mt-2 text-xs text-muted-foreground">آخر تحديث: يونيو 2026</p>
        </header>

        <p className="text-muted-foreground">
          نحن في "تمكين" نحترم خصوصية مستخدمينا، ونلتزم بجمع الحد الأدنى من البيانات اللازم لتقديم
          الخدمة. هذه السياسة توضّح ما نجمعه ولماذا، ومن يصل إليه، وكيف تتحكم به.
        </p>

        <section>
          <h2 className="text-xl font-semibold">1. البيانات التي نجمعها</h2>
          <ul className="mt-2 list-disc space-y-1 pr-6 text-muted-foreground">
            <li>
              <strong className="text-foreground">بيانات الحساب:</strong> الاسم الكامل، البريد
              الإلكتروني، كلمة المرور (مشفّرة)، رقم الهاتف (إن أُدخل اختياريًا).
            </li>
            <li>
              <strong className="text-foreground">البيانات الأكاديمية:</strong> الصف الدراسي،
              المحافظة، المسار (علمي/أدبي)، اسم المدرسة، وتقدّم الدروس والاختبارات.
            </li>
            <li>
              <strong className="text-foreground">بيانات الدفع:</strong> طلبات الاشتراك، رصيد
              المحفظة، سجل المعاملات الداخلية. لا نخزّن أرقام بطاقات بنكية.
            </li>
            <li>
              <strong className="text-foreground">صور سندات الحوالة:</strong> صور التحويلات البنكية
              التي ترفعها لتأكيد الاشتراك، تُحفظ في تخزين خاص مرتبط بحسابك ولا يصل إليه غيرك سوى
              فريق الإدارة لمراجعة الدفع.
            </li>
            <li>
              <strong className="text-foreground">سجلات تقنية محدودة:</strong> معلومات أمنية أساسية
              كوقت تسجيل الدخول، لاكتشاف إساءة الاستخدام.
            </li>
          </ul>
          <p className="mt-3 text-muted-foreground">
            لا نجمع موقعك الجغرافي عبر GPS، ولا معرّفات الإعلانات، ولا قوائم جهات الاتصال، ولا أي
            بيانات من خارج المنصة.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">2. استخدام التحليل الآلي (OCR)</h2>
          <p className="mt-2 text-muted-foreground">
            عند رفع صورة سند حوالة، قد نُمرّرها إلى نموذج ذكاء اصطناعي (Gemini عبر بوابة Lovable AI)
            لاستخراج بيانات الحوالة تلقائيًا (اسم المرسل، رقم العملية، المبلغ، التاريخ). الهدف:
            تسريع الإدخال وتقليل الأخطاء.
          </p>
          <ul className="mt-2 list-disc space-y-1 pr-6 text-muted-foreground">
            <li>النتائج تظهر لك للمراجعة قبل الإرسال — أنت المسؤول عن صحتها.</li>
            <li>لا تُستخدم صور السندات لتدريب نماذج الذكاء الاصطناعي.</li>
            <li>التحليل اختياري عمليًا — يمكنك تعديل أي حقل يدويًا.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">3. مزودو الخدمات</h2>
          <p className="mt-2 text-muted-foreground">
            نعتمد على المزودين التاليين فقط لتشغيل المنصة:
          </p>
          <ul className="mt-2 list-disc space-y-1 pr-6 text-muted-foreground">
            <li>
              <strong className="text-foreground">Supabase</strong> — قاعدة البيانات، المصادقة،
              وتخزين صور السندات.
            </li>
            <li>
              <strong className="text-foreground">Lovable AI Gateway (Gemini)</strong> — تحليل صور
              سندات الدفع تلقائيًا.
            </li>
            <li>
              <strong className="text-foreground">Cloudflare</strong> — استضافة التطبيق وتسريع
              الوصول.
            </li>
          </ul>
          <p className="mt-2 text-muted-foreground">
            لا نشارك بياناتك مع جهات إعلانية أو تسويقية. ولا نبيع أي بيانات.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">4. المستخدمون القُصّر</h2>
          <p className="mt-2 text-muted-foreground">
            تمكين منصة موجّهة لطلاب المرحلة الثانوية، وقد يكون بعضهم دون سن الثامنة عشرة. نلتزم بما
            يلي:
          </p>
          <ul className="mt-2 list-disc space-y-1 pr-6 text-muted-foreground">
            <li>لا نجمع من القاصرين أي بيانات غير ضرورية للخدمة التعليمية.</li>
            <li>
              إذا كانت قوانين بلدك تشترط موافقة ولي الأمر لاستخدام خدمات إلكترونية، فإن استخدامك
              للمنصة يعني الحصول على هذه الموافقة.
            </li>
            <li>ولي الأمر يستطيع طلب الاطلاع على بيانات ابنه/ابنته أو حذفها عبر التواصل معنا.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">5. مدة الاحتفاظ بالبيانات</h2>
          <ul className="mt-2 list-disc space-y-1 pr-6 text-muted-foreground">
            <li>
              بيانات الحساب والتقدم الأكاديمي: تُحفظ ما دام الحساب نشطًا، وتُحذف عند طلبك حذف
              الحساب.
            </li>
            <li>
              صور السندات وطلبات الدفع: تُحفظ مدة الاشتراك أو حتى 12 شهرًا لأغراض المحاسبة
              والمراجعة، أيهما أطول.
            </li>
            <li>
              سجلات التدقيق المجهولة (Audit logs): قد تبقى لفترة محدودة بعد الحذف لأسباب أمنية
              وقانونية، بدون ربطها بهويتك.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">6. حقوقك</h2>
          <ul className="mt-2 list-disc space-y-1 pr-6 text-muted-foreground">
            <li>
              <strong className="text-foreground">الاطلاع والتعديل:</strong> من صفحة الحساب داخل
              التطبيق.
            </li>
            <li>
              <strong className="text-foreground">حذف الحساب ذاتيًا:</strong> عبر الإعدادات →{" "}
              <Link to="/settings" className="text-primary">
                حذف الحساب
              </Link>
              .
            </li>
            <li>
              <strong className="text-foreground">طلب نسخة من بياناتك</strong> أو الاستفسار: عبر{" "}
              <a href="mailto:support@studentamkeen.com" className="text-primary">
                support@studentamkeen.com
              </a>
              .
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">7. الأمان</h2>
          <p className="mt-2 text-muted-foreground">
            نستخدم تشفير الاتصال (HTTPS)، تشفير كلمات المرور، وسياسات وصول صارمة (Row-Level
            Security) تضمن أن كل مستخدم يرى بياناته فقط. ومع ذلك، لا يوجد نظام آمن بنسبة 100%، ونوصي
            بحماية كلمة مرورك وعدم مشاركة الحساب.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">8. تحديث هذه السياسة</h2>
          <p className="mt-2 text-muted-foreground">
            قد نُحدّث هذه السياسة. سنُعلمك بالتغييرات الجوهرية داخل التطبيق أو عبر البريد. الاستمرار
            في استخدام المنصة بعد التحديث يعني موافقتك على النسخة الجديدة.
          </p>
        </section>

        <p className="text-xs text-muted-foreground">
          لأي استفسار حول الخصوصية:{" "}
          <a href="mailto:support@studentamkeen.com" className="text-primary">
            support@studentamkeen.com
          </a>
        </p>
      </div>
    </article>
  );
}
