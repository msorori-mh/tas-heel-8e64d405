import { beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: api }));
import {
  fetchAdminReviewCoverage,
  fetchReviewSummaryPreview,
} from "../../src/lib/review/admin-review-coverage";
import { fetchAllPaged } from "../../src/lib/review/review-paging";
beforeEach(() => vi.clearAllMocks());

it("loads all 1481 lesson facts in one call without downloading summaries", async () => {
  api.rpc.mockResolvedValue({
    data: Array.from({ length: 1481 }, (_, i) => ({
      lessonId: `l${i}`,
      lessonTitle: "درس",
      subjectId: "s",
      subjectName: "مادة",
      gradeId: "g",
      gradeName: "الثالث",
      unitId: null,
      unitTitle: null,
      trackIds: ["t"],
      trackNames: ["مسار"],
      deliveryMode: "standard",
      hasSummary: i < 787,
    })),
    error: null,
  });
  const data = await fetchAdminReviewCoverage();
  expect(data.summary.totalLessons).toBe(1481);
  expect(data.summary.lessonsWithSummary).toBe(787);
  expect(api.rpc).toHaveBeenCalledTimes(1);
  expect(api.from).not.toHaveBeenCalled();
  expect(data.lessons[0].summary).toBe("");
});
it("reports an aggregate failure without a costly fallback", async () => {
  api.rpc.mockResolvedValue({ data: null, error: { message: "forbidden" } });
  await expect(fetchAdminReviewCoverage()).rejects.toThrow("forbidden");
  expect(api.from).not.toHaveBeenCalled();
});
it("fetches a summary only for the requested preview lesson", async () => {
  const eq = vi.fn().mockReturnValue({
    maybeSingle: async () => ({
      data: { summary: "ملخص", key_points: [" نقطة ", 2], study_tip: null },
      error: null,
    }),
  });
  api.from.mockReturnValue({ select: () => ({ eq }) });
  expect((await fetchReviewSummaryPreview("lesson-26")).keyPoints).toEqual(["نقطة"]);
  expect(eq).toHaveBeenCalledWith("lesson_id", "lesson-26");
});
it("loads a curriculum larger than the default server row limit", async () => {
  const all = Array.from({ length: 1481 }, (_, i) => ({ id: i }));
  const data = await fetchAllPaged(async (from, to) => ({
    data: all.slice(from, to + 1),
    error: null,
  }));
  expect(data).toEqual(all);
});
it("never silently returns partial counts when its safety limit is reached", async () => {
  await expect(
    fetchAllPaged(async () => ({ data: [{ id: 1 }], error: null }), 1, 2),
  ).rejects.toThrow("حد التحميل الآمن");
});
