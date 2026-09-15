import React from "react";
import { createRoot } from "react-dom/client";
import { LessonCapabilityTabs } from "@/components/lessons/LessonCapabilityTabs";
import {
  LESSON_CAPABILITY_LABEL_AR,
  type LessonCapability,
  type LessonCapabilityType,
} from "@/lib/lessons/lesson-capabilities";
import "../../../src/styles.css";
const types: LessonCapabilityType[] = [
  "PRIMARY_CONTENT",
  "EXPLANATION",
  "SUMMARY",
  "MINDMAP",
  "PRACTICAL",
  "OFFICIAL_QUESTIONS",
  "SELF_TEST",
];
const actions = types.map((type) => ({
  type,
  label: LESSON_CAPABILITY_LABEL_AR[type],
  description: "TEST_ONLY محتوى تجريبي لفحص التنقل",
  available: true,
  studentVisible: true,
  trackable: false,
  completed: false,
  count: 1,
  action: "فتح",
  source: "NONE",
})) as LessonCapability[];
createRoot(document.getElementById("root")!).render(
  <div className="student-theme min-h-screen bg-background" dir="rtl">
    <header className="sticky top-0 z-30 bg-card p-4">تمكين الطالب — TEST_ONLY</header>
    <main className="mx-auto max-w-[960px] px-4 pb-28">
      <h1 className="py-8 text-xl">الدرس 3: الحديد واستخلاصه — اختبار التنقل</h1>
      <LessonCapabilityTabs
        actions={actions}
        waitingForPrimary={false}
        renderBody={(capability) => (
          <div>
            <label>
              إجابتي <input aria-label={`إجابتي ${capability.type}`} className="border p-2" />
            </label>
            {Array.from({ length: 24 }, (_, i) => (
              <p className="py-8" key={i}>
                {capability.label} — الفقرة {i + 1}
              </p>
            ))}
          </div>
        )}
      />
    </main>
    <nav className="fixed inset-x-0 bottom-0 z-40 bg-card p-4 text-center">
      الرئيسية · موادي · الاختبارات · التقدم · حسابي
    </nav>
  </div>,
);
