import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260912030000_offline_assessment_answer_layer.sql",
    import.meta.url,
  ),
  "utf8",
);
const source = readFileSync(
  new URL("../../src/lib/offline/offline-assessment-source.server.ts", import.meta.url),
  "utf8",
);
const sync = readFileSync(
  new URL("../../src/lib/offline/offline-sync.ts", import.meta.url),
  "utf8",
);
const workflow = readFileSync(
  new URL("../../.github/workflows/web-ci.yml", import.meta.url),
  "utf8",
);
const pgRunner = readFileSync(
  new URL("./run-pg17-offline-assessment-rehearsal.sh", import.meta.url),
  "utf8",
);
const pgSmoke = readFileSync(
  new URL("./fixtures/pg17-offline-assessment-smoke.sql", import.meta.url),
  "utf8",
);

describe("OFFLINE-05 service-only answer layer", () => {
  it("binds every requested revision to the lesson, published pointer and educational role", () => {
    expect(migration).toMatch(/q\.lesson_id = _lesson_id/);
    expect(migration).toMatch(/q\.current_published_revision_id = r\.id/);
    expect(migration).toMatch(/r\.status = 'PUBLISHED'/);
    expect(migration).toMatch(/r\.educational_label = expected_label/);
    expect(migration).toMatch(/matched_revision_count <> cardinality\(_revision_ids\)/);
  });

  it("is executable by service_role only", () => {
    expect(migration).toMatch(/SECURITY DEFINER/);
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.get_offline_assessment_answer_layer\(uuid, text, uuid\[\]\) FROM PUBLIC/,
    );
    expect(migration).toMatch(/FROM anon, authenticated/);
    expect(migration).toMatch(/TO service_role/);
    expect(migration).not.toMatch(/TO (?:PUBLIC|anon|authenticated)\s*;/);
  });

  it("joins rationale option UUIDs back to stable option codes", () => {
    expect(migration).toMatch(/o\.option_code = x\.option_id/);
    expect(migration).not.toMatch(/o\.id = x\.option_id/);
    expect(migration).toMatch(/'optionId', o\.option_code/);
  });

  it("keeps direct answer-column selects out of application TypeScript", () => {
    expect(source).toContain('rpc("get_offline_assessment_answer_layer"');
    expect(source).not.toMatch(
      /\.from\("(?:official_question_answers|question_option_rationales)"\)/,
    );
    expect(source).not.toMatch(/\.select\([^)]*\bexplanation\b/);
  });
});

describe("OFFLINE-05 ordered idempotent activity sync", () => {
  it("serializes one account/key and rejects a conflicting payload", () => {
    expect(migration.match(/pg_advisory_xact_lock/g)).toHaveLength(2);
    expect(migration).toMatch(/actor_id::text \|\| ':' \|\| _kind \|\| ':' \|\| _entity_id::text/);
    expect(migration).toMatch(/UNIQUE \(user_id, idempotency_key\)/);
    expect(migration).toMatch(/server_payload_sha256 := encode\(extensions\.digest/);
    expect(migration).toMatch(/existing\.payload_sha256 IS DISTINCT FROM server_payload_sha256/);
    expect(migration).toMatch(/actor_id, _idempotency_key, server_payload_sha256, _kind/);
    expect(migration).toMatch(/OFFLINE_SYNC_IDEMPOTENCY_CONFLICT/);
  });

  it("never overwrites a newer note or progress value and clamps future clock skew", () => {
    expect(migration).toMatch(/effective_occurred_at := LEAST\(_occurred_at, now\(\)\)/);
    expect(migration).toMatch(/SELECT max\(occurred_at\) INTO latest_offline_at/);
    expect(migration).toMatch(/latest_offline_at > effective_occurred_at/);
    expect(migration).toMatch(/offline_learning_mutations_entity_clock_idx/);
    expect(migration).toMatch(
      /latest_offline_at IS NOT NULL\s+OR public\.lesson_question_notes\.updated_at <= EXCLUDED\.updated_at/,
    );
    expect(migration).toMatch(
      /latest_offline_at IS NOT NULL\s+OR public\.user_progress\.updated_at <= EXCLUDED\.updated_at/,
    );
  });

  it("keeps partial progress separate from quiz scores and enforces lesson bindings", () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS progress_percent integer/);
    expect(migration).toMatch(
      /INSERT INTO public\.user_progress \(user_id, lesson_id, progress_percent, updated_at\)/,
    );
    expect(migration).not.toMatch(
      /INSERT INTO public\.user_progress \(user_id, lesson_id, quiz_score/,
    );
    expect(migration).toMatch(/public\.can_access_lesson\(_entity_id\) IS DISTINCT FROM true/);
    expect(migration).toMatch(/OFFLINE_SYNC_LESSON_ACCESS_DENIED/);
    expect(migration).toMatch(/q\.lesson_id = _lesson_id/);
    expect(migration).toMatch(/r\.educational_label = 'OFFICIAL_BOOK_QUESTION'/);
    expect(migration).toMatch(/OFFLINE_SYNC_QUESTION_BINDING_DENIED/);
  });

  it("keeps the ledger inaccessible and derives the actor from auth.uid", () => {
    expect(migration).toMatch(/actor_id uuid := auth\.uid\(\)/);
    expect(migration).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(migration).toMatch(
      /REVOKE ALL ON TABLE public\.offline_learning_mutations FROM PUBLIC, anon, authenticated/,
    );
    expect(migration).toMatch(
      /apply_offline_learning_mutation[\s\S]*TO authenticated, service_role/,
    );
  });

  it("routes every queued mutation through the atomic RPC", () => {
    expect(sync).toContain('rpc("apply_offline_learning_mutation"');
    expect(sync).toContain("_payload_sha256: record.payloadSha256");
    expect(sync).not.toMatch(/\.from\("(?:lesson_question_notes|user_progress)"\)/);
  });
});

describe("OFFLINE-05 PostgreSQL 17 release gate", () => {
  it("executes the uniquely-versioned migration against a localhost-only database", () => {
    expect(workflow).toContain("offline-assessment-pg17:");
    expect(workflow).toContain("run-pg17-offline-assessment-rehearsal.sh");
    expect(pgRunner).toContain("OFFLINE_PG17_URL must target localhost");
    expect(pgRunner).toContain("20260912030000_offline_assessment_answer_layer.sql");
    expect(pgSmoke).toContain("PASS partial progress preserves quiz score");
    expect(pgSmoke).toContain("PASS denied question binding rejected");
    expect(pgSmoke).toContain("PASS idempotent replay creates one ledger row");
  });
});
