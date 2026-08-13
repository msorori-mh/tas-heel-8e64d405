-- QB-01 PART 2/7
-- ============================================================================
-- 7) RPC idempotency store (request-bound fingerprint)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.question_bank_rpc_idempotency (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rpc_name text NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rpc_name, actor_id, idempotency_key)
);

-- ============================================================================
-- 8) Revision-scoped children
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.question_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_revision_id uuid NOT NULL REFERENCES public.question_revisions(id) ON DELETE CASCADE,
  option_code text NOT NULL CHECK (char_length(option_code) > 0),
  body text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_correct boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_revision_id, option_code),
  UNIQUE (question_revision_id, sort_order)
);

CREATE TABLE IF NOT EXISTS public.question_accepted_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_revision_id uuid NOT NULL REFERENCES public.question_revisions(id) ON DELETE CASCADE,
  answer_text text NOT NULL,
  normalized_answer text NOT NULL,
  normalization_policy text NOT NULL DEFAULT 'TRIM_COLLAPSE'
    CHECK (normalization_policy IN ('EXACT', 'TRIM', 'TRIM_COLLAPSE')),
  is_primary boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_revision_id, sort_order, normalized_answer, normalization_policy)
);

COMMENT ON TABLE public.question_accepted_answers IS
  'Accepted-answer normalization policies: EXACT, TRIM, TRIM_COLLAPSE only. CASEFOLD_AR is not allowed in QB-01.';

CREATE TABLE IF NOT EXISTS public.question_solutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_revision_id uuid NOT NULL REFERENCES public.question_revisions(id) ON DELETE CASCADE,
  solution_code text NOT NULL,
  solution_type text NOT NULL DEFAULT 'MODEL',
  sort_order int NOT NULL DEFAULT 0,
  model_answer text,
  explanation text,
  hint text,
  common_mistakes text,
  simplified_rubric text,
  reveal_policy text NOT NULL DEFAULT 'AFTER_SUBMIT',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_revision_id, solution_code)
);

CREATE TABLE IF NOT EXISTS public.question_solution_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solution_id uuid NOT NULL REFERENCES public.question_solutions(id) ON DELETE CASCADE,
  sort_order int NOT NULL,
  step_code text NOT NULL,
  body text NOT NULL,
  UNIQUE (solution_id, sort_order),
  UNIQUE (solution_id, step_code)
);

CREATE TABLE IF NOT EXISTS public.question_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_revision_id uuid NOT NULL REFERENCES public.question_revisions(id) ON DELETE CASCADE,
  media_code text NOT NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  file_size bigint,
  sha256 text CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  alt_text_ar text NOT NULL,
  caption text,
  sort_order int NOT NULL DEFAULT 0,
  requires_media boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_revision_id, media_code),
  UNIQUE (question_revision_id, sort_order, media_code)
);

COMMENT ON TABLE public.question_media IS
  'Revision-scoped media metadata. Storage bucket question-media is NOT created in QB-01.';

-- ============================================================================
-- 8a) Canonical payload_hash (canonical_payload_v1 / JCS / SHA-256)
-- ============================================================================
CREATE OR REPLACE FUNCTION public._qb_json_str(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN p IS NULL THEN 'null' ELSE trim(both from to_json(p)::text) END;
$$;

CREATE OR REPLACE FUNCTION public._qb_json_num(p numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p IS NULL THEN 'null'
    WHEN p = trunc(p) THEN trunc(p)::bigint::text
    ELSE trim(both from to_json(p)::text)
  END;
$$;

CREATE OR REPLACE FUNCTION public._qb_build_revision_canonical_jcs(p_revision_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rev public.question_revisions%ROWTYPE;
  v_code text;
  v_options text := '';
  v_accepted text := '';
  v_solutions text := '';
  v_steps text := '';
  v_media text := '';
  v_targets text := '';
  v_first boolean;
  r record;
BEGIN
  SELECT * INTO v_rev FROM public.question_revisions WHERE id = p_revision_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision not found';
  END IF;

  SELECT q.code INTO v_code FROM public.questions q WHERE q.id = v_rev.question_id;

  v_first := true;
  FOR r IN
    SELECT option_code, body, sort_order, is_correct
    FROM public.question_options
    WHERE question_revision_id = p_revision_id
    ORDER BY option_code
  LOOP
    IF NOT v_first THEN v_options := v_options || ','; END IF;
    v_first := false;
    v_options := v_options || '{'
      || '"body":' || public._qb_json_str(replace(replace(r.body, E'\r\n', E'\n'), E'\r', E'\n'))
      || ',"is_correct":' || CASE WHEN r.is_correct THEN 'true' ELSE 'false' END
      || ',"option_code":' || public._qb_json_str(replace(replace(r.option_code, E'\r\n', E'\n'), E'\r', E'\n'))
      || ',"sort_order":' || public._qb_json_num(r.sort_order)
      || '}';
  END LOOP;

  v_first := true;
  FOR r IN
    SELECT answer_text, normalized_answer, normalization_policy, is_primary, sort_order
    FROM public.question_accepted_answers
    WHERE question_revision_id = p_revision_id
    ORDER BY sort_order, normalized_answer, normalization_policy
  LOOP
    IF NOT v_first THEN v_accepted := v_accepted || ','; END IF;
    v_first := false;
    v_accepted := v_accepted || '{'
      || '"answer_text":' || public._qb_json_str(replace(replace(r.answer_text, E'\r\n', E'\n'), E'\r', E'\n'))
      || ',"is_primary":' || CASE WHEN r.is_primary THEN 'true' ELSE 'false' END
      || ',"normalization_policy":' || public._qb_json_str(r.normalization_policy)
      || ',"normalized_answer":' || public._qb_json_str(replace(replace(r.normalized_answer, E'\r\n', E'\n'), E'\r', E'\n'))
      || ',"sort_order":' || public._qb_json_num(r.sort_order)
      || '}';
  END LOOP;

  v_first := true;
  FOR r IN
    SELECT solution_code, solution_type, sort_order, model_answer, explanation, hint,
           common_mistakes, simplified_rubric
    FROM public.question_solutions
    WHERE question_revision_id = p_revision_id
    ORDER BY solution_type, sort_order, solution_code
  LOOP
    IF NOT v_first THEN v_solutions := v_solutions || ','; END IF;
    v_first := false;
    v_solutions := v_solutions || '{'
      || '"common_mistakes":' || public._qb_json_str(
           CASE WHEN r.common_mistakes IS NULL THEN NULL
                ELSE replace(replace(r.common_mistakes, E'\r\n', E'\n'), E'\r', E'\n') END)
      || ',"explanation":' || public._qb_json_str(
           CASE WHEN r.explanation IS NULL THEN NULL
                ELSE replace(replace(r.explanation, E'\r\n', E'\n'), E'\r', E'\n') END)
      || ',"hint":' || public._qb_json_str(
           CASE WHEN r.hint IS NULL THEN NULL
                ELSE replace(replace(r.hint, E'\r\n', E'\n'), E'\r', E'\n') END)
      || ',"model_answer":' || public._qb_json_str(
           CASE WHEN r.model_answer IS NULL THEN NULL
                ELSE replace(replace(r.model_answer, E'\r\n', E'\n'), E'\r', E'\n') END)
      || ',"simplified_rubric":' || public._qb_json_str(
           CASE WHEN r.simplified_rubric IS NULL THEN NULL
                ELSE replace(replace(r.simplified_rubric, E'\r\n', E'\n'), E'\r', E'\n') END)
      || ',"solution_code":' || public._qb_json_str(replace(replace(r.solution_code, E'\r\n', E'\n'), E'\r', E'\n'))
      || ',"solution_type":' || public._qb_json_str(r.solution_type)
      || ',"sort_order":' || public._qb_json_num(r.sort_order)
      || '}';
  END LOOP;

  v_first := true;
  FOR r IN
    SELECT ss.step_code, ss.sort_order, ss.body, s.solution_code
    FROM public.question_solution_steps ss
    JOIN public.question_solutions s ON s.id = ss.solution_id
    WHERE s.question_revision_id = p_revision_id
    ORDER BY ss.sort_order, ss.step_code
  LOOP
    IF NOT v_first THEN v_steps := v_steps || ','; END IF;
    v_first := false;
    v_steps := v_steps || '{'
      || '"body":' || public._qb_json_str(replace(replace(r.body, E'\r\n', E'\n'), E'\r', E'\n'))
      || ',"solution_code":' || public._qb_json_str(replace(replace(r.solution_code, E'\r\n', E'\n'), E'\r', E'\n'))
      || ',"sort_order":' || public._qb_json_num(r.sort_order)
      || ',"step_code":' || public._qb_json_str(replace(replace(r.step_code, E'\r\n', E'\n'), E'\r', E'\n'))
      || '}';
  END LOOP;

  v_first := true;
  FOR r IN
    SELECT media_code, storage_path, mime_type, file_size, sha256, alt_text_ar, caption,
           sort_order, requires_media
    FROM public.question_media
    WHERE question_revision_id = p_revision_id
    ORDER BY sort_order, media_code
  LOOP
    IF NOT v_first THEN v_media := v_media || ','; END IF;
    v_first := false;
    v_media := v_media || '{'
      || '"alt_text_ar":' || public._qb_json_str(replace(replace(r.alt_text_ar, E'\r\n', E'\n'), E'\r', E'\n'))
      || ',"caption":' || public._qb_json_str(
           CASE WHEN r.caption IS NULL THEN NULL
                ELSE replace(replace(r.caption, E'\r\n', E'\n'), E'\r', E'\n') END)
      || ',"file_size":' || CASE WHEN r.file_size IS NULL THEN 'null' ELSE r.file_size::text END
      || ',"media_code":' || public._qb_json_str(replace(replace(r.media_code, E'\r\n', E'\n'), E'\r', E'\n'))
      || ',"mime_type":' || public._qb_json_str(r.mime_type)
      || ',"requires_media":' || CASE WHEN r.requires_media THEN 'true' ELSE 'false' END
      || ',"sha256":' || public._qb_json_str(r.sha256)
      || ',"sort_order":' || public._qb_json_num(r.sort_order)
      || ',"storage_path":' || public._qb_json_str(replace(replace(r.storage_path, E'\r\n', E'\n'), E'\r', E'\n'))
      || '}';
  END LOOP;

  v_first := true;
  FOR r IN
    SELECT is_primary, target_type,
           COALESCE(lesson_id, unit_id, subject_id)::text AS target_id
    FROM public.question_targets
    WHERE question_id = v_rev.question_id
    ORDER BY is_primary DESC, target_type, COALESCE(lesson_id, unit_id, subject_id)
  LOOP
    IF NOT v_first THEN v_targets := v_targets || ','; END IF;
    v_first := false;
    v_targets := v_targets || '{'
      || '"is_primary":' || CASE WHEN r.is_primary THEN 'true' ELSE 'false' END
      || ',"target_id":' || public._qb_json_str(r.target_id)
      || ',"target_type":' || public._qb_json_str(r.target_type)
      || '}';
  END LOOP;

  -- Key order matches JCS lexicographic sort for canonical_payload_v1.
  RETURN '{'
    || '"accepted_answers":[' || v_accepted || '],'
    || '"allow_partial":' || CASE WHEN v_rev.allow_partial THEN 'true' ELSE 'false' END || ','
    || '"grading_mode":' || public._qb_json_str(v_rev.grading_mode) || ','
    || '"interaction_type":' || public._qb_json_str(v_rev.interaction_type) || ','
    || '"max_score":' || public._qb_json_num(v_rev.max_score) || ','
    || '"media":[' || v_media || '],'
    || '"options":[' || v_options || '],'
    || '"question_code":' || public._qb_json_str(
         CASE WHEN v_code IS NULL THEN NULL
              ELSE replace(replace(v_code, E'\r\n', E'\n'), E'\r', E'\n') END) || ','
    || '"question_text":' || public._qb_json_str(
         replace(replace(v_rev.question_text, E'\r\n', E'\n'), E'\r', E'\n')) || ','
    || '"revision_number":' || public._qb_json_num(v_rev.revision_number) || ','
    || '"schema_version":' || public._qb_json_str('canonical_payload_v1') || ','
    || '"solution_steps":[' || v_steps || '],'
    || '"solutions":[' || v_solutions || '],'
    || '"stimulus_text":' || public._qb_json_str(
         CASE WHEN v_rev.stimulus_text IS NULL THEN NULL
              ELSE replace(replace(v_rev.stimulus_text, E'\r\n', E'\n'), E'\r', E'\n') END) || ','
    || '"targets":[' || v_targets || ']'
    || '}';
END;
$$;

CREATE OR REPLACE FUNCTION public._qb_compute_revision_payload_hash(p_revision_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_jcs text;
BEGIN
  v_jcs := public._qb_build_revision_canonical_jcs(p_revision_id);
  RETURN encode(sha256(convert_to(v_jcs, 'utf8')), 'hex');
END;
$$;

CREATE OR REPLACE FUNCTION public._qb_assert_revision_payload_hash(
  p_revision_id uuid,
  p_payload_hash text,
  p_payload_hash_version text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_computed text;
BEGIN
  IF p_payload_hash_version IS DISTINCT FROM 'canonical_payload_v1' THEN
    RAISE EXCEPTION 'unsupported payload_hash_version';
  END IF;
  IF p_payload_hash IS NULL OR p_payload_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'payload_hash must be 64 lowercase hex chars';
  END IF;
  v_computed := public._qb_compute_revision_payload_hash(p_revision_id);
  IF p_payload_hash IS DISTINCT FROM v_computed THEN
    RAISE EXCEPTION 'payload_hash does not match canonical revision content';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.compute_and_set_revision_payload_hash(p_revision_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_rev public.question_revisions%ROWTYPE;
  v_hash text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF NOT (
    public.is_full_admin(v_actor)
    OR public.can_edit_question_bank(v_actor)
  ) THEN
    RAISE EXCEPTION 'not authorized to edit question bank';
  END IF;

  SELECT * INTO v_rev
  FROM public.question_revisions
  WHERE id = p_revision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision not found';
  END IF;
  IF v_rev.status NOT IN ('DRAFT', 'READY_FOR_REVIEW', 'REJECTED') THEN
    RAISE EXCEPTION 'payload_hash may only be set on DRAFT/READY_FOR_REVIEW/REJECTED revisions';
  END IF;

  v_hash := public._qb_compute_revision_payload_hash(p_revision_id);

  UPDATE public.question_revisions
  SET payload_hash = v_hash,
      payload_hash_version = 'canonical_payload_v1'
  WHERE id = p_revision_id;

  RETURN jsonb_build_object(
    'success', true,
    'revision_id', p_revision_id,
    'payload_hash', v_hash,
    'payload_hash_version', 'canonical_payload_v1'
  );
END;
$$;

REVOKE ALL ON FUNCTION public._qb_json_str(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._qb_json_num(numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._qb_build_revision_canonical_jcs(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._qb_compute_revision_payload_hash(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._qb_assert_revision_payload_hash(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compute_and_set_revision_payload_hash(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_and_set_revision_payload_hash(uuid) TO authenticated;

-- ============================================================================
-- 8b) Child payload immutability for APPROVED / PUBLISHED / SUPERSEDED parents
-- ============================================================================
CREATE OR REPLACE FUNCTION public.qb_guard_revision_children_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_status text;
  v_new_status text;
BEGIN
  -- Parent FK is immutable after INSERT (no reparenting, including Draft→Draft).
  IF TG_OP = 'UPDATE'
     AND NEW.question_revision_id IS DISTINCT FROM OLD.question_revision_id THEN
    RAISE EXCEPTION 'cannot reparent child rows; question_revision_id is immutable after insert';
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT status INTO v_old_status
    FROM public.question_revisions
    WHERE id = OLD.question_revision_id;

    IF v_old_status IN ('APPROVED', 'PUBLISHED', 'SUPERSEDED') THEN
      RAISE EXCEPTION
        'cannot % child rows of % revision (payload frozen)',
        TG_OP, v_old_status;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT status INTO v_new_status
    FROM public.question_revisions
    WHERE id = NEW.question_revision_id;

    IF v_new_status IN ('APPROVED', 'PUBLISHED', 'SUPERSEDED') THEN
      RAISE EXCEPTION
        'cannot % child rows of % revision (payload frozen)',
        TG_OP, v_new_status;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.qb_guard_revision_children_immutable() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_qb_options_immutable ON public.question_options;
CREATE TRIGGER trg_qb_options_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.question_options
  FOR EACH ROW EXECUTE FUNCTION public.qb_guard_revision_children_immutable();

DROP TRIGGER IF EXISTS trg_qb_accepted_immutable ON public.question_accepted_answers;
CREATE TRIGGER trg_qb_accepted_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.question_accepted_answers
  FOR EACH ROW EXECUTE FUNCTION public.qb_guard_revision_children_immutable();

DROP TRIGGER IF EXISTS trg_qb_solutions_immutable ON public.question_solutions;
CREATE TRIGGER trg_qb_solutions_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.question_solutions
  FOR EACH ROW EXECUTE FUNCTION public.qb_guard_revision_children_immutable();

CREATE OR REPLACE FUNCTION public.qb_guard_solution_steps_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_status text;
  v_new_status text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.solution_id IS DISTINCT FROM OLD.solution_id THEN
    RAISE EXCEPTION 'cannot reparent solution steps; solution_id is immutable after insert';
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT qr.status INTO v_old_status
    FROM public.question_solutions qs
    JOIN public.question_revisions qr ON qr.id = qs.question_revision_id
    WHERE qs.id = OLD.solution_id;

    IF v_old_status IN ('APPROVED', 'PUBLISHED', 'SUPERSEDED') THEN
      RAISE EXCEPTION
        'cannot % solution steps of % revision (payload frozen)',
        TG_OP, v_old_status;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT qr.status INTO v_new_status
    FROM public.question_solutions qs
    JOIN public.question_revisions qr ON qr.id = qs.question_revision_id
    WHERE qs.id = NEW.solution_id;

    IF v_new_status IN ('APPROVED', 'PUBLISHED', 'SUPERSEDED') THEN
      RAISE EXCEPTION
        'cannot % solution steps of % revision (payload frozen)',
        TG_OP, v_new_status;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.qb_guard_solution_steps_immutable() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_qb_solution_steps_immutable ON public.question_solution_steps;
CREATE TRIGGER trg_qb_solution_steps_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.question_solution_steps
  FOR EACH ROW EXECUTE FUNCTION public.qb_guard_solution_steps_immutable();

DROP TRIGGER IF EXISTS trg_qb_media_immutable ON public.question_media;
CREATE TRIGGER trg_qb_media_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON public.question_media
  FOR EACH ROW EXECUTE FUNCTION public.qb_guard_revision_children_immutable();