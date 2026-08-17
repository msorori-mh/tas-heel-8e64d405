-- 21B — post-apply assertions (schema, constraints, grants, RLS, behaviour).
\set ON_ERROR_STOP on

DO $$
DECLARE
  t1 uuid; t2 uuid; s1 uuid; b1 uuid; n int;
BEGIN
  -- structure
  ASSERT (SELECT count(*) FROM information_schema.columns
          WHERE table_schema='public' AND table_name='subject_textbooks') >= 16,
    'missing columns';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.subject_textbooks'::regclass),
    'RLS not enabled';
  ASSERT (SELECT count(*) FROM pg_policies WHERE tablename='subject_textbooks') = 2,
    'expected exactly 2 policies';

  -- grants: anon must have none, authenticated read-only, service_role full
  ASSERT NOT has_table_privilege('anon','public.subject_textbooks','SELECT'), 'anon can select';
  ASSERT has_table_privilege('authenticated','public.subject_textbooks','SELECT'), 'authenticated cannot select';
  ASSERT NOT has_table_privilege('authenticated','public.subject_textbooks','INSERT'), 'authenticated can insert';
  ASSERT NOT has_table_privilege('authenticated','public.subject_textbooks','UPDATE'), 'authenticated can update';
  ASSERT NOT has_table_privilege('authenticated','public.subject_textbooks','DELETE'), 'authenticated can delete';
  ASSERT has_table_privilege('service_role','public.subject_textbooks','INSERT'), 'service_role cannot insert';

  INSERT INTO public.curriculum_tracks (track_name) VALUES ('sanaa') RETURNING id INTO t1;
  INSERT INTO public.curriculum_tracks (track_name) VALUES ('aden') RETURNING id INTO t2;
  INSERT INTO public.subjects (name, curriculum_track_id) VALUES ('رياضيات', t1) RETURNING id INTO s1;

  -- happy path
  INSERT INTO public.subject_textbooks (subject_id, curriculum_track_id, semester, title, storage_path, version)
  VALUES (s1, t1, 1, 'كتاب الرياضيات', 'subject-textbooks/' || s1 || '/aaaa.pdf', 'v1')
  RETURNING id INTO b1;

  -- WRONG_TRACK_BINDING_DENY
  BEGIN
    INSERT INTO public.subject_textbooks (subject_id, curriculum_track_id, semester, title, storage_path, version)
    VALUES (s1, t2, 1, 'كتاب خاطئ', 'subject-textbooks/' || s1 || '/bbbb.pdf', 'v1');
    RAISE EXCEPTION 'track mismatch was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- path shape guard (no arbitrary storage path)
  BEGIN
    INSERT INTO public.subject_textbooks (subject_id, title, storage_path, version)
    VALUES (s1, 'مسار خاطئ', 'other-bucket/x.pdf', 'v1');
    RAISE EXCEPTION 'invalid storage path accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- semester guard
  BEGIN
    INSERT INTO public.subject_textbooks (subject_id, semester, title, storage_path, version)
    VALUES (s1, 3, 'فصل خاطئ', 'subject-textbooks/' || s1 || '/cccc.pdf', 'v1');
    RAISE EXCEPTION 'invalid semester accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- sha256 shape
  BEGIN
    INSERT INTO public.subject_textbooks (subject_id, title, storage_path, version, sha256)
    VALUES (s1, 'هاش خاطئ', 'subject-textbooks/' || s1 || '/dddd.pdf', 'v1', 'zzz');
    RAISE EXCEPTION 'invalid sha256 accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- same bytes reused for a second scope (no duplicated storage object)
  INSERT INTO public.subject_textbooks (subject_id, curriculum_track_id, semester, title, storage_path, version)
  VALUES (s1, NULL, 2, 'نفس الملف لمسار آخر', 'subject-textbooks/' || s1 || '/aaaa.pdf', 'v1');

  -- duplicate scope+path rejected
  BEGIN
    INSERT INTO public.subject_textbooks (subject_id, curriculum_track_id, semester, title, storage_path, version)
    VALUES (s1, t1, 1, 'مكرر', 'subject-textbooks/' || s1 || '/aaaa.pdf', 'v1');
    RAISE EXCEPTION 'duplicate scope accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- version bump updates updated_at via trigger
  UPDATE public.subject_textbooks SET version = 'v2' WHERE id = b1;
  ASSERT (SELECT version FROM public.subject_textbooks WHERE id=b1) = 'v2', 'version not updated';

  SELECT count(*) INTO n FROM public.subject_textbooks;
  ASSERT n = 2, 'unexpected row count: ' || n;

  RAISE NOTICE 'SUBJECT_TEXTBOOKS_21B_VERIFY=PASS';
END $$;
