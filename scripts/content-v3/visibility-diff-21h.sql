-- TAMKEEN CONTENT V3 / 21H
-- Deterministic visibility diff. Read-only; run before and after the apply
-- candidate and retain both result sets. Supporting resources and PDF are
-- deliberately excluded from the V3 student journey.

BEGIN;
SET TRANSACTION READ ONLY;

WITH legacy AS (
  SELECT l.id AS lesson_id, v.capability
    FROM public.lessons l
    CROSS JOIN (VALUES
      ('officialBookContent'), ('tamkeenExplanation'), ('quickReview'),
      ('mindMap'), ('simulation'), ('checkUnderstanding'), ('lessonAssessment')
    ) AS v(capability)
   WHERE CASE v.capability
     WHEN 'officialBookContent' THEN EXISTS (
       SELECT 1 FROM public.lesson_book_contents b
        WHERE b.lesson_id = l.id AND COALESCE(btrim(b.content), '') <> '')
     WHEN 'tamkeenExplanation' THEN EXISTS (
       SELECT 1 FROM public.lesson_explanations e
        WHERE e.lesson_id = l.id AND COALESCE(btrim(e.content), '') <> '')
     WHEN 'quickReview' THEN EXISTS (
       SELECT 1 FROM public.lesson_summaries s
        WHERE s.lesson_id = l.id AND COALESCE(btrim(s.summary), '') <> '')
     WHEN 'mindMap' THEN EXISTS (
       SELECT 1 FROM public.lesson_resources r
        WHERE r.lesson_id = l.id
          AND (r.resource_type::text = 'mindmap' OR r.html_resource_type::text = 'mindmap')
          AND COALESCE(btrim(r.url), '') <> '')
     WHEN 'simulation' THEN EXISTS (
       SELECT 1 FROM public.lesson_simulations s WHERE s.lesson_id = l.id)
       OR EXISTS (
       SELECT 1 FROM public.lesson_resources r
        WHERE r.lesson_id = l.id
          AND (r.resource_type::text = 'experiment' OR r.html_resource_type::text = 'experiment')
          AND COALESCE(btrim(r.url), '') <> '')
     WHEN 'checkUnderstanding' THEN EXISTS (
       SELECT 1 FROM public.questions q WHERE q.lesson_id = l.id)
     WHEN 'lessonAssessment' THEN EXISTS (
       SELECT 1 FROM public.lesson_assessments a WHERE a.lesson_id = l.id)
       OR EXISTS (
       SELECT 1 FROM public.exam_templates e WHERE e.lesson_id = l.id)
     ELSE false END
), after_expected AS (
  SELECT g.lesson_id, g.capability
    FROM legacy g
   WHERE NOT EXISTS (
     SELECT 1 FROM public.lesson_capability_lifecycle lcl
      WHERE lcl.lesson_id = g.lesson_id
        AND lcl.capability = g.capability
        AND lcl.status <> 'READY'
        AND lcl.ready_snapshot IS NULL)
), classified AS (
  SELECT COALESCE(b.lesson_id, a.lesson_id) AS lesson_id,
         COALESCE(b.capability, a.capability) AS capability,
         CASE
           WHEN b.lesson_id IS NOT NULL AND a.lesson_id IS NOT NULL THEN 'UNCHANGED'
           WHEN b.lesson_id IS NULL AND a.lesson_id IS NOT NULL THEN 'EXPECTED_GAIN'
           WHEN b.lesson_id IS NOT NULL AND a.lesson_id IS NULL THEN 'UNEXPECTED_LOSS'
           ELSE 'UNEXPECTED_VISIBILITY_GAIN'
         END AS classification
    FROM legacy b
    FULL OUTER JOIN after_expected a
      ON a.lesson_id = b.lesson_id AND a.capability = b.capability
)
SELECT classification, count(*) AS capability_rows
  FROM classified
 GROUP BY classification
 ORDER BY classification;

-- Exit criteria for the operator: UNEXPECTED_VISIBILITY_GAIN = 0 and
-- UNEXPECTED_LOSS = 0. A non-zero EXPECTED_GAIN requires an explicit
-- approved content event and must not be explained by this migration.

ROLLBACK;
