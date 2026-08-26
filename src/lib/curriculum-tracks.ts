import { supabase } from "@/integrations/supabase/client";

export type CurriculumTrack = {
  id: string;
  track_code: string;
  track_name: string;
};

/**
 * Fetch curriculum tracks allowed for a governorate via governorate_curriculum_map.
 * Source of truth — no hard-coding of (governorate → tracks).
 */
export async function fetchTracksForGovernorate(govId: string): Promise<CurriculumTrack[]> {
  const { data, error } = await supabase
    .from("governorate_curriculum_map")
    .select(
      "curriculum_track:curriculum_tracks!governorate_curriculum_map_curriculum_track_id_fkey(id,track_code,track_name)",
    )
    .eq("governorate_id", govId);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Array<{ curriculum_track: CurriculumTrack | null }>;
  return rows
    .map((r) => r.curriculum_track)
    .filter((t): t is CurriculumTrack => !!t)
    .sort((a, b) => a.track_name.localeCompare(b.track_name, "ar"));
}

/** Translate a curriculum track error from the trigger into a friendly Arabic message. */
export function translateTrackError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (msg.includes("curriculum_track_not_allowed_for_governorate")) {
    return "المنهج المختار غير مسموح لهذه المحافظة.";
  }
  return "تعذّر حفظ المنهج الدراسي. حاول مرة أخرى.";
}
