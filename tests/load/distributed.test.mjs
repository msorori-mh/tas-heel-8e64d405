import test from "node:test";
import assert from "node:assert/strict";
import { aggregateDistributed } from "../../scripts/load-test/aggregate-distributed.mjs";
import { STAGING } from "../../scripts/load-test/student-journey.mjs";
function report(shard) {
  return {
    target: STAGING,
    run: "capacitytest",
    concurrency: 50,
    uniqueUsers: 50,
    partition: {
      shard,
      accountOffset: shard * 50,
      totalShards: 2,
      totalConcurrency: 100,
      scheduledStartAt: 100000,
    },
    requestedDurationSeconds: 90,
    measurementStartedAt: new Date(100000).toISOString(),
    measurementEndedAt: new Date(195000).toISOString(),
    status: "PASS",
    usersCompletingJourney: 50,
    failedJourneys: 0,
    journeys: 100,
    abortReason: null,
    metrics: { requests: 200, failures: 0, errorRate: 0, p95Ms: 100 },
    endpoints: { profile: { requests: 200, failures: 0, errorRate: 0, p95Ms: 100, p99Ms: 500 } },
    generator: { eventLoopP99Ms: 20 },
  };
}
test("requires all distinct partitions and simultaneous measurement", () => {
  const a = report(0),
    b = report(1);
  assert.equal(aggregateDistributed([a, b]).status, "PASS");
  assert.throws(() => aggregateDistributed([a]), /MISSING/);
  assert.throws(() => aggregateDistributed([a, a]), /SCOPE/);
  assert.equal(
    aggregateDistributed([a, { ...b, measurementStartedAt: new Date(103000).toISOString() }])
      .status,
    "HOLD",
  );
  assert.equal(aggregateDistributed([a, { ...b, usersCompletingJourney: 49 }]).status, "HOLD");
  assert.equal(aggregateDistributed([a, { ...b, status: "HOLD" }]).status, "HOLD");
});
test("does not hide a slow shard with averaged percentiles", () => {
  const a = report(0),
    b = report(1);
  b.endpoints.profile.p95Ms = 3000;
  const r = aggregateDistributed([a, b]);
  assert.equal(r.status, "HOLD");
  assert.equal(r.endpoints.profile.worstShardP95Ms, 3000);
  assert.equal(r.requests, 400);
  assert.equal(r.concurrency, 100);
});
