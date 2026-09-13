import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { convertQuestionWorkbook } from "../../src/lib/content-factory/golden-lesson-xlsx.ts";
import { validateGoldenLessonArtifactBytes } from "../../src/lib/content-factory/golden-lesson-file-contract.ts";
import {
  parseQuestionImage,
  questionImageFromBytes,
} from "../../src/lib/lessons/question-image.ts";
import {
  parseOfflineAssessmentBundle,
  encodeOfflineAssessmentBundle,
} from "../../src/lib/offline/offline-assessment-contract.ts";
import {
  containsAnswerLeak,
  toPublicQuestion,
} from "../../src/lib/lessons/official-book-questions.ts";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
  "base64",
);
const image = questionImageFromBytes(png, "png", "دائرة كهربائية");
async function workbook(
  kind: "selfTest" | "officialBookQuestions" = "selfTest",
  tweak?: (w: ExcelJS.Workbook, s: ExcelJS.Worksheet) => void,
) {
  const w = new ExcelJS.Workbook();
  const s = w.addWorksheet(kind === "selfTest" ? "اختبر فهمك" : "أسئلة الكتاب الأصلية");
  s.addRow([
    "question_code",
    "subject_code",
    "lesson_code",
    "question_text",
    "option_1",
    "option_2",
    "option_3",
    "option_4",
    "correct_index",
    "explanation",
    "prompt_kind",
    "interaction_type",
    "grading_mode",
    "model_answer",
    "question_image",
    "question_image_alt",
  ]);
  s.addRow([
    "q1",
    "CHEM",
    "L1",
    "تأمل الشكل وأجب",
    "أ",
    "ب",
    "ج",
    "د",
    1,
    "تعليل سري",
    "اختيار_واحد",
    "SINGLE_CHOICE",
    "AUTO_SINGLE",
    "أ",
    "",
    "دائرة كهربائية",
  ]);
  s.addRow([
    "q2",
    "CHEM",
    "L1",
    "سؤال نصي",
    "أ",
    "ب",
    "ج",
    "د",
    2,
    "تعليل سري",
    "اختيار_واحد",
    "SINGLE_CHOICE",
    "AUTO_SINGLE",
    "ب",
    "",
    "",
  ]);
  const id = w.addImage({ base64: png.toString("base64"), extension: "png" });
  s.addImage(id, { tl: { col: 14, row: 1 }, ext: { width: 120, height: 80 } });
  tweak?.(w, s);
  return new File([new Uint8Array(await w.xlsx.writeBuffer())], "questions.xlsx");
}
for (const kind of ["selfTest", "officialBookQuestions"] as const) {
  test(kind + ": embedded figure belongs only to its row and never carries answers", async () => {
    const result = await convertQuestionWorkbook(kind, await workbook(kind));
    const body = JSON.parse(await result.publicFile.text());
    assert.equal(result.imageCount, 1);
    assert.equal(result.rowCount, 2);
    assert.deepEqual(body.questions[0].question_image, image);
    assert.equal(body.questions[1].question_image, undefined);
    assert.equal(containsAnswerLeak(body), false);
    assert.equal(result.answers.length, 2);
    assert.ok(!JSON.stringify(result.answers).includes("data:image"));
    assert.equal(
      validateGoldenLessonArtifactBytes(
        kind,
        result.publicFile.name,
        new Uint8Array(await result.publicFile.arrayBuffer()),
      ).valid,
      true,
    );
    assert.deepEqual(toPublicQuestion(body.questions[0]).questionImage, image);
  });
}
const failures: Array<[string, (w: ExcelJS.Workbook, s: ExcelJS.Worksheet) => void, RegExp]> = [
  [
    "missing description",
    (_, s) => {
      s.getCell("P2").value = "";
    },
    /وصف/,
  ],
  [
    "wrong column",
    (_, s) => {
      s.getImages()[0].range.tl.nativeCol = 13;
    },
    /question_image/,
  ],
  [
    "orphan image",
    (_, s) => {
      s.getImages()[0].range.tl.nativeRow = 20;
    },
    /صورة بلا سؤال/,
  ],
  [
    "duplicate images",
    (w, s) => {
      s.addImage(w.addImage({ base64: png.toString("base64"), extension: "png" }), {
        tl: { col: 14, row: 1 },
        ext: { width: 20, height: 20 },
      });
    },
    /صورتان/,
  ],
  [
    "description without figure",
    (_, s) => {
      s.getCell("P3").value = "صورة مفقودة";
    },
    /الصورة مفقودة/,
  ],
  [
    "external URL",
    (_, s) => {
      s.getCell("O2").value = "https://example.org/a.png";
    },
    /الروابط/,
  ],
  [
    "IMAGE formula",
    (_, s) => {
      s.getCell("O2").value = { formula: 'IMAGE("https://example.org/a.png")' };
    },
    /الروابط/,
  ],
  [
    "forged raster",
    (w) => {
      w.getImage(0).base64 = Buffer.from("<svg onload='alert(1)'/>").toString("base64");
    },
    /لا يطابق/,
  ],
  [
    "oversized raster",
    (w) => {
      w.getImage(0).base64 = Buffer.alloc(524289).toString("base64");
    },
    /512/,
  ],
];
for (const [name, tweak, message] of failures)
  test(name, async () => {
    await assert.rejects(
      () => workbook("selfTest", tweak).then((f) => convertQuestionWorkbook("selfTest", f)),
      message,
    );
  });
test("unsupported in-cell image parts fail explicitly", async () => {
  const f = await workbook();
  const zip = await JSZip.loadAsync(await f.arrayBuffer());
  zip.file("xl/richData/rdrichvalue.xml", "<rvData/>");
  const bytes = await zip.generateAsync({ type: "uint8array" });
  await assert.rejects(
    () => convertQuestionWorkbook("selfTest", new File([bytes], "questions.xlsx")),
    /داخل الخلية/,
  );
});
test("unsafe public JSON figure cannot bypass workbook checks", () => {
  for (const src of [
    "https://example.org/a.png",
    "javascript:alert(1)",
    "data:image/svg+xml;base64,PHN2Zy8+",
    "data:image/png;base64,SGVsbG8=",
  ]) {
    assert.throws(() => parseQuestionImage({ src, alt: "شكل" }));
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        questions: [{ id: "q", question: "س", question_image: { src, alt: "شكل" } }],
      }),
    );
    assert.equal(
      validateGoldenLessonArtifactBytes("officialBookQuestions", "lesson-activities.json", bytes)
        .valid,
      false,
    );
  }
  assert.throws(() => parseQuestionImage({ ...image, model_answer: "secret" }));
});
test("offline bundle preserves embedded bytes and rejects a substituted remote URL", () => {
  const bundle = {
    schemaVersion: 1 as const,
    kind: "official-questions" as const,
    lessonId: "lesson",
    questions: [
      {
        questionId: "q",
        revisionId: "r",
        questionText: "س",
        questionImage: image,
        questionType: "LONG_TEXT",
        sortOrder: 0,
        options: [],
        modelAnswer: "نموذج",
        explanation: null,
        correctOptionIds: [],
      },
    ],
  };
  const parsed = parseOfflineAssessmentBundle(encodeOfflineAssessmentBundle(bundle));
  assert.deepEqual(parsed.questions[0].questionImage, image);
  assert.throws(() =>
    encodeOfflineAssessmentBundle({
      ...bundle,
      questions: [
        { ...bundle.questions[0], questionImage: { src: "https://example.org/a.png", alt: "شكل" } },
      ],
    }),
  );
});
