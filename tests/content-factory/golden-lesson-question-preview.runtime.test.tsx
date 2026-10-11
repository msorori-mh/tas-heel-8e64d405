// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { File as NodeFile } from "node:buffer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GoldenLessonQuestionPreview } from "../../src/components/admin/GoldenLessonQuestionPreview";

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const answers = [
  {
    capability: "selfTest",
    question_id: "Q-1",
    correct_index: 3,
    explanation: "لأن الحديد رمزه Fe",
  },
];
const payload = {
  capability: "selfTest",
  questions: [
    { question_code: "Q-1", question_text: "ما رمز الحديد؟", options: ["Cu", "Au", "Fe", "Ag"] },
  ],
};
async function open(
  capability: "selfTest" | "officialBookQuestions",
  body: unknown,
  answerRows = answers,
) {
  const onClose = vi.fn();
  await act(async () =>
    root.render(
      <GoldenLessonQuestionPreview
        capability={capability}
        file={new NodeFile([JSON.stringify(body)], "preview.json") as unknown as File}
        fileName="أسئلة.xlsx"
        lessonTitle="الكيمياء ← الحديد"
        answers={answerRows}
        onClose={onClose}
      />,
    ),
  );
  return onClose;
}
it("renders self-test choices, the actual correct option and rationale; closes without writes", async () => {
  const onClose = await open("selfTest", payload);
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.getAttribute("dir")).toBe("rtl");
  expect(dialog.textContent).toContain("معاينة اختبر فهمك");
  expect(dialog.textContent).toContain("عدد الأسئلة: 1");
  expect(dialog.textContent).toContain("لأن الحديد رمزه Fe");
  const options = [...dialog.querySelectorAll("ol li")];
  expect(options.map((li) => li.textContent?.includes("الإجابة الصحيحة"))).toEqual([
    false,
    false,
    true,
    false,
  ]);
  const close = [...dialog.querySelectorAll("button")].find(
    (b) => b.textContent === "إغلاق المعاينة",
  )!;
  await act(async () => close.click());
  expect(onClose).toHaveBeenCalledOnce();
});
it("renders book essay answers and treats uploaded markup as text", async () => {
  const markup = '<img src=x onerror="alert(1)">';
  await open(
    "officialBookQuestions",
    {
      capability: "officialBookQuestions",
      questions: [
        { question_code: "B-1", question_text: markup, interaction_type: "LONG_TEXT", options: [] },
      ],
    },
    [
      {
        capability: "officialBookQuestions",
        question_id: "B-1",
        model_answer: "الحديد عنصر فلزي",
        grading_mode: "MANUAL",
      },
    ],
  );
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain("معاينة أسئلة الكتاب");
  expect(dialog.textContent).toContain("إجابة مقالية");
  expect(dialog.textContent).toContain("الحديد عنصر فلزي");
  expect(dialog.textContent).toContain(markup);
  expect(dialog.querySelector("img")).toBeNull();
});
it("shows a useful failure when the artifact cannot be previewed", async () => {
  await open("selfTest", { questions: [] });
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("أعد اختيار ملف Excel");
  expect(document.querySelector("article")).toBeNull();
});
it("does not show stale questions if a file is replaced while its read is pending", async () => {
  let finish!: (value: string) => void;
  const slowFile = {
    text: () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  } as File;
  await act(async () =>
    root.render(
      <GoldenLessonQuestionPreview
        capability="selfTest"
        file={slowFile}
        fileName="old.xlsx"
        lessonTitle="درس قديم"
        answers={answers}
        onClose={() => {}}
      />,
    ),
  );
  await open(
    "officialBookQuestions",
    {
      capability: "officialBookQuestions",
      questions: [
        {
          question_code: "B-1",
          question_text: "سؤال جديد",
          interaction_type: "LONG_TEXT",
          options: [],
        },
      ],
    },
    [],
  );
  await act(async () => finish(JSON.stringify(payload)));
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("سؤال جديد");
  expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain("ما رمز الحديد؟");
});
