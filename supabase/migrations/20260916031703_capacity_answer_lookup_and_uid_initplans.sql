-- CAP-03: index direct answer lookup and promote staging UID initplans.
-- Run in a transaction; fail quickly rather than waiting behind live writes.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

CREATE INDEX IF NOT EXISTS capacity_answers_session_question_id_idx
  ON public.exam_session_answers (exam_session_question_id);

-- auth.uid() is constant within a statement. An initplan avoids per-row evaluation.
-- Preserve policy names, roles, commands, ownership checks and administrator access.
ALTER POLICY "Users can view own progress" ON public.user_progress
  USING ((SELECT auth.uid()) = user_id);
ALTER POLICY "Users can insert own progress" ON public.user_progress
  WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "Users can update own progress" ON public.user_progress
  USING ((SELECT auth.uid()) = user_id);
ALTER POLICY "Admins can view all profiles" ON public.profiles
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class c ON c.oid=i.indexrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attname='exam_session_question_id'
    WHERE n.nspname='public' AND c.relname='capacity_answers_session_question_id_idx'
      AND i.indrelid='public.exam_session_answers'::regclass
      AND i.indisvalid AND i.indisready AND i.indnkeyatts=1
      AND i.indkey[0]=a.attnum AND i.indpred IS NULL
  ) THEN
    RAISE EXCEPTION 'CAPACITY_ANSWER_LOOKUP_INDEX_MISMATCH';
  END IF;
END $$;
