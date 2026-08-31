import { Capacitor, registerPlugin } from "@capacitor/core";

export type OfflineJsonPrimitive = string | number | boolean | null;
export type OfflineJsonValue =
  | OfflineJsonPrimitive
  | OfflineJsonValue[]
  | { [key: string]: OfflineJsonValue };

export type OfflineContentRecord<T extends OfflineJsonValue = OfflineJsonValue> = {
  contentKey: string;
  kind: string;
  scopeKey: string;
  version: string;
  checksum: string | null;
  payload: T;
  updatedAt: number;
};

export type OfflineMutation<T extends OfflineJsonValue = OfflineJsonValue> = {
  eventType: string;
  entityId: string | null;
  idempotencyKey: string;
  payload: T;
  createdAt: number;
  attempts: number;
  lastError: string | null;
};

export type OfflineStoreStatus = {
  schemaVersion: number;
  contentItems: number;
  pendingMutations: number;
  syncedMutations: number;
  databaseBytes: number;
};

type OfflineStorePlugin = {
  getStatus(): Promise<OfflineStoreStatus>;
  putContent(options: {
    contentKey: string;
    kind: string;
    scopeKey: string;
    version: string;
    checksum?: string;
    payload: Record<string, OfflineJsonValue>;
  }): Promise<{ contentKey: string; stored: boolean }>;
  getContent(options: {
    contentKey: string;
  }): Promise<{ item: OfflineContentRecord | null }>;
  listContent(options?: {
    kind?: string;
    scopePrefix?: string;
    limit?: number;
  }): Promise<{ items: OfflineContentRecord[] }>;
  deleteContent(options: { contentKey: string }): Promise<{ deleted: boolean }>;
  enqueueMutation(options: {
    eventType: string;
    entityId?: string;
    idempotencyKey: string;
    payload: Record<string, OfflineJsonValue>;
  }): Promise<{ queued: boolean; duplicate: boolean; idempotencyKey: string }>;
  listPendingMutations(options?: { limit?: number }): Promise<{ items: OfflineMutation[] }>;
  markMutationSynced(options: { idempotencyKey: string }): Promise<{ updated: boolean }>;
  markMutationFailed(options: {
    idempotencyKey: string;
    error?: string;
  }): Promise<{ updated: boolean }>;
};

const NativeOfflineStore = registerPlugin<OfflineStorePlugin>("TamkeenOfflineStore");

const FORBIDDEN_KEY_PARTS = [
  "access_token",
  "refresh_token",
  "authorization",
  "password",
  "service_role",
  "signed_url",
  "secret",
] as const;

export function isNativeOfflineStore(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function assertOfflineSafePayload(value: OfflineJsonValue): void {
  const visit = (current: OfflineJsonValue): void => {
    if (Array.isArray(current)) {
      for (const item of current) visit(item);
      return;
    }
    if (!current || typeof current !== "object") return;

    for (const [key, nested] of Object.entries(current)) {
      const normalized = key.toLowerCase().replaceAll("-", "_");
      if (FORBIDDEN_KEY_PARTS.some((part) => normalized.includes(part))) {
        throw new Error(`offline_payload_forbidden_key:${key}`);
      }
      visit(nested);
    }
  };
  visit(value);
}

function requireNativeStore(): void {
  if (!isNativeOfflineStore()) throw new Error("offline_native_store_unavailable");
}

export async function getOfflineStoreStatus(): Promise<OfflineStoreStatus> {
  requireNativeStore();
  return NativeOfflineStore.getStatus();
}

export async function putOfflineContent<T extends Record<string, OfflineJsonValue>>(params: {
  contentKey: string;
  kind: string;
  scopeKey: string;
  version: string;
  checksum?: string | null;
  payload: T;
}): Promise<void> {
  requireNativeStore();
  assertOfflineSafePayload(params.payload);
  await NativeOfflineStore.putContent({
    contentKey: params.contentKey,
    kind: params.kind,
    scopeKey: params.scopeKey,
    version: params.version,
    ...(params.checksum ? { checksum: params.checksum } : {}),
    payload: params.payload,
  });
}

export async function getOfflineContent<T extends OfflineJsonValue = OfflineJsonValue>(
  contentKey: string,
): Promise<OfflineContentRecord<T> | null> {
  requireNativeStore();
  const { item } = await NativeOfflineStore.getContent({ contentKey });
  return item as OfflineContentRecord<T> | null;
}

export async function listOfflineContent<T extends OfflineJsonValue = OfflineJsonValue>(params?: {
  kind?: string;
  scopePrefix?: string;
  limit?: number;
}): Promise<OfflineContentRecord<T>[]> {
  requireNativeStore();
  const { items } = await NativeOfflineStore.listContent(params);
  return items as OfflineContentRecord<T>[];
}

export async function deleteOfflineContent(contentKey: string): Promise<boolean> {
  requireNativeStore();
  const { deleted } = await NativeOfflineStore.deleteContent({ contentKey });
  return deleted;
}

export async function enqueueOfflineMutation<
  T extends Record<string, OfflineJsonValue>,
>(params: {
  eventType: string;
  entityId?: string | null;
  idempotencyKey: string;
  payload: T;
}): Promise<{ queued: boolean; duplicate: boolean }> {
  requireNativeStore();
  assertOfflineSafePayload(params.payload);
  const result = await NativeOfflineStore.enqueueMutation({
    eventType: params.eventType,
    ...(params.entityId ? { entityId: params.entityId } : {}),
    idempotencyKey: params.idempotencyKey,
    payload: params.payload,
  });
  return { queued: result.queued, duplicate: result.duplicate };
}

export async function listPendingOfflineMutations<T extends OfflineJsonValue = OfflineJsonValue>(
  limit = 100,
): Promise<OfflineMutation<T>[]> {
  requireNativeStore();
  const { items } = await NativeOfflineStore.listPendingMutations({ limit });
  return items as OfflineMutation<T>[];
}

export async function markOfflineMutationSynced(idempotencyKey: string): Promise<void> {
  requireNativeStore();
  await NativeOfflineStore.markMutationSynced({ idempotencyKey });
}

export async function markOfflineMutationFailed(
  idempotencyKey: string,
  error?: string,
): Promise<void> {
  requireNativeStore();
  await NativeOfflineStore.markMutationFailed({
    idempotencyKey,
    ...(error ? { error: error.slice(0, 600) } : {}),
  });
}
