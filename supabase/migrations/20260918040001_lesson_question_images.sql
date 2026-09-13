-- Generated with supabase migration new lesson_question_images, ordered after the
-- repository's already-shipped future-dated self-test management migration.
-- Optional revision-owned raster stimulus; no backfill and no public storage URLs.
BEGIN;
CREATE SCHEMA IF NOT EXISTS lesson_question_private;
REVOKE ALL ON SCHEMA lesson_question_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA lesson_question_private TO authenticated, service_role;

CREATE FUNCTION lesson_question_private.valid_image(image jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE encoded text; mime text; bytes bytea;
BEGIN
  IF image IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(image) <> 'object' OR image - ARRAY['src','alt'] <> '{}'::jsonb
     OR jsonb_typeof(image->'alt') IS DISTINCT FROM 'string'
     OR char_length(btrim(image->>'alt')) NOT BETWEEN 1 AND 500
     OR jsonb_typeof(image->'src') IS DISTINCT FROM 'string'
     OR length(image->>'src') > 699084 THEN RETURN false; END IF;
  IF image->>'src' !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$' THEN RETURN false; END IF;
  mime := split_part(split_part(image->>'src', ';', 1), ':', 2);
  encoded := split_part(image->>'src', ',', 2);
  IF length(encoded) % 4 <> 0 THEN RETURN false; END IF;
  bytes := decode(encoded, 'base64');
  IF octet_length(bytes) > 524288 OR replace(encode(bytes, 'base64'), E'\n', '') <> encoded THEN RETURN false; END IF;
  RETURN CASE mime
    WHEN 'image/png' THEN substring(bytes from 1 for 8) = decode('89504e470d0a1a0a','hex')
    WHEN 'image/jpeg' THEN substring(bytes from 1 for 3) = decode('ffd8ff','hex')
    WHEN 'image/webp' THEN substring(bytes from 1 for 4) = decode('52494646','hex')
                       AND substring(bytes from 9 for 4) = decode('57454250','hex')
    ELSE false END;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION lesson_question_private.valid_image(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION lesson_question_private.valid_image(jsonb) TO authenticated, service_role;

ALTER TABLE public.question_revisions ADD COLUMN question_image jsonb
  CHECK (lesson_question_private.valid_image(question_image));

CREATE FUNCTION lesson_question_private.guard_image()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.question_image IS DISTINCT FROM OLD.question_image
     AND OLD.status NOT IN ('DRAFT','READY_FOR_REVIEW','REJECTED') THEN
    RAISE EXCEPTION 'Published question image is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION lesson_question_private.guard_image() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER question_image_immutable BEFORE UPDATE ON public.question_revisions
FOR EACH ROW EXECUTE FUNCTION lesson_question_private.guard_image();

-- Checked anchors preserve every existing identity, authorization, replay and answer guard.
DO $patch$
DECLARE src text; a text; b text; hits integer;
BEGIN
  src := pg_get_functiondef('public.golden_lesson_materialize_domain_batch(uuid,uuid,text,text,text)'::regprocedure);
  a := 'grading_mode, question_text, max_score, allow_partial,';
  b := 'grading_mode, question_text, question_image, max_score, allow_partial,';
  hits := (length(src)-length(replace(src,a,'')))/length(a);
  IF hits <> 2 THEN RAISE EXCEPTION 'QUESTION_IMAGE_INSERT_COLUMNS: %', hits; END IF;
  src := replace(src,a,b);
  a := 'public.cf10_question_text(item), 1,';
  b := 'public.cf10_question_text(item), nullif(item->''question_image'',''null''::jsonb), 1,';
  hits := (length(src)-length(replace(src,a,'')))/length(a);
  IF hits <> 2 THEN RAISE EXCEPTION 'QUESTION_IMAGE_INSERT_VALUES: %', hits; END IF;
  src := replace(src,a,b);
  a := 'OR revision_row.question_text IS DISTINCT FROM public.cf10_question_text(item)';
  b := a || E'\n         OR revision_row.question_image IS DISTINCT FROM nullif(item->''question_image'',''null''::jsonb)';
  hits := (length(src)-length(replace(src,a,'')))/length(a);
  IF hits <> 2 THEN RAISE EXCEPTION 'QUESTION_IMAGE_REPLAY: %', hits; END IF;
  EXECUTE replace(src,a,b);

  -- Optional sorted JCS member: old questions keep exactly their existing hash.
  src := pg_get_functiondef('public._qb_build_revision_canonical_jcs(uuid)'::regprocedure);
  a := $anchor$    || '"question_text":' || public._qb_json_str($anchor$;
  b := $anchor$    || CASE WHEN v_rev.question_image IS NULL THEN '' ELSE
       '"question_image":{"alt":' || public._qb_json_str(v_rev.question_image->>'alt')
       || ',"src":' || public._qb_json_str(v_rev.question_image->>'src') || '},' END
    || '"question_text":' || public._qb_json_str($anchor$;
  hits := (length(src)-length(replace(src,a,'')))/length(a);
  IF hits <> 1 THEN RAISE EXCEPTION 'QUESTION_IMAGE_HASH: %', hits; END IF;
  EXECUTE replace(src,a,b);

  -- A text/answer edit creates a revision and must carry its existing figure.
  src := pg_get_functiondef('public.lesson_self_test_question_update(uuid,uuid,text,jsonb,text,text,integer,text)'::regprocedure);
  a := 'educational_label, question_text, max_score, allow_partial, requires_media,';
  b := 'educational_label, question_text, question_image, max_score, allow_partial, requires_media,';
  hits := (length(src)-length(replace(src,a,'')))/length(a);
  IF hits <> 1 THEN RAISE EXCEPTION 'QUESTION_IMAGE_EDIT_COLUMNS: %', hits; END IF;
  src := replace(src,a,b);
  a := '''SELF_TEST'', btrim(_question_text), v_old_revision.max_score, false,';
  b := '''SELF_TEST'', btrim(_question_text), v_old_revision.question_image, v_old_revision.max_score, false,';
  hits := (length(src)-length(replace(src,a,'')))/length(a);
  IF hits <> 1 THEN RAISE EXCEPTION 'QUESTION_IMAGE_EDIT_VALUES: %', hits; END IF;
  EXECUTE replace(src,a,b);
END $patch$;

DO $patch$
DECLARE src text; a text := '''question_text'', qr.question_text,';
BEGIN
  src := pg_get_functiondef('public.lesson_self_test_questions_admin_list(uuid)'::regprocedure);
  IF (length(src)-length(replace(src,a,'')))/length(a) <> 1 THEN RAISE EXCEPTION 'QUESTION_IMAGE_ADMIN_LIST_ANCHOR'; END IF;
  EXECUTE replace(src,a,a || E'\n    ''question_image'', qr.question_image,');
END $patch$;

DO $patch$
DECLARE src text; a text; b text;
BEGIN
  src := pg_get_functiondef('public.lesson_component_publish_questions_v2(uuid,text,uuid,text,jsonb,jsonb,text,uuid)'::regprocedure);
  a := 'grading_mode,educational_label,question_text,max_score,allow_partial,requires_media,';
  b := 'grading_mode,educational_label,question_text,question_image,max_score,allow_partial,requires_media,';
  IF (length(src)-length(replace(src,a,'')))/length(a) <> 1 THEN RAISE EXCEPTION 'QUESTION_IMAGE_V2_COLUMNS_ANCHOR'; END IF;
  src := replace(src,a,b);
  a := 'v_interaction,v_grading,v_label,v_text,';
  b := 'v_interaction,v_grading,v_label,v_text,nullif(v_item->''question_image'',''null''::jsonb),';
  IF (length(src)-length(replace(src,a,'')))/length(a) <> 1 THEN RAISE EXCEPTION 'QUESTION_IMAGE_V2_VALUES_ANCHOR'; END IF;
  EXECUTE replace(src,a,b);
END $patch$;

-- Existing student RPCs remain authoritative for lesson access, READY state,
-- role separation and pinned revisions. Only the image is added to their safe rows.
CREATE FUNCTION lesson_question_private.questions_with_images(_lesson_id uuid, _kind text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RETURN '[]'::jsonb; END IF;
  IF _kind = 'official' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(q) || jsonb_build_object('question_image', r.question_image)
      ORDER BY q.sort_order, q.id), '[]'::jsonb) INTO result
    FROM public.get_lesson_official_questions(_lesson_id) q
    JOIN public.question_revisions r ON r.id = q.revision_id AND r.question_id = q.id;
  ELSIF _kind = 'self_test' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(q) || jsonb_build_object('question_image', r.question_image)
      ORDER BY q.sort_order, q.id), '[]'::jsonb) INTO result
    FROM public.get_lesson_self_test_questions(_lesson_id) q
    JOIN public.question_revisions r ON r.id = q.revision_id AND r.question_id = q.id;
  ELSE
    RAISE EXCEPTION 'Invalid question kind' USING ERRCODE='22023';
  END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION lesson_question_private.questions_with_images(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION lesson_question_private.questions_with_images(uuid,text) TO authenticated;
CREATE FUNCTION public.get_lesson_questions_with_images(_lesson_id uuid, _kind text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT lesson_question_private.questions_with_images(_lesson_id, _kind)
$$;
REVOKE ALL ON FUNCTION public.get_lesson_questions_with_images(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_lesson_questions_with_images(uuid,text) TO authenticated;

CREATE FUNCTION lesson_question_private.images_for_lessons(_lesson_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE lesson uuid; kind text; question jsonb; result jsonb := '{}'::jsonb;
BEGIN
  IF coalesce(cardinality(_lesson_ids),0) > 100 THEN RAISE EXCEPTION 'Too many lessons'; END IF;
  FOR lesson IN SELECT DISTINCT unnest(_lesson_ids) LOOP
    FOREACH kind IN ARRAY ARRAY['official','self_test'] LOOP
      FOR question IN SELECT value FROM jsonb_array_elements(lesson_question_private.questions_with_images(lesson, kind)) LOOP
        IF question->'question_image' <> 'null'::jsonb THEN
          result := result || jsonb_build_object(question->>'id', question->'question_image');
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION lesson_question_private.images_for_lessons(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION lesson_question_private.images_for_lessons(uuid[]) TO authenticated;
CREATE FUNCTION public.get_lesson_question_images(_lesson_ids uuid[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT lesson_question_private.images_for_lessons(_lesson_ids)
$$;
REVOKE ALL ON FUNCTION public.get_lesson_question_images(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_lesson_question_images(uuid[]) TO authenticated;
COMMIT;
