import { z } from "zod";
import { OfflineContentReadError } from "./offline-content-reader";

const row = z.object({ id: z.string(), lesson_id: z.string() }).passthrough();
const preparedSchema = z.object({
  version: z.literal(1),
  pending: z.boolean(),
  gates: z.array(
    z.object({
      lesson_id: z.string(),
      managed: z.boolean(),
      visible: z.boolean(),
      ready_capabilities: z.array(z.string()).nullable(),
    }),
  ),
  ready: z.array(
    z.object({
      lesson_id: z.string(),
      capability: z.string(),
      ready_hash: z.string().nullable(),
      ready_at: z.string().nullable(),
      ready_descriptor: z.unknown(),
    }),
  ),
  books: z.array(row),
  explanations: z.array(row),
  summaries: z.array(row),
  resources: z.array(row),
});
export type PreparedOfflineSources = z.infer<typeof preparedSchema>;

type Client = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): {
    abortSignal(
      signal: AbortSignal,
    ): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
  };
};

/** Optional additive RPC; only its absence or an unfinished backfill uses legacy reads. */
export async function readPreparedOfflineSources(
  client: unknown,
  lessonIds: string[],
  signal: AbortSignal,
): Promise<PreparedOfflineSources | null> {
  const combined: PreparedOfflineSources = {
    version: 1,
    pending: false,
    gates: [],
    ready: [],
    books: [],
    explanations: [],
    summaries: [],
    resources: [],
  };
  for (let offset = 0; offset < lessonIds.length; offset += 64) {
    signal.throwIfAborted();
    const ids = lessonIds.slice(offset, offset + 64);
    const result = await (client as Client)
      .rpc("offline_manifest_sources_v1", { _lesson_ids: ids })
      .abortSignal(signal);
    signal.throwIfAborted();
    if (
      ["42883", "PGRST202"].includes(result.error?.code ?? "") &&
      result.error?.message?.includes("offline_manifest_sources_v1")
    )
      return null;
    if (result.error) throw new OfflineContentReadError("prepared", result.error);
    const parsed = preparedSchema.safeParse(result.data);
    if (!parsed.success) throw new OfflineContentReadError("prepared", { code: "INVALID" });
    if (parsed.data.pending) return null;
    for (const key of [
      "gates",
      "ready",
      "books",
      "explanations",
      "summaries",
      "resources",
    ] as const) {
      if (parsed.data[key].some((item) => !ids.includes(item.lesson_id)))
        throw new OfflineContentReadError("prepared", { code: "SCOPE" });
      // Each array is checked by the same schema above; preserve its specific row shape.
      (combined[key] as unknown[]).push(...parsed.data[key]);
    }
  }
  return combined;
}
