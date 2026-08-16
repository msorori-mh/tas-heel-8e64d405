/**
 * 18C — entitlement abstraction (guard #7).
 *
 * V1 policy: any file the student already downloaded through the authenticated
 * delivery route may be reopened offline. The abstraction exists from day one
 * so subscriptions can revoke offline copies later without touching the viewer.
 */

import { getEntry, removeFile } from "./pdf-cache";

export type EntitlementDecision = { allowed: boolean; reason?: string };

let policy: (resourceId: string) => Promise<EntitlementDecision> = async (resourceId) => {
  const entry = await getEntry(resourceId);
  if (!entry) return { allowed: false, reason: "not_cached" };
  return { allowed: true };
};

/** Replaces the V1 policy (used once subscriptions gate offline content). */
export function setOfflineEntitlementPolicy(
  next: (resourceId: string) => Promise<EntitlementDecision>,
): void {
  policy = next;
}

export async function canOpenCachedResource(resourceId: string): Promise<EntitlementDecision> {
  try {
    return await policy(resourceId);
  } catch {
    return { allowed: false, reason: "policy_error" };
  }
}

/** Drops a local copy the student is no longer entitled to. */
export async function revokeCachedResource(resourceId: string): Promise<void> {
  await removeFile(resourceId);
}
