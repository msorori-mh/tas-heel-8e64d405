-- =====================================================================
-- SHARED_CURRICULUM_SUBJECT_MAPPING_13C.1
-- One subject -> one or many curriculum tracks.
-- No curriculum data inserts. Fail-closed access.
-- =====================================================================

-- 1) TABLE ------------------------------------------------------------
CREATE TABLE public.subject_curriculum_tracks (
  subject_id          uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  curriculum_track_id uuid NOT NULL REFERENCES public.curriculum_tracks(id) ON DELETE RESTRICT,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamp with time zone NOT NULL DEFAULT now(),
  updated_at          timestamp with time zone NOT NULL DEFAULT now(),
  created_by          uuid,
  PRIMARY KEY (subject_id, curriculum_track_id)
);

COMMENT ON TABLE public.subject_curriculum_tracks IS
  'SHARED_CURRICULUM_SUBJECT_MAPPING_13C: availability of a subject in a curriculum track. Identity (subjects.code) != availability (this table).';

CREATE INDEX subject_curriculum_tracks_track_idx
  ON public.subject_curriculum_tracks (curriculum_track_id, subject_id)
  WHERE is_active;

-- 2) GRANTS -----------------------------------------------------------
GRANT SELECT ON public.subject_curriculum_tracks TO authenticated;
GRANT INSERT, UPDATE ON public.subject_curriculum_tracks TO authenticated;
GRANT ALL ON public.subject_curriculum_tracks TO service_role;

-- 3) RLS --------------------------------------------------------------
ALTER TABLE public.subject_curriculum_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Track assignments readable by authenticated"
  ON public.subject_curriculum_tracks
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Content staff insert track assignments"
  ON public.subject_curriculum_tracks
  FOR INSERT TO authenticated
  WITH CHECK (public.is_content_staff(auth.uid()));

CREATE POLICY "Content staff update track assignments"
  ON public.subject_curriculum_tracks
  FOR UPDATE TO authenticated
  USING (public.is_content_staff(auth.uid()))
  WITH CHECK (public.is_content_staff(auth.uid()));

-- NOTE: no DELETE policy on purpose. Detaching is an explicit, guarded
-- admin RPC operation only (13C rule 2/3).

-- 4) VALIDATION TRIGGERS ---------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_subject_track_assignment_valid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_active boolean;
BEGIN
  SELECT is_active INTO v_active
  FROM public.curriculum_tracks
  WHERE id = NEW.curriculum_track_id;

  IF v_active IS NULL THEN
    RAISE EXCEPTION 'CURRICULUM_TRACK_NOT_FOUND' USING ERRCODE = '23503';
  END IF;

  IF NEW.is_active AND NOT v_active THEN
    RAISE EXCEPTION 'CURRICULUM_TRACK_INACTIVE: cannot activate an assignment to an inactive track'
      USING ERRCODE = '22023';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_subject_track_assignment_valid
  BEFORE INSERT OR UPDATE ON public.subject_curriculum_tracks
  FOR EACH ROW EXECUTE FUNCTION public.assert_subject_track_assignment_valid();

-- Usage guard: shared by hard delete and by deactivation.
CREATE OR REPLACE FUNCTION public.subject_track_detach_impact(
  _subject_id uuid,
  _curriculum_track_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'subject_id', _subject_id,
    'curriculum_track_id', _curriculum_track_id,
    'students_on_track', (
      SELECT count(*) FROM public.profiles p
      JOIN public.subjects s ON s.id = _subject_id
      WHERE p.curriculum_track_id = _curriculum_track_id
        AND (p.grade_uuid = s.grade_id OR p.grade_id = s.grade_id::text)
    ),
    'progress_rows', (
      SELECT count(*) FROM public.user_progress up
      JOIN public.lessons l ON l.id = up.lesson_id
      JOIN public.profiles p ON p.user_id = up.user_id
      WHERE l.subject_id = _subject_id
        AND p.curriculum_track_id = _curriculum_track_id
    ),
    'exam_sessions', (
      SELECT count(*) FROM public.exam_sessions es
      JOIN public.exam_templates et ON et.id = es.template_id
      JOIN public.profiles p ON p.user_id = es.user_id
      WHERE et.subject_id = _subject_id
        AND p.curriculum_track_id = _curriculum_track_id
    ),
    'is_published', COALESCE((
      SELECT crs.publication_status = 'published'
      FROM public.content_review_state crs
      WHERE crs.entity_type = 'subject' AND crs.entity_id = _subject_id
      LIMIT 1
    ), false),
    'remaining_active_assignments', (
      SELECT count(*) FROM public.subject_curriculum_tracks sct
      WHERE sct.subject_id = _subject_id
        AND sct.is_active
        AND sct.curriculum_track_id <> _curriculum_track_id
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.guard_subject_track_detach()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_impact jsonb;
BEGIN
  IF TG_OP = 'UPDATE' AND NOT (OLD.is_active AND NOT NEW.is_active) THEN
    RETURN NEW;
  END IF;

  -- Cascading subject delete is allowed (the subject itself is being removed).
  IF TG_OP = 'DELETE'
     AND NOT EXISTS (SELECT 1 FROM public.subjects WHERE id = OLD.subject_id) THEN
    RETURN OLD;
  END IF;

  IF coalesce(current_setting('app.subject_track_detach', true), '') <> 'allow' THEN
    RAISE EXCEPTION 'SUBJECT_TRACK_DETACH_REQUIRES_RPC: use admin_subject_track_detach()'
      USING ERRCODE = '42501';
  END IF;

  v_impact := public.subject_track_detach_impact(OLD.subject_id, OLD.curriculum_track_id);

  IF (v_impact->>'is_published')::boolean
     OR (v_impact->>'students_on_track')::bigint > 0
     OR (v_impact->>'progress_rows')::bigint > 0
     OR (v_impact->>'exam_sessions')::bigint > 0 THEN
    RAISE EXCEPTION 'SUBJECT_TRACK_DETACH_PROTECTED: % ', v_impact USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_subject_track_detach
  BEFORE DELETE OR UPDATE ON public.subject_curriculum_tracks
  FOR EACH ROW EXECUTE FUNCTION public.guard_subject_track_detach();

-- 5) ADMIN RPCs -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_subject_track_detach_preview(
  _subject_id uuid,
  _curriculum_track_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_impact jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_full_admin(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  v_impact := public.subject_track_detach_impact(_subject_id, _curriculum_track_id);

  RETURN v_impact || jsonb_build_object(
    'allowed',
    NOT (
      (v_impact->>'is_published')::boolean
      OR (v_impact->>'students_on_track')::bigint > 0
      OR (v_impact->>'progress_rows')::bigint > 0
      OR (v_impact->>'exam_sessions')::bigint > 0
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_subject_track_detach(
  _subject_id uuid,
  _curriculum_track_id uuid,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_impact jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_full_admin(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  v_impact := public.subject_track_detach_impact(_subject_id, _curriculum_track_id);

  PERFORM set_config('app.subject_track_detach', 'allow', true);
  DELETE FROM public.subject_curriculum_tracks
   WHERE subject_id = _subject_id
     AND curriculum_track_id = _curriculum_track_id;
  PERFORM set_config('app.subject_track_detach', '', true);

  INSERT INTO public.audit_logs (action, actor_id, target_type, target_id, metadata)
  VALUES ('subject_track_detach', auth.uid(), 'subject', _subject_id,
          jsonb_build_object('curriculum_track_id', _curriculum_track_id,
                             'reason', _reason,
                             'impact', v_impact));

  RETURN jsonb_build_object('status', 'success', 'impact', v_impact);
END;
$$;

REVOKE ALL ON FUNCTION public.subject_track_detach_impact(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_subject_track_assignment_valid() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_subject_track_detach() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_subject_track_detach_preview(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_subject_track_detach(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_subject_track_detach_preview(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_subject_track_detach(uuid, uuid, text) TO authenticated;

-- 6) ACCESS PATH: subjects now resolve availability from the mapping ---
CREATE OR REPLACE FUNCTION public.can_access_subject(_subject_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1
        FROM public.subjects s
        JOIN public.profiles p ON p.user_id = auth.uid()
        JOIN public.subject_curriculum_tracks sct
          ON sct.subject_id = s.id
         AND sct.is_active
         AND sct.curriculum_track_id = p.curriculum_track_id
        WHERE s.id = _subject_id
          AND (
            p.grade_uuid = s.grade_id
            OR p.grade_id = s.grade_id::text
          )
      )
    )
$$;

DROP POLICY IF EXISTS "Subjects viewable per curriculum" ON public.subjects;
CREATE POLICY "Subjects viewable per track assignment"
  ON public.subjects
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_content_staff(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.subject_curriculum_tracks sct
      JOIN public.profiles p ON p.user_id = auth.uid()
      WHERE sct.subject_id = subjects.id
        AND sct.is_active
        AND sct.curriculum_track_id = p.curriculum_track_id
    )
  );

COMMENT ON COLUMN public.subjects.curriculum_track_id IS
  'DEPRECATED (13C): availability now lives in subject_curriculum_tracks. Not used by any access path.';

-- 7) PUBLISH GATE: no publish without an active track assignment -------
CREATE OR REPLACE FUNCTION public.content_review_set_state(
  _entity_type text,
  _entity_id uuid,
  _review_status text,
  _publication_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  st public.content_review_state;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_full_admin(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF _review_status NOT IN ('pending','approved','rejected') THEN
    RAISE EXCEPTION 'INVALID_REVIEW_STATUS' USING ERRCODE = '22023';
  END IF;

  IF _publication_status NOT IN ('draft','published','archived') THEN
    RAISE EXCEPTION 'INVALID_PUBLICATION_STATUS' USING ERRCODE = '22023';
  END IF;

  IF _publication_status = 'published' AND _review_status <> 'approved' THEN
    RAISE EXCEPTION 'PUBLISH_REQUIRES_APPROVAL' USING ERRCODE = '22023';
  END IF;

  -- 13C: a subject without an active curriculum-track assignment is
  -- unreachable for every student, so it must not be publishable.
  IF _publication_status = 'published' AND _entity_type = 'subject' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.subject_curriculum_tracks sct
      WHERE sct.subject_id = _entity_id AND sct.is_active
    ) THEN
      RAISE EXCEPTION 'NO_TRACK_ASSIGNMENT: subject cannot be published without an active curriculum track'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT * INTO st FROM public.content_review_state
  WHERE entity_type = _entity_type AND entity_id = _entity_id
  FOR UPDATE;

  IF st.id IS NULL THEN
    RAISE EXCEPTION 'REVIEW_STATE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.content_review_state
     SET review_status = _review_status,
         publication_status = _publication_status,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         updated_at = now()
   WHERE id = st.id;

  RETURN jsonb_build_object(
    'entity_type', _entity_type,
    'entity_id', _entity_id,
    'review_status', _review_status,
    'publication_status', _publication_status
  );
END;
$$;
