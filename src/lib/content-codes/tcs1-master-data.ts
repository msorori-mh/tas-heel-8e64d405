/**
 * OFFICIAL_CONTENT_CODE_SYSTEM_13B — master-data snapshot for TCS-1.
 *
 * These are the ONLY grades and curriculum tracks the code generator may use.
 * The list is synced from the live master data tables (read-only) — never
 * invent a grade_slug or a track_code that does not exist there.
 *
 * Last verified against public.grades / public.curriculum_tracks: 2026-08-14.
 *
 * Pure data — no DB access. Client, server and script safe.
 */

export interface Tcs1GradeRef {
  /** grades.slug — the authoritative master-data key. */
  gradeSlug: string;
  /** Short form used inside every TCS-1 code. */
  gradeShort: string;
  nameAr: string;
  sortOrder: number;
}

export interface Tcs1TrackRef {
  /** curriculum_tracks.track_code — the authoritative master-data key. */
  trackCode: string;
  nameAr: string;
  isActive: boolean;
}

export const TCS1_GRADES: readonly Tcs1GradeRef[] = [
  { gradeSlug: "grade-10", gradeShort: "g10", nameAr: "الصف الأول الثانوي", sortOrder: 1 },
  { gradeSlug: "grade-11", gradeShort: "g11", nameAr: "الصف الثاني الثانوي", sortOrder: 2 },
  { gradeSlug: "grade-12", gradeShort: "g12", nameAr: "الصف الثالث الثانوي", sortOrder: 3 },
] as const;

export const TCS1_TRACKS: readonly Tcs1TrackRef[] = [
  { trackCode: "sanaa", nameAr: "منهج صنعاء", isActive: true },
  { trackCode: "aden", nameAr: "منهج عدن", isActive: true },
  { trackCode: "other", nameAr: "آخر", isActive: true },
] as const;

export const TCS1_MASTER_DATA_VERIFIED_AT = "2026-08-14" as const;
