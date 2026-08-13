/**
 * QUESTION_IMPORT_QB_BINDING_08 / SEC-PURGE-GUARD-11B — shared teardown for
 * question-bank e2e rows.
 *
 * SECURITY POSTURE (11B): `qb_e2e_purge_questions` is PERMANENTLY ABSENT from
 * the shared production database. It could disable user triggers, so it must
 * never exist there again — not even temporarily for an e2e run.
 *
 * Consequence: teardown on the shared database may only remove rows through the
 * ordinary, guard-respecting paths. If it meets a PUBLISHED or SUPERSEDED
 * revision (whose targets are immutable by design), it FAILS CLOSED and asks a
 * human to deal with it. Destructive cleanup of published question trees
 * belongs on an isolated PostgreSQL 17 cluster, not here.
 *
 * `question_revisions → questions` is ON DELETE RESTRICT, so revisions (and
 * their cascading children) must go before the question roots. Only ever
 * touches rows whose code starts with `e2e-`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export class QbTeardownBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QbTeardownBlockedError";
  }
}

export async function purgeE2eQuestions(admin: SupabaseClient<Database>): Promise<void> {
  const { data: questions, error } = await admin
    .from("questions")
    .select("id, code")
    .like("code", "e2e-%");
  if (error) throw new Error(`teardown: cannot list e2e questions — ${error.message}`);

  const rows = questions ?? [];
  // Scope guard: never touch anything outside the e2e namespace.
  const foreign = rows.filter((q) => !q.code || !q.code.startsWith("e2e-"));
  if (foreign.length) {
    throw new QbTeardownBlockedError(
      `E2E_TEARDOWN_SCOPE_VIOLATION: ${foreign.length} non-e2e row(s) in the target set`,
    );
  }
  const ids = rows.map((q) => q.id);
  if (!ids.length) return;

  // Fail closed on frozen history: PUBLISHED / SUPERSEDED targets are immutable
  // and there is deliberately no privileged bypass on the shared database.
  const { data: frozen, error: revErr } = await admin
    .from("question_revisions")
    .select("id, question_id, status")
    .in("question_id", ids)
    .in("status", ["PUBLISHED", "SUPERSEDED"]);
  if (revErr) throw new Error(`teardown: cannot read revisions — ${revErr.message}`);
  if (frozen?.length) {
    throw new QbTeardownBlockedError(
      `E2E_TEARDOWN_BLOCKED_PUBLISHED: ${frozen.length} PUBLISHED/SUPERSEDED revision(s) cannot be removed ` +
        `on the shared database (targets are immutable by design). Questions: ` +
        `${[...new Set(frozen.map((r) => r.question_id))].join(", ")}. ` +
        `Run destructive published-revision tests on an isolated PG17 cluster instead.`,
    );
  }

  const steps: Array<[string, PromiseLike<{ error: { message: string } | null }>]> = [
    ["question_targets", admin.from("question_targets").delete().in("question_id", ids)],
    ["assessment_questions", admin.from("assessment_questions").delete().in("question_id", ids)],
    ["question_revisions", admin.from("question_revisions").delete().in("question_id", ids)],
    ["questions", admin.from("questions").delete().in("id", ids)],
  ];
  for (const [table, op] of steps) {
    const { error: delErr } = await op;
    if (delErr) {
      throw new QbTeardownBlockedError(`E2E_TEARDOWN_FAILED on ${table}: ${delErr.message}`);
    }
  }
}
