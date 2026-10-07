export type Mutation = {
  id: string;
  ownerId: string;
  payloadSha256: string;
  idempotencyKey: string;
  kind: string;
  entityId: string;
  lessonId: string | null;
  occurredAt: string;
  progressPercent: number | null;
  answerText: string | null;
};
export type NativeQueue = {
  getPendingMutations(input: {
    sessionUserId: string;
  }): Promise<{ records: Mutation[]; pendingCount: number }>;
  acknowledgeMutation(input: {
    sessionUserId: string;
    id: string;
    payloadSha256: string;
    delivered: boolean;
  }): Promise<void>;
};
/** Native answers and acknowledgements share one journal lock; JS never replaces the journal. */
export async function drainLocalQueue(
  queue: NativeQueue,
  userId: string,
  deliver: (record: Mutation) => Promise<void>,
) {
  const { records, pendingCount } = await queue.getPendingMutations({ sessionUserId: userId });
  let delivered = 0;
  for (const record of records) {
    if (record.ownerId !== userId) throw new Error("OFFLINE_SYNC_OWNER_MISMATCH");
    let ok = false;
    try {
      await deliver(record);
      ok = true;
    } catch {
      /* Keep failed activity for retry. */
    }
    await queue.acknowledgeMutation({
      sessionUserId: userId,
      id: record.id,
      payloadSha256: record.payloadSha256,
      delivered: ok,
    });
    if (ok) delivered++;
    else break; // An outage must not turn one batch into 25 failing requests.
  }
  return {
    delivered,
    pending: Math.max(0, pendingCount - delivered),
    fullBatch: records.length === 25 && delivered === 25,
  };
}
