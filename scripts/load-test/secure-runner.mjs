/** Ephemeral encrypted handoff to an authorized CI runner; private key never leaves it. */
import { generateKeyPairSync, privateDecrypt, createDecipheriv, constants } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { runJourneyLoad, STAGING } from "./student-journey.mjs";
const mode = process.argv[2],
  dir = process.env.RUNNER_TEMP + "/capacity";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (mode === "key") {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const pair = generateKeyPairSync("rsa", {
    modulusLength: 3072,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  await writeFile(dir + "/private.pem", pair.privateKey, { mode: 0o600 });
  await writeFile(dir + "/public.pem", pair.publicKey);
} else if (mode === "run") {
  let envelope;
  for (let i = 0; i < 90; i++) {
    const response = await fetch(
      `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/contents/scripts/load-test/transfer/${process.env.GITHUB_RUN_ID}.json?ref=${encodeURIComponent(process.env.GITHUB_REF_NAME)}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.GH_TOKEN}`,
          Accept: "application/vnd.github.raw+json",
        },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (response.ok) {
      envelope = await response.json();
      break;
    }
    if (response.status !== 404) throw Error("HANDOFF_FETCH_FAILED:" + response.status);
    await sleep(10000);
  }
  if (!envelope) throw Error("HANDOFF_TIMEOUT");
  const key = privateDecrypt(
    {
      key: await readFile(dir + "/private.pem"),
      oaepHash: "sha256",
      padding: constants.RSA_PKCS1_OAEP_PADDING,
    },
    Buffer.from(envelope.key, "base64"),
  );
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  const payload = JSON.parse(
    Buffer.concat([decipher.update(Buffer.from(envelope.data, "base64")), decipher.final()]),
  );
  if (
    payload.runId !== process.env.GITHUB_RUN_ID ||
    payload.expiresAt < Date.now() ||
    payload.config.project !== STAGING
  )
    throw Error("HANDOFF_BINDING_INVALID");
  const { config } = payload;
  // Mask credentials before any downstream operation. Reports only contain aggregate metrics.
  console.log("::add-mask::" + config.password);
  const sessions = [];
  const reports = [];
  await mkdir("artifacts/capacity", { recursive: true });
  for (const concurrency of payload.stages) {
    if (!Number.isInteger(concurrency) || concurrency > config.count || concurrency > 10000)
      throw Error("INVALID_STAGE");
    while (sessions.length < concurrency) {
      const i = sessions.length + 1;
      const r = await fetch(`https://${STAGING}.supabase.co/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: config.key, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${config.run}.${i}@load.test.invalid`,
          password: config.password,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const b = await r.json();
      if (!r.ok) throw Error("AUTH_SETUP_FAILED:" + r.status + ":" + (b.error_code ?? ""));
      console.log("::add-mask::" + b.access_token);
      console.log("::add-mask::" + b.refresh_token);
      sessions.push({
        id: b.user.id,
        access_token: b.access_token,
        refresh_token: b.refresh_token,
      });
      await sleep(2200); // Respect token endpoint rate limits; setup is outside measurements.
    }
    const report = await runJourneyLoad(config, sessions, {
      concurrency,
      duration: payload.duration,
      exam: payload.exam,
    });
    reports.push(report);
    await writeFile(
      `artifacts/capacity/stage-${concurrency}.json`,
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify({
        concurrency,
        status: report.status,
        requests: report.metrics.requests,
        p95Ms: report.metrics.p95Ms,
        errors: report.metrics.failures,
        journeyErrors: report.journeyErrors,
      }),
    );
    if (report.status !== "PASS") {
      process.exitCode = 2;
      break;
    }
  }
  await writeFile(
    "artifacts/capacity/summary.json",
    JSON.stringify(
      {
        sourceSha: process.env.GITHUB_SHA,
        runId: process.env.GITHUB_RUN_ID,
        stages: reports.map((r) => ({ concurrency: r.concurrency, status: r.status })),
        scope: "Authenticated API journeys only; not a 10k production readiness certificate.",
      },
      null,
      2,
    ),
  );
} else throw Error("UNKNOWN_MODE");
