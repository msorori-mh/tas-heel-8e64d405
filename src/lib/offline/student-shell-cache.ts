/** Local presentation data only: never a bearer token or a source of server roles. */
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/hooks/use-auth";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { deviceOfflineStateRepository } from "./offline-state-store";
import { digestOfflinePackManifest } from "./offline-pack-contract";

const IDENTITY_KEY = "tamkeen.student-shell.identity.v1";
async function read(key: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    return Capacitor.isNativePlatform()
      ? (await Preferences.get({ key })).value
      : localStorage.getItem(key);
  } catch {
    return null;
  }
}
async function write(key: string, value: string | null): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    if (Capacitor.isNativePlatform()) {
      if (value === null) await Preferences.remove({ key });
      else await Preferences.set({ key, value });
    } else if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* A failed UI cache must not prevent online learning. */
  }
}

export async function rememberStudentIdentity(profile: Profile): Promise<void> {
  if ((await deviceOfflineStateRepository.read()).activeOwnerId !== profile.user_id) return;
  await write(IDENTITY_KEY, JSON.stringify({ version: 1, profile }));
}
export async function forgetStudentIdentity(): Promise<void> {
  await write(IDENTITY_KEY, null);
}
export async function readStudentIdentity(): Promise<{ profile: Profile; user: User } | null> {
  try {
    const snapshot = await deviceOfflineStateRepository.read();
    const entry = JSON.parse((await read(IDENTITY_KEY)) ?? "null");
    const p = entry?.profile;
    if (
      entry?.version !== 1 ||
      !p ||
      !snapshot.activeOwnerId ||
      p.user_id !== snapshot.activeOwnerId ||
      typeof p.id !== "string" ||
      typeof p.full_name !== "string" ||
      !p.full_name.trim() ||
      !(p.grade_uuid || p.grade_id) ||
      !p.curriculum_track_id ||
      !p.governorate_id
    )
      return null;
    // This identity opens local student screens only. Online requests still require Supabase auth.
    return {
      profile: p,
      user: {
        id: p.user_id,
        aud: "authenticated",
        app_metadata: {},
        user_metadata: {},
        created_at: "",
      },
    };
  } catch {
    return null;
  }
}

function viewKey(ownerId: string, key: readonly unknown[]) {
  return `tamkeen.student-view.v1:${ownerId}:${JSON.stringify(key)}`;
}
export async function readStudentView<T>(
  ownerId: string,
  key: readonly unknown[],
): Promise<T | undefined> {
  try {
    if ((await deviceOfflineStateRepository.read()).activeOwnerId !== ownerId) return undefined;
    const value = await read(viewKey(ownerId, key));
    return value === null ? undefined : (JSON.parse(value) as T);
  } catch {
    return undefined;
  }
}
export async function rememberStudentView<T>(
  ownerId: string,
  key: readonly unknown[],
  data: T,
): Promise<void> {
  if ((await deviceOfflineStateRepository.read()).activeOwnerId !== ownerId) return;
  const value = JSON.stringify(data);
  if (value && value.length <= 500_000) await write(viewKey(ownerId, key), value);
}

export type SavedSubject = {
  id: string;
  name: string;
  grade_id: string;
  curriculum_track_id: string | null;
  semester: 1 | 2 | null;
  icon: null;
  color: null;
  group_code: null;
  group_name: null;
  sort_order: number;
  lessons: {
    id: string;
    title: string;
    duration: null;
    unit_id: null;
    sort_order: number;
    semester: 1 | 2 | null;
  }[];
};
/** Reconstruct navigation even when a downloaded subject has never been opened online. */
export async function readSavedSubjects(
  ownerId: string,
  semester?: number,
): Promise<SavedSubject[]> {
  const state = await deviceOfflineStateRepository.read();
  if (state.activeOwnerId !== ownerId) return [];
  const subjects = new Map<string, SavedSubject>();
  for (const pack of [...state.packs].sort((a, b) => b.manifest.revision - a.manifest.revision)) {
    const { scope } = pack.manifest;
    if (
      pack.ownerId !== ownerId ||
      !scope.subjectId ||
      pack.status === "corrupt" ||
      pack.status === "stale" ||
      (semester && scope.semester && semester !== scope.semester) ||
      (await digestOfflinePackManifest(pack.manifest)) !== pack.manifestSha256
    )
      continue;
    let subject = subjects.get(scope.subjectId);
    const artifacts = pack.manifest.artifacts.filter(
      (a) => a.lessonId && pack.verifiedArtifactIds.includes(a.artifactId),
    );
    if (!artifacts.length) continue;
    if (!subject) {
      subject = {
        id: scope.subjectId,
        name: scope.subjectTitle ?? "مادة محفوظة",
        grade_id: scope.gradeId,
        curriculum_track_id: scope.curriculumTrackId,
        semester: scope.semester,
        icon: null,
        color: null,
        group_code: null,
        group_name: null,
        sort_order: subjects.size,
        lessons: [],
      };
      subjects.set(subject.id, subject);
    }
    for (const a of artifacts) {
      if (subject.lessons.some((l) => l.id === a.lessonId)) continue;
      subject.lessons.push({
        id: a.lessonId!,
        title: a.lessonTitle ?? a.title,
        duration: null,
        unit_id: null,
        sort_order: a.sortOrder,
        semester: scope.semester,
      });
    }
  }
  return [...subjects.values()];
}
