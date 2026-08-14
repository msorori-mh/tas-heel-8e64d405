-- =============================================================================
-- LESSON_EXTERNAL_PDF_DELIVERY_13F
-- Lesson delivery mode + primary external resource (Google Drive PDF, links).
--
-- Design constraints honoured here:
--   * NO duplicated URL column on public.lessons. lesson_resources.url stays the
--     single source of truth for every external file.
--   * import_execute_template() is NOT rewritten. The operator marks a resource
--     as primary through the existing template-06 metadata allowlist
--     (metadata.is_primary), and a boundary trigger projects that into the real
--     lesson_resources.is_primary column and derives lessons.delivery_mode.
--   * Existing lessons keep delivery_mode = 'in_app_content' (book content path
--     is untouched).
-- PENDING: not applied to the shared database.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. lessons.delivery_mode
-- -----------------------------------------------------------------------------
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'in_app_content';

ALTER TABLE public.lessons DROP CONSTRAINT IF EXISTS lessons_delivery_mode_chk;
ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_delivery_mode_chk
  CHECK (delivery_mode IN ('in_app_content', 'external_resource'));

COMMENT ON COLUMN public.lessons.delivery_mode IS
  'LESSON_EXTERNAL_PDF_DELIVERY_13F: in_app_content = normal LessonDetail; external_resource = the lesson is delivered by its primary lesson_resources row.';

-- -----------------------------------------------------------------------------
-- 2. lesson_resources.is_primary (at most one per lesson)
-- -----------------------------------------------------------------------------
ALTER TABLE public.lesson_resources
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS lesson_resources_one_primary_per_lesson
  ON public.lesson_resources (lesson_id)
  WHERE is_primary;

COMMENT ON COLUMN public.lesson_resources.is_primary IS
  'LESSON_EXTERNAL_PDF_DELIVERY_13F: the single resource opened when the lesson delivery mode is external_resource.';

-- -----------------------------------------------------------------------------
-- 3. GAP-05 allowlist gains is_primary (template 06, minimal operator change)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_lesson_resource_metadata()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  allowed text[] := ARRAY[
    'resource_format','local_asset_path','thumbnail_url',
    'is_interactive','attribution','license_note','notes','is_primary'
  ];
  k text;
BEGIN
  IF NEW.metadata IS NULL THEN
    NEW.metadata := '{}'::jsonb;
  END IF;
  IF jsonb_typeof(NEW.metadata) <> 'object' THEN
    RAISE EXCEPTION 'lesson_resources.metadata must be a JSON object' USING ERRCODE = '23514';
  END IF;
  FOR k IN SELECT jsonb_object_keys(NEW.metadata) LOOP
    IF NOT (k = ANY (allowed)) THEN
      RAISE EXCEPTION 'unsupported lesson_resources.metadata key: %', k USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. metadata.is_primary -> column projection (import boundary)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lesson_resource_project_primary_flag()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  raw text;
BEGIN
  raw := lower(btrim(COALESCE(NEW.metadata->>'is_primary', '')));
  IF raw <> '' THEN
    NEW.is_primary := raw IN ('true', 't', '1', 'yes', 'y', 'نعم');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lesson_resource_project_primary_flag ON public.lesson_resources;
CREATE TRIGGER trg_lesson_resource_project_primary_flag
  BEFORE INSERT OR UPDATE OF metadata ON public.lesson_resources
  FOR EACH ROW EXECUTE FUNCTION public.lesson_resource_project_primary_flag();

-- -----------------------------------------------------------------------------
-- 5. Derive lessons.delivery_mode from the presence of a primary resource
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_lesson_delivery_mode()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  affected uuid;
BEGIN
  affected := COALESCE(NEW.lesson_id, OLD.lesson_id);

  -- Only one primary may survive per lesson.
  IF TG_OP <> 'DELETE' AND NEW.is_primary THEN
    UPDATE public.lesson_resources
       SET is_primary = false
     WHERE lesson_id = affected
       AND id <> NEW.id
       AND is_primary;
  END IF;

  UPDATE public.lessons l
     SET delivery_mode = CASE
           WHEN EXISTS (
             SELECT 1 FROM public.lesson_resources r
             WHERE r.lesson_id = affected AND r.is_primary
           ) THEN 'external_resource'
           ELSE 'in_app_content'
         END,
         updated_at = now()
   WHERE l.id = affected
     AND l.delivery_mode IS DISTINCT FROM CASE
           WHEN EXISTS (
             SELECT 1 FROM public.lesson_resources r
             WHERE r.lesson_id = affected AND r.is_primary
           ) THEN 'external_resource'
           ELSE 'in_app_content'
         END;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lesson_delivery_mode ON public.lesson_resources;
CREATE TRIGGER trg_sync_lesson_delivery_mode
  AFTER INSERT OR DELETE OR UPDATE OF is_primary, lesson_id ON public.lesson_resources
  FOR EACH ROW EXECUTE FUNCTION public.sync_lesson_delivery_mode();

-- -----------------------------------------------------------------------------
-- 6. Admin RPC — set/clear the primary resource of a lesson
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_primary_lesson_resource(
  _lesson_id uuid,
  _resource_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mode text;
BEGIN
  IF NOT public.is_content_staff(auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.lessons WHERE id = _lesson_id) THEN
    RAISE EXCEPTION 'LESSON_NOT_FOUND' USING ERRCODE = '23503';
  END IF;

  UPDATE public.lesson_resources
     SET is_primary = false
   WHERE lesson_id = _lesson_id
     AND is_primary
     AND (_resource_id IS NULL OR id <> _resource_id);

  IF _resource_id IS NOT NULL THEN
    UPDATE public.lesson_resources
       SET is_primary = true
     WHERE id = _resource_id
       AND lesson_id = _lesson_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'RESOURCE_NOT_IN_LESSON' USING ERRCODE = '23503';
    END IF;
  END IF;

  SELECT delivery_mode INTO v_mode FROM public.lessons WHERE id = _lesson_id;

  RETURN jsonb_build_object(
    'lesson_id', _lesson_id,
    'primary_resource_id', _resource_id,
    'delivery_mode', v_mode
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_primary_lesson_resource(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_primary_lesson_resource(uuid, uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. Student read path — safe primary-resource lookup (no answer/PII exposure)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_lesson_primary_resource(_lesson_id uuid)
RETURNS TABLE (
  lesson_id uuid,
  delivery_mode text,
  resource_id uuid,
  resource_type text,
  title text,
  url text,
  description text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    l.id,
    l.delivery_mode,
    r.id,
    r.resource_type::text,
    r.title,
    r.url,
    r.description
  FROM public.lessons l
  LEFT JOIN public.lesson_resources r
         ON r.lesson_id = l.id AND r.is_primary
  WHERE l.id = _lesson_id
    AND public.can_access_lesson(l.id)
$$;

REVOKE EXECUTE ON FUNCTION public.get_lesson_primary_resource(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_lesson_primary_resource(uuid) TO authenticated, service_role;