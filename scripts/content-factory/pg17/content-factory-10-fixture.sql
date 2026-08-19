-- CF10 PG17 fixture: domain surface mirroring production natural keys, constraints and triggers.
ALTER TABLE public.lessons ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.lessons ADD COLUMN title text NOT NULL DEFAULT 'درس';
ALTER TABLE public.lessons ADD COLUMN is_free boolean DEFAULT false;
ALTER TABLE public.lessons ADD COLUMN semester integer;
ALTER TABLE public.lessons ADD COLUMN delivery_mode text NOT NULL DEFAULT 'in_app_content';
ALTER TABLE public.lessons ADD COLUMN sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE public.lessons ADD CONSTRAINT lessons_subject_id_slug_key UNIQUE (subject_id, slug);


CREATE TABLE public.lesson_book_contents(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL UNIQUE REFERENCES public.lessons(id),
  content text, pdf_url text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.lesson_explanations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id),
  title text, content text NOT NULL, sort_order integer NOT NULL DEFAULT 0,
  explanation_code text, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX lesson_explanations_code_lesson_uniq
  ON public.lesson_explanations(lesson_id, explanation_code) WHERE explanation_code IS NOT NULL;

CREATE TABLE public.lesson_summaries(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL UNIQUE REFERENCES public.lessons(id),
  summary text NOT NULL, key_points jsonb NOT NULL DEFAULT '[]'::jsonb, study_tip text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TYPE public.lesson_resource_type AS ENUM ('video','mindmap','experiment','pdf','link');
CREATE TABLE public.lesson_resources(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id),
  resource_type public.lesson_resource_type NOT NULL, title text NOT NULL, url text NOT NULL,
  description text, sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
  resource_code text, html_resource_type text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_primary boolean NOT NULL DEFAULT false);
CREATE UNIQUE INDEX idx_lesson_resources_code_per_lesson
  ON public.lesson_resources(lesson_id, resource_code) WHERE resource_code IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Question Bank surface: mirrors production constraints, indexes, deferred FK,
-- lifecycle guards and the canonical payload-hash contract verbatim.
-- ---------------------------------------------------------------------------
CREATE TABLE public.questions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid REFERENCES public.lessons(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE CASCADE,
  question_text text NOT NULL, options jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct_index integer NOT NULL, explanation text, question_type text DEFAULT 'lesson', year integer,
  sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
  unit text, semester integer, code text, created_by uuid,
  archived_at timestamptz, archived_by uuid, current_published_revision_id uuid);
CREATE UNIQUE INDEX questions_code_uniq ON public.questions(code) WHERE code IS NOT NULL;

CREATE TABLE public.question_revisions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  revision_number integer NOT NULL CHECK (revision_number > 0),
  status text NOT NULL CHECK (status = ANY (ARRAY['DRAFT','READY_FOR_REVIEW','APPROVED','PUBLISHED','SUPERSEDED','REJECTED'])),
  interaction_type text NOT NULL,
  grading_mode text CHECK (grading_mode IS NULL OR grading_mode = ANY (ARRAY['AUTO_SINGLE','AUTO_TEXT','MANUAL'])),
  educational_label text,
  question_text text NOT NULL, stimulus_text text,
  max_score numeric NOT NULL DEFAULT 1 CHECK (max_score > 0),
  allow_partial boolean NOT NULL DEFAULT false, requires_media boolean NOT NULL DEFAULT false,
  manual_grading_required boolean NOT NULL DEFAULT false,
  payload_hash text,
  payload_hash_version text NOT NULL DEFAULT 'canonical_payload_v1',
  source_payload_hash text, backfill_version text,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid,
  reviewed_at timestamptz, reviewed_by uuid,
  published_at timestamptz, published_by uuid, superseded_at timestamptz,
  rejected_at timestamptz, rejected_by uuid, rejection_reason text,
  UNIQUE (question_id, revision_number),
  UNIQUE (question_id, id), UNIQUE (id, question_id),
  CHECK (payload_hash IS NULL OR (payload_hash_version IS NOT NULL AND payload_hash ~ '^[0-9a-f]{64}$')),
  CHECK (status <> 'PUBLISHED' OR (published_at IS NOT NULL AND published_by IS NOT NULL AND payload_hash IS NOT NULL)),
  CHECK (status <> 'REJECTED' OR (rejected_at IS NOT NULL AND rejected_by IS NOT NULL AND rejection_reason IS NOT NULL)));
CREATE UNIQUE INDEX question_revisions_one_published_uidx
  ON public.question_revisions(question_id) WHERE status = 'PUBLISHED';
ALTER TABLE public.questions ADD CONSTRAINT questions_current_published_revision_fk
  FOREIGN KEY (id, current_published_revision_id)
  REFERENCES public.question_revisions(question_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE public.question_options(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_revision_id uuid NOT NULL REFERENCES public.question_revisions(id) ON DELETE CASCADE,
  option_code text NOT NULL CHECK (char_length(option_code) > 0),
  body text NOT NULL, sort_order integer NOT NULL DEFAULT 0,
  is_correct boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_revision_id, option_code), UNIQUE (question_revision_id, sort_order));

CREATE TABLE public.question_targets(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type = ANY (ARRAY['SUBJECT','UNIT','LESSON'])),
  subject_id uuid REFERENCES public.subjects(id) ON DELETE CASCADE,
  unit_id uuid, lesson_id uuid REFERENCES public.lessons(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false, created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  revision_id uuid NOT NULL,
  CONSTRAINT question_targets_revision_question_fk FOREIGN KEY (revision_id, question_id)
    REFERENCES public.question_revisions(id, question_id) ON DELETE CASCADE,
  CONSTRAINT question_targets_shape_chk CHECK (
    (target_type = 'SUBJECT' AND subject_id IS NOT NULL AND unit_id IS NULL AND lesson_id IS NULL)
    OR (target_type = 'UNIT' AND subject_id IS NOT NULL AND unit_id IS NOT NULL AND lesson_id IS NULL)
    OR (target_type = 'LESSON' AND subject_id IS NOT NULL AND lesson_id IS NOT NULL)));

-- Auxiliary revision children read by the canonical JCS builder (kept empty by CF10).
CREATE TABLE public.question_accepted_answers(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_revision_id uuid NOT NULL REFERENCES public.question_revisions(id) ON DELETE CASCADE,
  answer_text text NOT NULL, normalized_answer text NOT NULL, normalization_policy text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false, sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.question_solutions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_revision_id uuid NOT NULL REFERENCES public.question_revisions(id) ON DELETE CASCADE,
  solution_code text NOT NULL, solution_type text NOT NULL, sort_order integer NOT NULL DEFAULT 0,
  model_answer text, explanation text, hint text, common_mistakes text, simplified_rubric text,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.question_solution_steps(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solution_id uuid NOT NULL REFERENCES public.question_solutions(id) ON DELETE CASCADE,
  step_code text NOT NULL, sort_order integer NOT NULL DEFAULT 0, body text NOT NULL);
CREATE TABLE public.question_media(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_revision_id uuid NOT NULL REFERENCES public.question_revisions(id) ON DELETE CASCADE,
  media_code text NOT NULL, storage_path text NOT NULL, mime_type text NOT NULL,
  file_size bigint, sha256 text NOT NULL, alt_text_ar text NOT NULL, caption text,
  sort_order integer NOT NULL DEFAULT 0, requires_media boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.official_question_answers(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  model_answer text, explanation text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, revision_id),
  CONSTRAINT official_question_answers_revision_fk FOREIGN KEY (question_id, revision_id)
    REFERENCES public.question_revisions(question_id, id) ON DELETE RESTRICT);

CREATE TABLE public.question_option_rationales(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL,
  question_revision_id uuid NOT NULL,
  option_id text NOT NULL, why_correct text, why_wrong text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_revision_id, option_id),
  CHECK (why_correct IS NOT NULL OR why_wrong IS NOT NULL),
  CONSTRAINT question_option_rationales_revision_fk FOREIGN KEY (question_id, question_revision_id)
    REFERENCES public.question_revisions(question_id, id) ON DELETE RESTRICT);

-- Canonical payload-hash contract (verbatim production definitions).
CREATE OR REPLACE FUNCTION public._qb_json_num(p numeric) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p IS NULL THEN 'null' WHEN p = trunc(p) THEN trunc(p)::bigint::text
              ELSE trim(both from to_json(p)::text) END;
$$;
CREATE OR REPLACE FUNCTION public._qb_json_str(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p IS NULL THEN 'null' ELSE trim(both from to_json(p)::text) END;
$$;

CREATE OR REPLACE FUNCTION public._qb_build_revision_canonical_jcs(p_revision_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE
  v_rev public.question_revisions%ROWTYPE;
  v_code text; v_options text := ''; v_accepted text := ''; v_solutions text := '';
  v_steps text := ''; v_media text := ''; v_targets text := ''; v_first boolean; r record;
BEGIN
  SELECT * INTO v_rev FROM public.question_revisions WHERE id = p_revision_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'revision not found'; END IF;
  SELECT q.code INTO v_code FROM public.questions q WHERE q.id = v_rev.question_id;

  v_first := true;
  FOR r IN SELECT option_code, body, sort_order, is_correct FROM public.question_options
            WHERE question_revision_id = p_revision_id ORDER BY option_code LOOP
    IF NOT v_first THEN v_options := v_options || ','; END IF; v_first := false;
    v_options := v_options || '{'
      || '"body":' || public._qb_json_str(replace(replace(r.body, E'\r\n', E'\n'), E'\r', E'\n'))
      || ',"is_correct":' || CASE WHEN r.is_correct THEN 'true' ELSE 'false' END
      || ',"option_code":' || public._qb_json_str(replace(replace(r.option_code, E'\r\n', E'\n'), E'\r', E'\n'))
      || ',"sort_order":' || public._qb_json_num(r.sort_order) || '}';
  END LOOP;

  v_first := true;
  FOR r IN SELECT answer_text, normalized_answer, normalization_policy, is_primary, sort_order
             FROM public.question_accepted_answers WHERE question_revision_id = p_revision_id
            ORDER BY sort_order, normalized_answer, normalization_policy LOOP
    IF NOT v_first THEN v_accepted := v_accepted || ','; END IF; v_first := false;
    v_accepted := v_accepted || '{'
      || '"answer_text":' || public._qb_json_str(r.answer_text)
      || ',"is_primary":' || CASE WHEN r.is_primary THEN 'true' ELSE 'false' END
      || ',"normalization_policy":' || public._qb_json_str(r.normalization_policy)
      || ',"normalized_answer":' || public._qb_json_str(r.normalized_answer)
      || ',"sort_order":' || public._qb_json_num(r.sort_order) || '}';
  END LOOP;

  v_first := true;
  FOR r IN SELECT solution_code, solution_type, sort_order, model_answer, explanation, hint,
                  common_mistakes, simplified_rubric
             FROM public.question_solutions WHERE question_revision_id = p_revision_id
            ORDER BY solution_type, sort_order, solution_code LOOP
    IF NOT v_first THEN v_solutions := v_solutions || ','; END IF; v_first := false;
    v_solutions := v_solutions || '{'
      || '"common_mistakes":' || public._qb_json_str(r.common_mistakes)
      || ',"explanation":' || public._qb_json_str(r.explanation)
      || ',"hint":' || public._qb_json_str(r.hint)
      || ',"model_answer":' || public._qb_json_str(r.model_answer)
      || ',"simplified_rubric":' || public._qb_json_str(r.simplified_rubric)
      || ',"solution_code":' || public._qb_json_str(r.solution_code)
      || ',"solution_type":' || public._qb_json_str(r.solution_type)
      || ',"sort_order":' || public._qb_json_num(r.sort_order) || '}';
  END LOOP;

  v_first := true;
  FOR r IN SELECT ss.step_code, ss.sort_order, ss.body, s.solution_code
             FROM public.question_solution_steps ss
             JOIN public.question_solutions s ON s.id = ss.solution_id
            WHERE s.question_revision_id = p_revision_id ORDER BY ss.sort_order, ss.step_code LOOP
    IF NOT v_first THEN v_steps := v_steps || ','; END IF; v_first := false;
    v_steps := v_steps || '{'
      || '"body":' || public._qb_json_str(r.body)
      || ',"solution_code":' || public._qb_json_str(r.solution_code)
      || ',"sort_order":' || public._qb_json_num(r.sort_order)
      || ',"step_code":' || public._qb_json_str(r.step_code) || '}';
  END LOOP;

  v_first := true;
  FOR r IN SELECT media_code, storage_path, mime_type, file_size, sha256, alt_text_ar, caption,
                  sort_order, requires_media
             FROM public.question_media WHERE question_revision_id = p_revision_id
            ORDER BY sort_order, media_code LOOP
    IF NOT v_first THEN v_media := v_media || ','; END IF; v_first := false;
    v_media := v_media || '{'
      || '"alt_text_ar":' || public._qb_json_str(r.alt_text_ar)
      || ',"caption":' || public._qb_json_str(r.caption)
      || ',"file_size":' || CASE WHEN r.file_size IS NULL THEN 'null' ELSE r.file_size::text END
      || ',"media_code":' || public._qb_json_str(r.media_code)
      || ',"mime_type":' || public._qb_json_str(r.mime_type)
      || ',"requires_media":' || CASE WHEN r.requires_media THEN 'true' ELSE 'false' END
      || ',"sha256":' || public._qb_json_str(r.sha256)
      || ',"sort_order":' || public._qb_json_num(r.sort_order)
      || ',"storage_path":' || public._qb_json_str(r.storage_path) || '}';
  END LOOP;

  v_first := true;
  FOR r IN SELECT is_primary, target_type, COALESCE(lesson_id, unit_id, subject_id)::text AS target_id
             FROM public.question_targets WHERE question_id = v_rev.question_id
            ORDER BY is_primary DESC, target_type, COALESCE(lesson_id, unit_id, subject_id) LOOP
    IF NOT v_first THEN v_targets := v_targets || ','; END IF; v_first := false;
    v_targets := v_targets || '{'
      || '"is_primary":' || CASE WHEN r.is_primary THEN 'true' ELSE 'false' END
      || ',"target_id":' || public._qb_json_str(r.target_id)
      || ',"target_type":' || public._qb_json_str(r.target_type) || '}';
  END LOOP;

  RETURN '{'
    || '"accepted_answers":[' || v_accepted || '],'
    || '"allow_partial":' || CASE WHEN v_rev.allow_partial THEN 'true' ELSE 'false' END || ','
    || '"grading_mode":' || public._qb_json_str(v_rev.grading_mode) || ','
    || '"interaction_type":' || public._qb_json_str(v_rev.interaction_type) || ','
    || '"max_score":' || public._qb_json_num(v_rev.max_score) || ','
    || '"media":[' || v_media || '],'
    || '"options":[' || v_options || '],'
    || '"question_code":' || public._qb_json_str(v_code) || ','
    || '"question_text":' || public._qb_json_str(v_rev.question_text) || ','
    || '"revision_number":' || public._qb_json_num(v_rev.revision_number) || ','
    || '"schema_version":' || public._qb_json_str('canonical_payload_v1') || ','
    || '"solution_steps":[' || v_steps || '],'
    || '"solutions":[' || v_solutions || '],'
    || '"stimulus_text":' || public._qb_json_str(v_rev.stimulus_text) || ','
    || '"targets":[' || v_targets || ']'
    || '}';
END; $fn$;

CREATE OR REPLACE FUNCTION public._qb_compute_revision_payload_hash(p_revision_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
BEGIN
  RETURN encode(sha256(convert_to(public._qb_build_revision_canonical_jcs(p_revision_id),'utf8')),'hex');
END; $fn$;

CREATE OR REPLACE FUNCTION public._qb_assert_revision_payload_hash(p_revision_id uuid, p_payload_hash text, p_payload_hash_version text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_computed text;
BEGIN
  IF p_payload_hash_version IS DISTINCT FROM 'canonical_payload_v1' THEN
    RAISE EXCEPTION 'unsupported payload_hash_version'; END IF;
  IF p_payload_hash IS NULL OR p_payload_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'payload_hash must be 64 lowercase hex chars'; END IF;
  v_computed := public._qb_compute_revision_payload_hash(p_revision_id);
  IF p_payload_hash IS DISTINCT FROM v_computed THEN
    RAISE EXCEPTION 'payload_hash does not match canonical revision content'; END IF;
END; $fn$;

-- Production lifecycle / pointer / immutability guards (verbatim behaviour).
CREATE OR REPLACE FUNCTION public.qb_guard_question_revision_lifecycle() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_pointed boolean; v_payload_changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('PUBLISHED','SUPERSEDED','APPROVED') THEN
      RAISE EXCEPTION 'cannot insert revision directly as APPROVED, PUBLISHED, or SUPERSEDED'; END IF;
    IF NEW.status NOT IN ('DRAFT','READY_FOR_REVIEW','REJECTED') THEN
      RAISE EXCEPTION 'invalid initial revision status'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('APPROVED','PUBLISHED','SUPERSEDED') THEN
      RAISE EXCEPTION 'cannot delete APPROVED, PUBLISHED, or SUPERSEDED revision'; END IF;
    SELECT EXISTS (SELECT 1 FROM public.questions q WHERE q.current_published_revision_id = OLD.id)
      INTO v_pointed;
    IF v_pointed THEN RAISE EXCEPTION 'cannot delete revision currently pointed by questions.current_published_revision_id'; END IF;
    RETURN OLD;
  END IF;
  v_payload_changed :=
       NEW.interaction_type IS DISTINCT FROM OLD.interaction_type
    OR NEW.grading_mode IS DISTINCT FROM OLD.grading_mode
    OR NEW.educational_label IS DISTINCT FROM OLD.educational_label
    OR NEW.question_text IS DISTINCT FROM OLD.question_text
    OR NEW.stimulus_text IS DISTINCT FROM OLD.stimulus_text
    OR NEW.max_score IS DISTINCT FROM OLD.max_score
    OR NEW.allow_partial IS DISTINCT FROM OLD.allow_partial
    OR NEW.requires_media IS DISTINCT FROM OLD.requires_media
    OR NEW.manual_grading_required IS DISTINCT FROM OLD.manual_grading_required
    OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
    OR NEW.payload_hash_version IS DISTINCT FROM OLD.payload_hash_version
    OR NEW.source_payload_hash IS DISTINCT FROM OLD.source_payload_hash
    OR NEW.backfill_version IS DISTINCT FROM OLD.backfill_version
    OR NEW.question_id IS DISTINCT FROM OLD.question_id
    OR NEW.revision_number IS DISTINCT FROM OLD.revision_number;
  IF OLD.status IN ('APPROVED','PUBLISHED','SUPERSEDED') AND v_payload_changed THEN
    RAISE EXCEPTION 'payload fields of % revisions are immutable', OLD.status; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'APPROVED' AND NEW.status = 'PUBLISHED' THEN
      IF NEW.published_at IS NULL OR NEW.published_by IS NULL THEN
        RAISE EXCEPTION 'PUBLISHED requires published_at and published_by'; END IF;
      PERFORM public._qb_assert_revision_payload_hash(NEW.id, NEW.payload_hash, NEW.payload_hash_version);
    ELSIF OLD.status = 'PUBLISHED' AND NEW.status = 'SUPERSEDED' THEN
      IF NEW.superseded_at IS NULL THEN RAISE EXCEPTION 'SUPERSEDED requires superseded_at'; END IF;
    ELSIF OLD.status IN ('DRAFT','READY_FOR_REVIEW','REJECTED')
          AND NEW.status IN ('DRAFT','READY_FOR_REVIEW','APPROVED','REJECTED') THEN
      IF NEW.status = 'APPROVED' THEN
        PERFORM public._qb_assert_revision_payload_hash(NEW.id, NEW.payload_hash, NEW.payload_hash_version);
      END IF;
    ELSE
      RAISE EXCEPTION 'illegal revision status transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END; $fn$;
CREATE TRIGGER trg_qb_guard_question_revision_lifecycle
  BEFORE INSERT OR DELETE OR UPDATE ON public.question_revisions
  FOR EACH ROW EXECUTE FUNCTION public.qb_guard_question_revision_lifecycle();

CREATE OR REPLACE FUNCTION public.qb_assert_published_pointer_consistency() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_qid uuid; v_ptr uuid; v_pub_id uuid; v_pub_count int;
BEGIN
  IF TG_TABLE_NAME = 'questions' THEN v_qid := COALESCE(NEW.id, OLD.id);
  ELSE v_qid := COALESCE(NEW.question_id, OLD.question_id); END IF;
  IF v_qid IS NULL THEN RETURN NULL; END IF;
  SELECT q.current_published_revision_id INTO v_ptr FROM public.questions q WHERE q.id = v_qid;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT count(*), (array_agg(qr.id ORDER BY qr.id))[1] INTO v_pub_count, v_pub_id
    FROM public.question_revisions qr WHERE qr.question_id = v_qid AND qr.status = 'PUBLISHED';
  IF v_pub_count > 1 THEN RAISE EXCEPTION 'question % has % PUBLISHED revisions', v_qid, v_pub_count; END IF;
  IF v_pub_count = 0 THEN
    IF v_ptr IS NOT NULL THEN
      RAISE EXCEPTION 'questions.current_published_revision_id must be NULL when no PUBLISHED revision exists'; END IF;
  ELSIF v_ptr IS DISTINCT FROM v_pub_id THEN
    RAISE EXCEPTION 'questions.current_published_revision_id must equal the PUBLISHED revision (%)', v_pub_id;
  END IF;
  RETURN NULL;
END; $fn$;
CREATE CONSTRAINT TRIGGER trg_qb_revisions_pointer_consistency
  AFTER INSERT OR DELETE OR UPDATE OF status, question_id ON public.question_revisions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION public.qb_assert_published_pointer_consistency();
CREATE CONSTRAINT TRIGGER trg_qb_questions_pointer_consistency
  AFTER INSERT OR DELETE OR UPDATE OF current_published_revision_id ON public.questions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION public.qb_assert_published_pointer_consistency();

CREATE OR REPLACE FUNCTION public.qb_guard_current_published_revision_pointer() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_rev record;
BEGIN
  IF NEW.current_published_revision_id IS NULL THEN RETURN NEW; END IF;
  SELECT qr.question_id, qr.status INTO v_rev FROM public.question_revisions qr
   WHERE qr.id = NEW.current_published_revision_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'current_published_revision_id must reference an existing revision'; END IF;
  IF v_rev.question_id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'current_published_revision_id must belong to the same question'; END IF;
  IF v_rev.status <> 'PUBLISHED' THEN
    RAISE EXCEPTION 'current_published_revision_id must point to a PUBLISHED revision'; END IF;
  RETURN NEW;
END; $fn$;
CREATE TRIGGER trg_qb_guard_current_published_revision_pointer
  BEFORE INSERT OR UPDATE OF current_published_revision_id ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.qb_guard_current_published_revision_pointer();

CREATE OR REPLACE FUNCTION public.qb_guard_revision_children_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_old_status text; v_new_status text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.question_revision_id IS DISTINCT FROM OLD.question_revision_id THEN
    RAISE EXCEPTION 'cannot reparent child rows; question_revision_id is immutable after insert'; END IF;
  IF TG_OP IN ('UPDATE','DELETE') THEN
    SELECT status INTO v_old_status FROM public.question_revisions WHERE id = OLD.question_revision_id;
    IF v_old_status IN ('APPROVED','PUBLISHED','SUPERSEDED') THEN
      RAISE EXCEPTION 'cannot % child rows of % revision (payload frozen)', TG_OP, v_old_status; END IF;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    SELECT status INTO v_new_status FROM public.question_revisions WHERE id = NEW.question_revision_id;
    IF v_new_status IN ('APPROVED','PUBLISHED','SUPERSEDED') THEN
      RAISE EXCEPTION 'cannot % child rows of % revision (payload frozen)', TG_OP, v_new_status; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $fn$;
CREATE TRIGGER trg_qb_options_immutable BEFORE INSERT OR DELETE OR UPDATE ON public.question_options
  FOR EACH ROW EXECUTE FUNCTION public.qb_guard_revision_children_immutable();

CREATE OR REPLACE FUNCTION public.qb_guard_targets_revision_immutable() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_status text; v_rev uuid := COALESCE(NEW.revision_id, OLD.revision_id);
BEGIN
  SELECT r.status INTO v_status FROM public.question_revisions r WHERE r.id = v_rev;
  IF NOT FOUND THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'QB_TARGET_REVISION_NOT_FOUND' USING ERRCODE = '23503';
  END IF;
  IF v_status IN ('PUBLISHED','SUPERSEDED') THEN
    RAISE EXCEPTION 'QB_TARGET_IMMUTABLE_REVISION' USING ERRCODE = '55000'; END IF;
  IF TG_OP = 'UPDATE' AND NEW.revision_id IS DISTINCT FROM OLD.revision_id THEN
    RAISE EXCEPTION 'QB_TARGET_REVISION_REBIND_FORBIDDEN' USING ERRCODE = '55000'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $fn$;
CREATE TRIGGER trg_qb_targets_revision_immutable BEFORE INSERT OR DELETE OR UPDATE ON public.question_targets
  FOR EACH ROW EXECUTE FUNCTION public.qb_guard_targets_revision_immutable();

CREATE OR REPLACE FUNCTION public.reject_v3_answer_layer_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
BEGIN RAISE EXCEPTION 'V3_ANSWER_LAYER_IMMUTABLE'; END; $fn$;
CREATE TRIGGER trg_v3_official_answers_immutable BEFORE DELETE OR UPDATE ON public.official_question_answers
  FOR EACH ROW EXECUTE FUNCTION public.reject_v3_answer_layer_mutation();
CREATE TRIGGER trg_v3_rationales_immutable BEFORE DELETE OR UPDATE ON public.question_option_rationales
  FOR EACH ROW EXECUTE FUNCTION public.reject_v3_answer_layer_mutation();

CREATE TABLE public.lesson_assessments(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id), title text NOT NULL,
  instructions text, sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), assessment_code text);
CREATE UNIQUE INDEX lesson_assessments_code_uniq
  ON public.lesson_assessments(assessment_code) WHERE assessment_code IS NOT NULL;

CREATE TABLE public.assessment_questions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.lesson_assessments(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0, points numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (assessment_id, question_id));

-- Production membership guard: assessment links require a PUBLISHED revision + matching target.
CREATE OR REPLACE FUNCTION public.validate_assessment_question_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_lesson_id uuid; v_lesson_unit_id uuid; v_lesson_subject_id uuid;
        v_published_revision uuid; v_question_exists boolean;
BEGIN
  SELECT la.lesson_id, l.unit_id, l.subject_id INTO v_lesson_id, v_lesson_unit_id, v_lesson_subject_id
    FROM public.lesson_assessments la JOIN public.lessons l ON l.id = la.lesson_id
   WHERE la.id = NEW.assessment_id;
  IF v_lesson_id IS NULL THEN RAISE EXCEPTION 'ASSESSMENT_NOT_FOUND' USING ERRCODE = '23514'; END IF;
  SELECT true, q.current_published_revision_id INTO v_question_exists, v_published_revision
    FROM public.questions q WHERE q.id = NEW.question_id;
  IF NOT COALESCE(v_question_exists,false) THEN RAISE EXCEPTION 'QUESTION_NOT_FOUND' USING ERRCODE = '23514'; END IF;
  IF v_published_revision IS NULL THEN
    RAISE EXCEPTION 'QUESTION_PUBLISH_REQUIRED' USING ERRCODE = '23514'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.question_targets t
     WHERE t.question_id = NEW.question_id AND t.revision_id = v_published_revision
       AND ((t.target_type = 'LESSON' AND t.lesson_id = v_lesson_id)
         OR (t.target_type = 'UNIT' AND v_lesson_unit_id IS NOT NULL AND t.unit_id = v_lesson_unit_id)
         OR (t.target_type = 'SUBJECT' AND t.subject_id = v_lesson_subject_id))) THEN
    RAISE EXCEPTION 'QUESTION_TARGET_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $fn$;
CREATE TRIGGER trg_validate_assessment_question_link
  BEFORE INSERT OR UPDATE OF assessment_id, question_id ON public.assessment_questions
  FOR EACH ROW EXECUTE FUNCTION public.validate_assessment_question_link();


CREATE TYPE public.capability_applicability AS ENUM ('REQUIRED','OPTIONAL','NA');
CREATE TABLE public.lesson_capability_lifecycle(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id), capability text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT', ready_snapshot jsonb, ready_hash text,
  draft_hash text, draft_updated_at timestamptz, reviewed_by uuid, reviewed_at timestamptz,
  ready_by uuid, ready_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), evidence_origin text, retirement_origin text,
  applicability public.capability_applicability NOT NULL DEFAULT 'REQUIRED',
  UNIQUE (lesson_id, capability));

-- Rich second package: exercises lesson creation, questions, options, answers, rationales, resources.
CREATE OR REPLACE FUNCTION public.cf10_manifest() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
SELECT jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(
 jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(
  jsonb_set(public.cf04_manifest('cf10'),'{packageCode}','"QURAN-G10-L04-PKG"'),
  '{profileId}','"GOLDEN_CHEMISTRY_V1"'),
  '{identity,lessonSlug}','"quran-lesson-04"'),
  '{identity,lessonCode}','"QURAN-G10-L04"'),
  '{identity,lessonTitle}','"الدرس الرابع"'),
  '{artifacts,0,sha256}',to_jsonb(public.cf08_sha('official-04'))),
  '{artifacts,0,provenanceSha256}',to_jsonb(public.cf08_sha('official-source-04'))),
  '{artifacts,1,sha256}',to_jsonb(public.cf08_sha('<p>explanation-04</p>'))),
  '{artifacts,2,sha256}',to_jsonb(public.cf08_sha('<p>summary-04</p>'))),
  '{artifacts,3,applicability}','"REQUIRED"'),
  '{artifacts,3,sourcePath}','"mindmap.html"'),
  '{artifacts,3,sha256}',to_jsonb(public.cf08_sha('<p>mindmap-04</p>'))),
  '{artifacts,4,applicability}','"OPTIONAL"'),
  '{artifacts,4,sourcePath}','"lab.html"'),
  '{artifacts,4,sha256}',to_jsonb(public.cf08_sha('<p>lab-04</p>'))),
  '{artifacts,5,sha256}',to_jsonb(public.cf08_sha('{"questions":[{"question_number":"7","official_text":"Q7","question_type":"SHORT_ANSWER"}]}'))),
  '{artifacts,5,provenanceSha256}',to_jsonb(public.cf08_sha('questions-source-04'))),
  '{artifacts,6,applicability}','"REQUIRED"'),
  '{artifacts,6,sourcePath}','"self-test.json"'),
  '{artifacts,6,sha256}',to_jsonb(public.cf08_sha('{"questions":[{"id":"s1","question":"SQ1","type":"multiple_choice","options":["a1","a2"],"source_row":2}]}'))),
  '{security,answersCompanionSha256}',to_jsonb(public.cf08_sha('{"answers":[{"question_id":"s1","correct_option":"(b)","rationale":"why"}]}')));
$$;

CREATE OR REPLACE FUNCTION public.cf10_entry(cap text, lifecycle text, target text, authority text, path text, body text, prov text, prov_body text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
SELECT jsonb_build_object('capability',cap,'lifecycleCapability',lifecycle,'targetPlan',target,
 'applicability','REQUIRED','authority',authority,'sourcePath',path,'sourceSha256',public.cf08_sha(body),
 'sourceBase64',encode(convert_to(body,'UTF8'),'base64'),'provenancePath',prov,
 'provenanceSha256',CASE WHEN prov IS NULL THEN NULL ELSE public.cf08_sha(prov_body) END,
 'provenanceBase64',CASE WHEN prov IS NULL THEN NULL ELSE encode(convert_to(prov_body,'UTF8'),'base64') END);
$$;

CREATE OR REPLACE FUNCTION public.cf10_entries() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
SELECT jsonb_build_array(
 public.cf10_entry('officialBookContent','officialBookContent','lesson_book_contents','OFFICIAL','official.json','official-04','official.provenance.json','official-source-04'),
 public.cf10_entry('tamkeenExplanationHtml','tamkeenExplanation','lesson_explanations','TAMKEEN','explanation.html','<p>explanation-04</p>',NULL,NULL),
 public.cf10_entry('lessonSummaryHtml','quickReview','lesson_summaries','TAMKEEN','summary.html','<p>summary-04</p>',NULL,NULL),
 public.cf10_entry('mindMapHtml','mindMap','lesson_resources:mindmap','TAMKEEN','mindmap.html','<p>mindmap-04</p>',NULL,NULL),
 jsonb_set(public.cf10_entry('labExperimentHtml','simulation','lesson_resources:experiment','TAMKEEN','lab.html','<p>lab-04</p>',NULL,NULL),'{applicability}','"OPTIONAL"'),
 public.cf10_entry('officialBookQuestions','checkUnderstanding','questions:official','OFFICIAL','questions.json','{"questions":[{"question_number":"7","official_text":"Q7","question_type":"SHORT_ANSWER"}]}','questions.provenance.json','questions-source-04'),
 public.cf10_entry('selfTest','lessonAssessment','lesson_assessments:self_test','TAMKEEN','self-test.json','{"questions":[{"id":"s1","question":"SQ1","type":"multiple_choice","options":["a1","a2"],"source_row":2}]}',NULL,NULL));
$$;

SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000001'; SET ROLE authenticated;
SELECT public.golden_lesson_stage_manifest(public.cf10_manifest(),repeat('a',64)); RESET ROLE;
SET ROLE service_role;
SELECT public.golden_lesson_attest_bundle(
 (SELECT id FROM public.golden_lesson_packages WHERE package_code='QURAN-G10-L04-PKG'),1,
 '10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001/30000000-0000-0000-0000-000000000004.zip',
 repeat('c',64),7,2048,4096); RESET ROLE;
SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000001'; SET ROLE authenticated;
SELECT public.golden_lesson_advance_review((SELECT id FROM public.golden_lesson_packages WHERE package_code='QURAN-G10-L04-PKG'),1,'SUBMITTED','{"packageValidationPassed":true}',NULL);
RESET ROLE; SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000002'; SET ROLE authenticated;
SELECT public.golden_lesson_advance_review((SELECT id FROM public.golden_lesson_packages WHERE package_code='QURAN-G10-L04-PKG'),1,'CONTENT_APPROVED','{"officialProvenanceChecked":true,"answerSeparationChecked":true}',NULL);
RESET ROLE; SET request.jwt.claim.sub='10000000-0000-0000-0000-000000000003'; SET ROLE authenticated;
SELECT public.golden_lesson_advance_review((SELECT id FROM public.golden_lesson_packages WHERE package_code='QURAN-G10-L04-PKG'),1,'APPROVED_FOR_STAGING','{"responsivePreviewChecked":true}',NULL);
RESET ROLE; RESET request.jwt.claim.sub;
SET ROLE service_role;
SELECT public.golden_lesson_stage_domain_bundle(
 (SELECT id FROM public.golden_lesson_packages WHERE package_code='QURAN-G10-L04-PKG'),1,
 '10000000-0000-0000-0000-000000000003',repeat('c',64),public.cf10_entries(),
 jsonb_build_object('path','answers.server-only.json','sha256',public.cf08_sha('{"answers":[{"question_id":"s1","correct_option":"(b)","rationale":"why"}]}'),
 'base64',encode(convert_to('{"answers":[{"question_id":"s1","correct_option":"(b)","rationale":"why"}]}','UTF8'),'base64')));
RESET ROLE;
