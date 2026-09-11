#!/usr/bin/env node

import { writeFile } from "node:fs/promises";

const PRODUCTION_HOSTS = new Set([
  "studentamkeen.com",
  "www.studentamkeen.com",
  "zbdhxyuulyovihjgeqbn.supabase.co",
]);

const DEFAULT_ENDPOINTS = [
  "/rest/v1/grades?select=id,name&order=sort_order.asc&limit=20",
  "/rest/v1/subjects?select=id,name,grade_id&limit=100",
  "/rest/v1/units?select=id,title,subject_id&limit=100",
  "/rest/v1/lessons?select=id,title,unit_id&limit=100",
];

export function percentile(values, ratio) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

export function assertSafeTarget(rawUrl, allowProduction = false) {
  const target = new URL(rawUrl);
  if (target.protocol !== "https:") throw new Error("LOAD_TARGET_URL must use HTTPS");
  if (PRODUCTION_HOSTS.has(target.hostname) && !allowProduction) {
    throw new Error("Production load testing is blocked. Use staging.");
  }
  if (!target.hostname.endsWith(".supabase.co")) {
    throw new Error("This runner accepts an explicit Supabase staging endpoint only");
  }
  return target;
}

export function summarize(samples, elapsedMs, thresholds) {
  const latencies = samples.map((sample) => sample.latencyMs);
  const failures = samples.filter((sample) => !sample.ok);
  const summary = {
    requests: samples.length,
    failures: failures.length,
    errorRate: samples.length === 0 ? 1 : failures.length / samples.length,
    elapsedMs,
    requestsPerSecond: elapsedMs === 0 ? 0 : samples.length / (elapsedMs / 1000),
    latencyMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99),
      max: latencies.length === 0 ? 0 : Math.max(...latencies),
    },
    statuses: Object.fromEntries(
      Object.entries(Object.groupBy(samples, (sample) => String(sample.status))).map(
        ([status, rows]) => [status, rows.length],
      ),
    ),
    endpoints: Object.fromEntries(
      Object.entries(Object.groupBy(samples, (sample) => sample.endpoint ?? "unknown")).map(
        ([endpoint, rows]) => [
          endpoint,
          {
            requests: rows.length,
            failures: rows.filter((row) => !row.ok).length,
            p95Ms: percentile(
              rows.map((row) => row.latencyMs),
              0.95,
            ),
          },
        ],
      ),
    ),
  };
  summary.pass =
    summary.errorRate <= thresholds.maxErrorRate &&
    summary.latencyMs.p95 <= thresholds.maxP95Ms &&
    summary.latencyMs.p99 <= thresholds.maxP99Ms;
  return summary;
}

async function requestOnce({ baseUrl, apiKey, endpoint, timeoutMs }) {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(new URL(endpoint, baseUrl), {
      headers: { apikey: apiKey },
      signal: controller.signal,
    });
    await response.arrayBuffer();
    return {
      ok: response.ok,
      endpoint,
      status: response.status,
      latencyMs: Math.round((performance.now() - started) * 100) / 100,
    };
  } catch (error) {
    return {
      ok: false,
      endpoint,
      status: error?.name === "AbortError" ? "timeout" : "network_error",
      latencyMs: Math.round((performance.now() - started) * 100) / 100,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runScenario(config) {
  const samples = [];
  let cursor = 0;
  const started = performance.now();
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= config.requests) return;
      const endpoint = config.endpoints[index % config.endpoints.length];
      samples.push(await requestOnce({ ...config, endpoint }));
    }
  }
  await Promise.all(Array.from({ length: config.concurrency }, () => worker()));
  return summarize(samples, performance.now() - started, config.thresholds);
}

async function main() {
  const baseUrl = assertSafeTarget(
    process.env.LOAD_TARGET_URL ?? "",
    process.env.ALLOW_PRODUCTION_LOAD_TEST === "I_ACCEPT_PRODUCTION_RISK",
  );
  const apiKey = process.env.LOAD_PUBLISHABLE_KEY;
  if (!apiKey) throw new Error("LOAD_PUBLISHABLE_KEY is required");

  const scenarios = JSON.parse(
    process.env.LOAD_SCENARIOS ??
      '[{"name":"smoke","concurrency":1,"requests":20},{"name":"baseline","concurrency":5,"requests":200},{"name":"steady-25","concurrency":25,"requests":1000},{"name":"spike-100","concurrency":100,"requests":2000}]',
  );
  const thresholds = {
    maxErrorRate: Number(process.env.LOAD_MAX_ERROR_RATE ?? 0.01),
    maxP95Ms: Number(process.env.LOAD_MAX_P95_MS ?? 1200),
    maxP99Ms: Number(process.env.LOAD_MAX_P99_MS ?? 2500),
  };
  const endpoints = JSON.parse(process.env.LOAD_ENDPOINTS ?? JSON.stringify(DEFAULT_ENDPOINTS));
  const results = [];
  for (const scenario of scenarios) {
    const metrics = await runScenario({
      baseUrl,
      apiKey,
      endpoints,
      timeoutMs: Number(process.env.LOAD_TIMEOUT_MS ?? 8000),
      concurrency: scenario.concurrency,
      requests: scenario.requests,
      thresholds,
    });
    results.push({ ...scenario, ...metrics });
    process.stdout.write(
      `${scenario.name}: ${metrics.pass ? "PASS" : "FAIL"} ${JSON.stringify(metrics)}\n`,
    );
    if (!metrics.pass) break;
  }
  const report = {
    generatedAt: new Date().toISOString(),
    targetHost: baseUrl.hostname,
    thresholds,
    results,
    pass: results.length === scenarios.length && results.every((result) => result.pass),
  };
  if (process.env.LOAD_REPORT_PATH) {
    await writeFile(process.env.LOAD_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (!report.pass) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
