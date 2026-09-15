import { it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { allRows } from "./load";
it("loads every page beyond the API row boundary", async () => {
  const rows = Array.from({ length: 421 }, (_, id) => ({ id }));
  expect(await allRows(async (a, b) => ({ data: rows.slice(a, b + 1), error: null }))).toEqual(
    rows,
  );
});
it("rejects partial results on a later page failure", async () => {
  await expect(
    allRows(async (a) =>
      a === 0
        ? { data: Array.from({ length: 200 }, () => 1), error: null }
        : { data: null, error: { message: "denied" } },
    ),
  ).rejects.toThrow("denied");
});
it("honors cancellation before issuing another query", async () => {
  const c = new AbortController();
  c.abort();
  const q = vi.fn();
  await expect(allRows(q, c.signal)).rejects.toThrow();
  expect(q).not.toHaveBeenCalled();
});
