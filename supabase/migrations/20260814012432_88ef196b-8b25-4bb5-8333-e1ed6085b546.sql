-- SHARED_CURRICULUM_SUBJECT_MAPPING_13C.3 — bind template 01 (subjects) to
-- multi-track availability via public.subject_curriculum_tracks.
--
-- Identity  = subjects.code (TCS-2, track-independent)
-- Available = subject_curriculum_tracks (1 subject → N tracks)

CREATE OR REPLACE FUNCTION public.import_apply_subject_track_codes(
  _subject uuid,
  _track_codes text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  codes text[];
  code text;
  track uuid;
  applied integer := 0;
BEGIN
  IF _subject IS NULL THEN
    RAISE EXCEPTION 'SUBJECT_REQUIRED' USING ERRCODE = '23502';
  END IF;

  codes := ARRAY(
    SELECT DISTINCT lower(btrim(x))
    FROM regexp_split_to_table(COALESCE(_track_codes, ''), '[|,،]') AS x
    WHERE btrim(x) <> ''
  );

  IF array_length(codes, 1) IS NULL THEN
    RAISE EXCEPTION 'TRACK_CODES_REQUIRED: يجب تحديد مسار واحد على الأقل في track_codes'
      USING ERRCODE = '23502';
  END IF;

  FOREACH code IN ARRAY codes LOOP
    SELECT t.id INTO track FROM public.curriculum_tracks t WHERE t.track_code = code;
    IF track IS NULL THEN
      RAISE EXCEPTION 'UNKNOWN_TRACK_CODE: %', code USING ERRCODE = '23503';
    END IF;

    -- Append-only from the import path: attaching is safe, detaching is not.
    INSERT INTO public.subject_curriculum_tracks (subject_id, curriculum_track_id, is_active)
    VALUES (_subject, track, true)
    ON CONFLICT (subject_id, curriculum_track_id) DO UPDATE
      SET is_active = true;

    applied := applied + 1;
  END LOOP;

  -- Legacy single-track column: meaningful only for single-track subjects.
  UPDATE public.subjects s
     SET curriculum_track_id = CASE
       WHEN array_length(codes, 1) = 1
         THEN (SELECT t.id FROM public.curriculum_tracks t WHERE t.track_code = codes[1])
       ELSE NULL
     END
   WHERE s.id = _subject;

  RETURN applied;
END;
$function$;

REVOKE ALL ON FUNCTION public.import_apply_subject_track_codes(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.import_execute_template(_job_id uuid, _template_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  job public.import_jobs;
  row_rec public.import_staging_rows;
  p jsonb;
  action text;
  entity_type text;
  target uuid;
  subject uuid;
  lesson uuid;
  unit uuid;
  inserted integer := 0;
  updated integer := 0;
  skipped integer := 0;
  blocked integer := 0;
BEGIN
  -- Questions never enter through the generic upsert path: they are routed to
  -- the question-bank workflow (draft revisions only, never a publish).
  IF _template_key = 'questions' THEN
    RETURN public.import_execute_questions_template(_job_id);
  END IF;

  job := public.assert_import_job_operator(_job_id);

  IF job.execution_state <> 'planned' THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION: % -> applying', job.execution_state USING ERRCODE = '55000';
  END IF;

  UPDATE public.import_jobs
     SET execution_state = 'applying', updated_at = now()
   WHERE id = _job_id;

  FOR row_rec IN
    SELECT * FROM public.import_staging_rows
    WHERE job_id = _job_id AND template_key = _template_key
    ORDER BY row_number
  LOOP
    IF NOT row_rec.is_valid THEN
      RAISE EXCEPTION 'INVALID_STAGED_ROW: row %', row_rec.row_number USING ERRCODE = '22023';
    END IF;

    p := row_rec.payload;
    target := NULL;
    subject := NULL;
    lesson := NULL;
    unit := NULL;

    IF p ? 'subject_code' THEN
      SELECT s.id INTO subject FROM public.subjects s WHERE s.code = p->>'subject_code';
    END IF;

    IF p ? 'lesson_code' AND subject IS NOT NULL THEN
      SELECT l.id INTO lesson FROM public.lessons l
      WHERE l.subject_id = subject AND l.slug = p->>'lesson_code';
    END IF;

    IF p ? 'unit_code' AND subject IS NOT NULL THEN
      SELECT u.id INTO unit FROM public.units u
      WHERE u.subject_id = subject AND u.code = p->>'unit_code';
    END IF;

    CASE _template_key
      WHEN 'subjects' THEN
        entity_type := 'subjects';
        SELECT s.id INTO target FROM public.subjects s WHERE s.code = p->>'subject_code';
      WHEN 'units' THEN
        entity_type := 'units';
        IF subject IS NULL THEN
          RAISE EXCEPTION 'SUBJECT_NOT_FOUND: %', p->>'subject_code' USING ERRCODE = '23503';
        END IF;
        SELECT u.id INTO target FROM public.units u
        WHERE u.subject_id = subject AND u.code = p->>'unit_code';
      WHEN 'lessons' THEN
        entity_type := 'lessons';
        IF subject IS NULL THEN
          RAISE EXCEPTION 'SUBJECT_NOT_FOUND: %', p->>'subject_code' USING ERRCODE = '23503';
        END IF;
        SELECT l.id INTO target FROM public.lessons l
        WHERE l.subject_id = subject AND l.slug = p->>'lesson_code';
      WHEN 'explanations' THEN
        entity_type := 'lesson_explanations';
        IF lesson IS NULL THEN
          RAISE EXCEPTION 'LESSON_NOT_FOUND: %', p->>'lesson_code' USING ERRCODE = '23503';
        END IF;
        SELECT e.id INTO target FROM public.lesson_explanations e
        WHERE e.lesson_id = lesson
          AND e.explanation_code = public.normalize_content_code(p->>'explanation_code');
      WHEN 'assessments' THEN
        entity_type := 'lesson_assessments';
        IF lesson IS NULL THEN
          RAISE EXCEPTION 'LESSON_NOT_FOUND: %', p->>'lesson_code' USING ERRCODE = '23503';
        END IF;
        SELECT a.id INTO target FROM public.lesson_assessments a
        WHERE a.assessment_code = public.normalize_content_code(p->>'assessment_code');
      WHEN 'book_contents', 'resources', 'assessment_questions' THEN
        entity_type := NULL;
        IF lesson IS NULL AND _template_key <> 'assessment_questions' THEN
          RAISE EXCEPTION 'LESSON_NOT_FOUND: %', p->>'lesson_code' USING ERRCODE = '23503';
        END IF;
        IF _template_key = 'book_contents' THEN
          SELECT b.id INTO target FROM public.lesson_book_contents b
          WHERE b.lesson_id = lesson;
        ELSIF _template_key = 'resources' THEN
          SELECT r.id INTO target FROM public.lesson_resources r
          WHERE r.lesson_id = lesson
            AND r.resource_code = public.normalize_content_code(p->>'resource_code');
        ELSE
          SELECT aq.id INTO target
          FROM public.assessment_questions aq
          JOIN public.lesson_assessments a ON a.id = aq.assessment_id
          JOIN public.questions q ON q.id = aq.question_id
          WHERE a.assessment_code = public.normalize_content_code(p->>'assessment_code')
            AND q.code = p->>'question_code';
        END IF;
      ELSE
        RAISE EXCEPTION 'UNSUPPORTED_TEMPLATE: %', _template_key USING ERRCODE = '0A000';
    END CASE;

    IF entity_type IS NOT NULL THEN
      action := public.import_plan_row_action(entity_type, target, row_rec.row_hash);
    ELSIF target IS NULL THEN
      action := 'INSERT';
    ELSIF EXISTS (
      SELECT 1 FROM public.import_staging_rows s
      WHERE s.template_key = _template_key
        AND s.natural_key = row_rec.natural_key
        AND s.row_hash = row_rec.row_hash
        AND s.id <> row_rec.id
        AND s.applied_action IN ('INSERT','UPDATE_DRAFT','SKIP')
    ) THEN
      action := 'SKIP';
    ELSE
      action := 'UPDATE_DRAFT';
    END IF;

    IF action = 'BLOCKED_PUBLISHED' THEN
      blocked := blocked + 1;
      UPDATE public.import_staging_rows
         SET applied_action = 'BLOCKED_PUBLISHED', target_id = target
       WHERE id = row_rec.id;
      CONTINUE;
    END IF;

    IF action = 'SKIP' THEN
      skipped := skipped + 1;
      UPDATE public.import_staging_rows
         SET applied_action = 'SKIP', target_id = target, applied_at = now()
       WHERE id = row_rec.id;
      CONTINUE;
    END IF;

    CASE _template_key
      WHEN 'subjects' THEN
        IF target IS NULL THEN
          INSERT INTO public.subjects (code, slug, name, group_code, group_name, grade_id, semester, icon, color, sort_order)
          VALUES (
            p->>'subject_code',
            p->>'slug',
            p->>'name',
            NULLIF(p->>'group_code',''),
            NULLIF(p->>'group_name',''),
            (SELECT g.id FROM public.grades g WHERE g.slug = p->>'grade_slug'),
            NULLIF(p->>'semester','')::integer,
            NULLIF(p->>'icon',''),
            NULLIF(p->>'color',''),
            COALESCE(NULLIF(p->>'sort_order','')::integer, 0)
          )
          RETURNING id INTO target;
        ELSE
          UPDATE public.subjects SET
            name = p->>'name',
            -- SUBJECT_AS_BRANCH: group_code is immutable once set; only first assignment is allowed.
            group_code = COALESCE(group_code, NULLIF(p->>'group_code','')),
            group_name = CASE
              WHEN COALESCE(group_code, NULLIF(p->>'group_code','')) IS NULL THEN NULL
              ELSE COALESCE(NULLIF(p->>'group_name',''), group_name)
            END,
            semester = NULLIF(p->>'semester','')::integer,
            icon = NULLIF(p->>'icon',''),
            color = NULLIF(p->>'color',''),
            sort_order = COALESCE(NULLIF(p->>'sort_order','')::integer, sort_order)
          WHERE id = target;
        END IF;

        -- SHARED_SUBJECT (13C): availability comes from track_codes, and the
        -- import path only attaches/reactivates. Detaching stays admin-only.
        PERFORM public.import_apply_subject_track_codes(target, p->>'track_codes');

      WHEN 'units' THEN
        IF target IS NULL THEN
          INSERT INTO public.units (subject_id, code, title, description, semester, is_free, sort_order)
          VALUES (
            subject,
            p->>'unit_code',
            p->>'title',
            NULLIF(p->>'description',''),
            NULLIF(p->>'semester','')::integer,
            COALESCE((p->>'is_free')::boolean, false),
            COALESCE(NULLIF(p->>'sort_order','')::integer, 0)
          )
          RETURNING id INTO target;
        ELSE
          UPDATE public.units SET
            title = p->>'title',
            description = NULLIF(p->>'description',''),
            semester = NULLIF(p->>'semester','')::integer,
            is_free = COALESCE((p->>'is_free')::boolean, is_free),
            sort_order = COALESCE(NULLIF(p->>'sort_order','')::integer, sort_order),
            updated_at = now()
          WHERE id = target;
        END IF;

      WHEN 'lessons' THEN
        IF target IS NULL THEN
          INSERT INTO public.lessons (subject_id, unit_id, slug, title, duration, semester, is_free, sort_order)
          VALUES (
            subject,
            unit,
            p->>'lesson_code',
            p->>'title',
            NULLIF(p->>'duration',''),
            NULLIF(p->>'semester','')::integer,
            COALESCE((p->>'is_free')::boolean, false),
            COALESCE(NULLIF(p->>'sort_order','')::integer, 0)
          )
          RETURNING id INTO target;
        ELSE
          UPDATE public.lessons SET
            unit_id = COALESCE(unit, unit_id),
            title = p->>'title',
            duration = NULLIF(p->>'duration',''),
            semester = NULLIF(p->>'semester','')::integer,
            is_free = COALESCE((p->>'is_free')::boolean, is_free),
            sort_order = COALESCE(NULLIF(p->>'sort_order','')::integer, sort_order),
            updated_at = now()
          WHERE id = target;
        END IF;

      WHEN 'book_contents' THEN
        INSERT INTO public.lesson_book_contents (lesson_id, content, pdf_url)
        VALUES (lesson, NULLIF(p->>'content',''), NULLIF(p->>'pdf_url',''))
        ON CONFLICT (lesson_id) DO UPDATE
          SET content = EXCLUDED.content,
              pdf_url = EXCLUDED.pdf_url,
              updated_at = now()
        RETURNING id INTO target;

      WHEN 'explanations' THEN
        IF target IS NULL THEN
          INSERT INTO public.lesson_explanations (lesson_id, explanation_code, title, content, sort_order)
          VALUES (
            lesson,
            p->>'explanation_code',
            NULLIF(p->>'title',''),
            p->>'content',
            COALESCE(NULLIF(p->>'sort_order','')::integer, 0)
          )
          RETURNING id INTO target;
        ELSE
          UPDATE public.lesson_explanations SET
            title = NULLIF(p->>'title',''),
            content = p->>'content',
            sort_order = COALESCE(NULLIF(p->>'sort_order','')::integer, sort_order),
            updated_at = now()
          WHERE id = target;
        END IF;

      WHEN 'resources' THEN
        SELECT r.id INTO target FROM public.lesson_resources r
        WHERE r.lesson_id = lesson
          AND r.resource_code = public.normalize_content_code(p->>'resource_code');

        IF p->>'resource_url' IS NULL OR length(trim(p->>'resource_url')) = 0 THEN
          RAISE EXCEPTION 'MISSING_RESOURCE_URL: row %', row_rec.row_number USING ERRCODE = '23514';
        END IF;

        IF target IS NULL THEN
          INSERT INTO public.lesson_resources
            (lesson_id, resource_code, resource_type, title, url, description, sort_order, metadata)
          VALUES (
            lesson,
            p->>'resource_code',
            (p->>'resource_type')::public.lesson_resource_type,
            p->>'title',
            p->>'resource_url',
            NULLIF(p->>'description',''),
            COALESCE(NULLIF(p->>'sort_order','')::integer, 0),
            COALESCE(p->'metadata', '{}'::jsonb)
          )
          RETURNING id INTO target;
        ELSE
          UPDATE public.lesson_resources SET
            resource_type = (p->>'resource_type')::public.lesson_resource_type,
            title = p->>'title',
            url = p->>'resource_url',
            description = NULLIF(p->>'description',''),
            sort_order = COALESCE(NULLIF(p->>'sort_order','')::integer, sort_order),
            metadata = COALESCE(p->'metadata', '{}'::jsonb)
          WHERE id = target;
        END IF;

      WHEN 'assessments' THEN
        IF target IS NULL THEN
          INSERT INTO public.lesson_assessments (lesson_id, assessment_code, title, instructions, sort_order)
          VALUES (
            lesson,
            p->>'assessment_code',
            p->>'title',
            NULLIF(p->>'instructions',''),
            COALESCE(NULLIF(p->>'sort_order','')::integer, 0)
          )
          RETURNING id INTO target;
        ELSE
          UPDATE public.lesson_assessments SET
            title = p->>'title',
            instructions = NULLIF(p->>'instructions',''),
            sort_order = COALESCE(NULLIF(p->>'sort_order','')::integer, sort_order)
          WHERE id = target;
        END IF;

      WHEN 'assessment_questions' THEN
        INSERT INTO public.assessment_questions (assessment_id, question_id, sort_order, points)
        SELECT a.id, q.id,
               COALESCE(NULLIF(p->>'sort_order','')::integer, 0),
               COALESCE(NULLIF(p->>'points','')::numeric, 1)
        FROM public.lesson_assessments a, public.questions q
        WHERE a.assessment_code = public.normalize_content_code(p->>'assessment_code')
          AND q.code = p->>'question_code'
        ON CONFLICT (assessment_id, question_id) DO UPDATE
          SET sort_order = EXCLUDED.sort_order,
              points = EXCLUDED.points
        RETURNING id INTO target;

        IF target IS NULL THEN
          RAISE EXCEPTION 'ASSESSMENT_QUESTION_LINK_UNRESOLVED: row %', row_rec.row_number
            USING ERRCODE = '23503';
        END IF;
      ELSE
        RAISE EXCEPTION 'UNSUPPORTED_TEMPLATE: %', _template_key USING ERRCODE = '0A000';
    END CASE;

    IF entity_type IS NOT NULL AND target IS NOT NULL THEN
      PERFORM public.import_touch_review_state(entity_type, target, row_rec.row_hash);
    END IF;

    IF action = 'INSERT' THEN
      inserted := inserted + 1;
    ELSE
      updated := updated + 1;
    END IF;

    UPDATE public.import_staging_rows
       SET applied_action = action, target_id = target, applied_at = now()
     WHERE id = row_rec.id;
  END LOOP;

  UPDATE public.import_jobs
     SET execution_state = 'planned',
         inserted_count = inserted_count + inserted,
         updated_count = updated_count + updated,
         skipped_count = skipped_count + skipped,
         updated_at = now()
   WHERE id = _job_id;

  RETURN jsonb_build_object(
    'job_id', _job_id,
    'template_key', _template_key,
    'inserted', inserted,
    'updated', updated,
    'skipped', skipped,
    'blocked_published', blocked
  );
END;
$function$;
