export type ProgramImportBundle = {
  schemaVersion?: number;
  bundleType: "NEW_PROGRAM" | "NEW_SUBJECT_PROGRAM";
  metadata: {
    title: string;
    summary: string;
    detailedDescription: string;
    objectives: string[];
    prerequisites: string[];
    instructions: string[];
    audienceType: "ALL_TEACHERS" | "SUBJECT_SPECIFIC";
    subjectCode?: string;
    estimatedMinutes: number;
  };
  lessons: Array<{
    title: string;
    durationMinutes: number;
    sections: {
      objective: string;
      introduction: string;
      content: string;
      example: string;
      activity: string;
      summary: string;
    };
  }>;
  assessment: {
    title: string;
    passPercentage: number;
    questions: Array<{
      questionText: string;
      options: [string, string, string, string];
      correctOption: "a" | "b" | "c" | "d";
    }>;
  };
  liveSessionPlan?: unknown;
};

type JsonObject = Record<string, unknown>;

function objectOf(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}: يجب أن تكون القيمة كائن JSON.`);
  }
  return value as JsonObject;
}

function stringOf(value: unknown, label: string, minimum: number, maximum: number): string {
  if (typeof value !== "string" || value.trim().length < minimum || value.trim().length > maximum) {
    throw new Error(`${label}: يجب أن يكون النص بين ${minimum} و${maximum} حرفًا.`);
  }
  return value.trim();
}

function integerOf(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`${label}: يجب أن يكون رقمًا صحيحًا بين ${minimum} و${maximum}.`);
  }
  return Number(value);
}

function stringArrayOf(
  value: unknown,
  label: string,
  minimumItems: number,
  maximumItems: number,
): string[] {
  if (!Array.isArray(value) || value.length < minimumItems || value.length > maximumItems) {
    throw new Error(
      `${label}: يجب أن تحتوي القائمة على ${minimumItems} إلى ${maximumItems} عناصر.`,
    );
  }
  return value.map((item, index) => stringOf(item, `${label} (${index + 1})`, 2, 500));
}

export function validateProgramImportBundle(
  input: unknown,
  activeSubjectCodes: ReadonlySet<string>,
): ProgramImportBundle {
  const root = objectOf(input, "الملف");
  if (root.bundleType !== "NEW_PROGRAM" && root.bundleType !== "NEW_SUBJECT_PROGRAM") {
    throw new Error("نوع الحزمة يجب أن يكون NEW_PROGRAM أو NEW_SUBJECT_PROGRAM.");
  }

  const metadataInput = objectOf(root.metadata, "بيانات البرنامج");
  const audienceType = metadataInput.audienceType;
  if (audienceType !== "ALL_TEACHERS" && audienceType !== "SUBJECT_SPECIFIC") {
    throw new Error("جمهور البرنامج يجب أن يكون جميع المعلمين أو مادة واحدة.");
  }
  const subjectCode =
    typeof metadataInput.subjectCode === "string" ? metadataInput.subjectCode.trim() : "";
  if (audienceType === "ALL_TEACHERS" && subjectCode) {
    throw new Error("البرنامج العام لا يقبل رمز مادة.");
  }
  if (audienceType === "SUBJECT_SPECIFIC" && !activeSubjectCodes.has(subjectCode)) {
    throw new Error("رمز المادة غير موجود ضمن المواد النشطة.");
  }

  if (!Array.isArray(root.lessons) || root.lessons.length < 1 || root.lessons.length > 100) {
    throw new Error("يجب أن يحتوي البرنامج على 1 إلى 100 درس.");
  }
  const sectionKeys = [
    "objective",
    "introduction",
    "content",
    "example",
    "activity",
    "summary",
  ] as const;
  const lessons = root.lessons.map((item, lessonIndex) => {
    const lesson = objectOf(item, `الدرس ${lessonIndex + 1}`);
    const sectionsInput = objectOf(lesson.sections, `أقسام الدرس ${lessonIndex + 1}`);
    const sections = Object.fromEntries(
      sectionKeys.map((key) => [
        key,
        stringOf(sectionsInput[key], `قسم ${key} في الدرس ${lessonIndex + 1}`, 1, 20_000),
      ]),
    ) as ProgramImportBundle["lessons"][number]["sections"];
    return {
      title: stringOf(lesson.title, `عنوان الدرس ${lessonIndex + 1}`, 2, 180),
      durationMinutes: integerOf(lesson.durationMinutes, `مدة الدرس ${lessonIndex + 1}`, 1, 1440),
      sections,
    };
  });

  const assessmentInput = objectOf(root.assessment, "التقييم");
  if (
    !Array.isArray(assessmentInput.questions) ||
    assessmentInput.questions.length < 1 ||
    assessmentInput.questions.length > 200
  ) {
    throw new Error("يجب أن يحتوي التقييم على 1 إلى 200 سؤال.");
  }
  const questions = assessmentInput.questions.map((item, questionIndex) => {
    const question = objectOf(item, `السؤال ${questionIndex + 1}`);
    if (!Array.isArray(question.options) || question.options.length !== 4) {
      throw new Error(`السؤال ${questionIndex + 1}: يجب توفير أربعة خيارات بالضبط.`);
    }
    if (!["a", "b", "c", "d"].includes(String(question.correctOption))) {
      throw new Error(`السؤال ${questionIndex + 1}: الإجابة الصحيحة غير صالحة.`);
    }
    return {
      questionText: stringOf(question.questionText, `نص السؤال ${questionIndex + 1}`, 3, 2000),
      options: question.options.map((option, optionIndex) =>
        stringOf(option, `الخيار ${optionIndex + 1} في السؤال ${questionIndex + 1}`, 1, 1000),
      ) as [string, string, string, string],
      correctOption: question.correctOption as "a" | "b" | "c" | "d",
    };
  });

  return {
    ...(typeof root.schemaVersion === "number" ? { schemaVersion: root.schemaVersion } : {}),
    bundleType: root.bundleType,
    metadata: {
      title: stringOf(metadataInput.title, "اسم البرنامج", 3, 180),
      summary: stringOf(metadataInput.summary, "الوصف المختصر", 10, 600),
      detailedDescription: stringOf(metadataInput.detailedDescription, "الوصف التفصيلي", 50, 5000),
      objectives: stringArrayOf(metadataInput.objectives, "الأهداف", 1, 12),
      prerequisites: stringArrayOf(metadataInput.prerequisites, "المتطلبات", 0, 12),
      instructions: stringArrayOf(metadataInput.instructions, "التعليمات", 1, 12),
      audienceType,
      ...(subjectCode ? { subjectCode } : {}),
      estimatedMinutes: integerOf(metadataInput.estimatedMinutes, "مدة البرنامج", 1, 100_000),
    },
    lessons,
    assessment: {
      title: stringOf(assessmentInput.title, "عنوان التقييم", 2, 180),
      passPercentage: integerOf(assessmentInput.passPercentage, "نسبة الاجتياز", 1, 100),
      questions,
    },
    ...(root.liveSessionPlan === undefined ? {} : { liveSessionPlan: root.liveSessionPlan }),
  };
}
