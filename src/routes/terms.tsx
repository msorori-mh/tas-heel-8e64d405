import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "شروط الاستخدام — تنوير" }] }),
  component: () => (
    <article className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <Link to="/" className="text-sm text-muted-foreground">→ الرئيسية</Link>
        <h1 className="mt-3 text-3xl font-bold">شروط الاستخدام</h1>
        <p className="mt-4 text-muted-foreground">
          باستخدامك منصة "تنوير"، فإنك توافق على الالتزام بهذه الشروط. المنصة مخصّصة
          لطلاب الثانوية في اليمن لأغراض تعليمية شخصية.
        </p>
        <h2 className="mt-6 text-xl font-semibold">الاستخدام المسموح</h2>
        <p className="mt-2 text-muted-foreground">
          لا يُسمح بإعادة نشر المحتوى أو بيعه أو مشاركة الحساب مع أشخاص آخرين. أي
          استخدام مخالف قد يؤدي إلى إيقاف الحساب.
        </p>
        <h2 className="mt-6 text-xl font-semibold">الاشتراكات</h2>
        <p className="mt-2 text-muted-foreground">
          الاشتراكات مدفوعة وتنتهي حسب المدة المختارة. تُحفظ المدفوعات في محفظتك ضمن
          المنصة.
        </p>
        <p className="mt-6 text-muted-foreground">
          للاستفسار:{" "}
          <a href="mailto:support@studentamkeen.com" className="text-primary">support@studentamkeen.com</a>
        </p>
      </div>
    </article>
  ),
});
