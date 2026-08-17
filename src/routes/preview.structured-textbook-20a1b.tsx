import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { StructuredTextbookReader } from "@/components/lessons/StructuredTextbookReader";
import { PILOT_20A1B_DOCUMENT } from "@/lib/content/official-textbook/structured-blocks";

/**
 * TAMKEEN_STRUCTURED_TEXTBOOK_READER_PILOT_20A1B — visual review only.
 * Nothing here is published to students; the approved document is rendered
 * verbatim so the reader layout can be reviewed on mobile and desktop.
 */
export const Route = createFileRoute("/preview/structured-textbook-20a1b")({
  head: () => ({
    meta: [
      { title: "معاينة قارئ الكتاب الرسمي | تمكين" },
      {
        name: "description",
        content:
          "معاينة تصميم قارئ محتوى الكتاب الوزاري المنظم لدرس مكانة القرآن الكريم وكمال قدرة الله في تمكين.",
      },
      { property: "og:title", content: "معاينة قارئ الكتاب الرسمي | تمكين" },
      {
        property: "og:description",
        content: "مراجعة بصرية لقارئ محتوى الكتاب الوزاري المنظم داخل تمكين.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PreviewPage,
});

function PreviewPage() {
  const doc = PILOT_20A1B_DOCUMENT;
  return (
    <main dir="rtl" className="min-h-screen w-full overflow-x-hidden bg-background py-5">
      <div className="mx-auto w-full max-w-[900px] px-[14px] sm:px-4">
        <h1 className="mb-1 text-right text-[18px] font-extrabold text-foreground">
          {doc.detected_lesson_title}
        </h1>
        <p className="mb-4 text-right text-[12px] text-muted-foreground">
          {doc.detected_subject} — {doc.detected_semester} — {doc.detected_section}
        </p>

        <section className="rounded-2xl border border-border bg-card py-4 shadow-sm">
          <StructuredTextbookReader document={doc} />
        </section>

        <section className="mt-4 flex items-center gap-2 rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-3 text-right">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            نسخة الكتاب الأصلية (PDF) متاحة كمرجع اختياري فقط.
          </p>
        </section>
      </div>
    </main>
  );
}
