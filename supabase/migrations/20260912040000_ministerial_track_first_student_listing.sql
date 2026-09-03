-- Student ministerial listing: choose Sanaa or Aden first, then list that track only.
-- Read-only RPC. It changes no content and keeps every existing grade/publish/RLS gate.

BEGIN;

CREATE OR REPLACE FUNCTION public.list_ministerial_track_models(_track_code text)
RETURNS TABLE(
  model_id uuid,
  model_code text,
  model_label text,
  academic_year integer,
  round_code text,
  variant_code text,
  question_count integer,
  duration_seconds integer,
  last_session_id uuid,
  last_session_status text,
  track_code text,
  track_name text,
  subject_id uuid,
  subject_name text,
  subject_code text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT m.id,
         m.model_code,
         m.model_label,
         m.academic_year,
         m.round_code::text,
         m.variant_code,
         (SELECT COUNT(*)::integer
            FROM public.ministerial_exam_questions q
           WHERE q.model_id = m.id),
         t.duration_seconds,
         ls.id,
         ls.status::text,
         ct.track_code,
         ct.track_name,
         s.id,
         s.name,
         s.code
  FROM public.ministerial_exam_models m
  JOIN public.curriculum_tracks ct ON ct.id = m.curriculum_track_id
  JOIN public.subjects s ON s.id = m.subject_id
  LEFT JOIN public.exam_templates t ON t.id = m.template_id
  LEFT JOIN LATERAL (
    SELECT es.id, es.status
    FROM public.exam_sessions es
    WHERE es.ministerial_model_id = m.id
      AND es.user_id = auth.uid()
    ORDER BY es.created_at DESC
    LIMIT 1
  ) ls ON true
  WHERE auth.uid() IS NOT NULL
    AND _track_code IN ('sanaa', 'aden')
    AND ct.track_code = _track_code
    AND m.status = 'published'
    AND public.can_access_ministerial_model(m.id)
  ORDER BY m.academic_year DESC, s.name, m.round_code, m.variant_code;
$$;

REVOKE ALL ON FUNCTION public.list_ministerial_track_models(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_ministerial_track_models(text) TO authenticated;

COMMENT ON FUNCTION public.list_ministerial_track_models(text) IS
  'Lists published Grade-12 ministerial models for one explicit Sanaa/Aden choice; never mixes tracks.';

COMMIT;
