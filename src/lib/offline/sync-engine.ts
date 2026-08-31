import { getNetworkState } from "./network";
import {
  isNativeOfflineStore,
  listPendingOfflineMutations,
  markOfflineMutationFailed,
  markOfflineMutationSynced,
  type OfflineJsonValue,
  type OfflineMutation,
} from "./native-offline-store";

export type OfflineSyncResult = {
  online: boolean;
  attempted: number;
  synced: number;
  failed: number;
  remaining: number;
};

export type OfflineMutationHandler = (
  mutation: OfflineMutation<OfflineJsonValue>,
) => Promise<void>;

/**
 * Drains a bounded batch of local mutations after connectivity returns.
 *
 * The backend adapter is deliberately injected. This foundation does not
 * invent server contracts or bypass existing RLS/RPC rules: each caller must
 * replay through the same authorized API used by the online student flow.
 */
export async function drainOfflineMutationQueue(
  handler: OfflineMutationHandler,
  options?: { limit?: number; stopAfterFailures?: number },
): Promise<OfflineSyncResult> {
  const network = await getNetworkState();
  if (!network.online || !isNativeOfflineStore()) {
    return { online: network.online, attempted: 0, synced: 0, failed: 0, remaining: 0 };
  }

  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 500);
  const stopAfterFailures = Math.max(options?.stopAfterFailures ?? 5, 1);
  const pending = await listPendingOfflineMutations(limit);

  let attempted = 0;
  let synced = 0;
  let failed = 0;

  for (const mutation of pending) {
    if (failed >= stopAfterFailures) break;
    attempted += 1;
    try {
      await handler(mutation);
      await markOfflineMutationSynced(mutation.idempotencyKey);
      synced += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "sync_failed";
      await markOfflineMutationFailed(mutation.idempotencyKey, message);
      failed += 1;
    }
  }

  const remaining = (await listPendingOfflineMutations(500)).length;
  return { online: true, attempted, synced, failed, remaining };
}
