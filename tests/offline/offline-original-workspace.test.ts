import { describe, it, expect } from "vitest";
import {
  MemoryOfflineStateAdapter,
  OfflineStateRepository,
  setActiveOfflineOwner,
} from "../../src/lib/offline/offline-state-store";
import { readOfflineView, saveOfflineView } from "../../src/lib/offline/offline-view-cache";

describe("original workspace snapshots", () => {
  it("restores display data after restart but never across accounts or after logout", async () => {
    const adapter = new MemoryOfflineStateAdapter();
    const repo = new OfflineStateRepository(adapter);
    await setActiveOfflineOwner("TEST_ONLY_student", repo);
    await saveOfflineView("TEST_ONLY_student", "student-profile", { full_name: "TEST_ONLY" }, repo);
    const restarted = new OfflineStateRepository(adapter);
    expect(await readOfflineView("TEST_ONLY_student", "student-profile", restarted)).toEqual({
      full_name: "TEST_ONLY",
    });
    await setActiveOfflineOwner("TEST_ONLY_teacher", restarted);
    expect(await readOfflineView("TEST_ONLY_student", "student-profile", restarted)).toBeNull();
    await expect(
      saveOfflineView("TEST_ONLY_student", "student-profile", { full_name: "stale" }, restarted),
    ).rejects.toThrow("OFFLINE_OWNER_CHANGED");
    await setActiveOfflineOwner(null, restarted);
    expect(await readOfflineView("TEST_ONLY_student", "student-profile", restarted)).toBeNull();
  });
  it("keeps student and teacher displays separate for an account using both portals", async () => {
    const repo = new OfflineStateRepository(new MemoryOfflineStateAdapter());
    await setActiveOfflineOwner("TEST_ONLY_both", repo);
    await saveOfflineView("TEST_ONLY_both", "student-profile", { grade: 12 }, repo);
    await saveOfflineView("TEST_ONLY_both", "teacher:profile", { subject: "chemistry" }, repo);
    expect(await readOfflineView("TEST_ONLY_both", "student-profile", repo)).toEqual({ grade: 12 });
    expect(await readOfflineView("TEST_ONLY_both", "teacher:profile", repo)).toEqual({
      subject: "chemistry",
    });
  });
});
