\set ON_ERROR_STOP on

INSERT INTO auth.users (id, email) VALUES
  ('10000000-0000-0000-0000-000000000001', 'offline@test.invalid');

INSERT INTO public.lessons (id, title) VALUES
  ('20000000-0000-0000-0000-000000000001', 'TEST_ONLY accessible lesson'),
  ('20000000-0000-0000-0000-000000000002', 'TEST_ONLY denied lesson');

INSERT INTO public.lesson_access (user_id, lesson_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001');

INSERT INTO public.questions (id, lesson_id, question_text) VALUES
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'TEST_ONLY question'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'TEST_ONLY denied question');

INSERT INTO public.question_revisions (
  id, question_id, status, educational_label, question_text
) VALUES
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'PUBLISHED', 'OFFICIAL_BOOK_QUESTION', 'TEST_ONLY question'),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'PUBLISHED', 'OFFICIAL_BOOK_QUESTION', 'TEST_ONLY denied question');

UPDATE public.questions
SET current_published_revision_id = CASE id
  WHEN '30000000-0000-0000-0000-000000000001'::uuid THEN '40000000-0000-0000-0000-000000000001'::uuid
  ELSE '40000000-0000-0000-0000-000000000002'::uuid
END;

INSERT INTO public.question_options (
  question_revision_id, option_code, body, sort_order, is_correct
) VALUES
  ('40000000-0000-0000-0000-000000000001', 'A', '3', 1, false),
  ('40000000-0000-0000-0000-000000000001', 'B', '4', 2, true);

INSERT INTO public.official_question_answers (
  question_id, revision_id, model_answer, explanation
) VALUES (
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '4',
  'TEST_ONLY explanation'
);

INSERT INTO public.question_option_rationales (
  question_id, question_revision_id, option_id, why_correct, why_wrong
) VALUES (
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  'B',
  'TEST_ONLY correct',
  NULL
);

INSERT INTO public.user_progress (
  user_id, lesson_id, completed, quiz_score, updated_at
) VALUES (
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  false,
  91,
  '2025-01-01T00:00:00Z'
);

DO $$
DECLARE
  answer_layer jsonb;
BEGIN
  IF has_function_privilege('authenticated', 'public.get_offline_assessment_answer_layer(uuid,text,uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must not execute the answer layer';
  END IF;
  RAISE NOTICE 'PASS answer layer denied to authenticated';

  IF NOT has_function_privilege('service_role', 'public.get_offline_assessment_answer_layer(uuid,text,uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must execute the answer layer';
  END IF;
  RAISE NOTICE 'PASS answer layer granted to service_role';

  answer_layer := public.get_offline_assessment_answer_layer(
    '20000000-0000-0000-0000-000000000001',
    'official-questions',
    ARRAY['40000000-0000-0000-0000-000000000001'::uuid]
  );
  IF answer_layer #>> '{answers,0,modelAnswer}' <> '4'
     OR answer_layer #>> '{options,1,isCorrect}' <> 'true'
     OR answer_layer #>> '{rationales,0,optionId}' <> 'B' THEN
    RAISE EXCEPTION 'answer layer payload mismatch: %', answer_layer;
  END IF;
  RAISE NOTICE 'PASS revision-pinned answer layer';

  BEGIN
    PERFORM public.get_offline_assessment_answer_layer(
      '20000000-0000-0000-0000-000000000001',
      'official-questions',
      ARRAY['40000000-0000-0000-0000-000000000002'::uuid]
    );
    RAISE EXCEPTION 'cross-lesson answer layer request was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS cross-lesson answer layer denied';
  END;
END;
$$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);

SELECT public.apply_offline_learning_mutation(
  'offline-progress-00000001',
  'lesson-progress',
  '20000000-0000-0000-0000-000000000001',
  NULL,
  '2026-01-01T00:00:00Z',
  40,
  NULL,
  repeat('0', 64)
);

RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_progress
    WHERE user_id = '10000000-0000-0000-0000-000000000001'
      AND lesson_id = '20000000-0000-0000-0000-000000000001'
      AND progress_percent = 40
      AND quiz_score = 91
  ) THEN
    RAISE EXCEPTION 'partial progress corrupted quiz_score';
  END IF;
  RAISE NOTICE 'PASS partial progress preserves quiz score';
END;
$$;

SET ROLE authenticated;
SELECT public.apply_offline_learning_mutation(
  'offline-progress-00000001',
  'lesson-progress',
  '20000000-0000-0000-0000-000000000001',
  NULL,
  '2026-01-01T00:00:00Z',
  40,
  NULL,
  repeat('f', 64)
);

RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.offline_learning_mutations
      WHERE user_id = '10000000-0000-0000-0000-000000000001'
        AND idempotency_key = 'offline-progress-00000001') <> 1 THEN
    RAISE EXCEPTION 'idempotent replay duplicated the ledger';
  END IF;
  RAISE NOTICE 'PASS idempotent replay creates one ledger row';

  BEGIN
    PERFORM public.apply_offline_learning_mutation(
      'offline-progress-00000001',
      'lesson-progress',
      '20000000-0000-0000-0000-000000000001',
      NULL,
      '2026-01-01T00:00:00Z',
      41,
      NULL,
      repeat('0', 64)
    );
    RAISE EXCEPTION 'conflicting replay was accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS conflicting replay denied';
  END;
END;
$$;

SET ROLE authenticated;
SELECT public.apply_offline_learning_mutation(
  'offline-note-000000000001',
  'official-question-note',
  '30000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  now(),
  NULL,
  'TEST_ONLY student answer',
  repeat('0', 64)
);

RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.lesson_question_notes
    WHERE student_id = '10000000-0000-0000-0000-000000000001'
      AND lesson_id = '20000000-0000-0000-0000-000000000001'
      AND question_id = '30000000-0000-0000-0000-000000000001'
      AND answer_text = 'TEST_ONLY student answer'
  ) THEN
    RAISE EXCEPTION 'bound question note was not saved';
  END IF;
  RAISE NOTICE 'PASS bound official question note saved';

  BEGIN
    PERFORM public.apply_offline_learning_mutation(
      'offline-denied-000000001',
      'official-question-note',
      '30000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000002',
      now(),
      NULL,
      'must not persist',
      repeat('0', 64)
    );
    RAISE EXCEPTION 'denied question note was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS denied question binding rejected';
  END;

  BEGIN
    PERFORM public.apply_offline_learning_mutation(
      'offline-denied-000000002',
      'lesson-progress',
      '20000000-0000-0000-0000-000000000002',
      NULL,
      now(),
      10,
      NULL,
      repeat('0', 64)
    );
    RAISE EXCEPTION 'denied lesson progress was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS denied lesson access rejected';
  END;
END;
$$;

SET ROLE authenticated;
SELECT public.apply_offline_learning_mutation(
  'offline-complete-00000001',
  'lesson-completion',
  '20000000-0000-0000-0000-000000000001',
  NULL,
  now() + interval '7 days',
  NULL,
  NULL,
  repeat('0', 64)
);

RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_progress
    WHERE user_id = '10000000-0000-0000-0000-000000000001'
      AND lesson_id = '20000000-0000-0000-0000-000000000001'
      AND completed = true
      AND quiz_score = 91
  ) THEN
    RAISE EXCEPTION 'completion did not preserve quiz score';
  END IF;
  RAISE NOTICE 'PASS completion is monotonic and preserves quiz score';

  IF EXISTS (
    SELECT 1 FROM public.offline_learning_mutations
    WHERE idempotency_key = 'offline-complete-00000001'
      AND occurred_at > now()
  ) THEN
    RAISE EXCEPTION 'future device timestamp was not clamped';
  END IF;
  RAISE NOTICE 'PASS future device clock clamped';

  IF (SELECT count(*) FROM public.offline_learning_mutations) <> 3 THEN
    RAISE EXCEPTION 'unexpected ledger count';
  END IF;
  RAISE NOTICE 'PASS denied writes leave no ledger residue';
END;
$$;

SELECT set_config('request.jwt.claim.sub', '', false);

DO $$
BEGIN
  BEGIN
    PERFORM public.apply_offline_learning_mutation(
      'offline-anon-00000000001',
      'lesson-completion',
      '20000000-0000-0000-0000-000000000001',
      NULL,
      now(),
      NULL,
      NULL,
      repeat('0', 64)
    );
    RAISE EXCEPTION 'unauthenticated mutation was accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS unauthenticated mutation denied';
  END;
END;
$$;
