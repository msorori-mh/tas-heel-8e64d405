import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = {};
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)="(.*)"$/);
  if (m) env[m[1]] = m[2];
}
const base = env.SUPABASE_URL;
const anonKey = env.SUPABASE_PUBLISHABLE_KEY;
const c = createClient(base, anonKey, { auth: { persistSession: false } });
const tag = Date.now();
const email = `audit-val02+${tag}@example.com`;
const password = `AuditVal01!${tag}`;
const up = await c.auth.signUp({ email, password });
const uid = up.data.user?.id;
const sess = up.data.session?.access_token ? "yes" : "no";
const { data: authUser } = await c.auth.getUser();
console.log("session_on_signup", sess);
console.log("getUser", authUser.user?.id ? authUser.user.id.slice(0,8) : "none");
const { data: sub } = await c.rpc("has_active_subscription", { _user_id: uid });
console.log("has_active_subscription", sub);
const { data: templates, error: te } = await c.from("exam_templates").select("id").eq("is_active", true).limit(1);
console.log("templates", te ? te.message : (templates?.length ?? 0));
if (templates?.[0]?.id) {
  const { data: sid, error: se } = await c.rpc("start_exam_session", { _template_id: templates[0].id });
  console.log("start_exam", se ? se.message : String(sid).slice(0,8));
}
const { data: plans } = await c.from("subscription_plans").select("id,price,currency").eq("is_active", true).limit(1);
const { data: methods } = await c.from("payment_methods").select("id").eq("is_active", true).limit(1);
if (plans?.[0] && methods?.[0] && uid) {
  const { data: pr, error: pe } = await c.from("payment_requests").insert({
    user_id: uid,
    plan_id: plans[0].id,
    payment_method_id: methods[0].id,
    sender_name: "AUDIT",
    transaction_reference: `AUDIT-${tag}`,
    payment_date: new Date().toISOString().slice(0,10),
    amount: Number(plans[0].price) || 1000,
    currency: plans[0].currency || "YER",
    status: "pending",
  }).select("id,subscription_id").single();
  console.log("payment_insert", pe ? pe.message : `ok sub_id=${pr.subscription_id}`);
  if (pr?.id) {
    const { error: ae } = await c.rpc("approve_payment_request", { _request_id: pr.id });
    console.log("approve", ae ? ae.message : "success");
  }
}
