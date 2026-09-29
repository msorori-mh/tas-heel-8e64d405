import { forgetStudentIdentity, clearStudentViews } from "@/lib/offline/student-shell-cache";
import { setActiveOfflineOwner } from "@/lib/offline/offline-state-store";

export const EXPLICIT_SIGN_OUT = "tamkeen:explicit-sign-out";

/** Remove display caches; downloaded packages/unsynced answers remain owner-isolated. */
export async function clearSignedOutPresentation(): Promise<void> {
  window.dispatchEvent(new Event(EXPLICIT_SIGN_OUT));
  localStorage.removeItem("tamkeen-academy-offline-owner");
  window.dispatchEvent(new Event("academy-offline-change"));
  await setActiveOfflineOwner(null);
  await forgetStudentIdentity();
  await clearStudentViews();
}
