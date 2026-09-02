/** OFFLINE-01 — durable at-least-once queue with idempotent operation keys. */

import { sha256Hex } from "./offline-pack-contract";
import {
  OfflineStateRepository,
  type OfflineOutboxRecord,
  type OfflineStateSnapshot,
} from "./offline-state-store";

export type OfflineMutationInput = {
  ownerId: string;
  idempotencyKey: string;
  kind: "lesson-progress" | "lesson-completion" | "official-question-note";
  entityId: string;
  lessonId?: string | null;
  occurredAt: string;
  progressPercent?: number | null;
  answerText?: string | null;
};

const MAX_BACKOFF_MS = 6 * 60 * 60 * 1_000;
const DEFAULT_LEASE_MS = 60_000;

function normalizedMutation(input: OfflineMutationInput) {
  const ownerId = input.ownerId.trim();
  const idempotencyKey = input.idempotencyKey.trim();
  const entityId = input.entityId.trim();
  const lessonId = input.lessonId?.trim() || null;
  const answerText = input.answerText ?? null;
  if (!ownerId || ownerId.length > 160) throw new Error("OFFLINE_OUTBOX_OWNER_INVALID");
  if (idempotencyKey.length < 16 || idempotencyKey.length > 160) {
    throw new Error("OFFLINE_OUTBOX_IDEMPOTENCY_KEY_INVALID");
  }
  if (!entityId || entityId.length > 160) throw new Error("OFFLINE_OUTBOX_ENTITY_INVALID");
  if (lessonId && lessonId.length > 160) throw new Error("OFFLINE_OUTBOX_LESSON_INVALID");
  if (answerText !== null && answerText.length > 64_000) {
    throw new Error("OFFLINE_OUTBOX_ANSWER_TOO_LARGE");
  }
  if (!Number.isFinite(Date.parse(input.occurredAt))) {
    throw new Error("OFFLINE_OUTBOX_OCCURRED_AT_INVALID");
  }
  const progressPercent = input.progressPercent ?? null;
  if (
    input.kind === "lesson-progress" &&
    (progressPercent === null || progressPercent < 0 || progressPercent > 100)
  ) {
    throw new Error("OFFLINE_OUTBOX_PROGRESS_INVALID");
  }
  if (input.kind !== "lesson-progress" && progressPercent !== null) {
    throw new Error("OFFLINE_OUTBOX_COMPLETION_PROGRESS_FORBIDDEN");
  }
  if (input.kind === "official-question-note" && (!lessonId || answerText === null)) {
    throw new Error("OFFLINE_OUTBOX_NOTE_PAYLOAD_INVALID");
  }
  if (input.kind !== "official-question-note" && (lessonId !== null || answerText !== null)) {
    throw new Error("OFFLINE_OUTBOX_UNEXPECTED_NOTE_PAYLOAD");
  }
  return {
    ownerId,
    idempotencyKey,
    kind: input.kind,
    entityId,
    lessonId,
    occurredAt: new Date(input.occurredAt).toISOString(),
    progressPercent,
    answerText,
  };
}

async function mutationDigest(input: ReturnType<typeof normalizedMutation>): Promise<string> {
  const canonical = JSON.stringify([
    input.ownerId,
    input.idempotencyKey,
    input.kind,
    input.entityId,
    input.lessonId,
    input.occurredAt,
    input.progressPercent,
    input.answerText,
  ]);
  return sha256Hex(new TextEncoder().encode(canonical));
}

function findOutbox(
  snapshot: OfflineStateSnapshot,
  ownerId: string,
  idempotencyKey: string,
): OfflineOutboxRecord | undefined {
  return snapshot.outbox.find(
    (record) => record.ownerId === ownerId && record.idempotencyKey === idempotencyKey,
  );
}

export async function enqueueOfflineMutation(
  repository: OfflineStateRepository,
  rawInput: OfflineMutationInput,
  now = new Date().toISOString(),
): Promise<OfflineOutboxRecord> {
  return repository.update(
    (snapshot) => enqueueOfflineMutationInSnapshot(snapshot, rawInput, now),
    now,
  );
}

/**
 * Adds an operation to an already-open repository update. Learning state and
 * its replay record can therefore be committed in one durable adapter write.
 */
export async function enqueueOfflineMutationInSnapshot(
  snapshot: OfflineStateSnapshot,
  rawInput: OfflineMutationInput,
  now: string,
): Promise<OfflineOutboxRecord> {
  const input = normalizedMutation(rawInput);
  const payloadSha256 = await mutationDigest(input);
  const id = `op-${(await sha256Hex(new TextEncoder().encode(`${input.ownerId}\u0000${input.idempotencyKey}`))).slice(0, 40)}`;

  const current = findOutbox(snapshot, input.ownerId, input.idempotencyKey);
  if (current) {
    if (current.payloadSha256 !== payloadSha256) {
      throw new Error("OFFLINE_OUTBOX_IDEMPOTENCY_CONFLICT");
    }
    return current;
  }
  const record: OfflineOutboxRecord = {
    id,
    ...input,
    payloadSha256,
    status: "pending",
    attempts: 0,
    nextAttemptAt: now,
    leaseUntil: null,
    lastErrorCode: null,
    createdAt: now,
    updatedAt: now,
    deliveredAt: null,
  };
  snapshot.outbox.push(record);
  return record;
}

export async function claimOfflineMutations(
  repository: OfflineStateRepository,
  ownerId: string,
  options: { now?: string; limit?: number; leaseMs?: number } = {},
): Promise<OfflineOutboxRecord[]> {
  const now = options.now ?? new Date().toISOString();
  const nowMs = Date.parse(now);
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const leaseUntil = new Date(nowMs + (options.leaseMs ?? DEFAULT_LEASE_MS)).toISOString();
  return repository.update((snapshot) => {
    const ready = snapshot.outbox
      .filter(
        (record) =>
          record.ownerId === ownerId &&
          record.status !== "delivered" &&
          Date.parse(record.nextAttemptAt) <= nowMs &&
          (record.status !== "processing" ||
            record.leaseUntil === null ||
            Date.parse(record.leaseUntil) <= nowMs),
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(0, limit);
    for (const record of ready) {
      record.status = "processing";
      record.attempts += 1;
      record.leaseUntil = leaseUntil;
      record.updatedAt = now;
    }
    return ready;
  }, now);
}

export async function markOfflineMutationDelivered(
  repository: OfflineStateRepository,
  ownerId: string,
  operationId: string,
  now = new Date().toISOString(),
): Promise<void> {
  await repository.update((snapshot) => {
    const record = snapshot.outbox.find(
      (candidate) => candidate.ownerId === ownerId && candidate.id === operationId,
    );
    if (!record) throw new Error("OFFLINE_OUTBOX_OPERATION_NOT_FOUND");
    record.status = "delivered";
    record.leaseUntil = null;
    record.nextAttemptAt = now;
    record.lastErrorCode = null;
    record.deliveredAt = record.deliveredAt ?? now;
    record.updatedAt = now;
  }, now);
}

export async function markOfflineMutationFailed(
  repository: OfflineStateRepository,
  ownerId: string,
  operationId: string,
  errorCode: string,
  now = new Date().toISOString(),
): Promise<void> {
  await repository.update((snapshot) => {
    const record = snapshot.outbox.find(
      (candidate) => candidate.ownerId === ownerId && candidate.id === operationId,
    );
    if (!record) throw new Error("OFFLINE_OUTBOX_OPERATION_NOT_FOUND");
    const backoffMs = Math.min(1_000 * 2 ** Math.max(record.attempts - 1, 0), MAX_BACKOFF_MS);
    record.status = "failed";
    record.leaseUntil = null;
    record.nextAttemptAt = new Date(Date.parse(now) + backoffMs).toISOString();
    record.lastErrorCode = errorCode.slice(0, 120);
    record.updatedAt = now;
  }, now);
}
