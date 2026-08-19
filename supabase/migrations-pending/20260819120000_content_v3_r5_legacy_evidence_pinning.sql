-- TAMKEEN CONTENT V3 / R5 — LEGACY EVIDENCE PINNING AND originalBookPdf RETIREMENT
-- Source-only apply candidate. NOT applied by this worktree.
--
-- Ordering contract: this file runs BEFORE
--   20260818210000_content_v3_21h_hardened_preflight.sql
-- It deliberately does NOT touch `applicability` (that column is introduced by
-- 21H, which then sets originalBookPdf/supportingResources to 'NA' by itself).
--
-- Governing rules enforced here:
--  * ready_by is NEVER fabricated. It is written only when an actual approval
--    transition for the same (lesson_id, capability) exists in audit_logs.
--    Every other legacy row is labelled evidence_origin='LEGACY_20C_VISIBLE_BASELINE'
--    which claims a measured visible baseline, not a human review.
--  * No lifecycle row is deleted or archived-then-deleted. originalBookPdf rows
--    are demoted out of READY and labelled retirement_origin='LEGACY_20C'.
--  * No student-visible content row is created, copied, renamed, or removed.

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
    'AUDITED_APPROVAL'
  ));

ALTER TABLE public.lesson_capability_lifecycle
  DROP CONSTRAINT IF EXISTS lesson_capability_lifecycle_retirement_origin_chk;
ALTER TABLE public.lesson_capability_lifecycle
  ADD CONSTRAINT lesson_capability_lifecycle_retirement_origin_chk
  CHECK (retirement_origin IS NULL OR retirement_origin IN ('LEGACY_20C'));

-- Every READY row must carry either a real approver or a documented legacy
-- provenance. This is the contract that replaces "ready_by is always present".
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
  'AUDITED_APPROVAL = ready_by proven from audit_logs. LEGACY_20C_VISIBLE_BASELINE = row predates the snapshot contract; snapshot/hash captured from the already-visible production content, no human review claimed.';
COMMENT ON COLUMN public.lesson_capability_lifecycle.retirement_origin IS
  'LEGACY_20C = capability retired from the V3 seven-capability contract; the row is kept as lifecycle history and is never READY.';

/* 2. Canonical snapshot v1.
      Deterministic UTF-8 JSON text with recursively sorted object keys and
      explicitly ordered arrays. Answers, rationales and model answers are
      structurally excluded — they can never enter a snapshot. */
CREATE OR REPLACE FUNCTION public._v3_jcs(v jsonb)
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
        SELECT string_agg(public._v3_jcs(e.value), ',' ORDER BY e.ordinality)
          FROM jsonb_array_elements(v) WITH ORDINALITY AS e(value, ordinality)
      ), '') || ']'
    WHEN 'object'  THEN '{' || COALESCE((
        SELECT string_agg(to_json(kv.key)::text || ':' || public._v3_jcs(kv.value), ',' ORDER BY kv.key COLLATE "C")
          FROM jsonb_each(v) AS kv(key, value)
      ), '') || '}'
  END;
$$;

REVOKE ALL ON FUNCTION public._v3_jcs(jsonb) FROM PUBLIC, anon, authenticated;

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
          LEFT JOIN public.question_revisions rev
            ON rev.id = q.current_published_revision_id
           AND rev.question_id = q.id
           AND rev.status = 'PUBLISHED'
         WHERE q.lesson_id = _lesson_id
           AND q.archived_at IS NULL
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
  SELECT encode(sha256(convert_to(public._v3_jcs(_snapshot), 'UTF8')), 'hex');
$$;

REVOKE ALL ON FUNCTION public.v3_capability_snapshot_hash(jsonb) FROM PUBLIC, anon, authenticated;

/* 3. Pin the legacy READY rows. status is never changed here, so the student
      surface is bit-for-bit identical before and after. */
UPDATE public.lesson_capability_lifecycle x
   SET ready_by = COALESCE(x.ready_by, ev.actor_id),
       evidence_origin = CASE
         WHEN x.ready_by IS NOT NULL OR ev.actor_id IS NOT NULL THEN 'AUDITED_APPROVAL'
         ELSE 'LEGACY_20C_VISIBLE_BASELINE'
       END,
       ready_snapshot = COALESCE(x.ready_snapshot, public.v3_capability_snapshot(x.lesson_id, x.capability)),
       ready_hash = COALESCE(
         x.ready_hash,
         public.v3_capability_snapshot_hash(public.v3_capability_snapshot(x.lesson_id, x.capability))
       ),
       ready_at = COALESCE(x.ready_at, x.updated_at, x.created_at)
  FROM (
    SELECT l.id AS lifecycle_id,
           (SELECT a.actor_id
              FROM public.audit_logs a
             WHERE a.action = 'lesson_capability_lifecycle_transition'
               AND a.target_id = l.lesson_id
               AND a.metadata ->> 'capability' = l.capability
               AND a.metadata ->> 'to_status' = 'READY'
               AND a.actor_id IS NOT NULL
             ORDER BY a.created_at DESC
             LIMIT 1) AS actor_id
      FROM public.lesson_capability_lifecycle l
     WHERE l.status = 'READY'
  ) ev
 WHERE ev.lifecycle_id = x.id
   AND x.status = 'READY'
   AND (x.ready_snapshot IS NULL OR x.ready_hash IS NULL OR x.evidence_origin IS NULL);

/* 4. Retire originalBookPdf without deleting history.
      READY is removed (the capability is out of the V3 contract) but the row,
      its snapshot and its audit trail are preserved. 21H then flips
      applicability to 'NA' on the very same rows. */
UPDATE public.lesson_capability_lifecycle
   SET status = 'REVIEW',
       retirement_origin = 'LEGACY_20C'
 WHERE capability = 'originalBookPdf'
   AND (status = 'READY' OR retirement_origin IS NULL);

INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
SELECT NULL,
       'content_v3_r5_legacy_evidence_pinning',
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

ALTER TABLE public.lesson_capability_lifecycle
  VALIDATE CONSTRAINT lesson_capability_lifecycle_ready_evidence_chk;

COMMIT;

-- Rollback guidance: this file is a single transaction; a failure rolls the
-- whole thing back. Do not "undo" it by deleting lifecycle rows — a correction
-- is a forward migration that re-pins evidence.
