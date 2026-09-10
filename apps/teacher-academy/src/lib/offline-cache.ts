import {
  readOfflineSession,
  signOutOnThisDevice,
} from "../../../../src/integrations/supabase/client";
import {
  deviceOfflineStateRepository,
  setActiveOfflineOwner,
} from "../../../../src/lib/offline/offline-state-store";
import { readOfflineView, saveOfflineView } from "../../../../src/lib/offline/offline-view-cache";
import { academySupabase } from "./supabase";

/** Only previously viewed teacher content; no admin capabilities or mutations. */
export async function readTeacherContent<T>(
  key: string,
  load: () => Promise<T>,
  expectedOwner?: string,
): Promise<T> {
  const offline = await readOfflineSession();
  const session = offline ?? (await academySupabase.auth.getSession()).data.session;
  if (!session || (expectedOwner && expectedOwner !== session.user.id))
    throw new Error("سجّل الدخول إلى حساب المعلم.");
  const ownerId = session.user.id;
  if (!navigator.onLine) {
    const cached = await readOfflineView<T>(ownerId, "teacher:" + key);
    if (cached !== null) return cached;
    throw new Error("هذا المحتوى غير محفوظ على الجهاز. اتصل بالإنترنت لفتحه أول مرة.");
  }
  await (async () => {
    if ((await deviceOfflineStateRepository.read()).activeOwnerId !== ownerId)
      await setActiveOfflineOwner(ownerId);
  })().catch(() => undefined);
  const data = await load();
  await saveOfflineView(ownerId, "teacher:" + key, data).catch(() => undefined);
  return data;
}

export async function signOutAcademyOnDevice(): Promise<void> {
  await setActiveOfflineOwner(null);
  await signOutOnThisDevice();
}
