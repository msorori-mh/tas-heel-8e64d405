import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { supabase } from "@/integrations/supabase/client";
import {
  closeNativeAuthBrowser,
  isCallbackConsumed,
  markCallbackConsumed,
  unmarkCallbackConsumed,
  parseNativeAuthCallback,
  openNativeAuthBrowser,
  NATIVE_OAUTH_REDIRECT_URL,
} from "@/lib/auth/native-oauth";
import {
  nativePath,
  hasEncryptedOfflineArtifacts,
  readOfflineArtifactBytes,
  removeOfflineArtifact,
  saveOfflineArtifactBytes,
} from "@/lib/offline/offline-artifact-cache";
import {
  deviceOfflineStateRepository as repository,
  readableOfflinePacks,
} from "@/lib/offline/offline-state-store";
import type { OfflinePackArtifact } from "@/lib/offline/offline-pack-contract";
import { openNativePdf, TamkeenPdfViewer } from "@/lib/pdf/native-pdf-viewer";

export async function assertOwner(ownerId: string) {
  if ((await repository.read()).activeOwnerId !== ownerId) throw new Error("OFFLINE_OWNER_CHANGED");
}

export async function signIn() {
  const native = Capacitor.isNativePlatform();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: native ? NATIVE_OAUTH_REDIRECT_URL : window.location.origin,
      skipBrowserRedirect: native,
    },
  });
  if (error) throw error;
  if (native && data.url) await openNativeAuthBrowser(data.url);
}

export async function attachNativeAuth(onError: () => void) {
  if (!Capacitor.isNativePlatform()) return () => {};
  const handle = async (url: string) => {
    const callback = parseNativeAuthCallback(url);
    if (callback.kind === "ignored") return;
    if (callback.kind === "error") {
      onError();
      return;
    }
    if (isCallbackConsumed(callback.code)) return;
    markCallbackConsumed(callback.code);
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(callback.code);
      if (error) throw error;
      await closeNativeAuthBrowser();
    } catch {
      unmarkCallbackConsumed(callback.code);
      onError();
    }
  };
  const listener = await App.addListener("appUrlOpen", ({ url }) => void handle(url));
  const launch = await App.getLaunchUrl();
  if (launch?.url) await handle(launch.url);
  return () => void listener.remove();
}

export async function subjectCatalog(ownerId: string) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("grade_id,grade_uuid,curriculum_track_id")
    .eq("user_id", ownerId)
    .maybeSingle();
  if (error) throw error;
  const grade = profile?.grade_uuid ?? (profile?.grade_id ? String(profile.grade_id) : null);
  if (!grade || !profile?.curriculum_track_id) throw new Error("OFFLINE_PROFILE_INCOMPLETE");
  const subjects: Array<{ id: string; name: string }> = [];
  for (let start = 0; ; start += 500) {
    const result = await supabase
      .from("subjects")
      .select("id,name")
      .eq("grade_id", grade)
      .or(`curriculum_track_id.is.null,curriculum_track_id.eq.${profile.curriculum_track_id}`)
      .order("id")
      .range(start, start + 499);
    if (result.error) throw result.error;
    subjects.push(...result.data);
    if (result.data.length < 500) break;
  }
  await assertOwner(ownerId);
  return subjects;
}

export async function openSavedPdf(ownerId: string, artifact: OfflinePackArtifact) {
  await assertOwner(ownerId);
  if (hasEncryptedOfflineArtifacts()) {
    await TamkeenPdfViewer.openOfflineArtifact({ ownerId, artifact });
    return null;
  }
  const bytes = await readOfflineArtifactBytes(ownerId, artifact);
  if (!bytes) throw new Error("OFFLINE_PDF_MISSING");
  await assertOwner(ownerId);
  if (Capacitor.isNativePlatform()) {
    await saveOfflineArtifactBytes(ownerId, artifact, bytes);
    // Legacy packs are verified and migrated by the downloader before release use.
    await openNativePdf({
      localPath: nativePath(ownerId, artifact),
      resourceId: artifact.resourceId,
      title: artifact.title,
    });
    return null;
  }
  return URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: "application/pdf" }));
}

export async function removeSavedPack(ownerId: string, packId: string) {
  await assertOwner(ownerId);
  const removed = await repository.update((snapshot) => {
    if (snapshot.activeOwnerId !== ownerId) throw new Error("OFFLINE_OWNER_CHANGED");
    const matches = (record: (typeof snapshot.packs)[number]) =>
      record.ownerId === ownerId && record.manifest.packId === packId;
    const records = [...snapshot.packs, ...snapshot.packBackups].filter(matches);
    snapshot.packs = snapshot.packs.filter((record) => !matches(record));
    snapshot.packBackups = snapshot.packBackups.filter((record) => !matches(record));
    const retained = [...snapshot.packs, ...snapshot.packBackups]
      .filter((record) => record.ownerId === ownerId)
      .flatMap((record) => record.manifest.artifacts);
    return records
      .flatMap((record) => record.manifest.artifacts)
      .filter(
        (artifact) =>
          !retained.some(
            (other) =>
              other.sha256 === artifact.sha256 && other.relativePath === artifact.relativePath,
          ),
      );
  });
  for (const artifact of removed) await removeOfflineArtifact(ownerId, artifact);
}

export async function installedPacks(ownerId: string) {
  return readableOfflinePacks(await repository.read()).filter((pack) => pack.ownerId === ownerId);
}
