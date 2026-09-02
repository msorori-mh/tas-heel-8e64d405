-- Test-only mirror of the deployed CF10 hash contract.
-- Production receives this function from the CF10 domain-materialization migration;
-- this disposable database intentionally loads only the ministerial dependency slice.
CREATE OR REPLACE FUNCTION public.cf10_text_sha256(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT encode(digest(convert_to(coalesce(_value, ''), 'UTF8'), 'sha256'), 'hex');
$$;

REVOKE ALL ON FUNCTION public.cf10_text_sha256(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cf10_text_sha256(text) TO authenticated, service_role;

-- The shared QB fixture starts from a reduced legacy answer table. Production
-- already has these two original exam-engine columns, and ministerial 14E/this
-- feature update them while preserving the pinned revision fields.
ALTER TABLE public.exam_session_answers
  ADD COLUMN IF NOT EXISTS answered_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
