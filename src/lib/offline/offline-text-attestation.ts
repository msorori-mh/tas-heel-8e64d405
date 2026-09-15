import { sha256Hex } from "./offline-pack-contract";

// Matches _v3_canonical_json_v1 for the integer/string/null snapshot fields used
// by text capabilities. Refuse other numbers instead of guessing PG formatting.
function canonicalSnapshot(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("OFFLINE_SNAPSHOT_NUMBER_UNSUPPORTED");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalSnapshot).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalSnapshot(object[key])}`)
      .join(",")}}`;
  }
  throw new Error("OFFLINE_SNAPSHOT_VALUE_UNSUPPORTED");
}

/** Verify either an exact-body publication or the approved legacy V3 snapshot.
 * Never replace approval with a hash computed from unapproved current content. */
export async function isOfflineTextApproved(params: {
  body?: string;
  bodySha256: string;
  expectedSha256: string;
  lessonId: string;
  capability: string;
  readySnapshot?: unknown;
}): Promise<boolean> {
  if (params.bodySha256 === params.expectedSha256) return true;
  const snapshot = params.readySnapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return false;
  const record = snapshot as Record<string, unknown>;
  if (
    record.snapshotVersion !== "v3.snapshot.1" ||
    record.lessonId !== params.lessonId ||
    record.capability !== params.capability ||
    !Array.isArray(record.payload)
  )
    return false;
  const field =
    params.capability === "quickReview"
      ? "summary"
      : params.capability === "officialBookContent" || params.capability === "tamkeenExplanation"
        ? "content"
        : null;
  if (!field) return false;
  let snapshotHash: string;
  try {
    snapshotHash = await sha256Hex(new TextEncoder().encode(canonicalSnapshot(snapshot)));
  } catch {
    return false;
  }
  if (snapshotHash !== params.expectedSha256) return false;
  for (const item of record.payload) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const approvedBody = (item as Record<string, unknown>)[field];
    if (typeof approvedBody !== "string") continue;
    if (typeof params.body === "string") {
      if (approvedBody === params.body) return true;
    } else if ((await sha256Hex(new TextEncoder().encode(approvedBody))) === params.bodySha256) {
      // The manifest may receive only database-generated body metadata.
      // Compare that exact body hash to content in the verified snapshot.
      return true;
    }
  }
  return false;
}
