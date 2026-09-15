export type ReportTextbook = {
  id: string;
  title: string;
  book_type: string;
  coverage_type: string;
  curriculum_track_id: string | null;
  semester: number | null;
  is_active: boolean;
  file_name: string | null;
  file_size: number | null;
  storage_path: string;
  version: string;
  updated_at: string;
  created_by: string | null;
};
export function hasBookFile(book: ReportTextbook) {
  return !!book.storage_path && !!book.file_name && (book.file_size ?? 0) > 0;
}
export function scopedBooks(books: ReportTextbook[], track: string, semester: string) {
  return books.filter(
    (b) =>
      (!track || b.curriculum_track_id === null || b.curriculum_track_id === track) &&
      (!semester || b.coverage_type === "FULL_ACADEMIC_YEAR" || String(b.semester) === semester),
  );
}
export function textbookCoverage(
  books: ReportTextbook[],
  tracks: { id: string; track_name: string }[],
  terms: number[],
) {
  return tracks.flatMap((track) =>
    terms.map((term) => ({
      track: track.track_name,
      term,
      covered: books.some(
        (b) =>
          b.book_type === "MAIN_TEXTBOOK" &&
          b.is_active &&
          hasBookFile(b) &&
          (b.curriculum_track_id === null || b.curriculum_track_id === track.id) &&
          (b.coverage_type === "FULL_ACADEMIC_YEAR" || b.semester === term),
      ),
    })),
  );
}
export function textbookStatus(book: ReportTextbook) {
  return !hasBookFile(book) ? "بيانات الملف ناقصة" : book.is_active ? "مفعّل" : "غير مفعّل";
}
