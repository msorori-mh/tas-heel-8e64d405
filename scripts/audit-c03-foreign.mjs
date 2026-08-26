import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = {};
for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)="(.*)"$/);
  if (m) env[m[1]] = m[2];
}
const base = env.SUPABASE_URL;
const anonKey = env.SUPABASE_PUBLISHABLE_KEY;
const c1 = createClient(base, anonKey, { auth: { persistSession: false } });
const tag = Date.now();
const up = await c1.auth.signUp({
  email: `audit-val03+${tag}@example.com`,
  password: `AuditVal01!${tag}`,
});
const victimId = up.data.user.id;
const c2 = createClient(base, anonKey, { auth: { persistSession: false } });
const foreign = crypto.randomUUID();
const r1 = await c2.rpc("get_user_email", { _user_id: victimId });
const r2 = await c2.rpc("get_user_email", { _user_id: foreign });
console.log("victim_known_id", victimId.slice(0, 8));
console.log(
  "fresh_client_victim",
  r1.error ? r1.error.message : r1.data ? `leaked_len_${r1.data.length}` : "null",
);
console.log(
  "fresh_client_random",
  r2.error ? r2.error.message : r2.data === null ? "null" : `leaked_len_${String(r2.data).length}`,
);
