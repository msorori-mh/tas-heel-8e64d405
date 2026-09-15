/** Drain durable student activity with fenced, idempotent server writes. */

import { supabase } from "@/integrations/supabase/client";
import {
  claimOfflineMutations,
  markOfflineMutationDelivered,
  markOfflineMutationFailed,
} from "./offline-outbox";
import {
  deviceOfflineStateRepository,
  type OfflineOutboxRecord,
  type OfflineStateRepository,
} from "./offline-state-store";

export interface OfflineMutationDelivery {
  deliver(record: OfflineOutboxRecord, signal?: AbortSignal): Promise<void>;
}
export type OfflineSyncResult = { claimed: number; delivered: number; failed: number };

export async function syncOfflineOutbox(params: {
  ownerId: string;
  delivery: OfflineMutationDelivery;
  repository?: OfflineStateRepository;
  now?: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<OfflineSyncResult> {
  const repository = params.repository ?? deviceOfflineStateRepository;
  const now = () => params.now ?? new Date().toISOString();
  const result = { claimed: 0, delivered: 0, failed: 0 };
  const limit = Math.min(100, Math.max(1, params.limit ?? 100));
  // Claim immediately before delivery so later operations keep their leases.
  while (result.claimed < limit && !params.signal?.aborted) {
    const [record] = await claimOfflineMutations(repository, params.ownerId, {
      now: now(),
      limit: 1,
    });
    if (!record) break;
    result.claimed += 1;
    try {
      await params.delivery.deliver(record, params.signal);
      await markOfflineMutationDelivered(
        repository,
        params.ownerId,
        record.id,
        now(),
        record.attempts,
      );
      result.delivered += 1;
    } catch (error) {
      const code = error instanceof Error ? error.message : "OFFLINE_SYNC_FAILED";
      await markOfflineMutationFailed(
        repository,
        params.ownerId,
        record.id,
        code.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120),
        now(),
        record.attempts,
      );
      result.failed += 1;
      // Preserve attempts on the rest of the queue during network/auth failure.
      break;
    }
  }
  return result;
}

function supabaseDelivery(ownerId: string): OfflineMutationDelivery {
  return {
    async deliver(record, signal) {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      const snapshot = await deviceOfflineStateRepository.read();
      if (
        record.ownerId !== ownerId ||
        session?.user.id !== ownerId ||
        snapshot.activeOwnerId !== ownerId
      )
        throw new Error("OFFLINE_SYNC_OWNER_MISMATCH");
      if (signal?.aborted) throw new Error("OFFLINE_SYNC_ABORTED");
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener("abort", abort, { once: true });
      const timeout = setTimeout(abort, 30_000);
      try {
        const rpc = supabase.rpc.bind(supabase) as unknown as (
          name: string,
          args: Record<string, unknown>,
        ) => {
          setHeader(
            name: string,
            value: string,
          ): {
            abortSignal(signal: AbortSignal): PromiseLike<{ error: { message?: string } | null }>;
          };
        };
        const { error } = await rpc("apply_offline_learning_mutation", {
          _idempotency_key: record.idempotencyKey,
          _kind: record.kind,
          _entity_id: record.entityId,
          _lesson_id: record.lessonId,
          _occurred_at: record.occurredAt,
          _progress_percent: record.progressPercent,
          _answer_text: record.answerText,
          _payload_sha256: record.payloadSha256,
        })
          .setHeader("Authorization", `Bearer ${session.access_token}`)
          .abortSignal(controller.signal);
        if (error) throw new Error(error.message || "OFFLINE_SYNC_FAILED");
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abort);
      }
    },
  };
}

export async function syncOfflineOutboxForCurrentSession(
  signal?: AbortSignal,
): Promise<OfflineSyncResult> {
  const { data } = await supabase.auth.getSession();
  const ownerId = data.session?.user.id;
  if (!ownerId) throw new Error("OFFLINE_SYNC_UNAUTHENTICATED");
  return syncOfflineOutbox({ ownerId, delivery: supabaseDelivery(ownerId), signal });
}
