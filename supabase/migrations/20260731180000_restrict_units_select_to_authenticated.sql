-- PRE-IMPORT-STABILITY-AND-IMPORT-TEMPLATES-ALIGNMENT-01
-- Source-only: NOT applied to Supabase from this PR. Application is an
-- explicit owner step after merge.
--
-- Gap: the legacy policy
--   "Units viewable by everyone" ON public.units FOR SELECT USING (true)
-- has no TO clause, so it applies to PUBLIC — including the anon role —
-- letting any visitor read unit titles while subjects stay authenticated-only
-- (verified live: anon GET /rest/v1/units returns rows).
--
-- Fix: drop the public SELECT policy and replace it with an
-- authenticated-only policy scoped by the same gate the rest of the content
-- model uses (can_access_subject): students read units of subjects in their
-- own grade/track, admins bypass, and content staff keep full access via the
-- existing "Content staff manage units" FOR ALL policy (unchanged here).

DROP POLICY IF EXISTS "Units viewable by everyone" ON public.units;

CREATE POLICY "Units viewable per subject access" ON public.units
  FOR SELECT TO authenticated
  USING (public.can_access_subject(subject_id));

-- No DML, no data changes, no schema changes, no financial/storage/auth
-- changes. questions/lessons/exams policies are untouched.
