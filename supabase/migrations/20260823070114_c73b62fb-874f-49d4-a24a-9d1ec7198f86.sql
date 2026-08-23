-- 1) Repair mis-classified rows written by the CF11 publisher.
UPDATE public.lesson_resources
   SET html_resource_type = resource_type::text
 WHERE html_resource_type = 'INTERACTIVE'
   AND resource_type::text IN ('mindmap', 'experiment');

-- 2) Stop the publisher from writing the render mode into the classification column.
CREATE OR REPLACE FUNCTION public.cf11_normalize_html_resource_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.resource_type::text IN ('mindmap', 'experiment')
     AND (NEW.html_resource_type IS NULL
          OR NEW.html_resource_type NOT IN ('mindmap', 'experiment')) THEN
    NEW.html_resource_type := NEW.resource_type::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cf11_normalize_html_resource_type ON public.lesson_resources;
CREATE TRIGGER trg_cf11_normalize_html_resource_type
BEFORE INSERT OR UPDATE ON public.lesson_resources
FOR EACH ROW EXECUTE FUNCTION public.cf11_normalize_html_resource_type();

-- 3) The materialization probe must key off the authoritative resource type.
CREATE OR REPLACE FUNCTION public.cf10_html_publication_pending(_lesson_id uuid, _capability text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT NOT EXISTS (
    SELECT 1
      FROM public.lesson_resources r
      JOIN public.golden_lesson_publications p
        ON p.id = (r.metadata->>'cf11_publication_id')::uuid
       AND p.lesson_id = r.lesson_id
     WHERE r.lesson_id = _lesson_id
       AND coalesce(r.html_resource_type, r.resource_type::text)
             = CASE _capability WHEN 'mindMap' THEN 'mindmap'
                                WHEN 'simulation' THEN 'experiment' END
       AND r.url = public.cf10_inline_html_url(r.resource_code)
       AND r.metadata->>'cf11_body_sha256' = public.cf11_text_sha256(r.description)
       AND r.metadata->>'cf11_body_sha256' =
             (p.result->'html'->(CASE _capability WHEN 'mindMap' THEN 'mindMap'
                                                  ELSE 'simulation' END)->>'sha256')
  );
$$;

REVOKE ALL ON FUNCTION public.cf10_html_publication_pending(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cf10_html_publication_pending(uuid, text) TO authenticated, service_role;
