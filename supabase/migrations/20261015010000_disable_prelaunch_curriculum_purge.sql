-- Curriculum content is live (1481 lessons). Turn off the pre-launch purge so
-- the destructive "تنظيف البيانات التجريبية" action can no longer run, and the
-- admin UI hides it. Reversible by an owner if a fresh pre-launch reset is ever
-- needed (UPDATE ... SET enabled = true). The permanent lock RPC cannot be used
-- here because it requires empty content.
UPDATE public.curriculum_prelaunch_purge_control
SET enabled = false,
    updated_at = now()
WHERE singleton = true
  AND enabled = true;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.curriculum_prelaunch_purge_control WHERE enabled) THEN
    RAISE EXCEPTION 'PRELAUNCH_PURGE_STILL_ENABLED';
  END IF;
END $$;
