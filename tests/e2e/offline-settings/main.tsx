import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { OfflineContentSettings } from "@/components/offline/OfflineContentSettings";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { readOfflineLessonContent } from "@/lib/offline/offline-lesson-content";
import "../../../src/styles.css";
function Fixture() {
  const [body, setBody] = useState("");
  return (
    <main dir="rtl" className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-xl font-bold">الإعدادات</h1>
      <Accordion type="single" collapsible defaultValue="offline">
        <AccordionItem value="offline" className="rounded-2xl border bg-card px-4">
          <AccordionTrigger>المحتوى دون إنترنت</AccordionTrigger>
          <AccordionContent>
            <OfflineContentSettings />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <Button
        onClick={async () => {
          const content = await readOfflineLessonContent("student-a", "lesson-one");
          setBody(content?.officialBook?.body ?? "لم يُحفظ الدرس");
        }}
      >
        فتح درس محفوظ
      </Button>
      <article aria-label="محتوى الدرس" dangerouslySetInnerHTML={{ __html: body }} />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
