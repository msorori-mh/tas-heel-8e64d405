/** Authenticated capacity runner. Only the explicit disposable staging target is accepted.
 * Credentials are supplied in local files, never in reports, URLs, or repository fixtures.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { performance, monitorEventLoopDelay } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

export const STAGING = "qwfvlppsffcmmbjpznkw";
export function validateInput(config, sessions, concurrency, duration) {
  if (config.project !== STAGING) throw Error("STAGING_TARGET_REQUIRED");
  if (!/^[a-z0-9]{8,32}$/.test(config.run)) throw Error("INVALID_RUN");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 10000)
    throw Error("INVALID_CONCURRENCY");
  if (!Number.isFinite(duration) || duration < 10 || duration > 7200)
    throw Error("INVALID_DURATION");
  if (sessions.length < concurrency) throw Error("DISTINCT_SESSIONS_REQUIRED");
  const ids = new Set();
  for (const s of sessions.slice(0, concurrency)) {
    const claims = JSON.parse(Buffer.from(s.access_token.split(".")[1] ?? "", "base64url"));
    if (
      claims.sub !== s.id ||
      claims.role !== "authenticated" ||
      claims.iss !== `https://${STAGING}.supabase.co/auth/v1` ||
      claims.app_metadata?.capacity_run !== config.run ||
      claims.app_metadata?.test_only !== true
    )
      throw Error("TEST_ONLY_SESSION_REQUIRED");
    if (claims.exp * 1000 < Date.now() + (duration + 120) * 1000)
      throw Error("SESSION_EXPIRES_DURING_RUN");
    if (ids.has(s.id)) throw Error("DUPLICATE_SESSION");
    ids.add(s.id);
  }
}
export class Histogram {
  constructor() {
    this.bins = new Uint32Array(60002);
    this.count = 0;
    this.failures = 0;
    this.bytes = 0;
    this.max = 0;
    this.codes = {};
  }
  add(ms, ok, bytes = 0, code = "200") {
    this.bins[Math.min(60001, Math.ceil(ms))]++;
    this.count++;
    this.failures += !ok;
    this.bytes += bytes;
    this.max = Math.max(this.max, ms);
    this.codes[code] = (this.codes[code] ?? 0) + 1;
  }
  percentile(p) {
    if (!this.count) return null;
    let n = 0;
    for (let i = 0; i < this.bins.length; i++) {
      n += this.bins[i];
      if (n >= Math.ceil(this.count * p)) return i;
    }
  }
  report() {
    return {
      requests: this.count,
      failures: this.failures,
      errorRate: this.count ? this.failures / this.count : 1,
      p95Ms: this.percentile(0.95),
      p99Ms: this.percentile(0.99),
      maxMs: Math.round(this.max),
      bytes: this.bytes,
      codes: this.codes,
    };
  }
}
export function passes(report) {
  return report.requests > 0 && report.errorRate <= 0.005 && report.p95Ms <= 2000;
}
export function passesJourneyCoverage(completedByUser) {
  return completedByUser.length > 0 && completedByUser.every((count) => count > 0);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function runJourneyLoad(
  config,
  sessions,
  { concurrency = 5, duration = 60, thinkMs = 2000, exam = false } = {},
) {
  validateInput(config, sessions, concurrency, duration);
  const base = `https://${config.project}.supabase.co/rest/v1/`;
  const metrics = new Map(),
    all = new Histogram();
  let journeys = 0,
    failedJourneys = 0,
    inFlight = 0,
    peakInFlight = 0,
    abortReason = null;
  const journeyErrors = {};
  const completedByUser = new Uint32Array(concurrency);
  const histogram = (label) => {
    if (!metrics.has(label)) metrics.set(label, new Histogram());
    return metrics.get(label);
  };
  const lag = monitorEventLoopDelay({ resolution: 20 });
  lag.enable();
  let started = performance.now(),
    deadline = started + duration * 1000;
  async function request(s, label, path, body, check = () => true) {
    const start = performance.now();
    let status = "network_error",
      bytes = 0,
      ok = false;
    inFlight++;
    peakInFlight = Math.max(peakInFlight, inFlight);
    try {
      const r = await fetch(base + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${s.access_token}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      status = String(r.status);
      const text = await r.text();
      bytes = Buffer.byteLength(text);
      const data = text ? JSON.parse(text) : null;
      ok = r.ok && check(data);
      if (!ok) {
        if (r.ok) status = "semantic_failure";
        else status += `:${data?.code ?? "http"}`;
        throw Error(label + ":" + status);
      }
      return data;
    } finally {
      inFlight--;
      const ms = performance.now() - start;
      if (label !== "preflight") {
        histogram(label).add(ms, ok, bytes, status);
        all.add(ms, ok, bytes, status);
      }
      if (status.startsWith("401") || status.startsWith("403"))
        abortReason = "AUTHORIZATION_FAILURE";
      if (all.count >= 100 && all.failures / all.count > 0.05)
        abortReason = "ERROR_RATE_OVER_5_PERCENT";
    }
  }
  async function journey(s, iteration, index) {
    const get = (label, path, check) => request(s, label, path, undefined, check);
    const rpc = (name, args, check) => request(s, name, "rpc/" + name, args, check);
    await get(
      "profile",
      `profiles?select=user_id,grade_uuid,curriculum_track_id&user_id=eq.${s.id}`,
      (d) => d.length === 1 && d[0].user_id === s.id,
    );
    await rpc(
      "get_student_unified_performance",
      { _attempt_type: "ALL", _limit: 50 },
      (d) => d !== null,
    );
    await get(
      "subject",
      `subjects?select=id,name,grade_id,curriculum_track_id&id=eq.${config.subject}`,
      (d) => d.length === 1,
    );
    await get(
      "units",
      `units?select=id,title,description,sort_order,is_free,semester&subject_id=eq.${config.subject}&order=sort_order.asc`,
    );
    const lessons = await get(
      "lesson-list",
      `lessons?select=id,title,duration,unit_id,sort_order,semester&subject_id=eq.${config.subject}&order=sort_order.asc`,
      (d) => d.length > 0,
    );
    await rpc(
      "lessons_student_visible",
      { _lesson_ids: lessons.map((l) => l.id) },
      (d) => Array.isArray(d) && d.length > 0,
    );
    await get(
      "lesson",
      `lessons?select=id,title,subject_id,unit_id,sort_order,content_text&id=eq.${config.lesson}`,
      (d) => d.length === 1,
    );
    await rpc("lesson_student_content_gate", { _lesson_id: config.lesson });
    await get(
      "lesson-resources",
      `lesson_resources?select=id,resource_type,title,url,description,sort_order,is_primary,html_resource_type,metadata&lesson_id=eq.${config.lesson}`,
    );
    if (thinkMs) await sleep(thinkMs * (0.5 + Math.random()));
    const mutation = {
      _idempotency_key: `${config.run}-${s.id}-${randomUUID()}`,
      _kind: "lesson-progress",
      _entity_id: config.lesson,
      _lesson_id: null,
      _occurred_at: new Date().toISOString(),
      _progress_percent: 75,
      _answer_text: null,
      _payload_sha256: "0".repeat(64),
    };
    await rpc(
      "apply_offline_learning_mutation",
      mutation,
      (d) => d?.applied === true && d?.replayed !== true,
    );
    await request(
      s,
      "offline-replay",
      "rpc/apply_offline_learning_mutation",
      mutation,
      (d) => d?.replayed === true,
    );
    await get(
      "progress-verify",
      `user_progress?select=user_id,lesson_id,progress_percent&user_id=eq.${s.id}&lesson_id=eq.${config.lesson}`,
      (d) => d.length === 1 && d[0].user_id === s.id && d[0].progress_percent === 75,
    );
    // Each account checks a different account; an empty RLS-filtered result is required.
    if (concurrency > 1 && iteration === 0) {
      const other = sessions[(index + 1) % concurrency];
      // Profiles already exist before the run, so denial cannot pass merely
      // because the other worker has not written its progress yet.
      await get(
        "cross-profile-denial",
        `profiles?select=user_id&user_id=eq.${other.id}`,
        (d) => Array.isArray(d) && d.length === 0,
      );
      await get(
        "cross-account-denial",
        `user_progress?select=user_id&user_id=eq.${other.id}`,
        (d) => Array.isArray(d) && d.length === 0,
      );
    }
    if (exam) {
      if (!config.model) throw Error("EXAM_FIXTURE_REQUIRED");
      const id = await rpc(
        "create_ministerial_exam_session",
        { _model_id: config.model, _mode: "training" },
        (d) => typeof d === "string",
      );
      const state = await rpc(
        "get_ministerial_session_state",
        { _session_id: id },
        (d) => d?.questions?.length > 0,
      );
      const question = state.questions.find((q) => q.session_question_id);
      if (!question) throw Error("EXAM_QUESTION_SHAPE");
      if (question.options?.length)
        await rpc("answer_ministerial_exam_question", {
          _session_id: id,
          _session_question_id: question.session_question_id,
          _option_code: question.options[0].option_code,
        });
      else
        await rpc("answer_ministerial_text_question", {
          _session_id: id,
          _session_question_id: question.session_question_id,
          _response_text: "TEST_ONLY CAPACITY ANSWER",
        });
      await rpc("submit_ministerial_exam_session", { _session_id: id });
      await request(
        s,
        "exam-verify",
        "rpc/get_ministerial_session_state",
        { _session_id: id },
        (d) =>
          d?.session?.status === "submitted" &&
          d?.answers?.some(
            (a) =>
              a.session_question_id === question.session_question_id &&
              (question.options?.length
                ? a.selected_option_code === question.options[0].option_code
                : a.response_text === "TEST_ONLY CAPACITY ANSWER"),
          ),
      );
    }
  }
  // Warm network/TLS separately: never count it as capacity evidence.
  await request(
    sessions[0],
    "preflight",
    "profiles?select=user_id&user_id=eq." + sessions[0].id,
    undefined,
    (d) => d.length === 1,
  );
  started = performance.now();
  deadline = started + duration * 1000;
  const workers = sessions.slice(0, concurrency).map(async (s, index) => {
    let iteration = 0;
    await sleep((index / Math.max(1, concurrency)) * Math.min(5000, duration * 100));
    while (performance.now() < deadline && !abortReason) {
      try {
        await journey(s, iteration++, index);
        journeys++;
        completedByUser[index]++;
      } catch (e) {
        failedJourneys++;
        journeyErrors[e.message] = (journeyErrors[e.message] ?? 0) + 1;
      }
      if (thinkMs) await sleep(thinkMs * (0.5 + Math.random()));
    }
  });
  await Promise.all(workers);
  lag.disable();
  const elapsed = (performance.now() - started) / 1000;
  const report = {
    schema: 1,
    run: config.run,
    target: config.project,
    concurrency,
    uniqueUsers: concurrency,
    requestedDurationSeconds: duration,
    thinkTimeBaseMs: thinkMs,
    elapsedSeconds: elapsed,
    usersCompletingJourney: completedByUser.filter((count) => count > 0).length,
    minimumJourneysPerUser: Math.min(...completedByUser),
    journeys,
    failedJourneys,
    journeyErrors,
    peakRequestsInFlight: peakInFlight,
    requestsPerSecond: all.count / elapsed,
    metrics: all.report(),
    endpoints: Object.fromEntries([...metrics].map(([k, v]) => [k, v.report()])),
    generator: { eventLoopP99Ms: lag.percentile(99) / 1e6, rssBytes: process.memoryUsage().rss },
    abortReason,
    coverage: {
      authenticated: true,
      googleOAuth: false,
      uiRendering: false,
      cdnDownloads: false,
      exam,
      offlineReplay: true,
    },
    status: "HOLD",
  };
  report.status =
    !abortReason &&
    passesJourneyCoverage(completedByUser) &&
    failedJourneys === 0 &&
    passes(report.metrics) &&
    Object.values(report.endpoints).every(passes) &&
    report.generator.eventLoopP99Ms < 100
      ? "PASS"
      : "HOLD";
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [configPath, sessionsPath, output, concurrency = "5", duration = "60", exam = "false"] =
    process.argv.slice(2);
  if (!configPath || !sessionsPath || !output)
    throw Error("Usage: student-journey.mjs config sessions report concurrency duration exam");
  const report = await runJourneyLoad(
    JSON.parse(await readFile(configPath)),
    JSON.parse(await readFile(sessionsPath)),
    { concurrency: Number(concurrency), duration: Number(duration), exam: exam === "true" },
  );
  await mkdir(new URL(".", pathToFileURL(output)), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.status === "PASS" ? 0 : 2;
}
