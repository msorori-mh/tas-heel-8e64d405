/** OFFLINE-05 — drain durable student activity with idempotent server writes. */

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
  deliver(record: OfflineOutboxRecord): Promise<void>;
}

export type OfflineSyncResult = {
  claimed: number;
  delivered: number;
  failed: number;
};

function safeErrorCode(error: unknown): string {
  const raw = error instanceof Error ? error.message : "OFFLINE_SYNC_FAILED";
  const normalized = raw.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120);
  return normalized || "OFFLINE_SYNC_FAILED";
}

export async function syncOfflineOutbox(params: {
  ownerId: string;
  delivery: OfflineMutationDelivery;
  repository?: OfflineStateRepository;
  now?: string;
  limit?: number;
}): Promise<OfflineSyncResult> {
  const repository = params.repository ?? deviceOfflineStateRepository;
  const now = params.now ?? new Date().toISOString();
  const claimed = await claimOfflineMutations(repository, params.ownerId, {
    now,
    limit: params.limit,
  });
  let delivered = 0;
  let failed = 0;
  for (const record of claimed) {
    try {
      await params.delivery.deliver(record);
      await markOfflineMutationDelivered(repository, params.ownerId, record.id, now);
      delivered += 1;
    } catch (error) {
      await markOfflineMutationFailed(
        repository,
        params.ownerId,
        record.id,
        safeErrorCode(error),
        now,
      );
      failed += 1;
    }
  }
  return { claimed: claimed.length, delivered, failed };
}

function supabaseDelivery(ownerId: string): OfflineMutationDelivery {
  return {
    async deliver(record) {
      if (record.ownerId !== ownerId) throw new Error("OFFLINE_SYNC_OWNER_MISMATCH");
      const rpc = supabase.rpc.bind(supabase) as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ error: { message?: string } | null }>;
      const { error } = await rpc("apply_offline_learning_mutation", {
        _idempotency_key: record.idempotencyKey,
        _kind: record.kind,
        _entity_id: record.entityId,
        _lesson_id: record.lessonId,
        _occurred_at: record.occurredAt,
        _progress_percent: record.progressPercent,
        _answer_text: record.answerText,
        _payload_sha256: record.payloadSha256,
      });
      if (error) throw error;
    },
  };
}

export async function syncOfflineOutboxForCurrentSession(): Promise<OfflineSyncResult> {
  const { data } = await supabase.auth.getSession();
  const ownerId = data.session?.user.id;
  if (!ownerId) throw new Error("OFFLINE_SYNC_UNAUTHENTICATED");
  return syncOfflineOutbox({ ownerId, delivery: supabaseDelivery(ownerId) });
}
