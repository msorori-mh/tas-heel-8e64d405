/**
 * Server-only helper: build the CF08 domain-stage envelope from a verified direct intake.
 * Read-only; the bytes are re-downloaded and re-verified before the envelope is produced.
 */

import { loadVerifiedDirectIntake } from "./golden-lesson-direct-source.server";
import {
  buildGoldenDomainStageEnvelope,
  type GoldenDomainStageEnvelope,
} from "./golden-lesson-domain-staging";

export async function buildDirectDomainStageEnvelope(
  packageId: string,
  version: number,
): Promise<{ envelope: GoldenDomainStageEnvelope; bundleSha256: string }> {
  const verified = await loadVerifiedDirectIntake(packageId, version);
  const envelope = buildGoldenDomainStageEnvelope({
    ...verified,
    bundleSha256: verified.intakeSha256,
    compressedBytes: verified.totalBytes,
    uncompressedBytes: verified.totalBytes,
  });
  return { envelope, bundleSha256: verified.intakeSha256 };
}
