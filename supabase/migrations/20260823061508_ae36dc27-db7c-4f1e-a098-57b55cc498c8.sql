DO $migration$
DECLARE
  fn_oid oid;
  fn_sql text;
  old_block text := $old$
  -- Lesson: created only when absent. An existing lesson must match the manifest exactly.
  IF lesson_row.id IS NULL THEN
    INSERT INTO public.lessons(subject_id, slug, title, unit_id, is_free, semester, sort_order)
    VALUES (subject_row.id, btrim(ident->>'lessonSlug'), expected_title,
            NULL, true, expected_semester, expected_sort)
    RETURNING * INTO lesson_row;
    GET DIAGNOSTICS rc = ROW_COUNT;
    lesson_created := true;
    domain_writes := domain_writes + rc;
  ELSE
    IF lesson_row.subject_id IS DISTINCT FROM subject_row.id
       OR lesson_row.title IS DISTINCT FROM expected_title
       OR lesson_row.unit_id IS NOT NULL
       OR lesson_row.is_free IS DISTINCT FROM true
       OR lesson_row.semester IS DISTINCT FROM expected_semester
       OR lesson_row.sort_order IS DISTINCT FROM expected_sort THEN
      RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: lessons %', lesson_row.slug USING ERRCODE = '23514';
    END IF;
  END IF;
$old$;
  new_block text := $new$
  -- Lesson identity is authoritative from the CF09 binding. A bound EXECUTE targets an
  -- existing lesson shell and must never overwrite or reject its operational metadata
  -- (title, unit placement, free flag, semester or sort order). Identity remains strict:
  -- binding.lesson_id, subject_id and slug were all verified above.
  IF lesson_row.id IS NULL THEN
    INSERT INTO public.lessons(subject_id, slug, title, unit_id, is_free, semester, sort_order)
    VALUES (subject_row.id, btrim(ident->>'lessonSlug'), expected_title,
            NULL, true, expected_semester, expected_sort)
    RETURNING * INTO lesson_row;
    GET DIAGNOSTICS rc = ROW_COUNT;
    lesson_created := true;
    domain_writes := domain_writes + rc;
  ELSIF binding_count = 0 THEN
    -- Unbound DRY_RUN / fixture compatibility keeps the legacy exact-match assertion.
    IF lesson_row.subject_id IS DISTINCT FROM subject_row.id
       OR lesson_row.title IS DISTINCT FROM expected_title
       OR lesson_row.unit_id IS NOT NULL
       OR lesson_row.is_free IS DISTINCT FROM true
       OR lesson_row.semester IS DISTINCT FROM expected_semester
       OR lesson_row.sort_order IS DISTINCT FROM expected_sort THEN
      RAISE EXCEPTION 'CF10_IDENTITY_CONFLICT: lessons %', lesson_row.slug USING ERRCODE = '23514';
    END IF;
  END IF;
$new$;
BEGIN
  SELECT p.oid INTO fn_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'golden_lesson_materialize_domain_batch'
    AND pg_get_function_identity_arguments(p.oid) = '_batch_id uuid, _actor_id uuid, _mode text, _expected_plan_sha256 text, _idempotency_key text';

  IF fn_oid IS NULL THEN
    RAISE EXCEPTION 'CF10_FUNCTION_NOT_FOUND';
  END IF;

  fn_sql := pg_get_functiondef(fn_oid);
  IF strpos(fn_sql, old_block) = 0 THEN
    RAISE EXCEPTION 'CF10_PATCH_ANCHOR_NOT_FOUND';
  END IF;

  fn_sql := replace(fn_sql, old_block, new_block);
  EXECUTE fn_sql;
END
$migration$;

COMMENT ON FUNCTION public.golden_lesson_materialize_domain_batch(uuid, uuid, text, text, text) IS
'CF10 materialization: CF09 binding owns immutable lesson identity; existing lesson operational metadata is preserved and does not cause identity conflicts.';