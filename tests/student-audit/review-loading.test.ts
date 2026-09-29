import { expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: db }));
import { fetchReviewItems } from "@/lib/review/review-data";
it("starts independent review reads together and preserves lesson/progress scope", async () => {
  const reads: string[] = [];
  const filters: unknown[] = [];
  const finish = new Map<string, (result: unknown) => void>();
  db.from.mockImplementation((table: string) => {
    const builder = {
      select: () => builder,
      order: () => builder,
      in: (key: string, ids: string[]) => {
        filters.push([table, key, ids]);
        return builder;
      },
      eq: (key: string, value: unknown) => {
        filters.push([table, key, value]);
        return builder;
      },
      range: () => {
        reads.push(table);
        if (table === "lessons")
          return Promise.resolve({
            data: [
              {
                id: "lesson-a",
                title: "درس",
                subject_id: "subject-a",
                unit_id: "unit-a",
                sort_order: 1,
              },
            ],
            error: null,
          });
        return new Promise((resolve) => finish.set(table, resolve));
      },
    };
    return builder;
  });
  const request = fetchReviewItems({
    subjects: [{ id: "subject-a", name: "الأحياء", icon: null, sort_order: 1 }],
    userId: "student-a",
  });
  await vi.waitFor(() =>
    expect(reads).toEqual(["lessons", "lesson_summaries", "units", "user_progress"]),
  );
  finish.get("lesson_summaries")!({
    data: [{ lesson_id: "lesson-a", summary: "ملخص مفيد للدرس", key_points: [], study_tip: null }],
    error: null,
  });
  finish.get("units")!({ data: [{ id: "unit-a", title: "الوحدة الأولى" }], error: null });
  finish.get("user_progress")!({ data: [{ lesson_id: "lesson-a" }], error: null });
  const rows = await request;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    lessonId: "lesson-a",
    subjectName: "الأحياء",
    unitTitle: "الوحدة الأولى",
    isCompleted: true,
  });
  expect(filters).toContainEqual(["user_progress", "user_id", "student-a"]);
  expect(filters).toContainEqual(["lesson_summaries", "lesson_id", ["lesson-a"]]);
});
