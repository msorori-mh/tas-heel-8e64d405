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

export type { LessonCapabilityLifecycleStatus };

export interface LessonLifecycleRow {
  capability: string;
  status: LessonCapabilityLifecycleStatus;
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

export const TRANSITION_LABEL_AR: Record<LessonCapabilityLifecycleStatus, string> = {
  DRAFT: "إنشاء نسخة تعديل (مسودة)",
  REVIEW: "إرسال للمراجعة",
  READY: "اعتماد ونشر للطالب",
};

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
    .select("capability,status,ready_at,ready_snapshot,draft_updated_at,reviewed_at")
    .eq("lesson_id", lessonId);
  if (error) throw error;
  return (data ?? []) as unknown as LessonLifecycleRow[];
}

/** Student read: RLS returns READY rows only. */
export async function fetchStudentLifecycleGate(
  lessonId: string,
): Promise<{ managed: boolean; readyKeys: Set<string> }> {
  const { data, error } = await supabase
    .from("lesson_capability_lifecycle")
    .select("capability,status")
    .eq("lesson_id", lessonId);
  if (error) throw error;
  const rows = (data ?? []) as { capability: string; status: string }[];
  const readyKeys = new Set(rows.filter((r) => r.status === "READY").map((r) => r.capability));
  return { managed: readyKeys.size > 0, readyKeys };
}

export async function transitionCapability(input: {
  lessonId: string;
  capability: LessonContentCapabilityKey;
  to: LessonCapabilityLifecycleStatus;
  snapshot?: unknown;
  hash?: string | null;
}): Promise<void> {
  const { error } = await (supabase.rpc as any)("lesson_capability_transition", {
    _lesson_id: input.lessonId,
    _capability: input.capability,
    _to_status: input.to,
    _snapshot: input.snapshot ?? null,
    _hash: input.hash ?? null,
  });
  if (error) throw error;
}
