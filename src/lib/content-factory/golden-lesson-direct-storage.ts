/**
 * Shared naming rules for the direct (no-ZIP) lesson intake.
 *
 * Storage keys must be ASCII-safe while the logical manifest paths may be Arabic,
 * so the object name is derived deterministically from the declared hash. Both the
 * upload step and every later verification step must resolve the same object.
 */

export const GOLDEN_DIRECT_BUCKET = "golden-lesson-intake-v2";

/** Marker written into `verified_storage_path` for direct intakes (no ZIP object exists). */
export const DIRECT_VERIFIED_PATH_PREFIX = "direct-intake://";

export function storageObjectName(
  declaration: { path: string; sha256: string },
  index: number,
): string {
  const extension = (/\.([A-Za-z0-9]{1,8})$/.exec(declaration.path)?.[1] ?? "bin").toLowerCase();
  return `${String(index).padStart(2, "0")}-${declaration.sha256}.${extension}`;
}

export function directIntakeStoragePath(
  ownerId: string,
  intakeId: string,
  declaration: { path: string; sha256: string },
  index: number,
): string {
  return `${ownerId}/${intakeId}/${storageObjectName(declaration, index)}`;
}

export function isDirectVerifiedPath(path: string | null | undefined): boolean {
  return typeof path === "string" && path.startsWith(DIRECT_VERIFIED_PATH_PREFIX);
}
