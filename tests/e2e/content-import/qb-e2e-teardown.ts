/**
 * QUESTION_IMPORT_QB_BINDING_08 — shared teardown for question-bank e2e rows.
 *
 * question_revisions → questions is ON DELETE RESTRICT, so revisions (and their
 * cascading children) must go before the question roots. Only ever touches rows
 * whose code starts with `e2e-`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export async function purgeE2eQuestions(admin: SupabaseClient<Database>): Promise<void> {
  const { data: questions } = await admin.from("questions").select("id").like("code", "e2e-%");
  const ids = (questions ?? []).map((q) => q.id);
  if (!ids.length) return;

  await admin.from("questions").update({ current_published_revision_id: null }).in("id", ids);
  await admin.from("question_targets").delete().in("question_id", ids);
  await admin.from("question_revisions").delete().in("question_id", ids);
  await admin.from("assessment_questions").delete().in("question_id", ids);
  await admin.from("questions").delete().in("id", ids);
}
