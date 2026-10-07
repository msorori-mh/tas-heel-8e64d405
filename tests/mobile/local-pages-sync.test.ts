import { describe, it, expect, vi } from "vitest";
import { drainLocalQueue, type Mutation } from "../../mobile/src/sync";
const mutation: Mutation = {
  id: "op-a",
  ownerId: "student-a",
  payloadSha256: "sha-a",
  idempotencyKey: "idempotency-a",
  kind: "official-question-note",
  entityId: "question-a",
  lessonId: "lesson-a",
  occurredAt: "2026-10-07T00:00:00Z",
  progressPercent: null,
  answerText: "answer",
};
function queue(records = [mutation], pendingCount = records.length) {
  return {
    getPendingMutations: vi.fn().mockResolvedValue({ records, pendingCount }),
    acknowledgeMutation: vi.fn().mockResolvedValue(undefined),
  };
}
describe("local-first synchronization", () => {
  it("acknowledges only after delivery using owner and payload identity", async () => {
    const q = queue();
    const deliver = vi.fn(async () => {
      expect(q.acknowledgeMutation).not.toHaveBeenCalled();
    });
    expect(await drainLocalQueue(q, "student-a", deliver)).toEqual({
      delivered: 1,
      pending: 0,
      fullBatch: false,
    });
    expect(q.acknowledgeMutation).toHaveBeenCalledWith({
      sessionUserId: "student-a",
      id: "op-a",
      payloadSha256: "sha-a",
      delivered: true,
    });
  });
  it("never sends another account activity", async () => {
    const q = queue();
    const deliver = vi.fn();
    await expect(drainLocalQueue(q, "student-b", deliver)).rejects.toThrow("OWNER_MISMATCH");
    expect(deliver).not.toHaveBeenCalled();
    expect(q.acknowledgeMutation).not.toHaveBeenCalled();
  });
  it("preserves failed activity and stops the batch on outage", async () => {
    const q = queue([mutation, { ...mutation, id: "op-b" }]);
    const deliver = vi.fn().mockRejectedValue(new Error("offline"));
    expect(await drainLocalQueue(q, "student-a", deliver)).toEqual({
      delivered: 0,
      pending: 2,
      fullBatch: false,
    });
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(q.acknowledgeMutation.mock.calls[0][0].delivered).toBe(false);
  });
  it("keeps the same idempotency key when the response or acknowledgement is lost", async () => {
    const q = queue();
    const deliver = vi.fn().mockResolvedValue(undefined);
    q.acknowledgeMutation.mockRejectedValueOnce(new Error("disk-write-failed"));
    await expect(drainLocalQueue(q, "student-a", deliver)).rejects.toThrow("disk-write-failed");
    await drainLocalQueue(q, "student-a", deliver);
    expect(deliver.mock.calls.map((c) => c[0].idempotencyKey)).toEqual([
      "idempotency-a",
      "idempotency-a",
    ]);
  });
  it("does not report complete while backoff records remain", async () => {
    expect(await drainLocalQueue(queue([], 3), "student-a", vi.fn())).toEqual({
      delivered: 0,
      pending: 3,
      fullBatch: false,
    });
  });
});
