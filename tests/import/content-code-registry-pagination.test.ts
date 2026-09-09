import { describe, expect, it } from "vitest";
import { loadContentCodeRegistry } from "@/lib/content-codes/content-code-registry.server";

function fixture(cap = 14, failAt = -1, emptyAt = -1) {
  const lessons = Array.from({ length: 20 }, (_, i) =>
    ["fiqh", "quran"].map((subject) => ({
      id: `${String(i).padStart(3, "0")}-${subject}`,
      slug: `${subject}-${i + 1}`,
      title: subject === "fiqh" && i === 19 ? "التعزير" : `${subject} ${i + 1}`,
      subject_id: subject,
      unit_id: null,
      semester: 1,
      sort_order: i + 1,
    })),
  ).flat();
  const offsets: number[] = [];
  const orders: string[][] = [];
  const client = {
    from(table: string) {
      let from = 0;
      let to = Infinity;
      const order: string[] = [];
      if (table === "lessons") orders.push(order);
      const query = {
        select() {
          return query;
        },
        order(column: string) {
          order.push(column);
          return query;
        },
        range(start: number, end: number) {
          from = start;
          to = end;
          offsets.push(start);
          return query;
        },
        then(resolve: (value: unknown) => unknown) {
          const data =
            table === "lessons"
              ? from >= emptyAt && emptyAt >= 0
                ? []
                : lessons.slice(from, Math.min(to + 1, from + cap))
              : table === "subjects"
                ? ["fiqh", "quran"].map((id) => ({ id, code: id, name: id }))
                : [];
          return Promise.resolve({
            data,
            count: lessons.length,
            error:
              table === "lessons" && failAt >= 0 && from >= failAt
                ? { message: "page failed" }
                : null,
          }).then(resolve);
        },
      };
      return query;
    },
  };
  return {
    client: client as unknown as Parameters<typeof loadContentCodeRegistry>[0],
    offsets,
    orders,
  };
}

describe("complete import lesson registry", () => {
  it("retains all 20 lessons per subject even when the server caps each response at 14", async () => {
    const { client, offsets, orders } = fixture();
    const registry = await loadContentCodeRegistry(client);
    for (const subject of ["fiqh", "quran"]) {
      const visible = registry.lessons.filter(
        (l) => l.subjectCode === subject && l.unitCode === null,
      );
      expect(visible).toHaveLength(20);
      expect(visible.map((l) => l.sortOrder)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    }
    expect(registry.lessons.find((l) => l.lessonCode === "fiqh-20")?.title).toBe("التعزير");
    expect(offsets).toEqual([0, 14, 28]);
    expect(orders.every((order) => order.join() === "sort_order,id")).toBe(true);
  });

  it("does not return a silently incomplete registry when a later page fails", async () => {
    await expect(loadContentCodeRegistry(fixture(14, 14).client)).rejects.toThrow("page failed");
  });

  it("stops with an error if a page makes no progress before the total", async () => {
    await expect(loadContentCodeRegistry(fixture(14, -1, 14).client)).rejects.toThrow("كاملة");
  });

  it("finishes without an extra out-of-range request at an exact page boundary", async () => {
    const { client, offsets } = fixture(20);
    expect((await loadContentCodeRegistry(client)).lessons).toHaveLength(40);
    expect(offsets).toEqual([0, 20]);
  });
});
