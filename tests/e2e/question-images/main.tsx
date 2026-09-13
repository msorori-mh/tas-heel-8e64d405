import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { QuestionFigure } from "@/components/lessons/QuestionFigure";
import { convertQuestionWorkbook } from "@/lib/content-factory/golden-lesson-xlsx";
import "../../../src/styles.css";
type ImportedQuestion = {
  id: string;
  question_text: string;
  question_image?: unknown;
  options: string[];
};
export function Fixture() {
  const [rows, setRows] = useState<ImportedQuestion[]>([]),
    [error, setError] = useState(""),
    [choice, setChoice] = useState("");
  return (
    <main dir="rtl" className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-xl font-bold">تقويم الوحدة</h1>
      <label>
        استيراد أسئلة الدرس
        <input
          aria-label="ملف الأسئلة"
          className="block w-full min-w-0 text-sm"
          type="file"
          accept=".xlsx"
          onChange={async (e) => {
            try {
              setError("");
              const result = await convertQuestionWorkbook("selfTest", e.target.files![0]);
              setRows(JSON.parse(await result.publicFile.text()).questions);
            } catch (e) {
              setError(String(e));
            }
          }}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {rows.map((q, i) => (
        <section key={q.id} className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 font-semibold">
            س{i + 1}: {q.question_text}
          </h2>
          <QuestionFigure image={q.question_image} />
          <div className="grid gap-2">
            {q.options.map((o: string, j: number) => (
              <button
                key={j}
                type="button"
                className="min-h-11 rounded-md border p-2"
                aria-pressed={choice === q.id + j}
                onClick={() => setChoice(q.id + j)}
              >
                {o}
              </button>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
