/**
 * AUDIT-VALIDATION-01 runtime smoke tests
 */
import { createClient } from "@supabase/supabase-js";
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
const SUPABASE_BASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const ANON = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_BASE_URL || !ANON) {
  console.error("Missing SUPABASE_URL or publishable key in .env");
  process.exit(1);
}

const anon = createClient(SUPABASE_BASE_URL, ANON, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const results = [];
function record(id, verdict, detail) {
  results.push({ id, verdict, detail });
}

async function testC04() {
  const publicRes = await fetch(`${SUPABASE_BASE_URL}/rest/v1/dashboard_stats?select=*&limit=1`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, Accept: "application/json" },
  });
  const publicText = await publicRes.text();
  let publicBody;
  try {
    publicBody = JSON.parse(publicText);
  } catch {
    publicBody = publicText.slice(0, 80);
  }
  record(
    "C-04a",
    publicRes.status === 200 && Array.isArray(publicBody) && publicBody.length > 0
      ? "Confirmed"
      : publicRes.status === 404 || publicRes.status === 406
        ? "False Positive"
        : "Partial",
    `GET public.dashboard_stats HTTP ${publicRes.status} rows=${Array.isArray(publicBody) ? publicBody.length : "n/a"}`,
  );

  const extRes = await fetch(`${SUPABASE_BASE_URL}/rest/v1/dashboard_stats?select=*&limit=1`, {
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      Accept: "application/json",
      "Accept-Profile": "extensions",
      "Content-Profile": "extensions",
    },
  });
  const extText = await extRes.text();
  let extBody;
  try {
    extBody = JSON.parse(extText);
  } catch {
    extBody = extText.slice(0, 80);
  }
  record(
    "C-04b",
    extRes.status === 200 && Array.isArray(extBody) && extBody.length > 0 ? "Confirmed" : "Partial",
    `GET extensions.dashboard_stats HTTP ${extRes.status} rows=${Array.isArray(extBody) ? extBody.length : "n/a"}`,
  );

  const rpcAnon = await anon.rpc("get_dashboard_stats");
  record(
    "C-04c",
    rpcAnon.error?.message?.includes("forbidden") || rpcAnon.error?.code === "42501"
      ? "Partial"
      : rpcAnon.data
        ? "Confirmed"
        : "Partial",
    `RPC get_dashboard_stats anon: ${rpcAnon.error ? rpcAnon.error.message : "data returned"}`,
  );
}

async function signUpTestUser() {
  const tag = Date.now();
  const email = `audit-val01+${tag}@example.com`;
  const password = `AuditVal01!${tag}`;
  const { data, error } = await anon.auth.signUp({ email, password });
  if (error) throw new Error(`signUp failed: ${error.message}`);
  let token = data.session?.access_token;
  let userId = data.user?.id;
  if (!token) {
    const si = await anon.auth.signInWithPassword({ email, password });
    if (si.error) {
      throw new Error(`no session after signUp; signIn: ${si.error.message}`);
    }
    token = si.data.session?.access_token;
    userId = si.data.user?.id;
  }
  if (!token || !userId) throw new Error("could not obtain access token");
  const client = createClient(SUPABASE_BASE_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  return { client, userId };
}

async function testC03(client) {
  const foreign = randomUUID();
  const { data, error } = await client.rpc("get_user_email", { _user_id: foreign });
  const leaked = typeof data === "string" && data.includes("@");
  record(
    "C-03",
    leaked ? "Confirmed" : error ? "Partial" : "False Positive",
    leaked
      ? "email returned for random UUID [redacted]"
      : error
        ? `error: ${error.message}`
        : `return: ${data}`,
  );
}

async function testBonus(client, ownUserId) {
  const foreign = randomUUID();
  const { data, error } = await client.rpc("has_active_subscription", { _user_id: foreign });
  record(
    "H-03-bonus",
    error ? "Partial" : typeof data === "boolean" ? "Confirmed" : "Partial",
    error ? `error: ${error.message}` : `boolean=${data}`,
  );
  const { data: ownSub } = await client.rpc("has_active_subscription", { _user_id: ownUserId });
  record("H-03-bonus-self", "Partial", `own=${ownSub}`);
}

async function testC02(client, userId) {
  const { data: subFlag } = await client.rpc("has_active_subscription", { _user_id: userId });
  const { data: templates, error: tplErr } = await client
    .from("exam_templates")
    .select("id")
    .eq("is_active", true)
    .limit(1);
  if (tplErr || !templates?.length) {
    record("C-02", "Partial", `no template: ${tplErr?.message ?? "empty"}`);
    return;
  }
  const templateId = templates[0].id;
  const { data: sessionId, error } = await client.rpc("start_exam_session", {
    _template_id: templateId,
  });
  record(
    "C-02",
    sessionId && !error ? "Confirmed" : "Partial",
    `has_active_subscription=${subFlag}; ${error ? `error: ${error.message}` : `session=${String(sessionId).slice(0, 8)}`}`,
  );
}

async function testC01(client, userId) {
  const { data: plans } = await client
    .from("subscription_plans")
    .select("id,price,currency")
    .eq("is_active", true)
    .limit(1);
  const { data: methods } = await client
    .from("payment_methods")
    .select("id")
    .eq("is_active", true)
    .limit(1);
  if (!plans?.length || !methods?.length) {
    record("C-01", "Partial", "no plan/method");
    return null;
  }
  const plan = plans[0];
  const { data: inserted, error: insErr } = await client
    .from("payment_requests")
    .insert({
      user_id: userId,
      plan_id: plan.id,
      payment_method_id: methods[0].id,
      sender_name: "AUDIT TEST",
      transaction_reference: `AUDIT-${Date.now()}`,
      payment_date: new Date().toISOString().slice(0, 10),
      amount: Number(plan.price) || 1000,
      currency: plan.currency || "YER",
      receipt_url: null,
      status: "pending",
    })
    .select("id,subscription_id")
    .single();
  if (insErr) {
    record("C-01-insert", "Partial", insErr.message);
    return null;
  }
  record(
    "C-01-insert",
    inserted.subscription_id == null ? "Confirmed" : "False Positive",
    `subscription_id=${inserted.subscription_id ?? "null"}`,
  );
  const { error: apprErr } = await client.rpc("approve_payment_request", {
    _request_id: inserted.id,
    _admin_notes: "audit",
  });
  record(
    "C-01-approve",
    apprErr?.message?.includes("missing subscription_id")
      ? "Confirmed"
      : apprErr?.message?.includes("forbidden") || apprErr?.code === "42501"
        ? "Partial"
        : apprErr
          ? "Partial"
          : "False Positive",
    apprErr ? apprErr.message : "success unexpected",
  );
  return inserted.id;
}

async function main() {
  console.log("# AUDIT-VALIDATION-01 Smoke Test Report\n");
  await testC04();
  let userId, paymentId;
  try {
    const { client, userId: uid } = await signUpTestUser();
    userId = uid;
    console.log(`Test user prefix: ${userId.slice(0, 8)}...\n`);
    await testC03(client);
    await testBonus(client, userId);
    await testC02(client, userId);
    paymentId = await testC01(client, userId);
  } catch (e) {
    record("AUTH", "Partial", String(e.message || e));
  }
  for (const r of results) {
    console.log(`${r.id}\t${r.verdict}\t${r.detail}`);
  }
  console.log("\nCleanup: no service role");
  if (paymentId) console.log(`payment prefix ${paymentId.slice(0, 8)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
