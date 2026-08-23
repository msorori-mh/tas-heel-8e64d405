import { validateHtmlAgainstProfile } from "../lessons/html-content-standard.ts";

export interface ConvertedLessonQuestionsHtml {
  publicFile: File;
  rowCount: number;
}

const QUESTION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/;

export async function convertLessonQuestionsHtml(file: File): Promise<ConvertedLessonQuestionsHtml> {
  if (!/\.html?$/i.test(file.name)) throw new Error("يُقبل ملف HTML المنظّم فقط.");
  const html = await file.text();
  const standard = validateHtmlAgainstProfile(html, { profile: "STATIC_EDUCATIONAL_HTML" });
  const firstError = standard.findings.find((finding) => finding.severity === "error");
  if (firstError) throw new Error(firstError.message);

  const document = new DOMParser().parseFromString(html, "text/html");
  const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-question-id]"));
  if (nodes.length === 0) {
    throw new Error('يجب أن يحتوي الملف سؤالًا واحدًا على الأقل بعنصر يحمل data-question-id="...".');
  }

  const seen = new Set<string>();
  const questions = nodes.map((node, index) => {
    const id = node.dataset.questionId?.trim() ?? "";
    if (!QUESTION_ID.test(id)) throw new Error(`السؤال ${index + 1}: معرّف data-question-id غير صالح.`);
    if (seen.has(id)) throw new Error(`معرّف السؤال مكرر: ${id}.`);
    seen.add(id);
    const prompt = node.querySelector<HTMLElement>("[data-question-text]")?.textContent?.trim()
      ?? node.textContent?.trim()
      ?? "";
    if (!prompt) throw new Error(`السؤال ${index + 1}: نص السؤال فارغ.`);
    return {
      id,
      question_number: id,
      official_text: prompt,
      question_text: prompt,
      question_type: "EXTENDED_RESPONSE",
      interaction_type: "LONG_TEXT",
      grading_mode: "SELF_REFLECTION",
      options: [],
      sort_order: index + 1,
    };
  });

  const publicFile = new File(
    [JSON.stringify({ capability: "officialBookQuestions", source_format: "STRUCTURED_HTML", questions })],
    "lesson-activities.json",
    { type: "application/json" },
  );
  return { publicFile, rowCount: questions.length };
}