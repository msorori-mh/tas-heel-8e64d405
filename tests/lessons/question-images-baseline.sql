-- Record actual hashes immediately before the additive image migration.
CREATE TEMP TABLE question_image_old_hashes AS
SELECT id,public._qb_build_revision_canonical_jcs(id) AS canonical
FROM public.question_revisions;
