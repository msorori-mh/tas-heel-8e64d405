// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { File as NodeFile } from "node:buffer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ publish: vi.fn(), upload: vi.fn(), verify: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/content-factory/lesson-component-publishing-v2.functions", () => ({
  getLessonComponentServerPublicationStatus: async () => [],
  correctLessonComponentV2Lab: api.publish,
  createLessonComponentV2Upload: api.upload,
  publishLessonComponentV2: api.publish,
  verifyLessonComponentV2Upload: api.verify,
}));
vi.mock("@/lib/content-codes/content-codes.functions", () => ({
  getContentCodeRegistry: async () => ({
    grades: [{ gradeSlug: "g12", nameAr: "الثالث الثانوي" }],
    tracks: [{ trackCode: "sanaa", nameAr: "صنعاء" }],
    subjects: [
      {
        subjectCode: "CHEM",
        name: "الكيمياء",
        gradeSlug: "g12",
        trackCodes: ["sanaa"],
        isOfficialCode: true,
      },
    ],
    units: [],
    lessons: [
      {
        lessonCode: "CHEM-IRON",
        subjectCode: "CHEM",
        unitCode: null,
        title: "الحديد",
        semester: 1,
        sortOrder: 1,
      },
    ],
  }),
}));
import { GoldenLessonPackageBuilder } from "../../src/components/admin/GoldenLessonPackageBuilder";
let host: HTMLDivElement, root: Root;
function artifact(capability: "selfTest" | "officialBookQuestions", code: string) {
  const fileName = capability === "selfTest" ? "self-test.json" : "lesson-activities.json";
  return {
    fileName,
    displayName: `${capability}.xlsx`,
    sha256: "a".repeat(64),
    rowCount: 1,
    file: new NodeFile(
      [
        JSON.stringify({
          capability,
          questions: [
            { question_code: code, question_text: `سؤال ${code}`, options: ["Fe", "Cu"] },
          ],
        }),
      ],
      fileName,
    ),
  };
}
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.setItem(
    "tamkeen:last-lesson-import-context",
    JSON.stringify({
      gradeSlug: "g12",
      trackCodes: ["sanaa"],
      subjectCode: "CHEM",
      lessonCode: "CHEM-IRON",
    }),
  );
  const draft = {
    lessonCode: "CHEM-IRON",
    uploads: {
      selfTest: artifact("selfTest", "ST-1"),
      officialBookQuestions: artifact("officialBookQuestions", "BOOK-1"),
    },
    answerSets: {
      selfTest: [
        {
          capability: "selfTest",
          question_id: "ST-1",
          correct_index: 1,
          explanation: "تعليل الاختبار",
        },
      ],
      officialBookQuestions: [
        {
          capability: "officialBookQuestions",
          question_id: "BOOK-1",
          correct_index: 2,
          model_answer: "Cu",
        },
      ],
    },
    answersCompanion: null,
    savedAt: "2026-10-10T23:00:00Z",
  };
  // A restored draft exercises the real builder wiring without network or DB writes.
  vi.stubGlobal("indexedDB", {
    open: () => {
      const request: Record<string, unknown> = {};
      queueMicrotask(() => {
        request.result = {
          transaction: () => ({
            objectStore: () => ({
              get: () => {
                const read: Record<string, unknown> = { result: draft };
                queueMicrotask(() => (read.onsuccess as () => void)?.());
                return read;
              },
            }),
          }),
          close: () => {},
        };
        (request.onsuccess as () => void)?.();
      });
      return request;
    },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<GoldenLessonPackageBuilder />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  localStorage.clear();
  vi.unstubAllGlobals();
});
it.each([
  ["officialBookQuestions", "معاينة أسئلة الكتاب", "BOOK-1", "Cu"],
  ["selfTest", "معاينة اختبر فهمك", "ST-1", "تعليل الاختبار"],
])(
  "opens the %s preview from its actual upload card, including a restored draft",
  async (capability, title, code, answer) => {
    const card = host.querySelector(`#golden-capability-${capability}`)!;
    const preview = [...card.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "معاينة",
    );
    expect(preview).toBeTruthy();
    await act(async () => preview!.click());
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain(title);
    expect(dialog.textContent).toContain(code);
    expect(dialog.textContent).toContain(answer);
    expect(api.upload).not.toHaveBeenCalled();
    expect(api.verify).not.toHaveBeenCalled();
    expect(api.publish).not.toHaveBeenCalled();
    const close = [...dialog.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "إغلاق المعاينة",
    )!;
    await act(async () => close.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(card.textContent).toContain("ملف الدفعة جاهز");
  },
);
