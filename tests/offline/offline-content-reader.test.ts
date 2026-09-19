import { expect, it, vi } from "vitest";
import {
  readOfflineContent,
  readOfflineLessonGates,
} from "../../src/lib/offline/offline-content-reader";

it("bounds lesson batches and paginates full pages without losing rows", async () => {
  const ids = Array.from({ length: 19 }, (_, i) => String(i));
  const read = vi.fn(async (batch: string[], from: number) => ({
    data:
      from === 0 ? Array.from({ length: 64 }, (_, i) => `${batch[0]}:${i}`) : [`${batch[0]}:last`],
    error: null,
  }));
  const rows = await readOfflineContent("books", ids, read);
  expect(rows).toHaveLength(195);
  expect(read.mock.calls.map(([batch]) => batch.length)).toEqual([8, 8, 8, 8, 3, 3]);
  expect(new Set(rows).size).toBe(195);
});

it("falls back only for a missing metadata column and retains the legacy mode", async () => {
  const read = vi.fn(async (_ids, from, _to, legacy) =>
    legacy
      ? {
          data: from === 0 ? [{ content: "verified through existing attestation" }] : [],
          error: null,
        }
      : {
          data: null,
          error: { code: "42703", message: "column offline_metadata_v1 does not exist" },
        },
  );
  expect(await readOfflineContent("books", Array(9).fill("lesson"), read)).toHaveLength(2);
  expect(read.mock.calls.map((call) => call[3])).toEqual([false, true, true, true, true]);
});

it.each(["42501", "57014", "PGRST204"])(
  "does not hide unrelated %s errors or leak private messages",
  async (code) => {
    const read = vi.fn(async () => ({
      data: null,
      error: { code, message: "private database detail" },
    }));
    await expect(readOfflineContent("summaries", ["lesson"], read)).rejects.toThrow(
      `content_summaries_${code}_lookup_failed`,
    );
    expect(read).toHaveBeenCalledTimes(1);
  },
);

it("fails the entire subject if a later page fails", async () => {
  const read = vi
    .fn()
    .mockResolvedValueOnce({ data: Array(64).fill({ id: 1 }), error: null })
    .mockResolvedValueOnce({ data: null, error: { code: "57014" } });
  await expect(readOfflineContent("books", ["lesson"], read)).rejects.toThrow("57014");
});

it("stops after cancellation without another request", async () => {
  const controller = new AbortController();
  const read = vi.fn(async () => {
    controller.abort();
    return { data: Array(64).fill({ id: 1 }), error: null };
  });
  await expect(readOfflineContent("books", ["lesson"], read, controller.signal)).rejects.toThrow();
  expect(read).toHaveBeenCalledTimes(1);
});
it("does not enter the fallback after cancellation during a missing-column response", async () => {
  const controller = new AbortController();
  const read = vi.fn(async () => {
    controller.abort();
    return { data: null, error: { code: "42703", message: "offline_metadata_v1 missing" } };
  });
  await expect(readOfflineContent("books", ["lesson"], read, controller.signal)).rejects.toThrow();
  expect(read).toHaveBeenCalledTimes(1);
});
it("does not accept null data as an empty successful content list", async () => {
  await expect(
    readOfflineContent("books", ["lesson"], async () => ({ data: null, error: null })),
  ).rejects.toThrow("content_books_NODATA_lookup_failed");
});
it.each(["42703", "PGRST204"])(
  "paginates legacy bodies after %s one body at a time",
  async (code) => {
    const read = vi.fn(async (_ids, from, to, legacy) =>
      legacy
        ? { data: Array.from({ length: 19 }, (_, i) => i).slice(from, to + 1), error: null }
        : { data: null, error: { code, message: "offline_metadata_v1 missing" } },
    );
    expect(await readOfflineContent("books", ["lesson"], read)).toEqual(
      Array.from({ length: 19 }, (_, i) => i),
    );
    expect(read.mock.calls.map((call) => [call[1], call[2]])).toEqual([
      [0, 63],
      ...Array.from({ length: 20 }, (_, i) => [i, i]),
    ]);
  },
);

it("retries only the failed legacy page once without duplicating earlier rows", async () => {
  let failed = false;
  const read = vi.fn(async (_ids, from, to, legacy) => {
    if (!legacy)
      return { data: null, error: { code: "42703", message: "offline_metadata_v1 missing" } };
    if (from === 1 && !failed) {
      failed = true;
      return { data: null, error: { code: "57014", message: "private timeout detail" } };
    }
    return { data: ["first", "second", "third"].slice(from, to + 1), error: null };
  });
  expect(await readOfflineContent("books", ["lesson"], read)).toEqual(["first", "second", "third"]);
  expect(read.mock.calls.map((call) => [call[1], call[2]])).toEqual([
    [0, 63],
    [0, 0],
    [1, 1],
    [1, 1],
    [2, 2],
    [3, 3],
  ]);
});

it.each(["57014", "42501"])(
  "rejects an incomplete legacy subject after persistent %s",
  async (code) => {
    const read = vi.fn(async (_ids, from, _to, legacy) => {
      if (!legacy)
        return { data: null, error: { code: "42703", message: "offline_metadata_v1 missing" } };
      return from === 0
        ? { data: ["saved only if the whole read succeeds"], error: null }
        : { data: null, error: { code, message: "private database detail" } };
    });
    await expect(readOfflineContent("books", ["lesson"], read)).rejects.toThrow(
      `content_books_${code}_lookup_failed`,
    );
    expect(read).toHaveBeenCalledTimes(code === "57014" ? 4 : 3);
  },
);

it("does not retry a legacy timeout after the caller cancels", async () => {
  const controller = new AbortController();
  const read = vi.fn(async (_ids, _from, _to, legacy) => {
    if (!legacy)
      return { data: null, error: { code: "42703", message: "offline_metadata_v1 missing" } };
    controller.abort();
    return { data: null, error: { code: "57014" } };
  });
  await expect(readOfflineContent("books", ["lesson"], read, controller.signal)).rejects.toThrow();
  expect(read).toHaveBeenCalledTimes(2);
});
it.each(["42501", "57014", "PGRST202"])(
  "does not substitute single-lesson reads for unrelated %s gate failures",
  async (code) => {
    const single = vi.fn();
    await expect(
      readOfflineLessonGates(
        ["a"],
        async () => ({ data: null, error: { code, message: "private database failure" } }),
        single,
      ),
    ).rejects.toThrow(`content_gates_${code}_lookup_failed`);
    expect(single).not.toHaveBeenCalled();
  },
);
it("preserves an access failure from the legacy single-lesson RPC", async () => {
  const single = vi.fn(async () => ({ data: null, error: { code: "42501" } }));
  await expect(
    readOfflineLessonGates(
      ["a", "b"],
      async () => ({
        data: null,
        error: { code: "PGRST202", message: "lesson_student_content_gates missing" },
      }),
      single,
    ),
  ).rejects.toThrow("content_gates_42501_lookup_failed");
  expect(single).toHaveBeenCalledTimes(1);
});
it("cancels between legacy gate reads", async () => {
  const controller = new AbortController();
  const single = vi.fn(async (id) => {
    controller.abort();
    return { data: [{ lesson_id: id }], error: null };
  });
  await expect(
    readOfflineLessonGates(
      ["a", "b"],
      async () => ({
        data: null,
        error: { code: "42883", message: "lesson_student_content_gates missing" },
      }),
      single,
      controller.signal,
    ),
  ).rejects.toThrow();
  expect(single).toHaveBeenCalledTimes(1);
});
