-- Preserve verified intake evidence while removing superseded attempts from the
-- active workflow. A successful publication archives only older, unpublished
-- attempts for the same lesson and capability; newer verified replacements stay active.

BEGIN;

ALTER TABLE public.lesson_component_intakes_v2
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.lesson_component_intakes_v2
  DROP CONSTRAINT IF EXISTS lesson_component_intakes_v2_status_check;
ALTER TABLE public.lesson_component_intakes_v2
  ADD CONSTRAINT lesson_component_intakes_v2_status_check
  CHECK (status IN ('UPLOADING','VERIFIED','PUBLISHED','REJECTED','ARCHIVED'));

CREATE OR REPLACE FUNCTION public.lesson_component_archive_superseded_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_archived integer := 0;
  v_published_intake_created_at timestamptz;
BEGIN
  SELECT created_at INTO STRICT v_published_intake_created_at
  FROM public.lesson_component_intakes_v2
  WHERE id=NEW.intake_id;

  UPDATE public.lesson_component_intakes_v2
     SET status='ARCHIVED',
         archived_at=NEW.published_at,
         archived_by=NEW.published_by,
         validation_summary=validation_summary || jsonb_build_object(
           'archiveReason','SUPERSEDED_BY_PUBLICATION',
           'supersedingPublicationId',NEW.id,
           'archivedAt',NEW.published_at
         )
   WHERE lesson_id=NEW.lesson_id
     AND capability=NEW.capability
     AND status='VERIFIED'
     AND id<>NEW.intake_id
     AND created_at<v_published_intake_created_at;
  GET DIAGNOSTICS v_archived=ROW_COUNT;

  IF v_archived>0 THEN
    INSERT INTO public.audit_logs(actor_id,action,target_type,target_id,metadata)
    VALUES (NEW.published_by,'lesson_component_archive_superseded_v2','lesson_capability',
      NEW.lesson_id,jsonb_build_object(
        'capability',NEW.capability,
        'publicationId',NEW.id,
        'archivedIntakeCount',v_archived
      ));
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.lesson_component_archive_superseded_v2()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lesson_component_archive_superseded_v2
  ON public.lesson_component_publications_v2;
CREATE TRIGGER trg_lesson_component_archive_superseded_v2
AFTER INSERT ON public.lesson_component_publications_v2
FOR EACH ROW EXECUTE FUNCTION public.lesson_component_archive_superseded_v2();

-- Reconcile only attempts that were already older than an existing successful
-- publication. Attempts created after the latest publication remain VERIFIED.
WITH latest_publication AS (
  SELECT DISTINCT ON (p.lesson_id,p.capability)
    p.id,p.lesson_id,p.capability,p.published_at,p.published_by,
    published_intake.created_at AS published_intake_created_at
  FROM public.lesson_component_publications_v2 p
  JOIN public.lesson_component_intakes_v2 published_intake ON published_intake.id=p.intake_id
  ORDER BY p.lesson_id,p.capability,p.published_at DESC,p.id DESC
), archived AS (
  UPDATE public.lesson_component_intakes_v2 i
     SET status='ARCHIVED',
         archived_at=p.published_at,
         archived_by=p.published_by,
         validation_summary=i.validation_summary || jsonb_build_object(
           'archiveReason','SUPERSEDED_BY_EXISTING_PUBLICATION',
           'supersedingPublicationId',p.id,
           'archivedAt',p.published_at
         )
    FROM latest_publication p
   WHERE i.lesson_id=p.lesson_id
     AND i.capability=p.capability
     AND i.status='VERIFIED'
     AND i.created_at<p.published_intake_created_at
  RETURNING i.lesson_id,i.capability,i.archived_by,p.id AS publication_id
), audit_groups AS (
  SELECT lesson_id,capability,archived_by,publication_id,count(*) AS archived_count
  FROM archived
  GROUP BY lesson_id,capability,archived_by,publication_id
)
INSERT INTO public.audit_logs(actor_id,action,target_type,target_id,metadata)
SELECT archived_by,'lesson_component_archive_superseded_v2_reconcile','lesson_capability',
  lesson_id,jsonb_build_object(
    'capability',capability,
    'publicationId',publication_id,
    'archivedIntakeCount',archived_count
  )
FROM audit_groups;

DO $proof$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.lesson_component_intakes_v2'::regclass
      AND conname='lesson_component_intakes_v2_status_check'
      AND pg_get_constraintdef(oid) LIKE '%ARCHIVED%'
  ) THEN
    RAISE EXCEPTION 'LCPV2_ARCHIVED_STATUS_MISSING';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='public.lesson_component_publications_v2'::regclass
      AND tgname='trg_lesson_component_archive_superseded_v2'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'LCPV2_SUPERSEDED_ARCHIVE_TRIGGER_MISSING';
  END IF;
END
$proof$;

COMMIT;
