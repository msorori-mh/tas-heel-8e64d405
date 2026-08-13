-- Post-apply ACL hardening for G1 stage 11 functions.
-- Supabase's default-grant event trigger re-granted EXECUTE to anon on functions
-- (re)created by the stage-11 migration. Restore the intended matrix.

REVOKE ALL ON FUNCTION public.qb_guard_targets_revision_immutable() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_assessment_question_link() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._qb_assert_revision_targets_publishable(uuid) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.publish_question_revision(uuid, uuid, uuid, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.publish_question_revision(uuid, uuid, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.retarget_question(uuid, uuid, jsonb, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.retarget_question(uuid, uuid, jsonb, text) TO authenticated;

REVOKE ALL ON FUNCTION public.qb_import_ingest_revision(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qb_import_ingest_revision(uuid) TO service_role;