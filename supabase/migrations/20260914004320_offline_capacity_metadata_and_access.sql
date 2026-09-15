-- Prepare HTML descriptors at write/publish time. No body, ID, or access rule is removed.
-- Stored generated columns require a table rewrite: schedule the production apply,
-- take a backup, and compare content checksums before/after. Never run a load test here.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.offline_text_metadata_v1(_body text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog AS $fn$
DECLARE
  body text := coalesce(_body, '');
  normalized text;
  leak boolean;
BEGIN
  -- ECMAScript whitespace, including NBSP and BOM. Hash the original UTF-8 bytes.
  normalized := regexp_replace(body, U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]', ' ', 'g');
  leak := normalized ~* $re$(data-answer|data-correct|correct-answer|data-rationale) *=|(?:data|aria)-(?:answer-key|correct-answer|model-answer|rationale) *=$re$
    OR normalized ~* $re$class=["'](?:[^"']*[^A-Za-z0-9_])?(?:answer-key|solution-text|teacher-note|explanation-hidden|model-answer)(?:[^A-Za-z0-9_][^"']*)?["']$re$
    OR normalized ~* $re$id=["'](?:[^"']*[^A-Za-z0-9_])?(?:answer-key|solution-text|teacher-note|model-answer)(?:[^A-Za-z0-9_][^"']*)?["']$re$
    OR normalized ~* $re$(?:class|id)=["'][^"']*(?:answer_key|correct-answer|correct_answer|solution_steps|hidden-explanation)[^"']*["']$re$;
  RETURN jsonb_build_object(
    'version', 1,
    'byteSize', octet_length(body),
    'sha256', encode(sha256(convert_to(body, 'UTF8')), 'hex'),
    'empty', btrim(normalized) = '',
    'answerLeak', leak,
    'remote', normalized ~* $re$(?:src|href) *= *["'](?:https?:)?//|url\( *["']?(?:https?:)?//|(?:^|[^A-Za-z0-9_])fetch *\( *["']https?://$re$
  );
END;
$fn$;
REVOKE ALL ON FUNCTION public.offline_text_metadata_v1(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.offline_text_metadata_v1(text) TO authenticated, service_role;

ALTER TABLE public.lesson_book_contents ADD COLUMN offline_metadata_v1 jsonb
  GENERATED ALWAYS AS (public.offline_text_metadata_v1(content)) STORED;
ALTER TABLE public.lesson_explanations ADD COLUMN offline_metadata_v1 jsonb
  GENERATED ALWAYS AS (public.offline_text_metadata_v1(content)) STORED;
ALTER TABLE public.lesson_summaries ADD COLUMN offline_metadata_v1 jsonb
  GENERATED ALWAYS AS (public.offline_text_metadata_v1(summary)) STORED;
ALTER TABLE public.lesson_resources ADD COLUMN offline_metadata_v1 jsonb
  GENERATED ALWAYS AS (public.offline_text_metadata_v1(description)) STORED;

-- An uncorrelated subject set replaces a subject/profile lookup for every lesson.
-- Existing staff ALL policy remains an OR branch, preserving editorial access.
ALTER POLICY "Lessons viewable per access" ON public.lessons
  USING (
    subject_id IN (SELECT s.id FROM public.subjects s WHERE public.can_access_subject(s.id))
    AND ((SELECT public.is_content_staff(auth.uid())) OR public.lesson_student_visible(id))
  );
ALTER POLICY "Content staff manage lessons" ON public.lessons
  USING ((SELECT public.is_content_staff(auth.uid())))
  WITH CHECK ((SELECT public.is_content_staff(auth.uid())));
ALTER POLICY "Content staff manage book contents" ON public.lesson_book_contents
  USING ((SELECT public.is_content_staff(auth.uid())))
  WITH CHECK ((SELECT public.is_content_staff(auth.uid())));
ALTER POLICY "Book content viewable per capability" ON public.lesson_book_contents
  USING (public.can_access_lesson(lesson_id) AND
    ((SELECT public.is_content_staff(auth.uid())) OR public.lesson_capability_ready(lesson_id, 'officialBookContent')));

-- INVOKER deliberately retains the lesson RLS policy. No hidden lesson metadata.
CREATE OR REPLACE FUNCTION public.lesson_student_content_gates(_lesson_ids uuid[])
RETURNS TABLE (lesson_id uuid, managed boolean, visible boolean, ready_capabilities text[])
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public, pg_temp AS $fn$
BEGIN
  IF coalesce(cardinality(_lesson_ids), 0) > 200 THEN
    RAISE EXCEPTION 'OFFLINE_GATE_BATCH_TOO_LARGE' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT g.lesson_id, g.managed, g.visible, g.ready_capabilities
    FROM public.lessons l
    CROSS JOIN LATERAL public.lesson_student_content_gate(l.id) g
    WHERE l.id = ANY(_lesson_ids);
END;
$fn$;
REVOKE ALL ON FUNCTION public.lesson_student_content_gates(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lesson_student_content_gates(uuid[]) TO authenticated;
COMMIT;
