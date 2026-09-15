import { it, expect } from "vitest";
import { scopedBooks, textbookCoverage, textbookStatus, type ReportTextbook } from "./textbooks";
const book: ReportTextbook = {
  id: "b",
  title: "الكيمياء",
  book_type: "MAIN_TEXTBOOK",
  coverage_type: "FULL_ACADEMIC_YEAR",
  curriculum_track_id: null,
  semester: null,
  is_active: true,
  file_name: "chem.pdf",
  file_size: 100,
  storage_path: "book.pdf",
  version: "1",
  updated_at: "2026-09-15",
  created_by: null,
};
const tracks = [
  { id: "s", track_name: "صنعاء" },
  { id: "a", track_name: "عدن" },
];
it("one shared annual book covers both terms and tracks without duplicate files", () => {
  expect(scopedBooks([book], "a", "2")).toHaveLength(1);
  expect(textbookCoverage([book], tracks, [1, 2]).every((c) => c.covered)).toBe(true);
});
it("semester and track specific books do not fill other scope gaps", () => {
  const b = { ...book, curriculum_track_id: "s", coverage_type: "SEMESTER_SPECIFIC", semester: 1 };
  expect(textbookCoverage([b], tracks, [1, 2]).filter((c) => c.covered)).toHaveLength(1);
  expect(scopedBooks([b], "a", "1")).toHaveLength(0);
});
it("inactive or unbound files and exercise books do not fill required main-book coverage", () => {
  for (const b of [
    { ...book, is_active: false },
    { ...book, file_size: null },
    { ...book, book_type: "EXERCISE_BOOK" },
  ])
    expect(textbookCoverage([b], tracks, [1])[0].covered).toBe(false);
  expect(textbookStatus({ ...book, file_name: null })).toBe("بيانات الملف ناقصة");
});
