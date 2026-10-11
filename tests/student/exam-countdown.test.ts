import { describe, expect, it } from "vitest";
import {
  adenToday,
  daysBetween,
  examCountdownLabel,
  pickUpcomingExam,
  schedulesOverlap,
  type ExamSchedule,
} from "../../src/lib/exams/exam-countdown";
import { arabicCount, DAY_FORMS } from "../../src/lib/i18n/arabic-count";
const row = (patch: Partial<ExamSchedule> = {}): ExamSchedule => ({
  id: "a",
  curriculum_track_id: "sanaa",
  grade_id: "12",
  semester: 2,
  exam_kind: "ministerial",
  title: "اختبارات الثانوية",
  starts_on: "2027-06-01",
  ends_on: "2027-06-15",
  is_published: true,
  ...patch,
});
const context = { trackId: "sanaa", gradeId: "12", today: "2027-05-01" };
describe("exam countdown", () => {
  it("isolates curriculum tracks and unpublished dates", () => {
    const rows = [
      row(),
      row({ id: "b", curriculum_track_id: "aden", starts_on: "2027-06-02" }),
      row({ id: "draft", starts_on: "2027-05-02", is_published: false }),
    ];
    expect(pickUpcomingExam(rows, context)?.id).toBe("a");
    expect(pickUpcomingExam(rows, { ...context, trackId: "aden" })?.id).toBe("b");
    expect(pickUpcomingExam(rows, { ...context, trackId: null })).toBeNull();
  });
  it("supports all grades and deterministic grade/kind tie breaks", () => {
    const rows = [
      row({ id: "global", grade_id: null }),
      row({ id: "midterm", exam_kind: "midterm" }),
      row(),
    ];
    expect(pickUpcomingExam(rows, { ...context, gradeId: "10" })?.id).toBe("global");
    expect(pickUpcomingExam(rows, context)?.id).toBe("a");
    expect(rows[0].id).toBe("global");
  });
  it("shows ongoing exams inclusively and advances after the end", () => {
    const next = row({ id: "next", starts_on: "2027-07-01", ends_on: null });
    for (const today of ["2027-06-01", "2027-06-15"])
      expect(
        examCountdownLabel(pickUpcomingExam([row(), next], { ...context, today })!, today),
      ).toContain("جارية");
    expect(pickUpcomingExam([row(), next], { ...context, today: "2027-06-16" })?.id).toBe("next");
    expect(pickUpcomingExam([row()], { ...context, today: "2027-06-16" })).toBeNull();
  });
  it("counts calendar days in Aden around UTC midnight", () => {
    expect(adenToday(new Date("2027-05-31T20:59:59Z"))).toBe("2027-05-31");
    expect(adenToday(new Date("2027-05-31T21:00:00Z"))).toBe("2027-06-01");
    expect(daysBetween("2027-05-31", "2027-06-01")).toBe(1);
  });
  it("uses correct Arabic number forms", () => {
    expect(arabicCount(1, DAY_FORMS)).toBe("يوم واحد");
    expect(arabicCount(2, DAY_FORMS)).toBe("يومان");
    expect(arabicCount(3, DAY_FORMS)).toBe("3 أيام");
    expect(arabicCount(14, DAY_FORMS)).toBe("14 يوماً");
  });
  it("warns about overlapping global or specific published dates only", () => {
    expect(schedulesOverlap(row(), row({ id: "b", grade_id: null }))).toBe(true);
    expect(schedulesOverlap(row(), row({ id: "b", semester: 1 }))).toBe(true);
    expect(schedulesOverlap(row(), row({ id: "b", curriculum_track_id: "aden" }))).toBe(false);
    expect(schedulesOverlap(row(), row({ id: "b", is_published: false }))).toBe(false);
  });
});
