-- 13L — student textbook discovery must follow the student's governorate track.
--
-- The administrative textbook manager intentionally keeps read-all access.
-- Student discovery uses a dedicated SECURITY DEFINER function whose contract
-- cannot be widened by an additional staff role on the same account.

DO $$
DECLARE
  v_aden uuid;
  v_sanaa uuid;
  v_taiz_city uuid;
  v_taiz_hawban uuid;
  v_mukalla uuid;
  v_seiyun uuid;
  v_taiz_sort integer;
  v_hadramout_sort integer;
BEGIN
  SELECT id INTO v_aden
  FROM public.curriculum_tracks
  WHERE track_code = 'aden' AND is_active IS TRUE;

  SELECT id INTO v_sanaa
  FROM public.curriculum_tracks
  WHERE track_code = 'sanaa' AND is_active IS TRUE;

  IF v_aden IS NULL OR v_sanaa IS NULL THEN
    RAISE EXCEPTION '13L requires active sanaa and aden curriculum tracks';
  END IF;

  -- Taiz is operationally split. Preserve existing students according to the
  -- track already stored on their profile before tightening each area to one
  -- official track.
  SELECT id, sort_order INTO v_taiz_city, v_taiz_sort
  FROM public.governorates
  WHERE name IN ('تعز المدينة', 'تعز')
  ORDER BY CASE WHEN name = 'تعز المدينة' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_taiz_city IS NULL THEN
    INSERT INTO public.governorates (name, default_curriculum_track_id, sort_order)
    VALUES ('تعز المدينة', v_aden, 60)
    RETURNING id, sort_order INTO v_taiz_city, v_taiz_sort;
  ELSE
    UPDATE public.governorates
    SET name = 'تعز المدينة', default_curriculum_track_id = v_aden
    WHERE id = v_taiz_city;
  END IF;

  INSERT INTO public.governorates (name, default_curriculum_track_id, sort_order)
  VALUES ('تعز الحوبان', v_sanaa, COALESCE(v_taiz_sort, 60) + 1)
  ON CONFLICT (name) DO UPDATE
  SET default_curriculum_track_id = EXCLUDED.default_curriculum_track_id
  RETURNING id INTO v_taiz_hawban;

  INSERT INTO public.governorate_curriculum_map (governorate_id, curriculum_track_id)
  VALUES (v_taiz_hawban, v_sanaa)
  ON CONFLICT (governorate_id, curriculum_track_id) DO NOTHING;

  UPDATE public.profiles
  SET governorate_id = v_taiz_hawban,
      governorate = 'تعز الحوبان',
      updated_at = now()
  WHERE governorate_id = v_taiz_city
    AND curriculum_track_id = v_sanaa;

  UPDATE public.profiles
  SET governorate = 'تعز المدينة',
      updated_at = now()
  WHERE governorate_id = v_taiz_city
    AND governorate IS DISTINCT FROM 'تعز المدينة';

  DELETE FROM public.governorate_curriculum_map
  WHERE governorate_id = v_taiz_city
    AND curriculum_track_id <> v_aden;

  INSERT INTO public.governorate_curriculum_map (governorate_id, curriculum_track_id)
  VALUES (v_taiz_city, v_aden)
  ON CONFLICT (governorate_id, curriculum_track_id) DO NOTHING;

  DELETE FROM public.governorate_curriculum_map
  WHERE governorate_id = v_taiz_hawban
    AND curriculum_track_id <> v_sanaa;

  -- Keep the broad Hadramout choice for existing profiles, and add the two
  -- explicit operational choices requested by the product (Mukalla/Seiyun).
  SELECT sort_order INTO v_hadramout_sort
  FROM public.governorates
  WHERE name = 'حضرموت'
  LIMIT 1;

  INSERT INTO public.governorates (name, default_curriculum_track_id, sort_order)
  VALUES ('المكلا', v_aden, COALESCE(v_hadramout_sort, 130) + 1)
  ON CONFLICT (name) DO UPDATE
  SET default_curriculum_track_id = EXCLUDED.default_curriculum_track_id
  RETURNING id INTO v_mukalla;

  INSERT INTO public.governorates (name, default_curriculum_track_id, sort_order)
  VALUES ('سيئون', v_aden, COALESCE(v_hadramout_sort, 130) + 2)
  ON CONFLICT (name) DO UPDATE
  SET default_curriculum_track_id = EXCLUDED.default_curriculum_track_id
  RETURNING id INTO v_seiyun;

  INSERT INTO public.governorate_curriculum_map (governorate_id, curriculum_track_id)
  VALUES (v_mukalla, v_aden), (v_seiyun, v_aden)
  ON CONFLICT (governorate_id, curriculum_track_id) DO NOTHING;

  DELETE FROM public.governorate_curriculum_map
  WHERE governorate_id IN (v_mukalla, v_seiyun)
    AND curriculum_track_id <> v_aden;
END
$$;

CREATE OR REPLACE FUNCTION public.list_student_subject_textbooks(
  _subject_id uuid,
  _semester integer DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  subject_id uuid,
  book_type text,
  coverage_type text,
  semester smallint,
  title text,
  file_name text,
  file_size bigint,
  version text,
  sort_order integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    st.id,
    st.subject_id,
    st.book_type,
    st.coverage_type,
    st.semester,
    st.title,
    st.file_name,
    st.file_size,
    st.version,
    st.sort_order
  FROM public.subject_textbooks AS st
  JOIN public.subjects AS s
    ON s.id = st.subject_id
  JOIN public.profiles AS p
    ON p.user_id = auth.uid()
  WHERE auth.uid() IS NOT NULL
    AND st.subject_id = _subject_id
    AND st.is_active IS TRUE
    AND p.curriculum_track_id IS NOT NULL
    AND (p.grade_uuid = s.grade_id OR p.grade_id = s.grade_id::text)
    AND EXISTS (
      SELECT 1
      FROM public.subject_curriculum_tracks AS sct
      WHERE sct.subject_id = s.id
        AND sct.curriculum_track_id = p.curriculum_track_id
        AND sct.is_active IS TRUE
    )
    AND (
      st.curriculum_track_id IS NULL
      OR st.curriculum_track_id = p.curriculum_track_id
    )
    AND (
      _semester IS NULL
      OR st.coverage_type = 'FULL_ACADEMIC_YEAR'
      OR (
        st.coverage_type = 'SEMESTER_SPECIFIC'
        AND st.semester = _semester
      )
    )
  ORDER BY
    CASE st.book_type
      WHEN 'MAIN_TEXTBOOK' THEN 0
      WHEN 'EXERCISE_BOOK' THEN 1
      ELSE 2
    END,
    st.sort_order,
    st.created_at;
$$;

REVOKE ALL ON FUNCTION public.list_student_subject_textbooks(uuid, integer)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_student_subject_textbooks(uuid, integer)
TO authenticated;

COMMENT ON FUNCTION public.list_student_subject_textbooks(uuid, integer) IS
'13L fail-closed student textbook discovery: grade + subject binding + exact profile curriculum track; NULL textbook track means shared across official tracks.';
