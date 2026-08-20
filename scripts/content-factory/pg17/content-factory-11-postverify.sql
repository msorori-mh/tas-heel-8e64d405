-- =====================================================================================
-- CF11 EXACT POSTVERIFY
-- Read-only. Safe to run verbatim against the PG17 rehearsal AND against production after an
-- authorized apply. Emits one row per check; the final row is the verdict.
-- Parameterised by :lesson (defaults to the Iron rehearsal lesson).
-- =====================================================================================
\if :{?lesson}
\else
  \set lesson '43000000-0000-0000-0000-000000000012'
\endif

CREATE TEMP TABLE cf11_postverify(check_name text, expected text, actual text, ok boolean);

INSERT INTO cf11_postverify
WITH l AS (SELECT :'lesson'::uuid AS id),
     probe AS (
  SELECT 'lesson_is_free' AS check_name, 'true' AS expected,
         (SELECT is_free::text FROM public.lessons WHERE id=(SELECT id FROM l)) AS actual
  UNION ALL SELECT 'lesson_student_visible','true',
         public.lesson_student_visible((SELECT id FROM l))::text
  UNION ALL SELECT 'lifecycle_rows','7',
         (SELECT count(*)::text FROM public.lesson_capability_lifecycle WHERE lesson_id=(SELECT id FROM l))
  UNION ALL SELECT 'lifecycle_ready','7',
         (SELECT count(*)::text FROM public.lesson_capability_lifecycle
           WHERE lesson_id=(SELECT id FROM l) AND status='READY')
  UNION ALL SELECT 'lifecycle_snapshot_hash_consistent','7',
         (SELECT count(*)::text FROM public.lesson_capability_lifecycle
           WHERE lesson_id=(SELECT id FROM l)
             AND ready_hash = public.v3_capability_snapshot_hash(ready_snapshot))
  UNION ALL SELECT 'mindmap_resources','1',
         (SELECT count(*)::text FROM public.lesson_resources
           WHERE lesson_id=(SELECT id FROM l) AND html_resource_type='mindmap')
  UNION ALL SELECT 'experiment_resources','1',
         (SELECT count(*)::text FROM public.lesson_resources
           WHERE lesson_id=(SELECT id FROM l) AND html_resource_type='experiment')
  UNION ALL SELECT 'resources_external_urls','0',
         (SELECT count(*)::text FROM public.lesson_resources
           WHERE lesson_id=(SELECT id FROM l) AND url ~* '^https?://')
  UNION ALL SELECT 'mindmap_publication_pending','false',
         public.cf10_html_publication_pending((SELECT id FROM l),'mindMap')::text
  UNION ALL SELECT 'simulation_publication_pending','false',
         public.cf10_html_publication_pending((SELECT id FROM l),'simulation')::text
  UNION ALL SELECT 'mindmap_is_js_free','0',
         (SELECT count(*)::text FROM public.lesson_resources
           WHERE lesson_id=(SELECT id FROM l) AND html_resource_type='mindmap'
             AND description ~* '<script\y')
  UNION ALL SELECT 'lab_csp_connect_src_none','1',
         (SELECT count(*)::text FROM public.lesson_resources
           WHERE lesson_id=(SELECT id FROM l) AND html_resource_type='experiment'
             AND description ~* 'connect-src\s+''none''')
  UNION ALL SELECT 'official_questions','5',
         (SELECT count(*)::text FROM public.questions
           WHERE lesson_id=(SELECT id FROM l) AND code LIKE '%-OFFQ-%')
  UNION ALL SELECT 'selftest_questions','40',
         (SELECT count(*)::text FROM public.questions
           WHERE lesson_id=(SELECT id FROM l) AND code LIKE '%-SELF-%')
  UNION ALL SELECT 'questions_published','45',
         (SELECT count(*)::text FROM public.questions
           WHERE lesson_id=(SELECT id FROM l) AND current_published_revision_id IS NOT NULL)
  UNION ALL SELECT 'assessment_members','40',
         (SELECT count(*)::text FROM public.assessment_questions aq
            JOIN public.lesson_assessments la ON la.id=aq.assessment_id
           WHERE la.lesson_id=(SELECT id FROM l))
  UNION ALL SELECT 'official_questions_in_assessment','0',
         (SELECT count(*)::text FROM public.assessment_questions aq
            JOIN public.lesson_assessments la ON la.id=aq.assessment_id
            JOIN public.questions q ON q.id=aq.question_id
           WHERE la.lesson_id=(SELECT id FROM l) AND q.code LIKE '%-OFFQ-%')
  UNION ALL SELECT 'published_assets','1',
         (SELECT count(*)::text FROM public.golden_lesson_published_assets
           WHERE lesson_id=(SELECT id FROM l))
  UNION ALL SELECT 'assets_all_private','0',
         (SELECT count(*)::text FROM public.golden_lesson_published_assets a
            JOIN storage.buckets b ON b.id=a.storage_bucket
           WHERE a.lesson_id=(SELECT id FROM l) AND b.public)
  UNION ALL SELECT 'asset_objects_present','1',
         (SELECT count(*)::text FROM public.golden_lesson_published_assets a
           WHERE a.lesson_id=(SELECT id FROM l)
             AND EXISTS (SELECT 1 FROM storage.objects o
                          WHERE o.bucket_id=a.storage_bucket AND o.name=a.storage_path))
  UNION ALL SELECT 'book_asset_reference_rewritten','1',
         (SELECT count(*)::text FROM public.lesson_book_contents
           WHERE lesson_id=(SELECT id FROM l)
             AND content LIKE '%supabase-storage://golden-lesson-assets/%')
  UNION ALL SELECT 'book_leaf_reference_gone','0',
         (SELECT count(*)::text FROM public.lesson_book_contents
           WHERE lesson_id=(SELECT id FROM l) AND content ~ 'src="[a-z0-9][a-z0-9._-]*\.(png|jpe?g|webp)"')
  UNION ALL SELECT 'answer_leak','0',
         (SELECT count(*)::text FROM (
            SELECT b.content AS body FROM public.lesson_book_contents b WHERE b.lesson_id=(SELECT id FROM l)
            UNION ALL SELECT e.content FROM public.lesson_explanations e WHERE e.lesson_id=(SELECT id FROM l)
            UNION ALL SELECT s.summary FROM public.lesson_summaries s WHERE s.lesson_id=(SELECT id FROM l)
            UNION ALL SELECT r.description FROM public.lesson_resources r WHERE r.lesson_id=(SELECT id FROM l)
          ) t WHERE t.body ~* '(is_correct|correct_index|correct_answer|answer_key|model_answer|rationale)')
  UNION ALL SELECT 'official_answers_confined','5',
         (SELECT count(*)::text FROM public.official_question_answers a
            JOIN public.question_revisions rv ON rv.id=a.revision_id
            JOIN public.questions q ON q.id=rv.question_id
           WHERE q.lesson_id=(SELECT id FROM l))
  UNION ALL SELECT 'rationales_confined','40',
         (SELECT count(*)::text FROM public.question_option_rationales ra
            JOIN public.question_revisions rv ON rv.id=ra.question_revision_id
            JOIN public.questions q ON q.id=rv.question_id
           WHERE q.lesson_id=(SELECT id FROM l))
  UNION ALL SELECT 'publication_rows','1',
         (SELECT count(*)::text FROM public.golden_lesson_publications WHERE lesson_id=(SELECT id FROM l))
  UNION ALL SELECT 'publisher_differs_from_attester','1',
         (SELECT count(*)::text FROM public.golden_lesson_publications
           WHERE lesson_id=(SELECT id FROM l)
             AND ready_attested_by IS NOT NULL AND ready_attested_by <> published_by)
)
SELECT check_name, expected, actual, actual IS NOT DISTINCT FROM expected FROM probe;

SELECT check_name, expected, actual, ok FROM cf11_postverify ORDER BY check_name;

DO $$
DECLARE failed integer;
BEGIN
  SELECT count(*) INTO failed FROM cf11_postverify WHERE NOT ok;
  IF failed > 0 THEN
    RAISE EXCEPTION 'CF11_POSTVERIFY_FAILED: % check(s)', failed;
  END IF;
END $$;

SELECT 'PASS_CONTENT_FACTORY_11_POSTVERIFY' AS verdict;
