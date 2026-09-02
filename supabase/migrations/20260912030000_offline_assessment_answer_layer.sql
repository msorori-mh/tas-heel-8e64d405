-- OFFLINE-05 — service-only, revision-pinned answer layer for verified subject packs.
--
-- This function is intentionally unavailable to browser roles. The application
-- server first resolves the student's safe question list through the existing
-- lesson RPC, then asks this function only for those exact published revisions.

DO $offline_pgcrypto$
BEGIN
  IF to_regprocedure('extensions.digest(bytea,text)') IS NULL THEN
    RAISE EXCEPTION 'OFFLINE_PGCRYPTO_DIGEST_MISSING';
  END IF;
END
$offline_pgcrypto$;

CREATE OR REPLACE FUNCTION public.get_offline_assessment_answer_layer(
  _lesson_id uuid,
  _kind text,
  _revision_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  expected_label text;
  matched_revision_count integer;
  result jsonb;
BEGIN
  IF _lesson_id IS NULL
     OR _kind NOT IN ('official-questions', 'self-test')
     OR _revision_ids IS NULL
     OR cardinality(_revision_ids) < 1
     OR cardinality(_revision_ids) > 500 THEN
    RAISE EXCEPTION 'OFFLINE_ASSESSMENT_REQUEST_INVALID' USING ERRCODE = '22023';
  END IF;

  expected_label := CASE _kind
    WHEN 'official-questions' THEN 'OFFICIAL_BOOK_QUESTION'
    ELSE 'SELF_TEST'
  END;

  SELECT count(*) INTO matched_revision_count
  FROM public.question_revisions r
  JOIN public.questions q
    ON q.id = r.question_id
   AND q.lesson_id = _lesson_id
   AND q.current_published_revision_id = r.id
  WHERE r.id = ANY (_revision_ids)
    AND r.status = 'PUBLISHED'
    AND r.educational_label = expected_label;

  IF matched_revision_count <> cardinality(_revision_ids) THEN
    RAISE EXCEPTION 'OFFLINE_ASSESSMENT_REVISION_BINDING_FAILED' USING ERRCODE = '42501';
  END IF;

  WITH selected_revisions AS (
    SELECT r.id, r.question_id
    FROM public.question_revisions r
    JOIN public.questions q
      ON q.id = r.question_id
     AND q.lesson_id = _lesson_id
     AND q.current_published_revision_id = r.id
    WHERE r.id = ANY (_revision_ids)
      AND r.status = 'PUBLISHED'
      AND r.educational_label = expected_label
  )
  SELECT jsonb_build_object(
    'options', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'revisionId', o.question_revision_id,
          'optionId', o.option_code,
          'isCorrect', o.is_correct,
          'sortOrder', o.sort_order
        ) ORDER BY o.question_revision_id, o.sort_order, o.option_code
      )
      FROM public.question_options o
      JOIN selected_revisions r ON r.id = o.question_revision_id
    ), '[]'::jsonb),
    'answers', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'questionId', a.question_id,
          'revisionId', a.revision_id,
          'modelAnswer', a.model_answer,
          'explanation', a.explanation,
          'updatedAt', a.updated_at
        ) ORDER BY a.revision_id
      )
      FROM public.official_question_answers a
      JOIN selected_revisions r
        ON r.id = a.revision_id
       AND r.question_id = a.question_id
    ), '[]'::jsonb),
    'rationales', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'questionId', x.question_id,
          'revisionId', x.question_revision_id,
          'optionId', o.option_code,
          'whyCorrect', x.why_correct,
          'whyWrong', x.why_wrong,
          'updatedAt', x.updated_at
        ) ORDER BY x.question_revision_id, o.sort_order, o.option_code
      )
      FROM public.question_option_rationales x
      JOIN selected_revisions r
        ON r.id = x.question_revision_id
       AND r.question_id = x.question_id
      JOIN public.question_options o
        ON o.option_code = x.option_id
       AND o.question_revision_id = x.question_revision_id
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_offline_assessment_answer_layer(uuid, text, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_offline_assessment_answer_layer(uuid, text, uuid[])
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_offline_assessment_answer_layer(uuid, text, uuid[])
  TO service_role;

COMMENT ON FUNCTION public.get_offline_assessment_answer_layer(uuid, text, uuid[]) IS
  'Service-only answer material for authenticated, content-addressed offline packs. Browser roles have no EXECUTE grant.';

-- Durable replay ledger. There are deliberately no client table grants or RLS
-- policies; students can only submit their own mutation through the RPC below.
CREATE TABLE IF NOT EXISTS public.offline_learning_mutations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 16 AND 160),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  mutation_kind text NOT NULL CHECK (
    mutation_kind IN ('lesson-progress', 'lesson-completion', 'official-question-note')
  ),
  entity_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  applied boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS offline_learning_mutations_entity_clock_idx
  ON public.offline_learning_mutations (
    user_id, mutation_kind, entity_id, occurred_at DESC
  )
  WHERE applied = true;

-- Partial lesson progress is not a quiz result. Keep it in its own bounded
-- column so an offline resume point can never overwrite a real assessment
-- score in user_progress.quiz_score.
ALTER TABLE public.user_progress
  ADD COLUMN IF NOT EXISTS progress_percent integer
  CHECK (progress_percent BETWEEN 0 AND 100);

ALTER TABLE public.offline_learning_mutations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.offline_learning_mutations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.offline_learning_mutations TO service_role;

CREATE OR REPLACE FUNCTION public.apply_offline_learning_mutation(
  _idempotency_key text,
  _kind text,
  _entity_id uuid,
  _lesson_id uuid,
  _occurred_at timestamptz,
  _progress_percent numeric,
  _answer_text text,
  _payload_sha256 text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_id uuid := auth.uid();
  existing public.offline_learning_mutations%ROWTYPE;
  effective_occurred_at timestamptz;
  latest_offline_at timestamptz;
  server_payload_sha256 text;
  affected integer := 0;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'OFFLINE_SYNC_UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;
  IF _idempotency_key IS NULL
     OR char_length(_idempotency_key) NOT BETWEEN 16 AND 160
     OR _kind IS NULL
     OR _kind NOT IN ('lesson-progress', 'lesson-completion', 'official-question-note')
     OR _entity_id IS NULL
     OR _occurred_at IS NULL
     OR _payload_sha256 IS NULL
     OR _payload_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'OFFLINE_SYNC_REQUEST_INVALID' USING ERRCODE = '22023';
  END IF;
  IF _kind = 'official-question-note' AND (
    _lesson_id IS NULL OR _answer_text IS NULL OR char_length(_answer_text) > 64000
  ) THEN
    RAISE EXCEPTION 'OFFLINE_SYNC_NOTE_INVALID' USING ERRCODE = '22023';
  END IF;
  IF _kind = 'lesson-progress' AND (
    _lesson_id IS NOT NULL OR _answer_text IS NOT NULL
    OR _progress_percent IS NULL OR _progress_percent < 0 OR _progress_percent > 100
  ) THEN
    RAISE EXCEPTION 'OFFLINE_SYNC_PROGRESS_INVALID' USING ERRCODE = '22023';
  END IF;
  IF _kind = 'lesson-completion' AND (
    _lesson_id IS NOT NULL OR _answer_text IS NOT NULL OR _progress_percent IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'OFFLINE_SYNC_COMPLETION_INVALID' USING ERRCODE = '22023';
  END IF;

  IF _kind IN ('lesson-progress', 'lesson-completion')
     AND public.can_access_lesson(_entity_id) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'OFFLINE_SYNC_LESSON_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;

  IF _kind = 'official-question-note' AND (
    public.can_access_lesson(_lesson_id) IS DISTINCT FROM true
    OR NOT EXISTS (
      SELECT 1
      FROM public.questions q
      JOIN public.question_revisions r
        ON r.id = q.current_published_revision_id
      WHERE q.id = _entity_id
        AND q.lesson_id = _lesson_id
        AND r.status = 'PUBLISHED'
        AND r.educational_label = 'OFFICIAL_BOOK_QUESTION'
    )
  ) THEN
    RAISE EXCEPTION 'OFFLINE_SYNC_QUESTION_BINDING_DENIED' USING ERRCODE = '42501';
  END IF;

  -- Never trust the client-supplied digest for replay conflict detection.
  server_payload_sha256 := encode(extensions.digest(convert_to(
    jsonb_build_array(
      _kind, _entity_id, _lesson_id, _occurred_at,
      _progress_percent, _answer_text
    )::text,
    'UTF8'
  ), 'sha256'), 'hex');

  -- Serializes competing deliveries of the same account/key before conflict checks.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(actor_id::text || ':' || _idempotency_key, 0)
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended(actor_id::text || ':' || _kind || ':' || _entity_id::text, 0)
  );
  SELECT * INTO existing
  FROM public.offline_learning_mutations
  WHERE user_id = actor_id AND idempotency_key = _idempotency_key;
  IF FOUND THEN
    IF existing.payload_sha256 IS DISTINCT FROM server_payload_sha256 THEN
      RAISE EXCEPTION 'OFFLINE_SYNC_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('replayed', true, 'applied', existing.applied);
  END IF;

  -- A future-skewed device clock must not poison ordering indefinitely.
  effective_occurred_at := LEAST(_occurred_at, now());

  -- Destination triggers replace updated_at with server time. Once an entity
  -- has entered this ledger, the ledger is therefore its logical clock. For
  -- the first delivery after rollout, retain the destination timestamp guard
  -- so an old queued edit cannot replace a newer pre-ledger server write.
  SELECT max(occurred_at) INTO latest_offline_at
  FROM public.offline_learning_mutations
  WHERE user_id = actor_id
    AND mutation_kind = _kind
    AND entity_id = _entity_id
    AND applied = true;

  IF latest_offline_at IS NOT NULL AND latest_offline_at > effective_occurred_at THEN
    affected := 0;
  ELSIF _kind = 'official-question-note' THEN
    INSERT INTO public.lesson_question_notes (
      student_id, lesson_id, question_id, answer_text, updated_at
    ) VALUES (
      actor_id, _lesson_id, _entity_id, _answer_text, effective_occurred_at
    )
    ON CONFLICT (student_id, question_id) DO UPDATE
      SET lesson_id = EXCLUDED.lesson_id,
          answer_text = EXCLUDED.answer_text,
          updated_at = EXCLUDED.updated_at
      WHERE latest_offline_at IS NOT NULL
         OR public.lesson_question_notes.updated_at <= EXCLUDED.updated_at;
    GET DIAGNOSTICS affected = ROW_COUNT;
  ELSIF _kind = 'lesson-progress' THEN
    INSERT INTO public.user_progress (user_id, lesson_id, progress_percent, updated_at)
    VALUES (actor_id, _entity_id, round(_progress_percent)::integer, effective_occurred_at)
    ON CONFLICT (user_id, lesson_id) DO UPDATE
      SET progress_percent = EXCLUDED.progress_percent,
          updated_at = EXCLUDED.updated_at
      WHERE latest_offline_at IS NOT NULL
         OR public.user_progress.updated_at <= EXCLUDED.updated_at;
    GET DIAGNOSTICS affected = ROW_COUNT;
  ELSE
    INSERT INTO public.user_progress (
      user_id, lesson_id, completed, completed_at, updated_at
    ) VALUES (
      actor_id, _entity_id, true, effective_occurred_at, effective_occurred_at
    )
    ON CONFLICT (user_id, lesson_id) DO UPDATE
      SET completed = true,
          completed_at = COALESCE(public.user_progress.completed_at, EXCLUDED.completed_at),
          updated_at = GREATEST(public.user_progress.updated_at, EXCLUDED.updated_at);
    GET DIAGNOSTICS affected = ROW_COUNT;
  END IF;

  INSERT INTO public.offline_learning_mutations (
    user_id, idempotency_key, payload_sha256, mutation_kind,
    entity_id, occurred_at, applied
  ) VALUES (
    actor_id, _idempotency_key, server_payload_sha256, _kind,
    _entity_id, effective_occurred_at, affected > 0
  );

  RETURN jsonb_build_object('replayed', false, 'applied', affected > 0);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_offline_learning_mutation(
  text, text, uuid, uuid, timestamptz, numeric, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_offline_learning_mutation(
  text, text, uuid, uuid, timestamptz, numeric, text, text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.apply_offline_learning_mutation(
  text, text, uuid, uuid, timestamptz, numeric, text, text
) IS 'Applies one authenticated offline learning mutation exactly once without overwriting newer server state.';
