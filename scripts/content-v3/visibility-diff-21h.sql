-- TAMKEEN CONTENT V3 / 21H / R1
-- Read-only semantic diff. Run before and after the apply candidate and retain
-- both result sets. This is READY_TO_VERIFY until both operator runs complete.
--
-- Canonical student-visible/revealable contract:
--   1. the lesson access predicate is public.can_access_lesson(lesson_id);
--   2. a missing lifecycle row grandfather-serves legacy content;
--   3. an existing lifecycle row is visible only when status = READY and
--      applicability <> NA; a snapshot never makes DRAFT/REVIEW visible;
--   4. official questions use the published pinned revision; answers are
--      revealable only through the submitted-attempt + exact-revision RPC gate.
-- The after_observed branch deliberately models the old snapshot exception so
-- a future consumer that still uses it is reported as UNEXPECTED_GAIN.

BEGIN;
SET TRANSACTION READ ONLY;

WITH capability_presence AS (
  SELECT l.id AS lesson_id,
         v.capability,
         public.can_access_lesson(l.id) AS access_granted,
         CASE v.capability
           WHEN 'officialBookContent' THEN EXISTS (
             SELECT 1 FROM public.lesson_book_contents b
              WHERE b.lesson_id = l.id
                AND COALESCE(btrim(b.content), '') <> '')
           WHEN 'tamkeenExplanation' THEN EXISTS (
             SELECT 1 FROM public.lesson_explanations e
              WHERE e.lesson_id = l.id
                AND COALESCE(btrim(e.content), '') <> '')
           WHEN 'quickReview' THEN EXISTS (
             SELECT 1 FROM public.lesson_summaries s
              WHERE s.lesson_id = l.id
                AND COALESCE(btrim(s.summary), '') <> '')
           WHEN 'mindMap' THEN EXISTS (
             SELECT 1 FROM public.lesson_resources r
              WHERE r.lesson_id = l.id
                AND (r.resource_type::text = 'mindmap'
                  OR r.html_resource_type::text = 'mindmap')
                AND COALESCE(btrim(r.url), '') <> '')
           WHEN 'simulation' THEN EXISTS (
             SELECT 1 FROM public.lesson_simulations s
              WHERE s.lesson_id = l.id)
             OR EXISTS (
             SELECT 1 FROM public.lesson_resources r
              WHERE r.lesson_id = l.id
                AND (r.resource_type::text = 'experiment'
                  OR r.html_resource_type::text = 'experiment')
                AND COALESCE(btrim(r.url), '') <> '')
           WHEN 'checkUnderstanding' THEN EXISTS (
             SELECT 1
               FROM public.questions q
               JOIN public.question_revisions r
                 ON r.id = q.current_published_revision_id
                AND r.question_id = q.id
                AND r.status = 'PUBLISHED'
              WHERE q.lesson_id = l.id)
           WHEN 'lessonAssessment' THEN EXISTS (
             SELECT 1 FROM public.lesson_assessments a
              WHERE a.lesson_id = l.id)
             OR EXISTS (
             SELECT 1 FROM public.exam_templates e
              WHERE e.lesson_id = l.id)
           ELSE false
         END AS v3_content_present,
         CASE v.capability
           WHEN 'officialBookContent' THEN EXISTS (
             SELECT 1 FROM public.lesson_book_contents b
              WHERE b.lesson_id = l.id
                AND COALESCE(btrim(b.content), '') <> '')
           WHEN 'tamkeenExplanation' THEN EXISTS (
             SELECT 1 FROM public.lesson_explanations e
              WHERE e.lesson_id = l.id
                AND COALESCE(btrim(e.content), '') <> '')
           WHEN 'quickReview' THEN EXISTS (
             SELECT 1 FROM public.lesson_summaries s
              WHERE s.lesson_id = l.id
                AND COALESCE(btrim(s.summary), '') <> '')
           WHEN 'mindMap' THEN EXISTS (
             SELECT 1 FROM public.lesson_resources r
              WHERE r.lesson_id = l.id
                AND (r.resource_type::text = 'mindmap'
                  OR r.html_resource_type::text = 'mindmap')
                AND COALESCE(btrim(r.url), '') <> '')
           WHEN 'simulation' THEN EXISTS (
             SELECT 1 FROM public.lesson_simulations s
              WHERE s.lesson_id = l.id)
             OR EXISTS (
             SELECT 1 FROM public.lesson_resources r
              WHERE r.lesson_id = l.id
                AND (r.resource_type::text = 'experiment'
                  OR r.html_resource_type::text = 'experiment')
                AND COALESCE(btrim(r.url), '') <> '')
           WHEN 'checkUnderstanding' THEN EXISTS (
             SELECT 1 FROM public.questions q
              WHERE q.lesson_id = l.id)
           WHEN 'lessonAssessment' THEN EXISTS (
             SELECT 1 FROM public.lesson_assessments a
              WHERE a.lesson_id = l.id)
             OR EXISTS (
             SELECT 1 FROM public.exam_templates e
              WHERE e.lesson_id = l.id)
           ELSE false
         END AS legacy_content_present
    FROM public.lessons l
    CROSS JOIN (VALUES
      ('officialBookContent'), ('tamkeenExplanation'), ('quickReview'),
      ('mindMap'), ('simulation'), ('checkUnderstanding'), ('lessonAssessment')
    ) AS v(capability)
), lifecycle_contract AS (
  SELECT p.*,
         lcl.id IS NOT NULL AS lifecycle_present,
         lcl.status,
         COALESCE((to_jsonb(lcl)->>'applicability'), 'REQUIRED') AS applicability,
         (to_jsonb(lcl)->>'ready_snapshot') IS NOT NULL AS snapshot_present
    FROM capability_presence p
    LEFT JOIN public.lesson_capability_lifecycle lcl
      ON lcl.lesson_id = p.lesson_id
     AND lcl.capability = p.capability
), before_visible AS (
  SELECT lesson_id, capability
    FROM lifecycle_contract
   WHERE access_granted AND legacy_content_present
), after_expected_visible AS (
  SELECT lesson_id, capability
    FROM lifecycle_contract
   WHERE access_granted
     AND v3_content_present
     AND (NOT lifecycle_present
       OR (status = 'READY' AND applicability <> 'NA'))
), after_observed_visible AS (
  SELECT lesson_id, capability
    FROM lifecycle_contract
   WHERE access_granted
     AND v3_content_present
     AND (NOT lifecycle_present
       OR (status = 'READY' AND applicability <> 'NA')
       OR (status IN ('DRAFT', 'REVIEW') AND snapshot_present))
), identities AS (
  SELECT lesson_id, capability FROM before_visible
  UNION
  SELECT lesson_id, capability FROM after_expected_visible
  UNION
  SELECT lesson_id, capability FROM after_observed_visible
), classified AS (
  SELECT i.lesson_id,
         i.capability,
         COALESCE(b.lesson_id IS NOT NULL, false) AS before_visible,
         COALESCE(e.lesson_id IS NOT NULL, false) AS after_expected_visible,
         COALESCE(o.lesson_id IS NOT NULL, false) AS after_observed_visible,
         CASE
           WHEN b.lesson_id IS NOT NULL
            AND e.lesson_id IS NOT NULL
            AND o.lesson_id IS NOT NULL THEN 'UNCHANGED'
           WHEN b.lesson_id IS NULL
            AND e.lesson_id IS NOT NULL
            AND o.lesson_id IS NOT NULL THEN 'EXPECTED_GAIN'
           WHEN e.lesson_id IS NULL
            AND o.lesson_id IS NOT NULL THEN 'UNEXPECTED_GAIN'
           WHEN b.lesson_id IS NOT NULL
            AND e.lesson_id IS NULL
            AND o.lesson_id IS NULL
            AND (c.lifecycle_present
              AND (c.status <> 'READY' OR c.applicability = 'NA')) THEN 'SECURITY_FIX'
           WHEN b.lesson_id IS NOT NULL
            AND e.lesson_id IS NULL THEN 'UNEXPECTED_LOSS'
           WHEN b.lesson_id IS NULL
            AND e.lesson_id IS NOT NULL
            AND o.lesson_id IS NULL THEN 'UNEXPECTED_LOSS'
           ELSE 'UNCHANGED'
         END AS classification
    FROM identities i
    LEFT JOIN before_visible b USING (lesson_id, capability)
    LEFT JOIN after_expected_visible e USING (lesson_id, capability)
    LEFT JOIN after_observed_visible o USING (lesson_id, capability)
    JOIN lifecycle_contract c USING (lesson_id, capability)
)
SELECT classification, count(*) AS capability_rows
  FROM classified
 GROUP BY classification
 ORDER BY classification;

WITH capability_presence AS (
  SELECT l.id AS lesson_id,
         v.capability,
         public.can_access_lesson(l.id) AS access_granted,
         CASE v.capability
           WHEN 'officialBookContent' THEN EXISTS (SELECT 1 FROM public.lesson_book_contents b WHERE b.lesson_id = l.id AND COALESCE(btrim(b.content), '') <> '')
           WHEN 'tamkeenExplanation' THEN EXISTS (SELECT 1 FROM public.lesson_explanations e WHERE e.lesson_id = l.id AND COALESCE(btrim(e.content), '') <> '')
           WHEN 'quickReview' THEN EXISTS (SELECT 1 FROM public.lesson_summaries s WHERE s.lesson_id = l.id AND COALESCE(btrim(s.summary), '') <> '')
           WHEN 'mindMap' THEN EXISTS (SELECT 1 FROM public.lesson_resources r WHERE r.lesson_id = l.id AND (r.resource_type::text = 'mindmap' OR r.html_resource_type::text = 'mindmap') AND COALESCE(btrim(r.url), '') <> '')
           WHEN 'simulation' THEN EXISTS (SELECT 1 FROM public.lesson_simulations s WHERE s.lesson_id = l.id) OR EXISTS (SELECT 1 FROM public.lesson_resources r WHERE r.lesson_id = l.id AND (r.resource_type::text = 'experiment' OR r.html_resource_type::text = 'experiment') AND COALESCE(btrim(r.url), '') <> '')
           WHEN 'checkUnderstanding' THEN EXISTS (SELECT 1 FROM public.questions q JOIN public.question_revisions r ON r.id = q.current_published_revision_id AND r.question_id = q.id AND r.status = 'PUBLISHED' WHERE q.lesson_id = l.id)
           WHEN 'lessonAssessment' THEN EXISTS (SELECT 1 FROM public.lesson_assessments a WHERE a.lesson_id = l.id) OR EXISTS (SELECT 1 FROM public.exam_templates e WHERE e.lesson_id = l.id)
           ELSE false END AS v3_content_present,
         CASE v.capability
           WHEN 'officialBookContent' THEN EXISTS (SELECT 1 FROM public.lesson_book_contents b WHERE b.lesson_id = l.id AND COALESCE(btrim(b.content), '') <> '')
           WHEN 'tamkeenExplanation' THEN EXISTS (SELECT 1 FROM public.lesson_explanations e WHERE e.lesson_id = l.id AND COALESCE(btrim(e.content), '') <> '')
           WHEN 'quickReview' THEN EXISTS (SELECT 1 FROM public.lesson_summaries s WHERE s.lesson_id = l.id AND COALESCE(btrim(s.summary), '') <> '')
           WHEN 'mindMap' THEN EXISTS (SELECT 1 FROM public.lesson_resources r WHERE r.lesson_id = l.id AND (r.resource_type::text = 'mindmap' OR r.html_resource_type::text = 'mindmap') AND COALESCE(btrim(r.url), '') <> '')
           WHEN 'simulation' THEN EXISTS (SELECT 1 FROM public.lesson_simulations s WHERE s.lesson_id = l.id) OR EXISTS (SELECT 1 FROM public.lesson_resources r WHERE r.lesson_id = l.id AND (r.resource_type::text = 'experiment' OR r.html_resource_type::text = 'experiment') AND COALESCE(btrim(r.url), '') <> '')
           WHEN 'checkUnderstanding' THEN EXISTS (SELECT 1 FROM public.questions q WHERE q.lesson_id = l.id)
           WHEN 'lessonAssessment' THEN EXISTS (SELECT 1 FROM public.lesson_assessments a WHERE a.lesson_id = l.id) OR EXISTS (SELECT 1 FROM public.exam_templates e WHERE e.lesson_id = l.id)
           ELSE false END AS legacy_content_present
    FROM public.lessons l CROSS JOIN (VALUES
      ('officialBookContent'), ('tamkeenExplanation'), ('quickReview'), ('mindMap'),
      ('simulation'), ('checkUnderstanding'), ('lessonAssessment')) AS v(capability)
), c AS (
  SELECT p.*, lcl.id IS NOT NULL AS lifecycle_present, lcl.status,
         COALESCE(to_jsonb(lcl)->>'applicability', 'REQUIRED') AS applicability,
         (to_jsonb(lcl)->>'ready_snapshot') IS NOT NULL AS snapshot_present
    FROM capability_presence p
    LEFT JOIN public.lesson_capability_lifecycle lcl
      ON lcl.lesson_id = p.lesson_id AND lcl.capability = p.capability
), classified AS (
  SELECT c.*,
         c.access_granted AND c.legacy_content_present AS before_visible,
         c.access_granted AND c.v3_content_present
           AND (NOT c.lifecycle_present OR (c.status = 'READY' AND c.applicability <> 'NA')) AS after_expected_visible,
         c.access_granted AND c.v3_content_present
           AND (NOT c.lifecycle_present OR (c.status = 'READY' AND c.applicability <> 'NA') OR (c.status IN ('DRAFT','REVIEW') AND c.snapshot_present)) AS after_observed_visible
    FROM c
), counts AS (
  SELECT count(*) FILTER (WHERE NOT before_visible AND after_expected_visible AND after_observed_visible) AS expected_gain_count,
         count(*) FILTER (WHERE NOT after_expected_visible AND after_observed_visible) AS unexpected_gain_count,
         count(*) FILTER (WHERE before_visible AND NOT after_expected_visible AND NOT after_observed_visible AND lifecycle_present AND (status <> 'READY' OR applicability = 'NA')) AS security_fix_count,
         count(*) FILTER (WHERE (before_visible AND NOT after_expected_visible AND NOT after_observed_visible AND NOT (lifecycle_present AND (status <> 'READY' OR applicability = 'NA'))) OR (before_visible AND after_expected_visible AND NOT after_observed_visible)) AS unexpected_loss_count
    FROM classified
)
SELECT 'EXPECTED_GAIN_COUNT' AS check_name, expected_gain_count::text AS capability_rows FROM counts
UNION ALL SELECT 'SECURITY_FIX_COUNT', security_fix_count::text FROM counts
UNION ALL SELECT 'UNEXPECTED_GAIN_COUNT', unexpected_gain_count::text FROM counts
UNION ALL SELECT 'UNEXPECTED_LOSS_COUNT', unexpected_loss_count::text FROM counts
UNION ALL
SELECT 'VISIBILITY_DIFF', CASE WHEN unexpected_gain_count = 0 AND unexpected_loss_count = 0 THEN 'READY_TO_VERIFY' ELSE 'STOP_VISIBILITY_DIFF' END FROM counts;

-- A zero result is an exit gate, not runtime proof. Only the operator's
-- PG17/production read-only before+after runs can change READY_TO_VERIFY to
-- PROVEN; this script never claims that state itself.

ROLLBACK;
