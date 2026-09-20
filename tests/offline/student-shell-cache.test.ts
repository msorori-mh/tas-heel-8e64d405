// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
const local = vi.hoisted(() => ({ state: { activeOwnerId: "student-a", packs: [] as unknown[] } }));
vi.mock("@/lib/offline/offline-state-store", () => ({
  deviceOfflineStateRepository: { read: async () => local.state },
}));
import {
  readSavedSubjects,
  rememberStudentIdentity,
  readStudentIdentity,
  forgetStudentIdentity,
  readStudentView,
  rememberStudentView,
} from "@/lib/offline/student-shell-cache";
import { prepared, savedSubject } from "./settings-fixtures";
import type { Profile } from "@/hooks/use-auth";
const profile = {
  id: "profile-a",
  user_id: "student-a",
  full_name: "طالبة",
  grade_uuid: "grade-12",
  curriculum_track_id: "track-a",
  governorate_id: "gov",
} as Profile;
beforeEach(() => {
  localStorage.clear();
  local.state = { activeOwnerId: "student-a", packs: [] };
  vi.stubGlobal("crypto", webcrypto);
});
it("restores local student identity without storing a session or privileged role", async () => {
  await rememberStudentIdentity(profile);
  expect((await readStudentIdentity())?.profile.full_name).toBe("طالبة");
  expect((await readStudentIdentity())?.user.app_metadata).toEqual({});
  expect(localStorage.getItem("tamkeen.student-shell.identity.v1")).not.toContain("access_token");
  local.state.activeOwnerId = "student-b";
  expect(await readStudentIdentity()).toBeNull();
  local.state.activeOwnerId = "student-a";
  await forgetStudentIdentity();
  expect(await readStudentIdentity()).toBeNull();
});
it("does not restore incomplete or corrupted identity", async () => {
  await rememberStudentIdentity({ ...profile, full_name: null });
  expect(await readStudentIdentity()).toBeNull();
  localStorage.setItem("tamkeen.student-shell.identity.v1", "{");
  expect(await readStudentIdentity()).toBeNull();
});
it("separates downloaded Biology and Chemistry and includes unvisited lessons", async () => {
  const bio = savedSubject(await prepared("one", "الأحياء")).local.record;
  const chem = savedSubject(await prepared("two", "الكيمياء")).local.record;
  local.state.packs = [bio, chem];
  const subjects = await readSavedSubjects("student-a");
  expect(subjects.map((s) => s.name)).toEqual(["الأحياء", "الكيمياء"]);
  expect(subjects[0].lessons.map((l) => l.id)).toEqual(["lesson-one"]);
  expect(subjects[1].lessons.map((l) => l.id)).toEqual(["lesson-two"]);
  expect((await readSavedSubjects("student-a", 2)).map((s) => s.name)).toEqual(["الكيمياء"]);
  expect(await readSavedSubjects("student-b")).toEqual([]);
});
it("excludes foreign, unverified, corrupt and altered manifest navigation", async () => {
  const base = savedSubject(await prepared()).local.record;
  for (const bad of [
    { ...base, ownerId: "student-b" },
    { ...base, verifiedArtifactIds: [] },
    { ...base, status: "corrupt" },
    { ...base, manifestSha256: "0".repeat(64) },
  ]) {
    local.state.packs = [bad];
    expect(await readSavedSubjects("student-a")).toEqual([]);
  }
});
it("isolates cached views by account and query scope", async () => {
  await rememberStudentView("student-a", ["home", "grade-12"], { completedLessons: 17 });
  expect(await readStudentView("student-a", ["home", "grade-12"])).toEqual({
    completedLessons: 17,
  });
  expect(await readStudentView("student-a", ["home", "grade-11"])).toBeUndefined();
  local.state.activeOwnerId = "student-b";
  expect(await readStudentView("student-a", ["home", "grade-12"])).toBeUndefined();
  expect(await readStudentView("student-b", ["home", "grade-12"])).toBeUndefined();
});
