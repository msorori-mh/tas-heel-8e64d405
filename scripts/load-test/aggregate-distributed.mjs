/** Aggregate independent partitions conservatively; never average latency percentiles. */
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { STAGING, passes } from "./student-journey.mjs";
export function aggregateDistributed(reports) {
  if (!reports.length) throw Error("MISSING_PARTITIONS");
  const first = reports[0],
    expected = first.partition?.totalShards;
  if (!Number.isInteger(expected) || expected < 1 || reports.length !== expected)
    throw Error("MISSING_PARTITIONS");
  const sorted = [...reports].sort((a, b) => a.partition.accountOffset - b.partition.accountOffset);
  const shards = new Set();
  let endOffset = 0;
  for (const r of sorted) {
    const p = r.partition;
    if (
      !p ||
      r.target !== STAGING ||
      r.run !== first.run ||
      p.totalShards !== expected ||
      p.totalConcurrency !== first.partition.totalConcurrency ||
      p.scheduledStartAt !== first.partition.scheduledStartAt ||
      r.requestedDurationSeconds !== first.requestedDurationSeconds ||
      !Number.isInteger(p.shard) ||
      p.shard < 0 ||
      p.shard >= expected ||
      shards.has(p.shard) ||
      !Number.isInteger(r.concurrency) ||
      r.concurrency < 1 ||
      r.uniqueUsers !== r.concurrency ||
      p.accountOffset !== endOffset ||
      !Number.isFinite(Date.parse(r.measurementStartedAt)) ||
      !Number.isFinite(Date.parse(r.measurementEndedAt))
    )
      throw Error("PARTITION_SCOPE_MISMATCH");
    shards.add(p.shard);
    endOffset += r.concurrency;
  }
  if (endOffset !== first.partition.totalConcurrency) throw Error("TOTAL_CONCURRENCY_MISMATCH");
  const starts = sorted.map((r) => Date.parse(r.measurementStartedAt));
  const ends = sorted.map((r) => Date.parse(r.measurementEndedAt));
  const startSkewMs = Math.max(...starts) - Math.min(...starts);
  const commonMeasurementSeconds = (Math.min(...ends) - Math.max(...starts)) / 1000;
  const requests = sorted.reduce((n, r) => n + r.metrics.requests, 0);
  const failures = sorted.reduce((n, r) => n + r.metrics.failures, 0);
  const endpoints = {};
  for (const r of sorted)
    for (const [name, m] of Object.entries(r.endpoints)) {
      const e = (endpoints[name] ??= {
        requests: 0,
        failures: 0,
        worstShardP95Ms: 0,
        worstShardP99Ms: 0,
      });
      e.requests += m.requests;
      e.failures += m.failures;
      e.worstShardP95Ms = Math.max(e.worstShardP95Ms, m.p95Ms ?? Infinity);
      e.worstShardP99Ms = Math.max(e.worstShardP99Ms, m.p99Ms ?? Infinity);
    }
  const pass =
    sorted.every(
      (r) =>
        r.status === "PASS" &&
        r.usersCompletingJourney === r.concurrency &&
        r.failedJourneys === 0 &&
        !r.abortReason &&
        passes(r.metrics) &&
        Object.values(r.endpoints).every(passes) &&
        r.generator.eventLoopP99Ms < 100,
    ) &&
    startSkewMs <= 1000 &&
    starts.every((t) => Math.abs(t - first.partition.scheduledStartAt) <= 1000) &&
    commonMeasurementSeconds >= first.requestedDurationSeconds - 1;
  return {
    schema: 1,
    run: first.run,
    target: STAGING,
    concurrency: endOffset,
    partitions: expected,
    requestedDurationSeconds: first.requestedDurationSeconds,
    startSkewMs,
    commonMeasurementSeconds,
    requests,
    failures,
    errorRate: requests ? failures / requests : 1,
    completedJourneys: sorted.reduce((n, r) => n + r.journeys, 0),
    usersCompletingJourney: sorted.reduce((n, r) => n + r.usersCompletingJourney, 0),
    endpoints,
    percentileMethod:
      "Worst per-shard percentile; global percentiles are not reconstructed from summaries.",
    status: pass ? "PASS" : "HOLD",
    scope: "Distributed authenticated API stress only; no production 10k certification.",
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [output, ...paths] = process.argv.slice(2);
  if (!output || !paths.length) throw Error("Usage: aggregate-distributed.mjs output report...");
  const reports = await Promise.all(paths.map(async (p) => JSON.parse(await readFile(p))));
  const result = aggregateDistributed(reports);
  await writeFile(output, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
  process.exitCode = result.status === "PASS" ? 0 : 2;
}
