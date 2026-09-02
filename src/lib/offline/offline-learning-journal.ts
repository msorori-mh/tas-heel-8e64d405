/** OFFLINE-05 — durable, account-isolated student answers and self-test state. */

import { enqueueOfflineMutationInSnapshot } from "./offline-outbox";
import { sha256Hex } from "./offline-pack-contract";
import {
  deviceOfflineStateRepository,
  type OfflineLearningRecord,
  type OfflineStateRepository,
} from "./offline-state-store";

async function stableId(parts: string[]): Promise<string> {
  const digest = await sha256Hex(new TextEncoder().encode(parts.join("\u0000")));
  return `learn-${digest.slice(0, 40)}`;
}

export async function readOfflineOfficialQuestionNotes(
  ownerId: string,
  lessonId: string,
  repository: OfflineStateRepository = deviceOfflineStateRepository,
): Promise<Record<string, string>> {
  const snapshot = await repository.read();
  return Object.fromEntries(
    snapshot.learning
      .filter(
        (record) =>
          record.ownerId === ownerId &&
          record.lessonId === lessonId &&
          record.kind === "official-question-note",
      )
      .map((record) => [record.questionId, record.answerText ?? ""]),
  );
}

export async function saveOfflineOfficialQuestionNote(
  input: {
    ownerId: string;
    lessonId: string;
    questionId: string;
    revisionId?: string | null;
    answerText: string;
  },
  repository: OfflineStateRepository = deviceOfflineStateRepository,
  now = new Date().toISOString(),
): Promise<OfflineLearningRecord> {
  if (input.answerText.length > 64_000) throw new Error("OFFLINE_NOTE_TOO_LARGE");
  const id = await stableId([
    input.ownerId,
    input.lessonId,
    input.questionId,
    "official-question-note",
  ]);
  return repository.update(async (snapshot) => {
    const current = snapshot.learning.find(
      (record) => record.ownerId === input.ownerId && record.id === id,
    );
    const effectiveAt = current?.answerText === input.answerText ? current.updatedAt : now;
    const record: OfflineLearningRecord = {
      id,
      ownerId: input.ownerId,
      lessonId: input.lessonId,
      questionId: input.questionId,
      revisionId: input.revisionId ?? null,
      kind: "official-question-note",
      answerText: input.answerText,
      selectedOptionId: null,
      isCorrect: null,
      updatedAt: effectiveAt,
    };
    snapshot.learning = snapshot.learning.filter(
      (candidate) => !(candidate.ownerId === input.ownerId && candidate.id === id),
    );
    snapshot.learning.push(record);
    const operationDigest = await sha256Hex(
      new TextEncoder().encode(
        [input.ownerId, input.lessonId, input.questionId, input.answerText, record.updatedAt].join(
          "\u0000",
        ),
      ),
    );
    await enqueueOfflineMutationInSnapshot(
      snapshot,
      {
        ownerId: input.ownerId,
        idempotencyKey: `note-${operationDigest.slice(0, 48)}`,
        kind: "official-question-note",
        entityId: input.questionId,
        lessonId: input.lessonId,
        occurredAt: record.updatedAt,
        answerText: input.answerText,
      },
      now,
    );
    return record;
  }, now);
}

export async function recordOfflineSelfTestAttempt(
  input: {
    ownerId: string;
    lessonId: string;
    questionId: string;
    revisionId: string;
    selectedOptionId: string;
    isCorrect: boolean;
  },
  repository: OfflineStateRepository = deviceOfflineStateRepository,
  now = new Date().toISOString(),
): Promise<{ record: OfflineLearningRecord; scorePercent: number }> {
  const id = await stableId([input.ownerId, input.lessonId, input.questionId, "self-test-attempt"]);
  const result = await repository.update(async (snapshot) => {
    const current = snapshot.learning.find(
      (record) => record.ownerId === input.ownerId && record.id === id,
    );
    const unchanged =
      current?.revisionId === input.revisionId &&
      current.selectedOptionId === input.selectedOptionId &&
      current.isCorrect === input.isCorrect;
    const record: OfflineLearningRecord = {
      id,
      ownerId: input.ownerId,
      lessonId: input.lessonId,
      questionId: input.questionId,
      revisionId: input.revisionId,
      kind: "self-test-attempt",
      answerText: null,
      selectedOptionId: input.selectedOptionId,
      isCorrect: input.isCorrect,
      updatedAt: unchanged ? current.updatedAt : now,
    };
    snapshot.learning = snapshot.learning.filter(
      (candidate) => !(candidate.ownerId === input.ownerId && candidate.id === id),
    );
    snapshot.learning.push(record);
    const attempts = snapshot.learning.filter(
      (candidate) =>
        candidate.ownerId === input.ownerId &&
        candidate.lessonId === input.lessonId &&
        candidate.kind === "self-test-attempt",
    );
    const correct = attempts.filter((candidate) => candidate.isCorrect === true).length;
    const result = {
      record,
      scorePercent: attempts.length === 0 ? 0 : Math.round((correct / attempts.length) * 100),
      snapshotKey: attempts
        .map((candidate) =>
          [
            candidate.questionId,
            candidate.revisionId,
            candidate.selectedOptionId,
            candidate.isCorrect,
          ]
            .map(String)
            .join(":"),
        )
        .sort()
        .join("|"),
    };
    const progressDigest = await sha256Hex(
      new TextEncoder().encode(
        [input.ownerId, input.lessonId, result.snapshotKey, result.record.updatedAt].join("\u0000"),
      ),
    );
    await enqueueOfflineMutationInSnapshot(
      snapshot,
      {
        ownerId: input.ownerId,
        idempotencyKey: `progress-${progressDigest.slice(0, 44)}`,
        kind: "lesson-progress",
        entityId: input.lessonId,
        occurredAt: result.record.updatedAt,
        progressPercent: result.scorePercent,
      },
      now,
    );
    return result;
  }, now);
  return { record: result.record, scorePercent: result.scorePercent };
}
