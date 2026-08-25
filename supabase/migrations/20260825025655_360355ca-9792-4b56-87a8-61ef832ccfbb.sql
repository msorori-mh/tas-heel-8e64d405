ALTER TABLE public.golden_lesson_ready_attestations
  DROP CONSTRAINT IF EXISTS golden_lesson_ready_attestations_separation_chk;

CREATE OR REPLACE FUNCTION public.cf11_guard_ready_attestation_separation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
BEGIN
  -- fail-closed: identity must be complete
  IF NEW.attested_by IS NULL OR NEW.published_by IS NULL THEN
    RAISE EXCEPTION 'CF11_ATTESTATION_IDENTITY_INVALID';
  END IF;

  IF NEW.attested_by <> NEW.published_by THEN
    RETURN NEW;
  END IF;

  BEGIN
    is_admin := public.golden_lesson_has_role(NEW.attested_by, 'admin');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'CF11_ATTESTATION_ROLE_CHECK_FAILED';
  END;

  IF is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'CF11_ATTESTATION_SEPARATION_REQUIRED';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cf11_guard_ready_attestation_separation_trg
  ON public.golden_lesson_ready_attestations;

CREATE TRIGGER cf11_guard_ready_attestation_separation_trg
  BEFORE INSERT OR UPDATE ON public.golden_lesson_ready_attestations
  FOR EACH ROW EXECUTE FUNCTION public.cf11_guard_ready_attestation_separation();