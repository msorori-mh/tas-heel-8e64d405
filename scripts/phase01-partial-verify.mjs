/**
 * PHASE-01 partial verification (C-03, H-03, C-04) — anon REST probes
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

function loadEnv() {
  const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)="(.*)"\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = loadEnv();
const BASE = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const ANON = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function rpc(name, body) {
  const res = await fetch(`${BASE}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text.slice(0, 120);
  }
  return { status: res.status, body: parsed };
}

const victim = randomUUID();
const tests = [];

const c03 = await rpc("get_user_email", { _user_id: victim });
tests.push({
  id: "C-03 anon get_user_email",
  pass:
    c03.status === 401 ||
    c03.status === 403 ||
    c03.body?.code === "42501" ||
    String(c03.body?.message || "").includes("permission"),
  detail: `HTTP ${c03.status} ${JSON.stringify(c03.body).slice(0, 80)}`,
});

const hasSub = await rpc("has_active_subscription", { _user_id: victim });
tests.push({
  id: "H-03 anon has_active_subscription",
  pass:
    hasSub.status === 401 ||
    hasSub.status === 403 ||
    String(hasSub.body?.message || "").includes("permission"),
  detail: `HTTP ${hasSub.status} ${JSON.stringify(hasSub.body).slice(0, 80)}`,
});

const pts = await rpc("get_user_total_points", { _user_id: victim });
tests.push({
  id: "H-03 anon get_user_total_points",
  pass:
    pts.status === 401 ||
    pts.status === 403 ||
    String(pts.body?.message || "").includes("permission"),
  detail: `HTTP ${pts.status} ${JSON.stringify(pts.body).slice(0, 80)}`,
});

const wallet = await rpc("ensure_wallet_account", { _user_id: victim });
tests.push({
  id: "H-03 anon ensure_wallet_account",
  pass:
    wallet.status === 401 ||
    wallet.status === 403 ||
    String(wallet.body?.message || "").includes("permission"),
  detail: `HTTP ${wallet.status} ${JSON.stringify(wallet.body).slice(0, 80)}`,
});

const dash = await rpc("get_dashboard_stats", {});
tests.push({
  id: "C-04 anon get_dashboard_stats RPC",
  pass:
    dash.status !== 200 ||
    dash.body?.code === "42501" ||
    String(dash.body?.message || "").includes("forbidden"),
  detail: `HTTP ${dash.status} ${JSON.stringify(dash.body).slice(0, 80)}`,
});

console.log("PHASE-01 partial anon probes (live DB — apply migrations if tests fail):\n");
for (const t of tests) {
  console.log(`${t.pass ? "PASS" : "FAIL"}  ${t.id}`);
  console.log(`       ${t.detail}\n`);
}
