
-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.exam_mode AS ENUM ('training', 'strict', 'ministry');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.exam_session_status AS ENUM ('in_progress', 'submitted', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ exam_templates ============
CREATE TABLE public.exam_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  mode public.exam_mode NOT NULL DEFAULT 'training',
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  lesson_id uuid REFERENCES public.lessons(id) ON DELETE SET NULL,
  duration_seconds integer,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_templates_duration_positive CHECK (duration_seconds IS NULL OR duration_seconds > 0)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_templates TO authenticated;
GRANT ALL ON public.exam_templates TO service_role;

ALTER TABLE public.exam_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read active templates"
  ON public.exam_templates FOR SELECT TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage templates"
  ON public.exam_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_exam_templates_mode_active ON public.exam_templates(mode, is_active);
CREATE INDEX idx_exam_templates_subject ON public.exam_templates(subject_id);
CREATE INDEX idx_exam_templates_unit ON public.exam_templates(unit_id);
CREATE INDEX idx_exam_templates_lesson ON public.exam_templates(lesson_id);

CREATE TRIGGER trg_exam_templates_updated_at
  BEFORE UPDATE ON public.exam_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ exam_template_questions ============
CREATE TABLE public.exam_template_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.exam_templates(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0,
  points numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_template_questions_unique UNIQUE (template_id, question_id),
  CONSTRAINT exam_template_questions_points_pos CHECK (points > 0),
  CONSTRAINT exam_template_questions_sort_nonneg CHECK (sort_order >= 0)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_template_questions TO authenticated;
GRANT ALL ON public.exam_template_questions TO service_role;

ALTER TABLE public.exam_template_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read questions of active templates"
  ON public.exam_template_questions FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.exam_templates t WHERE t.id = template_id AND t.is_active = true)
  );

CREATE POLICY "Admins manage template questions"
  ON public.exam_template_questions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_exam_template_questions_tpl_order
  ON public.exam_template_questions(template_id, sort_order);

-- ============ exam_sessions ============
CREATE TABLE public.exam_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.exam_templates(id) ON DELETE RESTRICT,
  mode public.exam_mode NOT NULL,
  status public.exam_session_status NOT NULL DEFAULT 'in_progress',
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  submitted_at timestamptz,
  total_questions integer NOT NULL DEFAULT 0,
  answered_questions integer NOT NULL DEFAULT 0,
  correct_answers integer NOT NULL DEFAULT 0,
  score numeric NOT NULL DEFAULT 0,
  total_points numeric NOT NULL DEFAULT 0,
  result_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_sessions_score_nonneg CHECK (score >= 0),
  CONSTRAINT exam_sessions_total_points_nonneg CHECK (total_points >= 0),
  CONSTRAINT exam_sessions_total_q_nonneg CHECK (total_questions >= 0),
  CONSTRAINT exam_sessions_answered_nonneg CHECK (answered_questions >= 0),
  CONSTRAINT exam_sessions_correct_nonneg CHECK (correct_answers >= 0)
);

GRANT SELECT ON public.exam_sessions TO authenticated;
GRANT ALL ON public.exam_sessions TO service_role;

ALTER TABLE public.exam_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own sessions"
  ON public.exam_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage all sessions"
  ON public.exam_sessions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_exam_sessions_user_status_created
  ON public.exam_sessions(user_id, status, created_at DESC);
CREATE INDEX idx_exam_sessions_template ON public.exam_sessions(template_id);

CREATE TRIGGER trg_exam_sessions_updated_at
  BEFORE UPDATE ON public.exam_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ exam_session_answers ============
CREATE TABLE public.exam_session_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  selected_index integer,
  is_correct boolean,
  points_awarded numeric NOT NULL DEFAULT 0,
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_session_answers_unique UNIQUE (session_id, question_id),
  CONSTRAINT exam_session_answers_selected_nonneg CHECK (selected_index IS NULL OR selected_index >= 0),
  CONSTRAINT exam_session_answers_points_nonneg CHECK (points_awarded >= 0)
);

GRANT SELECT ON public.exam_session_answers TO authenticated;
GRANT ALL ON public.exam_session_answers TO service_role;

ALTER TABLE public.exam_session_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own session answers"
  ON public.exam_session_answers FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.exam_sessions s WHERE s.id = session_id AND s.user_id = auth.uid())
  );

CREATE POLICY "Admins manage all session answers"
  ON public.exam_session_answers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_exam_session_answers_session ON public.exam_session_answers(session_id);
CREATE INDEX idx_exam_session_answers_question ON public.exam_session_answers(question_id);

CREATE TRIGGER trg_exam_session_answers_updated_at
  BEFORE UPDATE ON public.exam_session_answers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ RPC: start_exam_session ============
CREATE OR REPLACE FUNCTION public.start_exam_session(_template_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_tpl public.exam_templates;
  v_session_id uuid;
  v_total_q integer := 0;
  v_total_pts numeric := 0;
  v_expires timestamptz;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_tpl FROM public.exam_templates WHERE id = _template_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'template_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_tpl.is_active IS NOT TRUE THEN RAISE EXCEPTION 'template_inactive' USING ERRCODE = '42501'; END IF;

  SELECT COUNT(*), COALESCE(SUM(points), 0) INTO v_total_q, v_total_pts
  FROM public.exam_template_questions WHERE template_id = _template_id;

  IF v_total_q = 0 THEN RAISE EXCEPTION 'template_has_no_questions' USING ERRCODE = '22023'; END IF;

  IF v_tpl.duration_seconds IS NOT NULL THEN
    v_expires := now() + make_interval(secs => v_tpl.duration_seconds);
  END IF;

  INSERT INTO public.exam_sessions (user_id, template_id, mode, status, expires_at, total_questions, total_points)
  VALUES (v_user, _template_id, v_tpl.mode, 'in_progress', v_expires, v_total_q, v_total_pts)
  RETURNING id INTO v_session_id;

  INSERT INTO public.exam_session_answers (session_id, question_id)
  SELECT v_session_id, tq.question_id
  FROM public.exam_template_questions tq
  WHERE tq.template_id = _template_id
  ORDER BY tq.sort_order;

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_exam_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_exam_session(uuid) TO authenticated;

-- ============ RPC: answer_exam_question ============
CREATE OR REPLACE FUNCTION public.answer_exam_question(_session_id uuid, _question_id uuid, _selected_index integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_session public.exam_sessions;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  IF _selected_index IS NOT NULL AND _selected_index < 0 THEN
    RAISE EXCEPTION 'invalid_selected_index' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_session FROM public.exam_sessions WHERE id = _session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_session.user_id <> v_user THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF v_session.status <> 'in_progress' THEN RAISE EXCEPTION 'session_not_in_progress' USING ERRCODE = '22023'; END IF;

  IF v_session.expires_at IS NOT NULL AND v_session.expires_at < now() THEN
    UPDATE public.exam_sessions SET status = 'expired', updated_at = now() WHERE id = _session_id;
    RAISE EXCEPTION 'session_expired' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.exam_session_answers WHERE session_id = _session_id AND question_id = _question_id) THEN
    RAISE EXCEPTION 'question_not_in_session' USING ERRCODE = '22023';
  END IF;

  UPDATE public.exam_session_answers
  SET selected_index = _selected_index,
      answered_at = now(),
      updated_at = now()
  WHERE session_id = _session_id AND question_id = _question_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.answer_exam_question(uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.answer_exam_question(uuid, uuid, integer) TO authenticated;

-- ============ RPC: submit_exam_session ============
CREATE OR REPLACE FUNCTION public.submit_exam_session(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_session public.exam_sessions;
  v_answered int := 0;
  v_correct int := 0;
  v_score numeric := 0;
  v_total_pts numeric := 0;
  v_per_question jsonb := '[]'::jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_session FROM public.exam_sessions WHERE id = _session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_session.user_id <> v_user THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF v_session.status <> 'in_progress' THEN RAISE EXCEPTION 'session_not_in_progress' USING ERRCODE = '22023'; END IF;

  -- Score each answer server-side
  WITH graded AS (
    SELECT
      a.id AS answer_id,
      a.question_id,
      a.selected_index,
      q.correct_index,
      tq.points AS q_points,
      (a.selected_index IS NOT NULL AND a.selected_index = q.correct_index) AS is_correct
    FROM public.exam_session_answers a
    JOIN public.questions q ON q.id = a.question_id
    LEFT JOIN public.exam_template_questions tq
      ON tq.template_id = v_session.template_id AND tq.question_id = a.question_id
    WHERE a.session_id = _session_id
  ),
  upd AS (
    UPDATE public.exam_session_answers a
    SET is_correct = g.is_correct,
        points_awarded = CASE WHEN g.is_correct THEN COALESCE(g.q_points, 1) ELSE 0 END,
        updated_at = now()
    FROM graded g
    WHERE a.id = g.answer_id
    RETURNING a.id, a.is_correct, a.points_awarded, a.selected_index, a.question_id
  )
  SELECT
    COUNT(*) FILTER (WHERE selected_index IS NOT NULL)::int,
    COUNT(*) FILTER (WHERE is_correct)::int,
    COALESCE(SUM(points_awarded), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'question_id', question_id,
      'is_correct', is_correct,
      'selected_index', selected_index,
      'points_awarded', points_awarded
    )), '[]'::jsonb)
  INTO v_answered, v_correct, v_score, v_per_question
  FROM upd;

  v_total_pts := v_session.total_points;

  UPDATE public.exam_sessions
  SET status = 'submitted',
      submitted_at = now(),
      answered_questions = v_answered,
      correct_answers = v_correct,
      score = v_score,
      result_json = jsonb_build_object(
        'answered', v_answered,
        'correct', v_correct,
        'score', v_score,
        'total_points', v_total_pts,
        'per_question', v_per_question
      ),
      updated_at = now()
  WHERE id = _session_id;

  RETURN jsonb_build_object(
    'session_id', _session_id,
    'status', 'submitted',
    'total_questions', v_session.total_questions,
    'answered', v_answered,
    'correct', v_correct,
    'score', v_score,
    'total_points', v_total_pts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_exam_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_exam_session(uuid) TO authenticated;

-- ============ RPC: get_exam_session_state ============
CREATE OR REPLACE FUNCTION public.get_exam_session_state(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_session public.exam_sessions;
  v_template jsonb;
  v_answers jsonb;
  v_questions jsonb;
  v_reveal boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  v_is_admin := public.has_role(v_user, 'admin'::app_role);

  SELECT * INTO v_session FROM public.exam_sessions WHERE id = _session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_session.user_id <> v_user AND NOT v_is_admin THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_reveal := (v_session.status <> 'in_progress');

  SELECT to_jsonb(t) - 'created_by' INTO v_template
  FROM public.exam_templates t WHERE t.id = v_session.template_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'question_id', a.question_id,
    'selected_index', a.selected_index,
    'answered_at', a.answered_at,
    'is_correct', CASE WHEN v_reveal THEN a.is_correct ELSE NULL END,
    'points_awarded', CASE WHEN v_reveal THEN a.points_awarded ELSE NULL END
  ) ORDER BY a.created_at), '[]'::jsonb)
  INTO v_answers
  FROM public.exam_session_answers a
  WHERE a.session_id = _session_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', q.id,
    'question_text', q.question_text,
    'options', q.options,
    'question_type', q.question_type,
    'sort_order', tq.sort_order,
    'points', tq.points,
    'correct_index', CASE WHEN v_reveal THEN q.correct_index ELSE NULL END,
    'explanation', CASE WHEN v_reveal THEN q.explanation ELSE NULL END
  ) ORDER BY tq.sort_order), '[]'::jsonb)
  INTO v_questions
  FROM public.exam_template_questions tq
  JOIN public.questions q ON q.id = tq.question_id
  WHERE tq.template_id = v_session.template_id;

  RETURN jsonb_build_object(
    'session', to_jsonb(v_session) - 'result_json' || jsonb_build_object('result_json', CASE WHEN v_reveal THEN v_session.result_json ELSE NULL END),
    'template', v_template,
    'questions', v_questions,
    'answers', v_answers,
    'reveal', v_reveal
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_exam_session_state(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_exam_session_state(uuid) TO authenticated;
