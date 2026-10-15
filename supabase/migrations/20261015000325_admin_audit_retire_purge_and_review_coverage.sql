-- Retire pre-launch destructive endpoints now that real student records exist.
-- No curriculum, learning history, payment, or user rows are deleted.
BEGIN;

UPDATE public.curriculum_prelaunch_purge_control
SET enabled = false,
    locked_at = coalesce(locked_at, now()),
    lock_reason = 'Retired after launch: admin audit 2026-10-15',
    updated_at = now()
WHERE singleton = true;

CREATE OR REPLACE FUNCTION public.admin_curriculum_prelaunch_purge(
  _confirmation text, _reason text, _expected_preview_sha256 text, _idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'PRELAUNCH_PURGE_RETIRED' USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_curriculum_force_delete(
  _entity_type text, _entity_id uuid, _reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'PRELAUNCH_FORCE_DELETE_RETIRED' USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.admin_curriculum_prelaunch_purge(text,text,text,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_curriculum_force_delete(text,uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;

-- One lightweight facts response instead of downloading every summary body.
-- SECURITY INVOKER preserves all underlying table RLS and privileges.
CREATE OR REPLACE FUNCTION public.admin_review_coverage_facts()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'FORBIDDEN_ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'lessonId', l.id, 'lessonTitle', l.title,
    'subjectId', s.id, 'subjectName', s.name,
    'gradeId', g.id, 'gradeName', g.name,
    'trackIds', coalesce(tracks.ids, '[]'::jsonb),
    'trackNames', coalesce(tracks.names, '[]'::jsonb),
    'unitId', l.unit_id, 'unitTitle', u.title,
    'deliveryMode', l.delivery_mode,
    -- Match JavaScript String.trim(), including whitespace-only summaries.
    'hasSummary', EXISTS (
      SELECT 1 FROM public.lesson_summaries ls
      WHERE ls.lesson_id = l.id AND length(btrim(coalesce(ls.summary, ''),
        U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) > 0
    )
  ) ORDER BY s.id, l.sort_order, l.title, l.id), '[]'::jsonb)
  INTO result
  FROM public.lessons l
  JOIN public.subjects s ON s.id = l.subject_id
  LEFT JOIN public.grades g ON g.id = s.grade_id
  LEFT JOIN public.units u ON u.id = l.unit_id
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(t.id ORDER BY t.id) AS ids,
           jsonb_agg(t.track_name ORDER BY t.id) AS names
    FROM public.subject_curriculum_tracks st
    JOIN public.curriculum_tracks t ON t.id = st.curriculum_track_id
    WHERE st.subject_id = s.id AND st.is_active
  ) tracks ON true;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_coverage_facts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_coverage_facts() TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
