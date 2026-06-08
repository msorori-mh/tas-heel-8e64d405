import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/data-deletion")({
  head: () => ({
    meta: [
      { title: "حذف البيانات — تنوير" },
      { name: "description", content: "كيف تطلب حذف حسابك وبياناتك من منصة تنوير، والمدة المتوقعة لمعالجة الطلب." },
      { property: "og:title", content: "حذف البيانات — تنوير" },
      { property: "og:description", content: "كيف تطلب حذف حسابك وبياناتك من منصة تنوير، والمدة المتوقعة لمعالجة الطلب." },
      { property: "og:url", content: "https://tas-heel.lovable.app/data-deletion" },
    ],
    links: [{ rel: "canonical", href: "https://tas-heel.lovable.app/data-deletion" }],
  }),
  component: () => (
    <article className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <Link to="/" className="text-sm text-muted-foreground">→ الرئيسية</Link>
        <h1 className="mt-3 text-3xl font-bold">حذف البيانات</h1>
        <p className="mt-4 text-muted-foreground">
          لطلب حذف حسابك وكل بياناتك من منصة "تنوير"، أرسل بريداً إلكترونياً من البريد
          المسجّل في حسابك إلى:
        </p>
        <p className="mt-3">
          <a href="mailto:support@studentamkeen.com" className="text-primary text-lg">
            support@studentamkeen.com
          </a>
        </p>
        <p className="mt-4 text-muted-foreground">
          سنعالج الطلب خلال 7 أيام عمل ونؤكّد الحذف عبر البريد. بعد الحذف، لا يمكن
          استرجاع البيانات.
        </p>
      </div>
    </article>
  ),
});
