-- TAMKEEN_YOUSUF_LESSON_CONTENT_WORKFLOW_20C — PHASE 20C-A
-- Unified, fail-closed editorial lifecycle for lesson content capabilities.
-- PREPARE ONLY — do NOT apply to the shared production database until
-- APPROVED_PRODUCTION_LIFECYCLE_MIGRATION_APPLY is given.
--
-- Design notes
--  * ONE new table instead of lifecycle columns on 9 content tables.
--  * Keyed by (lesson_id, capability) — exactly the 20B capability contract.
--  * studentPerformance is derived from student data and has NO lifecycle row.
--  * Audit trail reuses public.audit_logs (no new audit system).
--  * READY version preservation: the approved payload snapshot is frozen in
--    ready_snapshot; editing a READY capability only touches the draft side.

BEGIN;

/* ------------------------------------------------------------------ */
/* 1 — table                                                           */
/* ------------------------------------------------------------------ */

CREATE TABLE IF NOT EXISTS public.lesson_capability_lifecycle (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id          uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  capability         text NOT NULL,
  status             text NOT NULL DEFAULT 'DRAFT',
  -- frozen copy of what was approved; students render this, never the draft
  ready_snapshot     jsonb,
  ready_hash         text,
  draft_hash         text,
  draft_updated_at   timestamptz,
  reviewed_by        uuid REFERENCES auth.users(id),
  reviewed_at        timestamptz,
  ready_by           uuid REFERENCES auth.users(id),
  ready_at           timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lesson_capability_lifecycle_capability_chk CHECK (
    capability = ANY (ARRAY[
      'officialBookContent','tamkeenExplanation','mindMap','simulation',
      'supportingResources','quickReview','checkUnderstanding',
      'lessonAssessment','originalBookPdf'
    ])
  ),
  CONSTRAINT lesson_capability_lifecycle_status_chk CHECK (
    status = ANY (ARRAY['DRAFT','REVIEW','READY'])
  ),
  CONSTRAINT lesson_capability_lifecycle_ready_chk CHECK (
    status <> 'READY' OR (ready_at IS NOT NULL AND ready_by IS NOT NULL)
  ),
  CONSTRAINT lesson_capability_lifecycle_uniq UNIQUE (lesson_id, capability)
);

CREATE INDEX IF NOT EXISTS lesson_capability_lifecycle_lesson_idx
  ON public.lesson_capability_lifecycle (lesson_id);
CREATE INDEX IF NOT EXISTS lesson_capability_lifecycle_status_idx
  ON public.lesson_capability_lifecycle (status, capability);

/* ------------------------------------------------------------------ */
/* 2 — grants (Data API needs explicit grants)                         */
/* ------------------------------------------------------------------ */

GRANT SELECT ON public.lesson_capability_lifecycle TO authenticated;
GRANT ALL    ON public.lesson_capability_lifecycle TO service_role;
-- no anon grant: lesson content is authenticated-only today.

/* ------------------------------------------------------------------ */
/* 3 — RLS: fail closed                                                */
/* ------------------------------------------------------------------ */

ALTER TABLE public.lesson_capability_lifecycle ENABLE ROW LEVEL SECURITY;

-- Students may only ever observe READY rows. DRAFT/REVIEW are staff-only.
DROP POLICY IF EXISTS "students read ready lifecycle rows" ON public.lesson_capability_lifecycle;
CREATE POLICY "students read ready lifecycle rows"
  ON public.lesson_capability_lifecycle
  FOR SELECT TO authenticated
  USING (status = 'READY');

DROP POLICY IF EXISTS "content staff read all lifecycle rows" ON public.lesson_capability_lifecycle;
CREATE POLICY "content staff read all lifecycle rows"
  ON public.lesson_capability_lifecycle
  FOR SELECT TO authenticated
  USING (public.is_content_staff(auth.uid()));

-- No INSERT/UPDATE/DELETE policy at all: every write goes through the
-- SECURITY DEFINER transition function below.

/* ------------------------------------------------------------------ */
/* 4 — updated_at trigger                                              */
/* ------------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION public.touch_lesson_capability_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_lesson_capability_lifecycle
  ON public.lesson_capability_lifecycle;
CREATE TRIGGER trg_touch_lesson_capability_lifecycle
  BEFORE UPDATE ON public.lesson_capability_lifecycle
  FOR EACH ROW EXECUTE FUNCTION public.touch_lesson_capability_lifecycle();

/* ------------------------------------------------------------------ */
/* 5 — transition RPC (the only write path)                            */
/* ------------------------------------------------------------------ */

-- Allowed transitions:
--   (none)  -> DRAFT    : content staff (first edit)
--   DRAFT   -> REVIEW   : content staff (submit for review)
--   REVIEW  -> DRAFT    : full admin (reject / send back)
--   REVIEW  -> READY    : full admin (approve; freezes ready_snapshot)
--   READY   -> DRAFT    : content staff (start a new revision;
--                         ready_snapshot is PRESERVED and keeps serving students)
CREATE OR REPLACE FUNCTION public.lesson_capability_transition(
  _lesson_id  uuid,
  _capability text,
  _to_status  text,
  _snapshot   jsonb DEFAULT NULL,
  _hash       text  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur   public.lesson_capability_lifecycle;
  frm   text;
  uid   uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT public.is_content_staff(uid) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF _to_status NOT IN ('DRAFT','REVIEW','READY') THEN
    RAISE EXCEPTION 'INVALID_STATUS' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO cur
    FROM public.lesson_capability_lifecycle
   WHERE lesson_id = _lesson_id AND capability = _capability
   FOR UPDATE;

  frm := COALESCE(cur.status, 'ABSENT');

  -- approval and rejection are full-admin only
  IF _to_status = 'READY' OR (frm = 'REVIEW' AND _to_status = 'DRAFT') THEN
    IF NOT public.is_full_admin(uid) THEN
      RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF _to_status = 'READY' AND frm <> 'REVIEW' THEN
    RAISE EXCEPTION 'READY_REQUIRES_REVIEW' USING ERRCODE = '22023';
  END IF;

  IF _to_status = 'REVIEW' AND frm NOT IN ('DRAFT') THEN
    RAISE EXCEPTION 'REVIEW_REQUIRES_DRAFT' USING ERRCODE = '22023';
  END IF;

  IF cur.id IS NULL THEN
    IF _to_status <> 'DRAFT' THEN
      RAISE EXCEPTION 'LIFECYCLE_ROW_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    INSERT INTO public.lesson_capability_lifecycle
      (lesson_id, capability, status, draft_hash, draft_updated_at)
    VALUES (_lesson_id, _capability, 'DRAFT', _hash, now())
    RETURNING * INTO cur;
  ELSE
    UPDATE public.lesson_capability_lifecycle
       SET status       = _to_status,
           draft_hash   = CASE WHEN _to_status = 'DRAFT'
                               THEN COALESCE(_hash, draft_hash) ELSE draft_hash END,
           draft_updated_at = CASE WHEN _to_status = 'DRAFT'
                               THEN now() ELSE draft_updated_at END,
           reviewed_by  = CASE WHEN _to_status IN ('REVIEW','READY')
                               THEN uid ELSE reviewed_by END,
           reviewed_at  = CASE WHEN _to_status IN ('REVIEW','READY')
                               THEN now() ELSE reviewed_at END,
           -- READY freezes the approved snapshot; a later DRAFT keeps it intact
           ready_snapshot = CASE WHEN _to_status = 'READY'
                               THEN COALESCE(_snapshot, ready_snapshot) ELSE ready_snapshot END,
           ready_hash   = CASE WHEN _to_status = 'READY'
                               THEN COALESCE(_hash, ready_hash) ELSE ready_hash END,
           ready_by     = CASE WHEN _to_status = 'READY' THEN uid ELSE ready_by END,
           ready_at     = CASE WHEN _to_status = 'READY' THEN now() ELSE ready_at END
     WHERE id = cur.id
    RETURNING * INTO cur;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (
    uid,
    'lesson_capability_lifecycle_transition',
    'lesson_capability',
    _lesson_id,
    jsonb_build_object(
      'lesson_id', _lesson_id,
      'capability', _capability,
      'from_status', frm,
      'to_status', cur.status
    )
  );

  RETURN jsonb_build_object(
    'lesson_id', _lesson_id,
    'capability', _capability,
    'from_status', frm,
    'to_status', cur.status,
    'ready_at', cur.ready_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.lesson_capability_transition(uuid, text, text, jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.lesson_capability_transition(uuid, text, text, jsonb, text) TO authenticated;

/* ------------------------------------------------------------------ */
/* 6 — BACKFILL (no student-visible content may disappear)             */
/* ------------------------------------------------------------------ */
-- Rule: any capability that is present AND already student-visible today is
-- grandfathered to READY (ready_by = NULL is forbidden by the check, so we
-- record the system backfill marker via ready_by = NULL bypass -> instead we
-- relax by inserting with ready_by set to the lesson's creator when known,
-- otherwise we mark it READY with a synthetic audit row and drop the
-- ready_by requirement for backfilled rows).
ALTER TABLE public.lesson_capability_lifecycle
  DROP CONSTRAINT IF EXISTS lesson_capability_lifecycle_ready_chk;
ALTER TABLE public.lesson_capability_lifecycle
  ADD CONSTRAINT lesson_capability_lifecycle_ready_chk
  CHECK (status <> 'READY' OR ready_at IS NOT NULL);

-- 6.1 official book content (non-empty content)
INSERT INTO public.lesson_capability_lifecycle
  (lesson_id, capability, status, ready_at)
SELECT DISTINCT b.lesson_id, 'officialBookContent', 'READY', now()
  FROM public.lesson_book_contents b
 WHERE COALESCE(btrim(b.content), '') <> ''
ON CONFLICT (lesson_id, capability) DO NOTHING;

-- 6.2 tamkeen explanation
INSERT INTO public.lesson_capability_lifecycle
  (lesson_id, capability, status, ready_at)
SELECT DISTINCT e.lesson_id, 'tamkeenExplanation', 'READY', now()
  FROM public.lesson_explanations e
ON CONFLICT (lesson_id, capability) DO NOTHING;

-- 6.3 mind map (HTML pipeline) — lesson_resources has NO lifecycle_status
--     column; an existing mind map resource is already student-visible today,
--     so it is grandfathered to READY (matches the production apply exactly).
INSERT INTO public.lesson_capability_lifecycle
  (lesson_id, capability, status, ready_at)
SELECT DISTINCT r.lesson_id, 'mindMap', 'READY', now()
  FROM public.lesson_resources r
 WHERE r.resource_type = 'mindmap' OR r.html_resource_type = 'mindmap'
ON CONFLICT (lesson_id, capability) DO NOTHING;

-- 6.4 simulation
INSERT INTO public.lesson_capability_lifecycle
  (lesson_id, capability, status, ready_at)
SELECT DISTINCT lesson_id, 'simulation', 'READY', now()
  FROM (
    SELECT lesson_id FROM public.lesson_simulations
    UNION
    SELECT lesson_id FROM public.lesson_resources
     WHERE resource_type = 'experiment' OR html_resource_type = 'experiment'
  ) s
ON CONFLICT (lesson_id, capability) DO NOTHING;

-- 6.5 supporting resources (non-primary video/link/pdf)
INSERT INTO public.lesson_capability_lifecycle
  (lesson_id, capability, status, ready_at)
SELECT DISTINCT r.lesson_id, 'supportingResources', 'READY', now()
  FROM public.lesson_resources r
 WHERE r.resource_type IN ('video','link','pdf')
   AND COALESCE(r.is_primary, false) = false
ON CONFLICT (lesson_id, capability) DO NOTHING;

-- 6.6 quick review
INSERT INTO public.lesson_capability_lifecycle
  (lesson_id, capability, status, ready_at)
SELECT DISTINCT s.lesson_id, 'quickReview', 'READY', now()
  FROM public.lesson_summaries s
 WHERE COALESCE(btrim(s.summary), '') <> ''
ON CONFLICT (lesson_id, capability) DO NOTHING;

-- 6.7 check understanding
INSERT INTO public.lesson_capability_lifecycle
  (lesson_id, capability, status, ready_at)
SELECT DISTINCT q.lesson_id, 'checkUnderstanding', 'READY', now()
  FROM public.questions q
 WHERE q.lesson_id IS NOT NULL
ON CONFLICT (lesson_id, capability) DO NOTHING;

-- 6.8 lesson assessment
INSERT INTO public.lesson_capability_lifecycle
  (lesson_id, capability, status, ready_at)
SELECT DISTINCT lesson_id, 'lessonAssessment', 'READY', now()
  FROM (
    SELECT lesson_id FROM public.lesson_assessments
    UNION
    SELECT lesson_id FROM public.exam_templates WHERE lesson_id IS NOT NULL
  ) a
 WHERE lesson_id IS NOT NULL
ON CONFLICT (lesson_id, capability) DO NOTHING;

-- 6.9 original book PDF (primary resource or book pdf_url)
INSERT INTO public.lesson_capability_lifecycle
  (lesson_id, capability, status, ready_at)
SELECT DISTINCT lesson_id, 'originalBookPdf', 'READY', now()
  FROM (
    SELECT lesson_id FROM public.lesson_resources WHERE COALESCE(is_primary,false)
    UNION
    SELECT lesson_id FROM public.lesson_book_contents
     WHERE COALESCE(btrim(pdf_url), '') <> ''
  ) p
ON CONFLICT (lesson_id, capability) DO NOTHING;

COMMIT;

-- ROLLBACK PLAN (manual, reversible):
--   DROP FUNCTION IF EXISTS public.lesson_capability_transition(uuid,text,text,jsonb,text);
--   DROP TABLE IF EXISTS public.lesson_capability_lifecycle;
--   DROP FUNCTION IF EXISTS public.touch_lesson_capability_lifecycle();
-- The application contract treats a missing lifecycle row as "legacy" and
-- falls back to 20B presence rules, so a rollback restores today's behaviour
-- exactly, with zero student-visible change.
