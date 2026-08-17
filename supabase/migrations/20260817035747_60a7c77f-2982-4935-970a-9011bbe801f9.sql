DO $$
DECLARE
  v_lesson uuid := '16c10040-7a7b-4647-add2-4aa4d3f70583';
  v_subject uuid := '1234e882-b0b2-499a-bd66-f91f480e1081';
  v_actor uuid := '9455d55f-17c3-4bbf-a75d-e6540b6a91a9';
  v_assessment uuid;
  v_qid uuid;
  v_rid uuid;
  v_i int := 0;
  v_texts text[] := ARRAY[
    'برهن على أن القرآن وحي من عند الله .',
    E'علل لما يأتي :\nأ - تذكير الله تعالى للإنسان بأن أصله من الطين والماء المهين .\nب - مجيء الحروف المقطعة في أوائل السور مثل ( ألف، لام، ميم )\nجـ - إضافة الروح إلى الله تعالى، في قوله ( ونفخت فيه من روحي )',
    '( اهتم الإسلام بروح الإنسان وجسده ) وضح ذلك .',
    E'ماذا تفهم من الآيات الآتية :\nأ - قال تعالى : ﴿مَا لَكُم مِّن دُونِهِ مِن وَلِيٍّ وَلَا شَفِيعٍ ۚ أَفَلَا تَتَذَكَّرُونَ﴾\nب - قال تعالى : ﴿يُدَبِّرُ الْأَمْرَ مِنَ السَّمَاءِ إِلَى الْأَرْضِ﴾\nجـ - قال تعالى : ﴿وَجَعَلَ لَكُمُ السَّمْعَ وَالْأَبْصَارَ وَالْأَفْئِدَةَ ۚ قَلِيلًا مَّا تَشْكُرُونَ﴾',
    'ما المراحل التي مر بها خلق الإنسان، حتى صار في أحسن تقويم .',
    E'بين معاني ما يأتي :\nأ - مَاءٍ مَّهِينٍ\nب - يَقُولُونَ افْتَرَاهُ\nجـ - لَا رَيْبَ فِيهِ\nد - جَعَلَ نَسْلَهُ مِن سُلَالَةٍ'
  ];
  v_txt text;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_actor::text, 'role', 'authenticated')::text,
    true
  );

  -- official assessment card for the lesson
  SELECT id INTO v_assessment FROM public.lesson_assessments
   WHERE lesson_id = v_lesson AND assessment_code = 'ASM-G10-QURAN-L01';
  IF v_assessment IS NULL THEN
    INSERT INTO public.lesson_assessments (lesson_id, title, instructions, sort_order, assessment_code)
    VALUES (v_lesson, 'التقويم',
            'أسئلة التقويم كما وردت في الكتاب الوزاري. أجب عنها كتابةً ثم راجع إجابتك مع معلمك.',
            1, 'ASM-G10-QURAN-L01')
    RETURNING id INTO v_assessment;
  END IF;

  FOREACH v_txt IN ARRAY v_texts LOOP
    v_i := v_i + 1;

    SELECT id INTO v_qid FROM public.questions
     WHERE code = 'Q-G10-QURAN-L01-' || lpad(v_i::text, 2, '0');
    CONTINUE WHEN v_qid IS NOT NULL;

    INSERT INTO public.questions
      (lesson_id, subject_id, question_text, options, correct_index, question_type,
       semester, sort_order, code, created_by)
    VALUES
      (v_lesson, v_subject, v_txt, '[]'::jsonb, -1, 'essay',
       1, v_i, 'Q-G10-QURAN-L01-' || lpad(v_i::text, 2, '0'), v_actor)
    RETURNING id INTO v_qid;

    INSERT INTO public.question_revisions
      (question_id, revision_number, status, interaction_type, grading_mode,
       educational_label, question_text, max_score, allow_partial, requires_media,
       manual_grading_required, payload_hash_version, created_by)
    VALUES
      (v_qid, 1, 'DRAFT', 'LONG_TEXT', NULL,
       'تقويم رسمي', v_txt, 1, false, false,
       true, 'v1', v_actor)
    RETURNING id INTO v_rid;

    INSERT INTO public.question_targets
      (question_id, target_type, subject_id, lesson_id, is_primary, created_by, revision_id)
    VALUES (v_qid, 'LESSON', v_subject, v_lesson, true, v_actor, v_rid);

    PERFORM public.compute_and_set_revision_payload_hash(v_rid);

    UPDATE public.question_revisions
       SET status = 'READY_FOR_REVIEW'
     WHERE id = v_rid;

    UPDATE public.question_revisions
       SET status = 'APPROVED', reviewed_at = now(), reviewed_by = v_actor
     WHERE id = v_rid;

    UPDATE public.question_revisions
       SET status = 'PUBLISHED', published_at = now(), published_by = v_actor
     WHERE id = v_rid;

    UPDATE public.questions
       SET current_published_revision_id = v_rid
     WHERE id = v_qid;

    INSERT INTO public.assessment_questions (assessment_id, question_id, sort_order, points)
    VALUES (v_assessment, v_qid, v_i, 1);
  END LOOP;

  -- pilot access: first Quran lesson is free
  UPDATE public.lessons SET is_free = true WHERE id = v_lesson;
END $$;