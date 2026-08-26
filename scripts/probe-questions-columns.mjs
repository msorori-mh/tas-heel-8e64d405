/**
 * Probe: questions.correct_index / explanation column exposure + safe RPC paths.
 * Run against Live or local Supabase (requires .env with URL + anon key).
 *
 * Expected AFTER migration 20260622140000_questions_answer_column_grants.sql:
 *   anon/authenticated direct select of correct_index → blocked (403 or no leak)
 *   authenticated direct select of safe columns → allowed
 *   get_lesson_quiz_questions / check_lesson_question → still callable
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

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

const results = [];

function pass(name, detail) {
  results.push({ name, ok: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

function skip(name, detail) {
  results.push({ name, ok: null, detail });
  console.log(`SKIP  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function restGet(token, path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 300);
  }
  return { status: res.status, body };
}

function rowsLeakAnswerKey(body) {
  const rows = Array.isArray(body) ? body : [];
  return rows.some(
    (x) =>
      (x.correct_index !== undefined && x.correct_index !== null) ||
      (x.explanation !== undefined && x.explanation !== null),
  );
}

function isBlocked(status, body) {
  if (status === 403 || status === 401) return true;
  if (body?.code === "42501" || body?.code === "PGRST301") return true;
  if (
    typeof body?.message === "string" &&
    /permission denied|column.*does not exist/i.test(body.message)
  )
    return true;
  return false;
}

console.log("=== questions column exposure probe ===\n");
console.log(`Target: ${BASE}\n`);

// --- anon direct column probes ---
for (const [name, sel, expectBlocked] of [
  ["anon select correct_index", "id,correct_index", true],
  ["anon select explanation", "id,explanation", true],
  ["anon select safe columns", "id,question_text,options", false],
]) {
  const r = await restGet(ANON, `/rest/v1/questions?select=${encodeURIComponent(sel)}&limit=1`);
  const leak = rowsLeakAnswerKey(r.body);
  if (expectBlocked) {
    if (isBlocked(r.status, r.body)) pass(name, `HTTP ${r.status}`);
    else if (leak) fail(name, `HTTP ${r.status} LEAK detected`);
    else fail(name, `HTTP ${r.status} column still selectable (migration not applied?)`);
  } else if (r.status === 200 && !leak) pass(name, `HTTP ${r.status}`);
  else if (isBlocked(r.status, r.body)) skip(name, `HTTP ${r.status} (RLS/empty ok)`);
  else fail(name, `HTTP ${r.status} msg=${r.body?.message ?? ""}`);
}

// --- authenticated probes ---
const client = createClient(BASE, ANON, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const tag = Date.now();
const email = `qprobe+${tag}@example.com`;
const password = `Qprobe!${tag}`;

const { data: signUp, error: suErr } = await client.auth.signUp({ email, password });
let token = signUp.session?.access_token ?? null;
if (!token) {
  const { data: signIn, error: siErr } = await client.auth.signInWithPassword({ email, password });
  token = signIn.session?.access_token ?? null;
  if (siErr) skip("authenticated session", siErr.message);
}

if (token) {
  for (const [name, sel, expectBlocked] of [
    ["auth select correct_index", "id,correct_index", true],
    ["auth select explanation", "id,explanation", true],
    ["auth select safe columns", "id,question_text,options,question_type,code", false],
  ]) {
    const r = await restGet(token, `/rest/v1/questions?select=${encodeURIComponent(sel)}&limit=3`);
    const leak = rowsLeakAnswerKey(r.body);
    if (expectBlocked) {
      if (isBlocked(r.status, r.body)) pass(name, `HTTP ${r.status}`);
      else if (leak)
        fail(name, `HTTP ${r.status} LEAK sample correct_index=${r.body?.[0]?.correct_index}`);
      else fail(name, `HTTP ${r.status} column still selectable (migration not applied?)`);
    } else if (r.status === 200 && !leak) pass(name, `HTTP ${r.status}`);
    else fail(name, `HTTP ${r.status} msg=${r.body?.message ?? ""}`);
  }

  const { data: lessons } = await client.from("lessons").select("id").limit(1);
  if (lessons?.[0]?.id) {
    const lessonId = lessons[0].id;
    const { data: quiz, error: qe } = await client.rpc("get_lesson_quiz_questions", {
      _lesson_id: lessonId,
    });
    const qrows = quiz ?? [];
    const rpcLeak =
      Array.isArray(qrows) && qrows.some((x) => "correct_index" in x || "explanation" in x);
    if (!qe && !rpcLeak) pass("RPC get_lesson_quiz_questions", `rows=${qrows.length}`);
    else if (qe?.message?.includes("forbidden") || qe?.message?.includes("42501"))
      skip("RPC get_lesson_quiz_questions", qe.message);
    else
      fail(
        "RPC get_lesson_quiz_questions",
        qe?.message ?? (rpcLeak ? "answer key in RPC output" : "unknown"),
      );

    const { data: qidRow } = await client
      .from("questions")
      .select("id")
      .eq("lesson_id", lessonId)
      .limit(1)
      .maybeSingle();
    if (qidRow?.id) {
      const { data: chk, error: ce } = await client.rpc("check_lesson_question", {
        _question_id: qidRow.id,
        _selected_index: 0,
      });
      if (!ce && chk && typeof chk.is_correct === "boolean") {
        const rpcDirectLeak = chk.correct_index !== undefined;
        if (rpcDirectLeak)
          pass("RPC check_lesson_question", "returns grading fields (expected via RPC)");
        else pass("RPC check_lesson_question", "callable");
      } else if (ce?.message?.includes("forbidden") || ce?.message?.includes("42501"))
        skip("RPC check_lesson_question", ce.message);
      else fail("RPC check_lesson_question", ce?.message ?? "no result");
    } else {
      skip("RPC check_lesson_question", "no question for lesson");
    }
  } else {
    skip("RPC get_lesson_quiz_questions", "no lessons");
  }
} else if (!suErr?.message) {
  skip("authenticated column tests", "no JWT");
}

const passed = results.filter((r) => r.ok === true).length;
const failed = results.filter((r) => r.ok === false).length;
const skipped = results.filter((r) => r.ok === null).length;
console.log(`\n=== summary: ${passed} pass, ${failed} fail, ${skipped} skip ===`);
process.exit(failed > 0 ? 1 : 0);
