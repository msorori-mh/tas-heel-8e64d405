import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "عن تنوير — منصة تعليمية لطلاب الثانوية في اليمن" },
      { name: "description", content: "تنوير منصة رقمية تعليمية متخصّصة لطلاب الثانوية في اليمن — دروس وملخصات وبنوك أسئلة حسب المنهج والمحافظة." },
      { property: "og:title", content: "عن تنوير — منصة تعليمية لطلاب الثانوية في اليمن" },
      { property: "og:description", content: "تنوير منصة رقمية تعليمية متخصّصة لطلاب الثانوية في اليمن — دروس وملخصات وبنوك أسئلة حسب المنهج والمحافظة." },
      { property: "og:url", content: "https://tas-heel.lovable.app/about" },
    ],
    links: [{ rel: "canonical", href: "https://tas-heel.lovable.app/about" }],
  }),
  component: () => (
    <article className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <Link to="/" className="text-sm text-muted-foreground">→ الرئيسية</Link>
        <h1 className="mt-3 text-3xl font-bold">عن تنوير</h1>
        <p className="mt-4 text-muted-foreground leading-loose">
          تنوير منصة تعليمية رقمية مخصّصة لطلاب الثانوية في اليمن. نُقدّم الدروس،
          الملخصات، بنوك الأسئلة، والاختبارات حسب المنهج الرسمي لكل محافظة. تركّز
          المنصة على الجوال أولاً، تعمل في ظروف الإنترنت الضعيف، وتدعم استمرار
          الدراسة دون انقطاع.
        </p>
        <p className="mt-4 text-muted-foreground">
          للتواصل:{" "}
          <a href="mailto:support@studentamkeen.com" className="text-primary">support@studentamkeen.com</a>
        </p>
      </div>
    </article>
  ),
});
