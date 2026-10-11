/**
 * READ-ONLY content data readiness audit (WAVE-3).
 * Uses only the publishable (anon) key from .env.local — the same credential
 * shipped to every browser client. Performs count/head selects only.
 * No inserts, updates, deletes, RPCs that mutate, or auth changes.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const key = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.log("FATAL: missing SUPABASE_URL / publishable key in .env.local");
  process.exit(1);
}
const c = createClient(url, key, { auth: { persistSession: false } });

async function count(table, label, filter) {
  let q = c.from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count: n, error } = await q;
  console.log(`${label}: ${error ? "DENIED/ERR: " + error.message : n}`);
}

// Anon readability probe + counts (whatever RLS allows as anon).
await count("grades", "grades");
await count("curriculum_tracks", "curriculum_tracks");
await count("subjects", "subjects");
await count("units", "units");
await count("lessons", "lessons");
await count("lesson_resources", "lesson_resources");
await count("questions", "questions");
await count("exam_templates", "exam_templates(active)", (q) => q.eq("is_active", true));
await count("exam_templates", "exam_templates(all)");
await count("subscription_plans", "subscription_plans");
