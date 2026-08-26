import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "شروط الاستخدام — تمكين" },
      {
        name: "description",
        content:
          "شروط استخدام منصة تمكين: الاشتراكات، الحسابات، مسؤولية بيانات الدفع، وسياسة المحتوى.",
      },
      { property: "og:title", content: "شروط الاستخدام — تمكين" },
      {
        property: "og:description",
        content:
          "شروط استخدام منصة تمكين: الاشتراكات، الحسابات، مسؤولية بيانات الدفع، وسياسة المحتوى.",
      },
      { property: "og:url", content: "https://tas-heel.lovable.app/terms" },
    ],
    links: [{ rel: "canonical", href: "https://tas-heel.lovable.app/terms" }],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <article className="min-h-screen bg-background px-4 py-10" dir="rtl">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link to="/" className="text-sm text-muted-foreground">
          → الرئيسية
        </Link>
        <header>
          <h1 className="text-3xl font-bold">شروط الاستخدام</h1>
          <p className="mt-2 text-xs text-muted-foreground">آخر تحديث: يونيو 2026</p>
        </header>

        <p className="text-muted-foreground">
          باستخدامك منصة "تمكين"، فإنك توافق على الالتزام بهذه الشروط. المنصة مخصّصة لطلاب الثانوية
          في اليمن لأغراض تعليمية شخصية.
        </p>

        <section>
          <h2 className="text-xl font-semibold">1. الحسابات</h2>
          <ul className="mt-2 list-disc space-y-1 pr-6 text-muted-foreground">
            <li>الحساب شخصي. ممنوع مشاركته أو بيعه.</li>
            <li>
              أنت مسؤول عن صحة بياناتك (الاسم، الصف، المحافظة، المسار) وعن المحافظة على كلمة المرور.
            </li>
            <li>يحق لنا تعليق أو إنهاء أي حساب يخالف هذه الشروط أو يُستخدم لإساءة الخدمة.</li>
            <li>
              يمكنك حذف حسابك في أي وقت من{" "}
              <Link to="/settings" className="text-primary">
                الإعدادات
              </Link>
              .
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">2. الاشتراكات والمدفوعات</h2>
          <ul className="mt-2 list-disc space-y-1 pr-6 text-muted-foreground">
            <li>تُفعَّل الاشتراكات بعد مراجعة طلب الدفع وسند الحوالة من فريق الإدارة.</li>
            <li>
              مدة الاشتراك محددة عند الشراء، وينتهي تلقائيًا عند انقضاء المدة دون تجديد تلقائي.
            </li>
            <li>
              أنت المسؤول عن صحة بيانات الحوالة (المبلغ، رقم العملية، اسم المرسل، التاريخ). الإدخال
              الخاطئ قد يؤخّر التفعيل.
            </li>
            <li>
              المبالغ المدفوعة لا تُسترد بعد التفعيل، إلا في حالات يحددها فريق الدعم وفق سياسة
              الاسترداد.
            </li>
            <li>
              قد تُحوَّل بعض المدفوعات إلى المحفظة الداخلية كرصيد خدمة، وهي ليست عملة قابلة للسحب
              نقدًا.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">3. سياسة المحتوى</h2>
          <ul className="mt-2 list-disc space-y-1 pr-6 text-muted-foreground">
            <li>
              المحتوى الدراسي (الدروس، الأسئلة، الاختبارات، الموارد) ملك لمنصة تمكين، يُستخدم
              للأغراض التعليمية الشخصية فقط.
            </li>
            <li>
              ممنوع نسخ المحتوى أو إعادة نشره أو بيعه أو استخدامه في تطبيقات أخرى دون إذن خطي.
            </li>
            <li>
              التعليقات أو المساهمات من المستخدمين يجب أن تكون محترمة وذات صلة بالمادة الدراسية.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">4. الاستخدام المسموح</h2>
          <p className="mt-2 text-muted-foreground">يُمنع:</p>
          <ul className="mt-2 list-disc space-y-1 pr-6 text-muted-foreground">
            <li>محاولة اختراق المنصة أو الوصول لبيانات مستخدمين آخرين.</li>
            <li>استخدام أدوات آلية لاستخراج المحتوى (Scraping).</li>
            <li>الإساءة لأي مستخدم أو نشر محتوى مخالف للقانون أو الآداب.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold">5. حدود المسؤولية</h2>
          <p className="mt-2 text-muted-foreground">
            نسعى لتوفير خدمة مستقرة، لكن لا نضمن خلوّها من الانقطاع أو الأخطاء. المحتوى التعليمي
            مرجعي ولا يُغني عن المنهج الرسمي أو المعلم.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold">6. تعديل الشروط</h2>
          <p className="mt-2 text-muted-foreground">
            قد نُحدّث هذه الشروط من وقت لآخر. سنُعلم المستخدمين بالتغييرات الجوهرية. الاستمرار في
            الاستخدام بعد التحديث يعني الموافقة.
          </p>
        </section>

        <p className="text-xs text-muted-foreground">
          للاستفسار:{" "}
          <a href="mailto:support@studentamkeen.com" className="text-primary">
            support@studentamkeen.com
          </a>{" "}
          · راجع أيضًا{" "}
          <Link to="/privacy" className="text-primary">
            سياسة الخصوصية
          </Link>
          .
        </p>
      </div>
    </article>
  );
}
