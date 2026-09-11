import { deviceOfflineStateRepository, type OfflineStateRepository } from "./offline-state-store";

/** Account-isolated display data, encrypted with the existing native journal. */
export async function readOfflineView<T>(
  ownerId: string,
  key: string,
  repository: OfflineStateRepository = deviceOfflineStateRepository,
): Promise<T | null> {
  const state = await repository.read();
  if (state.activeOwnerId !== ownerId) return null;
  const view = state.views?.find((v) => v.ownerId === ownerId && v.key === key);
  return view ? (JSON.parse(view.json) as T) : null;
}

export async function saveOfflineView(
  ownerId: string,
  key: string,
  value: unknown,
  repository: OfflineStateRepository = deviceOfflineStateRepository,
): Promise<void> {
  const json = JSON.stringify(value);
  if (json.length > 1_000_000) return;
  await repository.update((state) => {
    if (state.activeOwnerId !== ownerId) throw new Error("OFFLINE_OWNER_CHANGED");
    const views = (state.views ?? []).filter((v) => v.ownerId !== ownerId || v.key !== key);
    views.push({ ownerId, key, json, savedAt: new Date().toISOString() });
    while (views.length > 100 || views.reduce((n, v) => n + v.json.length, 0) > 2_000_000)
      views.shift();
    state.views = views;
  });
}
