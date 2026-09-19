import { expect, it, vi } from "vitest";
import { readPreparedOfflineSources } from "../../src/lib/offline/offline-prepared-sources.server";
const empty = {
  version: 1,
  pending: false,
  gates: [],
  ready: [],
  books: [],
  explanations: [],
  summaries: [],
  resources: [],
};
const signal = new AbortController().signal;
it("bounds prepared calls and merges only requested lesson scopes", async () => {
  const rpc = vi.fn((_name, args) => ({
    abortSignal: async () => ({
      data: {
        ...empty,
        gates: args._lesson_ids.map((lesson_id: string) => ({
          lesson_id,
          managed: true,
          visible: true,
          ready_capabilities: [],
        })),
      },
      error: null,
    }),
  }));
  const result = await readPreparedOfflineSources(
    { rpc },
    Array.from({ length: 130 }, (_, i) => String(i)),
    signal,
  );
  expect(result?.gates).toHaveLength(130);
  expect(rpc.mock.calls.map((c) => c[1]._lesson_ids.length)).toEqual([64, 64, 2]);
});
it.each(["PGRST202", "42883"])(
  "uses legacy only for the specifically absent RPC: %s",
  async (code) => {
    const rpc = () => ({
      abortSignal: async () => ({
        data: null,
        error: { code, message: "offline_manifest_sources_v1 missing" },
      }),
    });
    expect(await readPreparedOfflineSources({ rpc }, ["a"], signal)).toBeNull();
  },
);
it.each(["42501", "57014", "PGRST204"])("never hides %s behind raw body reads", async (code) => {
  const rpc = () => ({
    abortSignal: async () => ({ data: null, error: { code, message: "private" } }),
  });
  await expect(readPreparedOfflineSources({ rpc }, ["a"], signal)).rejects.toThrow(
    `content_prepared_${code}_lookup_failed`,
  );
});
it("fails closed on malformed or cross-lesson descriptor responses", async () => {
  for (const data of [{}, { ...empty, books: [{ id: "1", lesson_id: "outside" }] }]) {
    const rpc = () => ({ abortSignal: async () => ({ data, error: null }) });
    await expect(readPreparedOfflineSources({ rpc }, ["a"], signal)).rejects.toThrow();
  }
});
it("supports an unfinished incremental backfill without claiming complete metadata", async () => {
  const rpc = () => ({
    abortSignal: async () => ({ data: { ...empty, pending: true }, error: null }),
  });
  expect(await readPreparedOfflineSources({ rpc }, ["a"], signal)).toBeNull();
});
it("does not continue after cancellation", async () => {
  const controller = new AbortController();
  const rpc = vi.fn(() => ({
    abortSignal: async () => {
      controller.abort();
      return { data: empty, error: null };
    },
  }));
  await expect(
    readPreparedOfflineSources({ rpc }, Array(65).fill("a"), controller.signal),
  ).rejects.toThrow();
  expect(rpc).toHaveBeenCalledTimes(1);
});
