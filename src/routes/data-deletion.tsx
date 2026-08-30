import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/data-deletion")({
  head: () => ({
    meta: [
      { title: "حذف البيانات — تمكين" },
      {
        name: "description",
        content: "كيف تحذف حسابك وبياناتك ذاتيًا من منصة تمكين، وما يُحذف وما قد يُحتفظ به.",
      },
      { property: "og:title", content: "حذف البيانات — تمكين" },
      {
        property: "og:description",
        content: "كيف تحذف حسابك وبياناتك ذاتيًا من منصة تمكين، وما يُحذف وما قد يُحتفظ به.",
      },
      {
        property: "og:url",
        content: "https://studentamkeen.com/data-deletion",
      },
    ],
    links: [{ rel: "canonical", href: "https://studentamkeen.com/data-deletion" }],
  }),
  component: DataDeletionPage,
});

function DataDeletionPage() {
  return (
    <article className="min-h-screen bg-background px-4 py-10" dir="rtl">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link to="/" className="text-sm text-muted-foreground">
          → الرئيسية
        </Link>
        <header>
          <h1 className="text-3xl font-bold">حذف البيانات</h1>
          <p className="mt-2 text-xs text-muted-foreground">آخر تحديث: يونيو 2026</p>
        </header>

        <section>
          <h2 className="text-xl font-semibold">1. الحذف الذاتي (الأسرع)</h2>
          <p className="mt-2 text-muted-foreground">
            يمكنك حذف حسابك في أي وقت بنفسك من داخل التطبيق:
          </p>
          <ol className="mt-2 list-decimal space-y-1 pr-6 text-muted-foreground">
            <li>سجّل الدخول إلى حسابك.</li>
            <li>
              انتقل إلى{" "}
              <Link to="/settings" className="text-primary">
                الإعدادات
              </Link>{" "}
              → منطقة الخطر → "حذف الحساب".
            </li>
            <li>
              أكّد كلمة المرور واكتب <span className="font-mono">DELETE</span>.
            </li>
            <li>سيُحذف حسابك فورًا.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-xl font-semibold">2. ما الذي يُحذف</h2>
          <ul className="mt-2 list-disc space-y-1 pr-6 text-muted-foreground">
            <li>الملف الشخصي (الاسم، البريد، الصف، المحافظة، الهاتف…).</li>
            <li>التقدم الدراسي، نتائج الاختبارات، محاولات التمرين.</li>
            <li>الاشتراكات، رصيد المحفظة، معاملاتها.</li>
            <li>طلبات الدفع وصور سندات الحوالة.</li>
            <li>الشهادات، الشارات، نقاط الطالب.</li>
            <li>التعليقات والإشعارات.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">3. ما قد يُحتفظ به</h2>
          <p className="mt-2 text-muted-foreground">
            لأسباب قانونية ومحاسبية، قد نحتفظ بما يلي لفترة محدودة بعد الحذف، بدون ربطه بهويتك:
          </p>
          <ul className="mt-2 list-disc space-y-1 pr-6 text-muted-foreground">
            <li>
              سجلات تدقيق مجهولة (Audit logs): يُزال معرّفك منها فور الحذف، ويبقى السجل بدون هوية
              لمتابعة الأمان.
            </li>
            <li>ملخصات محاسبية مجمّعة (الإجماليات الشهرية)، بدون أي بيانات شخصية تخصك.</li>
            <li>
              نسخ احتياطية تقنية مشفّرة قد تحتوي بياناتك لمدة قصيرة قبل انتهاء دورة النسخ، ولا يصل
              إليها أحد إلا في حالات الطوارئ التقنية.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">4. حذف عبر البريد (بديل)</h2>
          <p className="mt-2 text-muted-foreground">
            إذا تعذّر عليك الوصول إلى حسابك، أرسل بريدًا من بريدك المسجّل إلى:
          </p>
          <p className="mt-2">
            <a href="mailto:support@studentamkeen.com" className="text-primary text-lg">
              support@studentamkeen.com
            </a>
          </p>
          <p className="mt-2 text-muted-foreground">
            سنعالج الطلب خلال 7 أيام عمل ونؤكّد الحذف عبر البريد.
          </p>
        </section>

        <p className="text-xs text-muted-foreground">
          راجع أيضًا{" "}
          <Link to="/privacy" className="text-primary">
            سياسة الخصوصية
          </Link>{" "}
          و
          <Link to="/terms" className="text-primary">
            {" "}
            شروط الاستخدام
          </Link>
          .
        </p>
      </div>
    </article>
  );
}
