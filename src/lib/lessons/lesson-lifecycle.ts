/**
 * 20C-B — lesson capability editorial lifecycle (DRAFT → REVIEW → READY).
 *
 * Data layer applied in 20C-A: table `lesson_capability_lifecycle` +
 * SECURITY DEFINER RPC `lesson_capability_transition`.
 *
 * RLS recap (unchanged here):
 *  - content staff read every row
 *  - students read only rows with status = 'READY'
 *
 * Because students cannot read non-READY rows, the student gate uses the
 * "managed lesson" rule: once a lesson has at least one READY lifecycle row
 * it is managed, and every lifecycle-bearing capability then needs its own
 * READY row to render. Lessons with no readable rows keep 20B legacy
 * behaviour (no silent hiding of existing content).
 */
import { supabase } from "@/integrations/supabase/client";
import {
  LEGACY_CAPABILITY_TO_KEY,
  LIFECYCLE_CAPABILITIES,
  isLifecycleStudentVisible,
  type LessonCapabilityLifecycleEntry,
  type LessonCapabilityLifecycleStatus,
  type LessonContentCapabilityKey,
  type LessonLifecycleMap,
} from "./lesson-content-contract";
import { V3_LIFECYCLE_TO_PACKAGE, type V3LifecycleCapability } from "./capability-mapping";
import type { ApplicabilityMap, CapabilityApplicability } from "./content-v3";

export type { LessonCapabilityLifecycleStatus };

export interface LessonLifecycleRow {
  capability: string;
  status: LessonCapabilityLifecycleStatus;
  applicability: CapabilityApplicability;
  ready_at: string | null;
  ready_snapshot: unknown | null;
  draft_updated_at: string | null;
  reviewed_at: string | null;
}

/* ------------------------------------------------------------------ */
/* Pure helpers (unit tested)                                          */
/* ------------------------------------------------------------------ */

export function rowsToLifecycleMap(rows: readonly LessonLifecycleRow[]): LessonLifecycleMap {
  const map: LessonLifecycleMap = {};
  for (const row of rows) {
    const key = row.capability as LessonContentCapabilityKey;
    if (!LIFECYCLE_CAPABILITIES.includes(key)) continue;
    map[key] = {
      status: row.status,
      hasReady: row.ready_at != null || row.ready_snapshot != null,
    } satisfies LessonCapabilityLifecycleEntry;
  }
  return map;
}

/** Stored per-lesson applicability, translated into the public Content V3 vocabulary. */
export function rowsToApplicabilityMap(rows: readonly LessonLifecycleRow[]): ApplicabilityMap {
  const map: ApplicabilityMap = {};
  for (const row of rows) {
    const packageKey = V3_LIFECYCLE_TO_PACKAGE[row.capability as V3LifecycleCapability];
    if (!packageKey) continue;
    if (
      row.applicability === "REQUIRED" ||
      row.applicability === "OPTIONAL" ||
      row.applicability === "NA"
    ) {
      map[packageKey] = row.applicability;
    }
  }
  return map;
}

/** Legal next states for the workflow buttons. */
export function allowedTransitions(
  status: LessonCapabilityLifecycleStatus | null,
): LessonCapabilityLifecycleStatus[] {
  switch (status) {
    case "READY":
      return ["DRAFT"];
    case "REVIEW":
      return ["READY", "DRAFT"];
    case "DRAFT":
      return ["REVIEW"];
    default:
      return ["DRAFT"];
  }
}

export const STATUS_LABEL_AR: Record<LessonCapabilityLifecycleStatus, string> = {
  DRAFT: "مسودة",
  REVIEW: "قيد المراجعة",
  READY: "معتمد",
};

/**
 * Student-side gate for the 18B capability list.
 * `readyKeys` are the capability keys the student could actually read as
 * READY rows. `managed` = the lesson has lifecycle rows at all.
 */
export function filterStudentCapabilitiesByLifecycle<T extends { type: string }>(
  capabilities: readonly T[],
  opts: { managed: boolean; readyKeys: ReadonlySet<string> },
): T[] {
  if (!opts.managed) return [...capabilities];
  return capabilities.filter((c) => {
    const key = LEGACY_CAPABILITY_TO_KEY[c.type];
    if (!key) return true;
    if (!LIFECYCLE_CAPABILITIES.includes(key)) return true;
    return opts.readyKeys.has(key);
  });
}

export function lifecycleVisibleForStudent(
  entry: LessonCapabilityLifecycleStatus | LessonCapabilityLifecycleEntry | undefined,
): boolean {
  return isLifecycleStudentVisible(entry);
}

/* ------------------------------------------------------------------ */
/* Data access                                                         */
/* ------------------------------------------------------------------ */

/** Staff read: every lifecycle row of the lesson. */
export async function fetchLessonLifecycleRows(lessonId: string): Promise<LessonLifecycleRow[]> {
  const { data, error } = await supabase
    .from("lesson_capability_lifecycle")
    .select("capability,status,applicability,ready_at,ready_snapshot,draft_updated_at,reviewed_at")
    .eq("lesson_id", lessonId);
  if (error) throw error;
  return (data ?? []) as unknown as LessonLifecycleRow[];
}

/**
 * Student read: CF10-R3 server-side visibility gate.
 * `lesson_student_content_gate` is SECURITY DEFINER and reports only whether a
 * lesson is editorially managed, whether it is visible, and which capabilities
 * are READY — never any draft content. Falls back to the RLS-filtered table
 * read when the RPC is not deployed yet.
 */
export async function fetchStudentLifecycleGate(
  lessonId: string,
): Promise<{ managed: boolean; visible: boolean; readyKeys: Set<string> }> {
  const rpc = await (supabase.rpc as any)("lesson_student_content_gate", { _lesson_id: lessonId });
  if (!rpc.error) {
    const row = (Array.isArray(rpc.data) ? rpc.data[0] : rpc.data) as
      | { managed: boolean; visible: boolean; ready_capabilities: string[] | null }
      | undefined;
    return {
      managed: row?.managed === true,
      visible: row?.visible !== false,
      readyKeys: new Set(row?.ready_capabilities ?? []),
    };
  }

  const { data, error } = await supabase
    .from("lesson_capability_lifecycle")
    .select("capability,status")
    .eq("lesson_id", lessonId);
  if (error) throw error;
  const rows = (data ?? []) as { capability: string; status: string }[];
  const readyKeys = new Set(rows.filter((r) => r.status === "READY").map((r) => r.capability));
  return { managed: rows.length > 0, visible: rows.length === 0 || readyKeys.size > 0, readyKeys };
}

/** Batch gate for subject lesson lists; unknown lessons default to visible. */
export async function fetchStudentLessonVisibility(
  lessonIds: readonly string[],
): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  if (lessonIds.length === 0) return map;
  const { data, error } = await (supabase.rpc as any)("lessons_student_visible", {
    _lesson_ids: lessonIds,
  });
  if (error) {
    for (const id of lessonIds) map.set(id, true);
    return map;
  }
  for (const row of (data ?? []) as { lesson_id: string; visible: boolean }[]) {
    map.set(row.lesson_id, row.visible !== false);
  }
  for (const id of lessonIds) if (!map.has(id)) map.set(id, true);
  return map;
}
