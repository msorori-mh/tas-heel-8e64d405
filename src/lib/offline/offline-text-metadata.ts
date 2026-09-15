import { z } from "zod";
import { ANSWER_LEAK_PATTERNS } from "@/lib/lessons/html-content-standard";
import { sha256Hex } from "./offline-pack-contract";

/** Versioned contract shared by the SQL stored column and the original body path. */
export const offlineTextMetadataSchema = z
  .object({
    version: z.literal(1),
    byteSize: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    empty: z.boolean(),
    answerLeak: z.boolean(),
    remote: z.boolean(),
  })
  .strict();
export type OfflineTextMetadata = z.infer<typeof offlineTextMetadataSchema>;

export async function fingerprintOfflineText(body: string): Promise<OfflineTextMetadata> {
  const bytes = new TextEncoder().encode(body);
  return {
    version: 1,
    byteSize: bytes.byteLength,
    sha256: await sha256Hex(bytes),
    empty: !body.trim(),
    answerLeak: ANSWER_LEAK_PATTERNS.some((pattern) => pattern.test(body)),
    remote:
      /(?:src|href)\s*=\s*["'](?:https?:)?\/\/|url\(\s*["']?(?:https?:)?\/\/|\bfetch\s*\(\s*["']https?:\/\//i.test(
        body,
      ),
  };
}
