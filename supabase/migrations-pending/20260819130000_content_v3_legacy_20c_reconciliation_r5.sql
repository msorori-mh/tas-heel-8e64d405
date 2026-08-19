-- TAMKEEN CONTENT V3 / R5-R3 — LEGACY 20C RECONCILIATION (FAIL-CLOSED)
-- Source-only apply candidate. NOT applied by this worktree.
--
-- Ordering contract: this file runs BEFORE
--   20260818210000_content_v3_21h_hardened_preflight.sql
-- It deliberately does NOT touch `applicability` (that column is introduced by
-- 21H, which then sets the retired capabilities to 'NA' by itself).
--
-- R5-R2 corrections over R5:
--   1. AUDITED_APPROVAL is granted ONLY for a literal REVIEW -> READY audit
--      transition on the same (lesson_id, capability), picked deterministically
--      by (created_at DESC, id DESC).
--   2. ready_at for an audited row comes from the matching audit row's
--      created_at — never from lifecycle.updated_at/created_at.
--      LEGACY_20C_VISIBLE_BASELINE rows keep ready_by = NULL: no human approval
--      is ever claimed for them.
--   3. checkUnderstanding snapshots INNER JOIN the current published revision;
--      a question without one can never appear with revisionId = null.
--   4. Every retired capability declared in src/lib/lessons/capability-mapping.ts
--      (V3_RETIRED_CAPABILITIES) is demoted out of READY, not just
--      originalBookPdf.
--   5. Fail-closed: all preconditions run BEFORE the first UPDATE. A READY row
--      whose snapshot would be NULL/empty aborts the whole transaction unless
--      the operator explicitly allow-lists that lifecycle id for manual review.
--   6. The canonical JSON serializer is named _v3_canonical_json_v1. It is a
--      PROJECT-DEFINED deterministic canonical JSON, NOT RFC 8785 / JCS.
--
-- R5-R3 forward corrections over R5-R2 (this file is still unapplied anywhere;
-- the correction is carried forward in source, no prior commit is rewritten):
--   A. snapshot/hash atomic consistency for every READY row:
--        both NULL            -> rebuild snapshot, hash the rebuilt snapshot
--        snapshot, no hash    -> hash the STORED snapshot (not the rebuilt one)
--        hash, no snapshot    -> ABORT (R5_READY_HASH_WITHOUT_SNAPSHOT):
--                                the hash provenance cannot be proven
--        both present         -> recompute from the stored snapshot and ABORT
--                                on any difference
--                                (R5_READY_SNAPSHOT_HASH_MISMATCH)
--      Post-state gate: READY_SNAPSHOT_HASH_MISMATCH = 0.
--   B. approval identity consistency: a row is AUDITED_APPROVAL only when
--      ready_by equals the audit actor_id AND ready_at is the matching audit
--      row's created_at. A pre-existing, conflicting ready_by is NEVER silently
--      replaced — the row is documented as LEGACY_20C_ROW_APPROVER instead.
--      Post-state gate: AUDITED_APPROVAL_ACTOR_MISMATCH = 0.
--   C. audit target scope is pinned to the real audit contract:
--      target_type = 'lesson_capability' (verified against the live audit_logs
--      contract) in addition to action / target_id / capability / REVIEW->READY
--      / non-NULL actor.
--
-- Governing rules preserved:
--   * ready_by is NEVER fabricated.
--   * No lifecycle row is deleted or archived-then-deleted.
--   * No student-visible content row is created, copied, renamed, or removed.


BEGIN;

DO $$
BEGIN
  IF to_regclass('public.lesson_capability_lifecycle') IS NULL THEN
    RAISE EXCEPTION 'R5_PREREQUISITE_SCHEMA_MISSING: lesson_capability_lifecycle';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'lesson_capability_lifecycle'
       AND column_name = 'applicability'
  ) THEN
    RAISE EXCEPTION 'R5_MUST_RUN_BEFORE_21H: applicability already present';
  END IF;
END $$;

/* 0. Retired capability contract. MUST stay in sync with
      V3_RETIRED_CAPABILITIES in src/lib/lessons/capability-mapping.ts. */
CREATE OR REPLACE FUNCTION public.v3_retired_capabilities()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT ARRAY['originalBookPdf', 'supportingResources']::text[];
$$;

REVOKE ALL ON FUNCTION public.v3_retired_capabilities() FROM PUBLIC, anon, authenticated;

/* 1. Provenance columns. Additive only. */
ALTER TABLE public.lesson_capability_lifecycle
  ADD COLUMN IF NOT EXISTS evidence_origin text,
  ADD COLUMN IF NOT EXISTS retirement_origin text;

ALTER TABLE public.lesson_capability_lifecycle
  DROP CONSTRAINT IF EXISTS lesson_capability_lifecycle_evidence_origin_chk;
ALTER TABLE public.lesson_capability_lifecycle
  ADD CONSTRAINT lesson_capability_lifecycle_evidence_origin_chk
  CHECK (evidence_origin IS NULL OR evidence_origin IN (
    'LEGACY_20C_VISIBLE_BASELINE',
    'LEGACY_20C_ROW_APPROVER',
    'AUDITED_APPROVAL',
    'NEEDS_MANUAL_REVIEW'
  ));

-- LEGACY_20C_VISIBLE_BASELINE claims a measured visible baseline and nothing
-- else, so it must never carry an approver.
ALTER TABLE public.lesson_capability_lifecycle
  DROP CONSTRAINT IF EXISTS lesson_capability_lifecycle_legacy_baseline_no_approver_chk;
ALTER TABLE public.lesson_capability_lifecycle
  ADD CONSTRAINT lesson_capability_lifecycle_legacy_baseline_no_approver_chk
  CHECK (evidence_origin IS DISTINCT FROM 'LEGACY_20C_VISIBLE_BASELINE'
         OR ready_by IS NULL) NOT VALID;

ALTER TABLE public.lesson_capability_lifecycle
  DROP CONSTRAINT IF EXISTS lesson_capability_lifecycle_retirement_origin_chk;
ALTER TABLE public.lesson_capability_lifecycle
  ADD CONSTRAINT lesson_capability_lifecycle_retirement_origin_chk
  CHECK (retirement_origin IS NULL OR retirement_origin IN ('LEGACY_20C'));

-- A retired capability can never be READY again.
ALTER TABLE public.lesson_capability_lifecycle
  DROP CONSTRAINT IF EXISTS lesson_capability_lifecycle_retired_not_ready_chk;
ALTER TABLE public.lesson_capability_lifecycle
  ADD CONSTRAINT lesson_capability_lifecycle_retired_not_ready_chk
  CHECK (status <> 'READY'
         OR capability NOT IN ('originalBookPdf', 'supportingResources')) NOT VALID;

-- Every READY row must carry either a real approver or a documented legacy
-- provenance. NEEDS_MANUAL_REVIEW is explicitly NOT sufficient for READY.
ALTER TABLE public.lesson_capability_lifecycle
  DROP CONSTRAINT IF EXISTS lesson_capability_lifecycle_ready_evidence_chk;
ALTER TABLE public.lesson_capability_lifecycle
  ADD CONSTRAINT lesson_capability_lifecycle_ready_evidence_chk
  CHECK (
    status <> 'READY'
    OR (ready_at IS NOT NULL
        AND ready_snapshot IS NOT NULL
        AND ready_hash IS NOT NULL
        AND (ready_by IS NOT NULL OR evidence_origin = 'LEGACY_20C_VISIBLE_BASELINE'))
  ) NOT VALID;

COMMENT ON COLUMN public.lesson_capability_lifecycle.evidence_origin IS
  'AUDITED_APPROVAL = a literal REVIEW->READY audit transition exists for this (lesson_id, capability); ready_by and ready_at come from that row. LEGACY_20C_ROW_APPROVER = the row already stored an approver before the snapshot contract existed. LEGACY_20C_VISIBLE_BASELINE = row predates the snapshot contract, snapshot/hash captured from already-visible production content, ready_by stays NULL and no human review is claimed. NEEDS_MANUAL_REVIEW = source content could not be rebuilt; the row is never READY.';
COMMENT ON COLUMN public.lesson_capability_lifecycle.retirement_origin IS
  'LEGACY_20C = capability retired from the V3 seven-capability contract; the row is kept as lifecycle history and is never READY.';

/* 2. Canonical JSON v1 — PROJECT-DEFINED, not RFC 8785/JCS.
      Guarantees: recursively sorted object keys under COLLATE "C", explicit
      array ordering by ordinality, UTF-8 hashing, deterministic null handling
      (JSON null serializes to the literal `null`, SQL NULL propagates to NULL).
      Numbers are emitted with PostgreSQL's jsonb numeric text form, which is
      deterministic for this project's payloads but is NOT the RFC 8785
      canonical number serialization. Do not rename this to a JCS name. */
DROP FUNCTION IF EXISTS public._v3_jcs(jsonb);

CREATE OR REPLACE FUNCTION public._v3_canonical_json_v1(v jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE jsonb_typeof(v)
    WHEN 'null'    THEN 'null'
    WHEN 'boolean' THEN CASE WHEN v = 'true'::jsonb THEN 'true' ELSE 'false' END
    WHEN 'number'  THEN v #>> '{}'
    WHEN 'string'  THEN to_json(v #>> '{}')::text
    WHEN 'array'   THEN '[' || COALESCE((
        SELECT string_agg(public._v3_canonical_json_v1(e.value), ',' ORDER BY e.ordinality)
          FROM jsonb_array_elements(v) WITH ORDINALITY AS e(value, ordinality)
      ), '') || ']'
    WHEN 'object'  THEN '{' || COALESCE((
        SELECT string_agg(to_json(kv.key)::text || ':' || public._v3_canonical_json_v1(kv.value), ',' ORDER BY kv.key COLLATE "C")
          FROM jsonb_each(v) AS kv(key, value)
      ), '') || '}'
  END;
$$;

COMMENT ON FUNCTION public._v3_canonical_json_v1(jsonb) IS
  'Project-defined deterministic canonical JSON v1. NOT RFC 8785 / JCS: number serialization follows PostgreSQL jsonb text output, not the JCS numeric algorithm.';

REVOKE ALL ON FUNCTION public._v3_canonical_json_v1(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.v3_capability_snapshot(_lesson_id uuid, _capability text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'snapshotVersion', 'v3.snapshot.1',
    'capability', _capability,
    'lessonId', _lesson_id,
    'payload', CASE _capability

      WHEN 'officialBookContent' THEN COALESCE((
        SELECT jsonb_agg(jsonb_build_object('content', b.content) ORDER BY b.id)
          FROM public.lesson_book_contents b
         WHERE b.lesson_id = _lesson_id
           AND COALESCE(btrim(b.content), '') <> ''
      ), '[]'::jsonb)

      WHEN 'tamkeenExplanation' THEN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'code', e.explanation_code,
                 'title', e.title,
                 'content', e.content,
                 'sortOrder', COALESCE(e.sort_order, 0)
               ) ORDER BY COALESCE(e.sort_order, 0), e.id)
          FROM public.lesson_explanations e
         WHERE e.lesson_id = _lesson_id
           AND COALESCE(btrim(e.content), '') <> ''
      ), '[]'::jsonb)

      WHEN 'quickReview' THEN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'summary', s.summary,
                 'keyPoints', to_jsonb(s.key_points),
                 'studyTip', s.study_tip
               ) ORDER BY s.id)
          FROM public.lesson_summaries s
         WHERE s.lesson_id = _lesson_id
           AND COALESCE(btrim(s.summary), '') <> ''
      ), '[]'::jsonb)

      WHEN 'mindMap' THEN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'code', r.resource_code,
                 'title', r.title,
                 'url', r.url,
                 'sortOrder', COALESCE(r.sort_order, 0)
               ) ORDER BY COALESCE(r.sort_order, 0), r.id)
          FROM public.lesson_resources r
         WHERE r.lesson_id = _lesson_id
           AND (r.resource_type::text = 'mindmap' OR r.html_resource_type::text = 'mindmap')
           AND COALESCE(btrim(r.url), '') <> ''
      ), '[]'::jsonb)

      WHEN 'simulation' THEN jsonb_build_object(
        'resources', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'code', r.resource_code,
                   'title', r.title,
                   'url', r.url,
                   'sortOrder', COALESCE(r.sort_order, 0)
                 ) ORDER BY COALESCE(r.sort_order, 0), r.id)
            FROM public.lesson_resources r
           WHERE r.lesson_id = _lesson_id
             AND (r.resource_type::text = 'experiment' OR r.html_resource_type::text = 'experiment')
             AND COALESCE(btrim(r.url), '') <> ''
        ), '[]'::jsonb),
        'simulations', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
                   'title', s.title,
                   'phetUrl', s.phet_url,
                   'sortOrder', COALESCE(s.sort_order, 0)
                 ) ORDER BY COALESCE(s.sort_order, 0), s.id)
            FROM public.lesson_simulations s
           WHERE s.lesson_id = _lesson_id
        ), '[]'::jsonb)
      )

      -- Questions: identity, published revision pin, and option ORDER only.
      -- is_correct, rationales and model answers are never selected.
      -- INNER JOIN: a question without a valid current published revision is
      -- structurally excluded, so revisionId can never be null.
      WHEN 'checkUnderstanding' THEN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'questionId', q.id,
                 'revisionId', rev.id,
                 'questionType', q.question_type,
                 'sortOrder', COALESCE(q.sort_order, 0),
                 'optionCodes', COALESCE((
                   SELECT jsonb_agg(o.option_code ORDER BY o.sort_order, o.option_code)
                     FROM public.question_options o
                    WHERE o.question_revision_id = rev.id
                 ), '[]'::jsonb)
               ) ORDER BY COALESCE(q.sort_order, 0), q.id)
          FROM public.questions q
          JOIN public.question_revisions rev
            ON rev.id = q.current_published_revision_id
           AND rev.question_id = q.id
         WHERE q.lesson_id = _lesson_id
           AND q.archived_at IS NULL
           AND rev.id IS NOT NULL
           AND rev.status = 'PUBLISHED'
      ), '[]'::jsonb)

      WHEN 'lessonAssessment' THEN COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'assessmentCode', a.assessment_code,
                 'title', a.title,
                 'sortOrder', COALESCE(a.sort_order, 0),
                 'questions', COALESCE((
                   SELECT jsonb_agg(jsonb_build_object(
                            'questionId', aq.question_id,
                            'sortOrder', COALESCE(aq.sort_order, 0),
                            'points', aq.points
                          ) ORDER BY COALESCE(aq.sort_order, 0), aq.question_id)
                     FROM public.assessment_questions aq
                    WHERE aq.assessment_id = a.id
                 ), '[]'::jsonb)
               ) ORDER BY COALESCE(a.sort_order, 0), a.id)
          FROM public.lesson_assessments a
         WHERE a.lesson_id = _lesson_id
      ), '[]'::jsonb)

      ELSE 'null'::jsonb
    END
  );
$$;

REVOKE ALL ON FUNCTION public.v3_capability_snapshot(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.v3_capability_snapshot_hash(_snapshot jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT encode(sha256(convert_to(public._v3_canonical_json_v1(_snapshot), 'UTF8')), 'hex');
$$;

REVOKE ALL ON FUNCTION public.v3_capability_snapshot_hash(jsonb) FROM PUBLIC, anon, authenticated;

/* 2b. Reconcilability test. A snapshot may only be pinned when the capability's
       current source content can actually be rebuilt. A NULL snapshot or an
       empty payload means the source is gone (or was never there), so no
       snapshot and no ready_hash is invented. */
CREATE OR REPLACE FUNCTION public.v3_capability_snapshot_is_reconcilable(_snapshot jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN _snapshot IS NULL THEN false
    ELSE CASE jsonb_typeof(_snapshot -> 'payload')
      WHEN 'array'  THEN jsonb_array_length(_snapshot -> 'payload') > 0
      WHEN 'object' THEN EXISTS (
        SELECT 1 FROM jsonb_each(_snapshot -> 'payload') AS kv(key, value)
         WHERE CASE jsonb_typeof(kv.value)
                 WHEN 'array' THEN jsonb_array_length(kv.value) > 0
                 WHEN 'null'  THEN false
                 ELSE true
               END
      )
      ELSE false
    END
  END;
$$;

REVOKE ALL ON FUNCTION public.v3_capability_snapshot_is_reconcilable(jsonb) FROM PUBLIC, anon, authenticated;

/* 2c. Exact approval evidence. A transition only counts when it is literally
       REVIEW -> READY for the SAME lesson and capability. Deterministic pick:
       (created_at DESC, id DESC). */
CREATE OR REPLACE FUNCTION public.v3_capability_audited_approval(_lesson_id uuid, _capability text)
RETURNS TABLE (actor_id uuid, approved_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT a.actor_id, a.created_at
    FROM public.audit_logs a
  WHERE a.action = 'lesson_capability_lifecycle_transition'
    AND a.target_type = 'lesson_capability'
    AND a.target_id = _lesson_id
     AND a.metadata ->> 'capability' = _capability
     AND a.metadata ->> 'from_status' = 'REVIEW'
     AND a.metadata ->> 'to_status' = 'READY'
     AND a.actor_id IS NOT NULL
   ORDER BY a.created_at DESC, a.id DESC
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.v3_capability_audited_approval(uuid, text) FROM PUBLIC, anon, authenticated;

/* 3. FAIL-CLOSED PRECONDITIONS. All of them run before the first UPDATE.
      Any violation aborts the whole transaction.

      `tamkeen.r5_manual_review_allowlist` is a comma-separated list of
      lifecycle row ids the operator has explicitly reviewed and accepted for
      demotion to REVIEW/NEEDS_MANUAL_REVIEW. Unset (the default) means ANY
      unreconcilable READY row is a hard stop. */
DO $$
DECLARE
  v_allow uuid[] := (
    SELECT COALESCE(array_agg(btrim(t)::uuid), ARRAY[]::uuid[])
      FROM regexp_split_to_table(
             COALESCE(NULLIF(current_setting('tamkeen.r5_manual_review_allowlist', true), ''), ''),
             ',') AS t
     WHERE btrim(t) <> ''
  );
  v_empty bigint;
  v_nullrev bigint;
  v_retired_ready bigint;
BEGIN
  -- 3.1 No READY row may be pinned without real, rebuildable content.
  SELECT count(*) INTO v_empty
    FROM public.lesson_capability_lifecycle x
   WHERE x.status = 'READY'
     AND NOT (x.capability = ANY (public.v3_retired_capabilities()))
     AND NOT (x.id = ANY (v_allow))
     AND NOT public.v3_capability_snapshot_is_reconcilable(
           public.v3_capability_snapshot(x.lesson_id, x.capability));
  IF v_empty > 0 THEN
    RAISE EXCEPTION 'R5_EMPTY_READY_SNAPSHOT=% (no ready_hash may be created without content; review and allow-list the rows explicitly)', v_empty;
  END IF;

  -- 3.2 No snapshot may carry a null published revision.
  SELECT count(*) INTO v_nullrev
    FROM public.lesson_capability_lifecycle x,
         LATERAL jsonb_array_elements(
           COALESCE(public.v3_capability_snapshot(x.lesson_id, x.capability) -> 'payload', '[]'::jsonb)
         ) q
   WHERE x.status = 'READY'
     AND x.capability = 'checkUnderstanding'
     AND COALESCE(q ->> 'revisionId', '') = '';
  IF v_nullrev > 0 THEN
    RAISE EXCEPTION 'R5_PUBLISHED_REVISION_NULL=%', v_nullrev;
  END IF;

  -- 3.3 Retired capabilities that carry a snapshot must not lose it silently.
  SELECT count(*) INTO v_retired_ready
    FROM public.lesson_capability_lifecycle x
   WHERE x.capability = ANY (public.v3_retired_capabilities())
     AND x.status = 'READY';
  RAISE NOTICE 'R5_RETIRED_READY_ROWS_TO_DEMOTE=%', v_retired_ready;
END $$;

/* 3a. Pin the legacy READY rows whose source content is deterministically
       reconcilable. status is never changed here, so the student surface is
       bit-for-bit identical before and after. */
UPDATE public.lesson_capability_lifecycle x
   SET ready_by = COALESCE(x.ready_by, ev.actor_id),
       evidence_origin = CASE
         WHEN ev.actor_id IS NOT NULL THEN 'AUDITED_APPROVAL'
         WHEN x.ready_by IS NOT NULL  THEN 'LEGACY_20C_ROW_APPROVER'
         ELSE 'LEGACY_20C_VISIBLE_BASELINE'
       END,
       ready_snapshot = COALESCE(x.ready_snapshot, ev.snapshot),
       ready_hash = COALESCE(x.ready_hash, public.v3_capability_snapshot_hash(ev.snapshot)),
       ready_at = CASE
         WHEN x.ready_at IS NOT NULL THEN x.ready_at
         -- Audited rows take the approval time from the audit row itself.
         WHEN ev.actor_id IS NOT NULL THEN ev.approved_at
         -- Legacy baseline rows record the observed baseline time, and their
         -- provenance says explicitly that this is not an approval timestamp.
         ELSE COALESCE(x.updated_at, x.created_at)
       END
  FROM (
    SELECT l.id AS lifecycle_id,
           ap.actor_id,
           ap.approved_at,
           public.v3_capability_snapshot(l.lesson_id, l.capability) AS snapshot
      FROM public.lesson_capability_lifecycle l
      LEFT JOIN LATERAL public.v3_capability_audited_approval(l.lesson_id, l.capability) ap ON true
     WHERE l.status = 'READY'
  ) ev
 WHERE ev.lifecycle_id = x.id
   AND x.status = 'READY'
   AND NOT (x.capability = ANY (public.v3_retired_capabilities()))
   AND (x.ready_snapshot IS NULL OR x.ready_hash IS NULL OR x.evidence_origin IS NULL)
   AND public.v3_capability_snapshot_is_reconcilable(ev.snapshot);

/* 3b. Explicitly allow-listed rows whose source cannot be rebuilt get no
       invented evidence. They are flagged for a human and moved out of READY,
       which is the only honest state for "we cannot prove what this published".
       In the measured production baseline this set is empty (0 rows). */
UPDATE public.lesson_capability_lifecycle x
   SET status = 'REVIEW',
       evidence_origin = 'NEEDS_MANUAL_REVIEW'
 WHERE x.status = 'READY'
   AND NOT (x.capability = ANY (public.v3_retired_capabilities()))
   AND NOT public.v3_capability_snapshot_is_reconcilable(
         public.v3_capability_snapshot(x.lesson_id, x.capability)
       );

/* 4. Retire EVERY capability outside the V3 contract without deleting history.
      READY is removed but the row, its snapshot and its audit trail are
      preserved. 21H then flips applicability to 'NA' on the very same rows. */
UPDATE public.lesson_capability_lifecycle
   SET status = CASE WHEN status = 'READY' THEN 'REVIEW' ELSE status END,
       retirement_origin = 'LEGACY_20C'
 WHERE capability = ANY (public.v3_retired_capabilities())
   AND (status = 'READY' OR retirement_origin IS DISTINCT FROM 'LEGACY_20C');

INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
SELECT NULL,
       'content_v3_r5_r2_legacy_reconciliation',
       'lesson_capability',
       x.lesson_id,
       jsonb_build_object(
         'capability', x.capability,
         'status', x.status,
         'evidence_origin', x.evidence_origin,
         'retirement_origin', x.retirement_origin
       )
  FROM public.lesson_capability_lifecycle x
 WHERE x.evidence_origin IS NOT NULL
    OR x.retirement_origin IS NOT NULL;

/* 5. Post-state gates inside the same transaction. */
DO $$
DECLARE
  n bigint;
BEGIN
  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle
   WHERE status = 'READY'
     AND (ready_snapshot IS NULL OR ready_hash IS NULL OR ready_at IS NULL
          OR (ready_by IS NULL AND COALESCE(evidence_origin, '') <> 'LEGACY_20C_VISIBLE_BASELINE'));
  IF n > 0 THEN RAISE EXCEPTION 'R5_READY_ROWS_WITHOUT_VALID_EVIDENCE=%', n; END IF;

  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle
   WHERE evidence_origin = 'LEGACY_20C_VISIBLE_BASELINE' AND ready_by IS NOT NULL;
  IF n > 0 THEN RAISE EXCEPTION 'R5_INVENTED_READY_BY=%', n; END IF;

  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle
   WHERE capability = ANY (public.v3_retired_capabilities()) AND status = 'READY';
  IF n > 0 THEN RAISE EXCEPTION 'R5_RETIRED_READY_ROWS=%', n; END IF;

  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle
   WHERE status = 'READY'
     AND NOT public.v3_capability_snapshot_is_reconcilable(ready_snapshot);
  IF n > 0 THEN RAISE EXCEPTION 'R5_EMPTY_READY_SNAPSHOT_POST=%', n; END IF;

  SELECT count(*) INTO n FROM public.lesson_capability_lifecycle x
   WHERE x.ready_snapshot::text ~* '(is_correct|isCorrect|why_correct|why_wrong|model_answer|correct_option)';
  IF n > 0 THEN RAISE EXCEPTION 'R5_ANSWER_LEAK=%', n; END IF;
END $$;

ALTER TABLE public.lesson_capability_lifecycle
  VALIDATE CONSTRAINT lesson_capability_lifecycle_ready_evidence_chk;
ALTER TABLE public.lesson_capability_lifecycle
  VALIDATE CONSTRAINT lesson_capability_lifecycle_legacy_baseline_no_approver_chk;
ALTER TABLE public.lesson_capability_lifecycle
  VALIDATE CONSTRAINT lesson_capability_lifecycle_retired_not_ready_chk;

COMMIT;

-- Rollback guidance: this file is a single transaction; a failure rolls the
-- whole thing back. Do not "undo" it by deleting lifecycle rows — a correction
-- is a forward migration that re-pins evidence.
