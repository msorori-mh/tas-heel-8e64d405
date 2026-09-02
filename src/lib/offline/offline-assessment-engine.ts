/** OFFLINE-05 — verified local question read, reveal and grading engine. */

import { readOfflineArtifactBytes } from "./offline-artifact-cache";
import {
  parseOfflineAssessmentBundle,
  type OfflineAssessmentBundle,
  type OfflineOfficialQuestion,
  type OfflineQuestionOption,
  type OfflineSelfTestQuestion,
} from "./offline-assessment-contract";
import { verifyOfflineArtifact, type OfflinePackArtifact } from "./offline-pack-contract";
import { deviceOfflineStateRepository, type OfflineStateRepository } from "./offline-state-store";

export type OfflineStudentQuestion = {
  id: string;
  revisionId: string;
  questionText: string;
  questionType: string;
  sortOrder: number;
  options: OfflineQuestionOption[];
  savedAnswer: string | null;
  selectedOptionId: string | null;
  isCorrect: boolean | null;
};

export type OfflineOfficialReveal = {
  modelAnswer: string;
  explanation: string | null;
  correctOptionIds: string[];
};

export type OfflineSelfTestResult = {
  isCorrect: boolean;
  correctOptionId: string;
  explanation: string | null;
  correction: string | null;
};

export type OfflineLessonAssessment = {
  officialQuestions: OfflineStudentQuestion[];
  selfTestQuestions: OfflineStudentQuestion[];
  revealOfficialAnswer(
    questionId: string,
    revisionId: string,
    attempt: string,
  ): OfflineOfficialReveal;
  checkSelfTestAnswer(
    questionId: string,
    revisionId: string,
    selectedOptionId: string,
  ): OfflineSelfTestResult;
};

function studentQuestion(
  question: OfflineOfficialQuestion | OfflineSelfTestQuestion,
  saved?: {
    answerText: string | null;
    selectedOptionId: string | null;
    isCorrect: boolean | null;
  },
): OfflineStudentQuestion {
  return {
    id: question.questionId,
    revisionId: question.revisionId,
    questionText: question.questionText,
    questionType: question.questionType,
    sortOrder: question.sortOrder,
    options: question.options.map((option) => ({ ...option })),
    savedAnswer: saved?.answerText ?? null,
    selectedOptionId: saved?.selectedOptionId ?? null,
    isCorrect: saved?.isCorrect ?? null,
  };
}

async function readBundles(params: {
  ownerId: string;
  lessonId: string;
  repository: OfflineStateRepository;
  readBytes: (ownerId: string, artifact: OfflinePackArtifact) => Promise<Uint8Array | null>;
}): Promise<{
  bundles: OfflineAssessmentBundle[];
  learning: Array<{
    questionId: string;
    revisionId: string | null;
    kind: "official-question-note" | "self-test-attempt";
    answerText: string | null;
    selectedOptionId: string | null;
    isCorrect: boolean | null;
  }>;
}> {
  const snapshot = await params.repository.read();
  const packs = snapshot.packs
    .filter((record) => record.ownerId === params.ownerId && record.status === "ready")
    .sort((left, right) => right.manifest.revision - left.manifest.revision);
  const bundles: OfflineAssessmentBundle[] = [];
  const seenKinds = new Set<string>();
  for (const pack of packs) {
    for (const artifact of pack.manifest.artifacts) {
      if (
        artifact.lessonId !== params.lessonId ||
        (artifact.kind !== "assessment" && artifact.kind !== "self-test") ||
        !pack.verifiedArtifactIds.includes(artifact.artifactId) ||
        seenKinds.has(artifact.kind)
      ) {
        continue;
      }
      const bytes = await params.readBytes(params.ownerId, artifact);
      if (!bytes) continue;
      try {
        await verifyOfflineArtifact(bytes, artifact);
        const bundle = parseOfflineAssessmentBundle(bytes);
        if (bundle.lessonId !== params.lessonId) continue;
        if (artifact.kind === "assessment" && bundle.kind !== "official-questions") continue;
        if (artifact.kind === "self-test" && bundle.kind !== "self-test") continue;
        bundles.push(bundle);
        seenKinds.add(artifact.kind);
      } catch {
        // A corrupt or mismatched answer layer is never exposed or graded.
      }
    }
  }
  return {
    bundles,
    learning: snapshot.learning.filter(
      (record) => record.ownerId === params.ownerId && record.lessonId === params.lessonId,
    ),
  };
}

export async function readOfflineLessonAssessment(
  ownerId: string,
  lessonId: string,
  repository: OfflineStateRepository = deviceOfflineStateRepository,
  readBytes: (
    ownerId: string,
    artifact: OfflinePackArtifact,
  ) => Promise<Uint8Array | null> = readOfflineArtifactBytes,
): Promise<OfflineLessonAssessment> {
  const { bundles, learning } = await readBundles({ ownerId, lessonId, repository, readBytes });
  const official = bundles.find((bundle) => bundle.kind === "official-questions");
  const selfTest = bundles.find((bundle) => bundle.kind === "self-test");

  const officialByKey = new Map(
    official?.kind === "official-questions"
      ? official.questions.map((question) => [
          `${question.questionId}\u0000${question.revisionId}`,
          question,
        ])
      : [],
  );
  const selfTestByKey = new Map(
    selfTest?.kind === "self-test"
      ? selfTest.questions.map((question) => [
          `${question.questionId}\u0000${question.revisionId}`,
          question,
        ])
      : [],
  );
  const savedByKey = new Map(
    learning.map((record) => [
      `${record.kind}\u0000${record.questionId}\u0000${record.revisionId ?? ""}`,
      record,
    ]),
  );

  return {
    officialQuestions:
      official?.kind === "official-questions"
        ? official.questions.map((question) =>
            studentQuestion(
              question,
              savedByKey.get(
                `official-question-note\u0000${question.questionId}\u0000${question.revisionId}`,
              ) ?? savedByKey.get(`official-question-note\u0000${question.questionId}\u0000`),
            ),
          )
        : [],
    selfTestQuestions:
      selfTest?.kind === "self-test"
        ? selfTest.questions.map((question) =>
            studentQuestion(
              question,
              savedByKey.get(
                `self-test-attempt\u0000${question.questionId}\u0000${question.revisionId}`,
              ),
            ),
          )
        : [],
    revealOfficialAnswer(questionId, revisionId, attempt) {
      if (!attempt.trim()) throw new Error("OFFLINE_ASSESSMENT_ATTEMPT_REQUIRED");
      const question = officialByKey.get(`${questionId}\u0000${revisionId}`);
      if (!question) throw new Error("OFFLINE_ASSESSMENT_QUESTION_NOT_FOUND");
      return {
        modelAnswer: question.modelAnswer,
        explanation: question.explanation,
        correctOptionIds: [...question.correctOptionIds],
      };
    },
    checkSelfTestAnswer(questionId, revisionId, selectedOptionId) {
      const question = selfTestByKey.get(`${questionId}\u0000${revisionId}`);
      if (!question) throw new Error("OFFLINE_ASSESSMENT_QUESTION_NOT_FOUND");
      if (!question.options.some((option) => option.id === selectedOptionId)) {
        throw new Error("OFFLINE_ASSESSMENT_OPTION_NOT_FOUND");
      }
      const isCorrect = selectedOptionId === question.correctOptionId;
      const feedback = question.feedbackByOption[selectedOptionId];
      return {
        isCorrect,
        correctOptionId: question.correctOptionId,
        explanation: question.explanation,
        correction: isCorrect ? (feedback?.whyCorrect ?? null) : (feedback?.whyWrong ?? null),
      };
    },
  };
}
