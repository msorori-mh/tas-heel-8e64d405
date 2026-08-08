-- ============================================================================
-- Migration: Content HTML Resource Contract Alignment
-- Created At: 2026-08-08
-- Scoped Objective: Close the Admin Import → Database → Student contract for
--                   interactive HTML resources without mutating prior migrations.
-- Rules: Additive only; preserve enum/legacy resource_type; canonical subtype
--        lives in html_resource_type; resource_code is stable within lesson.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Canonical columns for HTML resource identity
-- ----------------------------------------------------------------------------
ALTER TABLE public.lesson_resources
  ADD COLUMN IF NOT EXISTS resource_code TEXT,
  ADD COLUMN IF NOT EXISTS html_resource_type TEXT;

-- ----------------------------------------------------------------------------
-- 2. Constraints: legal subtype values and consistency with broad resource_type
-- ----------------------------------------------------------------------------
ALTER TABLE public.lesson_resources
  DROP CONSTRAINT IF EXISTS lesson_resources_html_resource_type_check,
  ADD CONSTRAINT lesson_resources_html_resource_type_check
    CHECK (
      html_resource_type IS NULL
      OR html_resource_type IN ('mind_map_html', 'practical_experiment_html', 'summary_html')
    );

ALTER TABLE public.lesson_resources
  DROP CONSTRAINT IF EXISTS lesson_resources_html_resource_type_consistency_check,
  ADD CONSTRAINT lesson_resources_html_resource_type_consistency_check
    CHECK (
      html_resource_type IS NULL
      OR resource_type = 'html'
    );

-- ----------------------------------------------------------------------------
-- 3. Resource code normalization guard and partial uniqueness within lesson
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_resource_code(p_code text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT NULLIF(trim(p_code), '');
$$;

DROP INDEX IF EXISTS idx_lesson_resources_code_per_lesson;
CREATE UNIQUE INDEX idx_lesson_resources_code_per_lesson
  ON public.lesson_resources (lesson_id, resource_code)
  WHERE resource_code IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. Update student binding helpers to expose canonical subtype
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_student_resource_binding(p_resource_id uuid)
RETURNS TABLE (
  resource_id uuid,
  lesson_id uuid,
  version_id uuid,
  resource_type text,
  title text,
  published_version_number integer
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_res record; v_ver record;
BEGIN
  IF NOT public.is_content_feature_enabled('html_content_student_read') THEN
    RAISE EXCEPTION 'Feature html_content_student_read is disabled' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_res FROM public.lesson_resources WHERE id = p_resource_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resource % not found', p_resource_id USING ERRCODE = 'P0002';
  END IF;

  IF v_res.lifecycle_status <> 'published' OR v_res.published_version_id IS NULL THEN
    RAISE EXCEPTION 'Resource % is not published', p_resource_id USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_access_lesson(v_res.lesson_id) THEN
    RAISE EXCEPTION 'Student cannot access lesson %', v_res.lesson_id USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_ver FROM public.lesson_resource_versions WHERE id = v_res.published_version_id;

  RETURN QUERY SELECT
    v_res.id,
    v_res.lesson_id,
    v_ver.id,
    COALESCE(v_res.html_resource_type, v_res.resource_type::text),
    v_res.title,
    v_ver.version_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.fetch_published_lesson_resources(p_lesson_id uuid)
RETURNS TABLE (
  resource_id uuid,
  version_id uuid,
  resource_type text,
  title text,
  sort_order integer
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_content_feature_enabled('html_content_student_read') THEN
    RAISE EXCEPTION 'Feature html_content_student_read is disabled' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_access_lesson(p_lesson_id) THEN
    RAISE EXCEPTION 'Lesson access denied for lesson %', p_lesson_id USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    lr.id AS resource_id,
    lr.published_version_id AS version_id,
    COALESCE(lr.html_resource_type, lr.resource_type::text) AS resource_type,
    lr.title AS title,
    lr.sort_order AS sort_order
  FROM public.lesson_resources lr
  WHERE lr.lesson_id = p_lesson_id
    AND lr.lifecycle_status = 'published'
    AND lr.published_version_id IS NOT NULL
  ORDER BY lr.sort_order;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Helper for student HTML resource enumeration using real columns
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_published_html_resources_for_lesson(p_lesson_id uuid)
RETURNS TABLE (
  resource_id uuid,
  resource_code text,
  resource_type text,
  title text,
  version_id uuid,
  version_number integer,
  sort_order integer
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_content_feature_enabled('html_content_student_read') THEN
    RAISE EXCEPTION 'Feature html_content_student_read is disabled' USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_access_lesson(p_lesson_id) THEN
    RAISE EXCEPTION 'Lesson access denied for lesson %', p_lesson_id USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    lr.id AS resource_id,
    lr.resource_code AS resource_code,
    lr.html_resource_type AS resource_type,
    lr.title AS title,
    lr.published_version_id AS version_id,
    lrv.version_number AS version_number,
    lr.sort_order AS sort_order
  FROM public.lesson_resources lr
  JOIN public.lesson_resource_versions lrv
    ON lrv.id = lr.published_version_id AND lrv.resource_id = lr.id
  WHERE lr.lesson_id = p_lesson_id
    AND lr.resource_type = 'html'
    AND lr.html_resource_type IN ('mind_map_html', 'practical_experiment_html', 'summary_html')
    AND lr.lifecycle_status = 'published'
    AND lr.published_version_id IS NOT NULL
  ORDER BY lr.sort_order;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Grants and revokes
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.resolve_student_resource_binding(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fetch_published_lesson_resources(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_published_html_resources_for_lesson(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.resolve_student_resource_binding(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fetch_published_lesson_resources(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_published_html_resources_for_lesson(uuid) TO authenticated, service_role;
