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
const email = `audit-val01+${tag}@example.com`;
const password = `AuditVal01!${tag}`;
const up = await c.auth.signUp({ email, password });
const uid = up.data.user?.id;
console.log("user_prefix", uid ? uid.slice(0, 8) : "none");
console.log("signup_err", up.error?.message || "none");
if (uid) {
  const r = await c.rpc("get_user_email", { _user_id: uid });
  if (r.error) console.log("get_user_email_err", r.error.message);
  else if (r.data === null) console.log("get_user_email_result", "null");
  else if (typeof r.data === "string" && r.data.includes("@")) console.log("get_user_email_result", "email_leaked_len", r.data.length);
  else console.log("get_user_email_result", typeof r.data);
}
