import { useState } from "react";
import { createRoot } from "react-dom/client";
import { GoldenLessonQuestionPreview } from "../../../src/components/admin/GoldenLessonQuestionPreview";
import "../../../src/styles.css";
import "@fontsource/cairo/arabic-400.css";
import "@fontsource/cairo/arabic-600.css";
const capability =
  new URLSearchParams(location.search).get("kind") === "book"
    ? "officialBookQuestions"
    : "selfTest";
const questions =
  capability === "selfTest"
    ? [
        {
          question_code: "CHEM-IRON-ST-01",
          question_text: "ما الرمز الكيميائي لعنصر الحديد؟",
          options: ["Cu", "Au", "Fe", "Ag"],
        },
        {
          question_code: "CHEM-IRON-ST-02",
          question_text: "أيّ مما يأتي يصف خاصية الحديد؟",
          options: [
            "غاز في درجة حرارة الغرفة",
            "فلز موصل للحرارة والكهرباء",
            "سائل عديم اللون",
            "غير قابل للمغنطة",
          ],
        },
      ]
    : [
        {
          question_code: "CHEM-IRON-BOOK-01",
          question_text: "عرّف عنصر الحديد، واذكر استخدامًا له في حياتنا اليومية.",
          interaction_type: "LONG_TEXT",
          options: [],
        },
        {
          question_code: "CHEM-IRON-BOOK-02",
          question_text: "اختر الرمز الكيميائي الصحيح لعنصر الحديد.",
          interaction_type: "SINGLE_CHOICE",
          options: ["Cu", "Fe", "Au", "Ag"],
        },
      ];
const answers =
  capability === "selfTest"
    ? [
        {
          capability,
          question_id: "CHEM-IRON-ST-01",
          correct_index: 3,
          explanation: "يرمز للحديد بالرمز Fe، بينما يرمز للنحاس بالرمز Cu.",
        },
        {
          capability,
          question_id: "CHEM-IRON-ST-02",
          correct_index: 2,
          explanation: "الحديد فلز؛ لذا فهو موصل للحرارة والكهرباء.",
        },
      ]
    : [
        {
          capability,
          question_id: "CHEM-IRON-BOOK-01",
          model_answer: "الحديد عنصر فلزي رمزه Fe، يستخدم في البناء وصناعة الأدوات.",
          grading_mode: "MANUAL",
        },
        {
          capability,
          question_id: "CHEM-IRON-BOOK-02",
          model_answer: "Fe",
          correct_index: 2,
          grading_mode: "AUTO_SINGLE",
          explanation: "Fe هو الرمز الكيميائي للحديد.",
        },
      ];
const file = new File([JSON.stringify({ capability, questions })], "preview.json", {
  type: "application/json",
});
export function Page() {
  const [open, setOpen] = useState(true);
  return (
    <main dir="rtl" className="p-6">
      <h1>مراجعة محتوى الدرس</h1>
      {open && (
        <GoldenLessonQuestionPreview
          capability={capability}
          file={file}
          fileName={
            capability === "selfTest" ? "اختبر فهمك - الحديد.xlsx" : "أسئلة الكتاب - الحديد.xlsx"
          }
          lessonTitle="الكيمياء ← الحديد"
          answers={answers}
          onClose={() => setOpen(false)}
        />
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Page />);
