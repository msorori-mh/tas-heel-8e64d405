CREATE OR REPLACE FUNCTION public.get_report_monthly_data(_months_back integer DEFAULT 12, _grade_id uuid DEFAULT NULL)
RETURNS TABLE(year_month text, revenue numeric, new_students bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH months AS (SELECT to_char(date_trunc('month', now()) - (i || ' months')::interval, 'YYYY-MM') AS ym FROM generate_series(0, _months_back - 1) AS i),
  rev AS (SELECT to_char(created_at, 'YYYY-MM') AS ym, SUM(amount) AS total FROM payment_requests WHERE status = 'approved' AND created_at >= date_trunc('month', now()) - (_months_back || ' months')::interval GROUP BY 1),
  stu AS (SELECT to_char(created_at, 'YYYY-MM') AS ym, count(*) AS total FROM profiles WHERE created_at >= date_trunc('month', now()) - (_months_back || ' months')::interval AND (_grade_id IS NULL OR grade_id = _grade_id::text) GROUP BY 1)
  SELECT m.ym, COALESCE(r.total, 0), COALESCE(s.total, 0) FROM months m LEFT JOIN rev r ON r.ym = m.ym LEFT JOIN stu s ON s.ym = m.ym ORDER BY m.ym;
$$;

CREATE OR REPLACE FUNCTION public.get_report_governorate_data(_months_back integer DEFAULT 0, _grade_id uuid DEFAULT NULL)
RETURNS TABLE(governorate text, student_count bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(p.governorate, 'غير محدد'), count(*) FROM profiles p
  WHERE (_months_back = 0 OR p.created_at >= date_trunc('month', now()) - (_months_back || ' months')::interval)
    AND (_grade_id IS NULL OR p.grade_id = _grade_id::text) GROUP BY 1 ORDER BY 2 DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_report_school_data(_months_back integer DEFAULT 0, _grade_id uuid DEFAULT NULL, _limit integer DEFAULT 15)
RETURNS TABLE(school_name text, governorate text, student_count bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.school_name, COALESCE(p.governorate, 'غير محدد'), count(*) FROM profiles p
  WHERE p.school_name IS NOT NULL AND trim(p.school_name) != ''
    AND (_months_back = 0 OR p.created_at >= date_trunc('month', now()) - (_months_back || ' months')::interval)
    AND (_grade_id IS NULL OR p.grade_id = _grade_id::text)
  GROUP BY 1, 2 ORDER BY 3 DESC LIMIT _limit;
$$;

CREATE OR REPLACE FUNCTION public.get_report_subscription_status(_months_back integer DEFAULT 0, _grade_id uuid DEFAULT NULL)
RETURNS TABLE(status text, sub_count bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT s.status, count(*) FROM subscriptions s
  WHERE (_months_back = 0 OR s.created_at >= date_trunc('month', now()) - (_months_back || ' months')::interval)
    AND (_grade_id IS NULL OR s.grade_id = _grade_id) GROUP BY 1;
$$;

CREATE OR REPLACE FUNCTION public.get_report_grade_content()
RETURNS TABLE(grade_name text, subjects_count bigint, lessons_count bigint) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT g.name, (SELECT count(*) FROM subjects s WHERE s.grade_id = g.id),
    (SELECT count(*) FROM lessons l JOIN subjects s ON s.id = l.subject_id WHERE s.grade_id = g.id)
  FROM grades g ORDER BY g.sort_order;
$$;

-- ===== pending payment notif =====
CREATE OR REPLACE FUNCTION public.notify_admins_on_pending_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_admin record; v_student_name text; v_amount text;
BEGIN
  IF NEW.status <> 'pending' THEN RETURN NEW; END IF;
  SELECT full_name INTO v_student_name FROM profiles WHERE user_id = NEW.user_id LIMIT 1;
  v_amount := NEW.amount::text || ' ' || NEW.currency;
  FOR v_admin IN SELECT user_id FROM user_roles WHERE role = 'admin' LOOP
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (v_admin.user_id, 'طلب دفع جديد 💳', 'طلب دفع معلق بمبلغ ' || v_amount || ' من الطالب: ' || COALESCE(v_student_name, 'غير معروف'), 'info');
  END LOOP;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER on_pending_payment_request AFTER INSERT ON public.payment_requests FOR EACH ROW EXECUTE FUNCTION public.notify_admins_on_pending_payment();

-- ===== lesson_simulations =====
CREATE TABLE public.lesson_simulations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  title text NOT NULL, description text, phet_url text NOT NULL, thumbnail_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.lesson_simulations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Simulations viewable by everyone" ON public.lesson_simulations FOR SELECT TO public USING (true);
CREATE POLICY "Admins can manage simulations" ON public.lesson_simulations FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX idx_lesson_simulations_lesson_id ON public.lesson_simulations(lesson_id);

-- ===== receipts tightening =====
DROP POLICY IF EXISTS "Anyone can view receipts" ON storage.objects;
CREATE POLICY "Users can view own receipts" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'receipts' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'::public.app_role)));
DROP POLICY IF EXISTS "Users can upload receipts" ON storage.objects;
CREATE POLICY "Users can upload own receipts" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);
DROP POLICY IF EXISTS "Users can insert own subscriptions" ON public.subscriptions;
CREATE POLICY "Users can insert pending subscriptions" ON public.subscriptions FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND status = 'pending' AND expires_at IS NULL);
DROP POLICY IF EXISTS "Users can update own subscriptions" ON public.subscriptions;

-- ===== Phase 0.1 curriculum_tracks/governorates/units =====
CREATE TABLE public.curriculum_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_name text NOT NULL, track_code text NOT NULL UNIQUE, description text,
  is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.curriculum_tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tracks viewable by authenticated" ON public.curriculum_tracks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage tracks" ON public.curriculum_tracks FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
INSERT INTO public.curriculum_tracks (track_name, track_code, description) VALUES
  ('منهج صنعاء', 'sanaa', 'المنهج المعتمد في محافظات صنعاء'),
  ('منهج عدن', 'aden', 'المنهج المعتمد في محافظات عدن'),
  ('آخر', 'other', 'مسار افتراضي للمناطق الأخرى');

CREATE TABLE public.governorates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  default_curriculum_track_id uuid REFERENCES public.curriculum_tracks(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.governorates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Governorates viewable by authenticated" ON public.governorates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage governorates" ON public.governorates FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
WITH t AS (SELECT track_code, id FROM public.curriculum_tracks)
INSERT INTO public.governorates (name, default_curriculum_track_id, sort_order) VALUES
  ('صنعاء', (SELECT id FROM t WHERE track_code='sanaa'), 1), ('أمانة العاصمة', (SELECT id FROM t WHERE track_code='sanaa'), 2),
  ('عمران', (SELECT id FROM t WHERE track_code='sanaa'), 3), ('ذمار', (SELECT id FROM t WHERE track_code='sanaa'), 4),
  ('إب', (SELECT id FROM t WHERE track_code='sanaa'), 5), ('تعز', (SELECT id FROM t WHERE track_code='sanaa'), 6),
  ('الحديدة', (SELECT id FROM t WHERE track_code='sanaa'), 7), ('حجة', (SELECT id FROM t WHERE track_code='sanaa'), 8),
  ('المحويت', (SELECT id FROM t WHERE track_code='sanaa'), 9), ('صعدة', (SELECT id FROM t WHERE track_code='sanaa'), 10),
  ('ريمة', (SELECT id FROM t WHERE track_code='sanaa'), 11), ('البيضاء', (SELECT id FROM t WHERE track_code='sanaa'), 12),
  ('الجوف', (SELECT id FROM t WHERE track_code='sanaa'), 13), ('مأرب', (SELECT id FROM t WHERE track_code='sanaa'), 14),
  ('عدن', (SELECT id FROM t WHERE track_code='aden'), 15), ('لحج', (SELECT id FROM t WHERE track_code='aden'), 16),
  ('أبين', (SELECT id FROM t WHERE track_code='aden'), 17), ('الضالع', (SELECT id FROM t WHERE track_code='aden'), 18),
  ('شبوة', (SELECT id FROM t WHERE track_code='aden'), 19), ('حضرموت', (SELECT id FROM t WHERE track_code='aden'), 20),
  ('المهرة', (SELECT id FROM t WHERE track_code='aden'), 21), ('سقطرى', (SELECT id FROM t WHERE track_code='aden'), 22);

CREATE TABLE public.governorate_curriculum_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  governorate_id uuid NOT NULL REFERENCES public.governorates(id) ON DELETE CASCADE,
  curriculum_track_id uuid NOT NULL REFERENCES public.curriculum_tracks(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (governorate_id, curriculum_track_id)
);
ALTER TABLE public.governorate_curriculum_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Map viewable by authenticated" ON public.governorate_curriculum_map FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage map" ON public.governorate_curriculum_map FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
INSERT INTO public.governorate_curriculum_map (governorate_id, curriculum_track_id)
SELECT id, default_curriculum_track_id FROM public.governorates WHERE default_curriculum_track_id IS NOT NULL;

CREATE TABLE public.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  title text NOT NULL, description text, sort_order integer NOT NULL DEFAULT 0, semester integer,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_units_subject ON public.units(subject_id, sort_order);
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Units viewable by everyone" ON public.units FOR SELECT USING (true);
CREATE POLICY "Admins manage units" ON public.units FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_units_updated_at BEFORE UPDATE ON public.units FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.grades ADD COLUMN curriculum_track_id uuid REFERENCES public.curriculum_tracks(id) ON DELETE SET NULL;
ALTER TABLE public.lessons ADD COLUMN unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL;
CREATE INDEX idx_lessons_unit ON public.lessons(unit_id);
ALTER TABLE public.profiles ADD COLUMN governorate_id uuid REFERENCES public.governorates(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.can_access_lesson(_lesson_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = _lesson_id
    AND (l.is_free = true OR public.is_first_lesson_in_subject(l.id) OR public.has_active_subscription(auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role)))
$$;

CREATE TABLE public.lesson_book_contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL UNIQUE REFERENCES public.lessons(id) ON DELETE CASCADE,
  content text, pdf_url text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lesson_book_contents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Book content viewable per lesson access" ON public.lesson_book_contents FOR SELECT TO authenticated USING (public.can_access_lesson(lesson_id));
CREATE POLICY "Admins manage book contents" ON public.lesson_book_contents FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_book_contents_updated_at BEFORE UPDATE ON public.lesson_book_contents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.lesson_explanations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  title text, content text NOT NULL, sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_explanations_lesson ON public.lesson_explanations(lesson_id, sort_order);
ALTER TABLE public.lesson_explanations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Explanations viewable per lesson access" ON public.lesson_explanations FOR SELECT TO authenticated USING (public.can_access_lesson(lesson_id));
CREATE POLICY "Admins manage explanations" ON public.lesson_explanations FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_explanations_updated_at BEFORE UPDATE ON public.lesson_explanations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.lesson_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  title text NOT NULL, instructions text, sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_assessments_lesson ON public.lesson_assessments(lesson_id, sort_order);
ALTER TABLE public.lesson_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Assessments viewable per lesson access" ON public.lesson_assessments FOR SELECT TO authenticated USING (public.can_access_lesson(lesson_id));
CREATE POLICY "Admins manage assessments" ON public.lesson_assessments FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DO $$ BEGIN CREATE TYPE public.lesson_resource_type AS ENUM ('video', 'mindmap', 'experiment', 'pdf', 'link'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE public.lesson_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  resource_type public.lesson_resource_type NOT NULL,
  title text NOT NULL, url text NOT NULL, description text,
  sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_resources_lesson ON public.lesson_resources(lesson_id, resource_type, sort_order);
ALTER TABLE public.lesson_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Resources viewable per lesson access" ON public.lesson_resources FOR SELECT TO authenticated USING (public.can_access_lesson(lesson_id));
CREATE POLICY "Admins manage resources" ON public.lesson_resources FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ===== Phase 0.2 get_lesson_full_content + backfill =====
CREATE OR REPLACE FUNCTION public.get_lesson_full_content(_lesson_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_lesson record; v_book jsonb; v_explanations jsonb; v_summary jsonb; v_assessments jsonb; v_resources jsonb;
BEGIN
  IF NOT public.can_access_lesson(_lesson_id) THEN RETURN jsonb_build_object('error', 'forbidden'); END IF;
  SELECT id, subject_id, unit_id, title, slug, duration, is_free, semester, video_url, content_text, content_pdf_url, sort_order INTO v_lesson FROM public.lessons WHERE id = _lesson_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  SELECT to_jsonb(b) INTO v_book FROM (SELECT content, pdf_url, updated_at FROM public.lesson_book_contents WHERE lesson_id = _lesson_id LIMIT 1) b;
  IF v_book IS NULL AND (v_lesson.content_text IS NOT NULL OR v_lesson.content_pdf_url IS NOT NULL) THEN
    v_book := jsonb_build_object('content', v_lesson.content_text, 'pdf_url', v_lesson.content_pdf_url, 'source', 'legacy');
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.sort_order), '[]'::jsonb) INTO v_explanations FROM (SELECT id, title, content, sort_order FROM public.lesson_explanations WHERE lesson_id = _lesson_id ORDER BY sort_order) e;
  SELECT to_jsonb(s) INTO v_summary FROM (SELECT summary, key_points, study_tip FROM public.lesson_summaries WHERE lesson_id = _lesson_id LIMIT 1) s;
  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.sort_order), '[]'::jsonb) INTO v_assessments FROM (SELECT id, title, instructions, sort_order FROM public.lesson_assessments WHERE lesson_id = _lesson_id ORDER BY sort_order) a;
  WITH combined AS (
    SELECT id::text AS id, resource_type::text AS resource_type, title, url, description, sort_order, 'new' AS source FROM public.lesson_resources WHERE lesson_id = _lesson_id
    UNION ALL SELECT 'legacy-video-' || v_lesson.id::text, 'video', 'فيديو الدرس', v_lesson.video_url, NULL, 0, 'legacy' WHERE v_lesson.video_url IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.lesson_resources lr WHERE lr.lesson_id = _lesson_id AND lr.resource_type = 'video' AND lr.url = v_lesson.video_url)
    UNION ALL SELECT 'legacy-pdf-' || v_lesson.id::text, 'pdf', 'ملف PDF', v_lesson.content_pdf_url, NULL, 1, 'legacy' WHERE v_lesson.content_pdf_url IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.lesson_resources lr WHERE lr.lesson_id = _lesson_id AND lr.resource_type = 'pdf' AND lr.url = v_lesson.content_pdf_url)
    UNION ALL SELECT 'legacy-sim-' || ls.id::text, 'experiment', ls.title, ls.phet_url, ls.description, ls.sort_order + 10, 'legacy' FROM public.lesson_simulations ls WHERE ls.lesson_id = _lesson_id AND NOT EXISTS (SELECT 1 FROM public.lesson_resources lr WHERE lr.lesson_id = _lesson_id AND lr.resource_type = 'experiment' AND lr.url = ls.phet_url)
  ) SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.sort_order), '[]'::jsonb) INTO v_resources FROM combined c;
  RETURN jsonb_build_object('lesson', to_jsonb(v_lesson), 'book', v_book, 'explanations', v_explanations, 'summary', v_summary, 'assessments', v_assessments, 'resources', v_resources);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_lesson_full_content(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_lesson_full_content(uuid) TO authenticated;

INSERT INTO public.lesson_book_contents (lesson_id, content, pdf_url)
SELECT l.id, l.content_text, l.content_pdf_url FROM public.lessons l
WHERE (l.content_text IS NOT NULL OR l.content_pdf_url IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM public.lesson_book_contents b WHERE b.lesson_id = l.id);
INSERT INTO public.lesson_resources (lesson_id, resource_type, title, url, sort_order)
SELECT l.id, 'video'::lesson_resource_type, 'فيديو الدرس', l.video_url, 0 FROM public.lessons l
WHERE l.video_url IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.lesson_resources r WHERE r.lesson_id = l.id AND r.resource_type = 'video' AND r.url = l.video_url);
INSERT INTO public.lesson_resources (lesson_id, resource_type, title, url, sort_order)
SELECT l.id, 'pdf'::lesson_resource_type, 'ملف PDF', l.content_pdf_url, 1 FROM public.lessons l
WHERE l.content_pdf_url IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.lesson_resources r WHERE r.lesson_id = l.id AND r.resource_type = 'pdf' AND r.url = l.content_pdf_url);
INSERT INTO public.lesson_resources (lesson_id, resource_type, title, url, description, sort_order)
SELECT ls.lesson_id, 'experiment'::lesson_resource_type, ls.title, ls.phet_url, ls.description, ls.sort_order + 10
FROM public.lesson_simulations ls
WHERE NOT EXISTS (SELECT 1 FROM public.lesson_resources r WHERE r.lesson_id = ls.lesson_id AND r.resource_type = 'experiment' AND r.url = ls.phet_url);

-- ===== validate lesson↔unit↔subject =====
CREATE OR REPLACE FUNCTION public.validate_lesson_unit_subject_match()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_unit_subject uuid;
BEGIN
  IF NEW.unit_id IS NULL THEN RETURN NEW; END IF;
  SELECT subject_id INTO v_unit_subject FROM public.units WHERE id = NEW.unit_id;
  IF v_unit_subject IS NULL THEN RAISE EXCEPTION 'Unit not found' USING ERRCODE = '23514'; END IF;
  IF v_unit_subject <> NEW.subject_id THEN RAISE EXCEPTION 'Unit must belong to the same subject as the lesson' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_lesson_unit_subject BEFORE INSERT OR UPDATE OF subject_id, unit_id ON public.lessons FOR EACH ROW EXECUTE FUNCTION public.validate_lesson_unit_subject_match();

CREATE OR REPLACE FUNCTION public.validate_unit_subject_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.subject_id <> OLD.subject_id THEN
    IF EXISTS (SELECT 1 FROM public.lessons WHERE unit_id = NEW.id) THEN
      RAISE EXCEPTION 'Cannot change unit subject while lessons are linked to this unit' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_unit_subject_change BEFORE UPDATE OF subject_id ON public.units FOR EACH ROW EXECUTE FUNCTION public.validate_unit_subject_change();

-- ===== assessment_questions =====
CREATE TABLE public.assessment_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.lesson_assessments(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0, points numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assessment_questions_unique UNIQUE (assessment_id, question_id)
);
CREATE INDEX idx_assessment_questions_assessment ON public.assessment_questions(assessment_id);
CREATE INDEX idx_assessment_questions_question ON public.assessment_questions(question_id);
ALTER TABLE public.assessment_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage assessment questions" ON public.assessment_questions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Assessment questions viewable per lesson access" ON public.assessment_questions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.lesson_assessments la WHERE la.id = assessment_questions.assessment_id AND public.can_access_lesson(la.lesson_id)));

CREATE OR REPLACE FUNCTION public.validate_assessment_question_link()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_assessment_lesson_id uuid; v_lesson_subject_id uuid; v_q_lesson_id uuid; v_q_subject_id uuid;
BEGIN
  SELECT la.lesson_id, l.subject_id INTO v_assessment_lesson_id, v_lesson_subject_id
  FROM public.lesson_assessments la JOIN public.lessons l ON l.id = la.lesson_id WHERE la.id = NEW.assessment_id;
  IF v_assessment_lesson_id IS NULL THEN RAISE EXCEPTION 'Assessment not found' USING ERRCODE = '23514'; END IF;
  SELECT lesson_id, subject_id INTO v_q_lesson_id, v_q_subject_id FROM public.questions WHERE id = NEW.question_id;
  IF v_q_lesson_id IS NOT NULL THEN
    IF v_q_lesson_id <> v_assessment_lesson_id THEN RAISE EXCEPTION 'Question belongs to a different lesson' USING ERRCODE = '23514'; END IF;
  ELSE
    IF v_q_subject_id IS NULL OR v_q_subject_id <> v_lesson_subject_id THEN RAISE EXCEPTION 'Question must belong to the same subject as the assessment lesson' USING ERRCODE = '23514'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_assessment_question_link BEFORE INSERT OR UPDATE OF assessment_id, question_id ON public.assessment_questions FOR EACH ROW EXECUTE FUNCTION public.validate_assessment_question_link();

-- ===== can_access_subject + tighten RLS =====
CREATE OR REPLACE FUNCTION public.can_access_subject(_subject_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _subject_id IS NOT NULL AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_active_subscription(auth.uid()))
$$;
DROP POLICY IF EXISTS "Anyone authenticated can view summaries" ON public.lesson_summaries;
CREATE POLICY "Summaries viewable per lesson access" ON public.lesson_summaries FOR SELECT TO authenticated USING (public.can_access_lesson(lesson_id));
DROP POLICY IF EXISTS "Simulations viewable by everyone" ON public.lesson_simulations;
CREATE POLICY "Simulations viewable per lesson access" ON public.lesson_simulations FOR SELECT TO authenticated USING (public.can_access_lesson(lesson_id));
DROP POLICY IF EXISTS "Questions viewable by authenticated" ON public.questions;
CREATE POLICY "Questions viewable per access" ON public.questions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR (lesson_id IS NOT NULL AND public.can_access_lesson(lesson_id)) OR (lesson_id IS NULL AND subject_id IS NOT NULL AND public.can_access_subject(subject_id)));

CREATE OR REPLACE FUNCTION public.validate_lesson_subject_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.subject_id IS DISTINCT FROM OLD.subject_id THEN
    IF EXISTS (SELECT 1 FROM public.lesson_assessments la JOIN public.assessment_questions aq ON aq.assessment_id = la.id JOIN public.questions q ON q.id = aq.question_id
      WHERE la.lesson_id = NEW.id AND ((q.lesson_id IS NOT NULL AND q.lesson_id = NEW.id) OR (q.lesson_id IS NULL AND q.subject_id = OLD.subject_id))) THEN
      RAISE EXCEPTION 'Cannot change lesson subject while assessments have linked questions from the current subject' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_lesson_subject_change BEFORE UPDATE OF subject_id ON public.lessons FOR EACH ROW EXECUTE FUNCTION public.validate_lesson_subject_change();

REVOKE EXECUTE ON FUNCTION public.can_access_lesson(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_access_subject(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_total_points(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_email(uuid) FROM anon;

-- ===== Phase 0.6 grade_id normalization =====
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS grade_uuid uuid REFERENCES public.grades(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_grade_uuid ON public.profiles(grade_uuid);
UPDATE public.profiles p SET grade_uuid = g.id FROM public.grades g
WHERE p.grade_uuid IS NULL AND p.grade_id IS NOT NULL
  AND p.grade_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND g.id::text = p.grade_id;

CREATE OR REPLACE FUNCTION public.sync_profile_grade_columns()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_exists boolean;
BEGIN
  IF NEW.grade_uuid IS DISTINCT FROM COALESCE(OLD.grade_uuid, NULL) THEN
    IF NEW.grade_uuid IS NULL THEN
      IF OLD.grade_id IS NOT NULL AND OLD.grade_uuid IS NOT NULL AND OLD.grade_id = OLD.grade_uuid::text THEN NEW.grade_id := NULL; END IF;
    ELSE NEW.grade_id := NEW.grade_uuid::text; END IF;
  END IF;
  IF NEW.grade_id IS DISTINCT FROM COALESCE(OLD.grade_id, NULL) THEN
    IF NEW.grade_id IS NULL THEN NEW.grade_uuid := NULL;
    ELSIF NEW.grade_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT EXISTS(SELECT 1 FROM public.grades WHERE id::text = NEW.grade_id) INTO v_exists;
      IF v_exists THEN NEW.grade_uuid := NEW.grade_id::uuid; END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_sync_profile_grade_columns BEFORE INSERT OR UPDATE OF grade_id, grade_uuid ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sync_profile_grade_columns();

-- ===== Phase 1.1 curriculum_track on profile =====
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS curriculum_track_id uuid REFERENCES public.curriculum_tracks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_curriculum_track_id ON public.profiles(curriculum_track_id);
CREATE INDEX IF NOT EXISTS idx_profiles_governorate_id ON public.profiles(governorate_id);

CREATE OR REPLACE FUNCTION public.sync_profile_curriculum_track()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_gov_id uuid; v_track_id uuid;
BEGIN
  IF NEW.governorate_id IS NULL AND NEW.governorate IS NOT NULL AND length(trim(NEW.governorate)) > 0 THEN
    SELECT id INTO v_gov_id FROM public.governorates WHERE name = trim(NEW.governorate) LIMIT 1;
    IF v_gov_id IS NOT NULL THEN NEW.governorate_id := v_gov_id; END IF;
  END IF;
  IF NEW.governorate_id IS NOT NULL THEN
    SELECT default_curriculum_track_id INTO v_track_id FROM public.governorates WHERE id = NEW.governorate_id;
    NEW.curriculum_track_id := v_track_id;
  ELSE NEW.curriculum_track_id := NULL; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_sync_profile_curriculum_track BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sync_profile_curriculum_track();
UPDATE public.profiles p SET governorate_id = g.id FROM public.governorates g
WHERE p.governorate_id IS NULL AND p.governorate IS NOT NULL AND g.name = trim(p.governorate);
UPDATE public.profiles p SET curriculum_track_id = g.default_curriculum_track_id FROM public.governorates g
WHERE p.governorate_id = g.id AND p.curriculum_track_id IS DISTINCT FROM g.default_curriculum_track_id;

-- ===== Phase 1.2 subjects.curriculum_track_id =====
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS curriculum_track_id uuid NULL REFERENCES public.curriculum_tracks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_subjects_curriculum_track_id ON public.subjects(curriculum_track_id);
CREATE OR REPLACE FUNCTION public.subject_matches_track(_subject_id uuid, _track_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.subjects s WHERE s.id = _subject_id AND (s.curriculum_track_id IS NULL OR _track_id IS NULL OR s.curriculum_track_id = _track_id))
$$;
REVOKE EXECUTE ON FUNCTION public.subject_matches_track(uuid, uuid) FROM anon;

-- ===== Phase 1.4 user_can_access_subject_curriculum + tighten =====
CREATE OR REPLACE FUNCTION public.user_can_access_subject_curriculum(_subject_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin'::app_role) OR EXISTS (
    SELECT 1 FROM public.subjects s WHERE s.id = _subject_id
      AND (s.curriculum_track_id IS NULL OR s.curriculum_track_id = (SELECT p.curriculum_track_id FROM public.profiles p WHERE p.user_id = auth.uid()))
  )
$$;
REVOKE EXECUTE ON FUNCTION public.user_can_access_subject_curriculum(uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.can_access_lesson(_lesson_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = _lesson_id
    AND (public.has_role(auth.uid(), 'admin'::app_role)
      OR ((l.is_free = true OR public.is_first_lesson_in_subject(l.id) OR public.has_active_subscription(auth.uid()))
        AND public.user_can_access_subject_curriculum(l.subject_id))))
$$;

DROP POLICY IF EXISTS "Subjects are viewable by everyone" ON public.subjects;
CREATE POLICY "Subjects viewable per curriculum" ON public.subjects FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role) OR curriculum_track_id IS NULL
  OR (auth.uid() IS NOT NULL AND curriculum_track_id = (SELECT p.curriculum_track_id FROM public.profiles p WHERE p.user_id = auth.uid())));
DROP POLICY IF EXISTS "Paid lessons viewable by active subscribers" ON public.lessons;
CREATE POLICY "Lessons viewable per access" ON public.lessons FOR SELECT TO authenticated USING (public.can_access_lesson(id));
DROP POLICY IF EXISTS "Questions viewable per access" ON public.questions;
CREATE POLICY "Questions viewable per access" ON public.questions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR (lesson_id IS NOT NULL AND public.can_access_lesson(lesson_id))
  OR (lesson_id IS NULL AND subject_id IS NOT NULL AND public.can_access_subject(subject_id) AND public.user_can_access_subject_curriculum(subject_id)));

-- ===== grade_lesson_quiz =====
CREATE OR REPLACE FUNCTION public.grade_lesson_quiz(_lesson_id uuid, _answers jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user_id uuid := auth.uid(); v_total int := 0; v_correct int := 0; v_score int := 0; v_per_question jsonb := '[]'::jsonb; v_existing_id uuid;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('error', 'unauthorized'); END IF;
  IF NOT public.can_access_lesson(_lesson_id) THEN RETURN jsonb_build_object('error', 'forbidden'); END IF;
  IF _answers IS NULL OR jsonb_typeof(_answers) <> 'array' THEN RETURN jsonb_build_object('error', 'invalid_payload'); END IF;
  WITH supplied AS (SELECT (elem->>'question_id')::uuid AS question_id, NULLIF(elem->>'selected_index','')::int AS selected_index FROM jsonb_array_elements(_answers) elem WHERE elem ? 'question_id'),
  graded AS (SELECT q.id AS question_id, q.correct_index, q.explanation, s.selected_index, (s.selected_index IS NOT NULL AND s.selected_index = q.correct_index) AS is_correct FROM supplied s JOIN public.questions q ON q.id = s.question_id WHERE q.lesson_id = _lesson_id)
  SELECT COUNT(*)::int, COUNT(*) FILTER (WHERE is_correct)::int,
    COALESCE(jsonb_agg(jsonb_build_object('question_id', question_id, 'is_correct', is_correct, 'explanation', explanation)), '[]'::jsonb)
  INTO v_total, v_correct, v_per_question FROM graded;
  IF v_total = 0 THEN RETURN jsonb_build_object('error', 'no_valid_questions'); END IF;
  v_score := ROUND((v_correct::numeric / v_total::numeric) * 100)::int;
  SELECT id INTO v_existing_id FROM public.user_progress WHERE user_id = v_user_id AND lesson_id = _lesson_id LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    UPDATE public.user_progress SET completed = TRUE, completed_at = COALESCE(completed_at, now()), quiz_score = GREATEST(COALESCE(quiz_score, 0), v_score), updated_at = now() WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.user_progress (user_id, lesson_id, completed, completed_at, quiz_score) VALUES (v_user_id, _lesson_id, TRUE, now(), v_score);
  END IF;
  RETURN jsonb_build_object('total', v_total, 'correct', v_correct, 'score', v_score, 'per_question', v_per_question);
END;
$$;
REVOKE ALL ON FUNCTION public.grade_lesson_quiz(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.grade_lesson_quiz(uuid, jsonb) TO authenticated;

-- ===== get_lesson_quiz_questions =====
CREATE OR REPLACE FUNCTION public.get_lesson_quiz_questions(_lesson_id uuid)
RETURNS TABLE (id uuid, question_text text, options jsonb, question_type text, sort_order int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF NOT public.can_access_lesson(_lesson_id) THEN RETURN; END IF;
  RETURN QUERY SELECT q.id, q.question_text, q.options, q.question_type, q.sort_order
    FROM public.questions q WHERE q.lesson_id = _lesson_id ORDER BY q.sort_order;
END;
$$;
REVOKE ALL ON FUNCTION public.get_lesson_quiz_questions(uuid) FROM public;
REVOKE ALL ON FUNCTION public.get_lesson_quiz_questions(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_lesson_quiz_questions(uuid) TO authenticated;

-- ===== Phase 3.1 Wallet =====
CREATE TABLE public.wallet_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'YER', balance numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_accounts_user_currency_unique UNIQUE (user_id, currency),
  CONSTRAINT wallet_accounts_balance_nonneg CHECK (balance >= 0),
  CONSTRAINT wallet_accounts_status_valid CHECK (status IN ('active','frozen','closed'))
);
CREATE INDEX idx_wallet_accounts_user_id ON public.wallet_accounts(user_id);
CREATE INDEX idx_wallet_accounts_currency ON public.wallet_accounts(currency);
CREATE INDEX idx_wallet_accounts_status ON public.wallet_accounts(status);
CREATE TRIGGER trg_wallet_accounts_updated_at BEFORE UPDATE ON public.wallet_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_account_id uuid NOT NULL REFERENCES public.wallet_accounts(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL, direction text NOT NULL, amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'YER',
  balance_before numeric NOT NULL, balance_after numeric NOT NULL,
  reference_type text NULL, reference_id uuid NULL, description text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_tx_amount_positive CHECK (amount > 0),
  CONSTRAINT wallet_tx_direction_valid CHECK (direction IN ('credit','debit')),
  CONSTRAINT wallet_tx_type_valid CHECK (type IN ('deposit','subscription_payment','refund','adjustment','manual_correction')),
  CONSTRAINT wallet_tx_balance_after_nonneg CHECK (balance_after >= 0)
);
CREATE INDEX idx_wallet_tx_wallet_account_id ON public.wallet_transactions(wallet_account_id);
CREATE INDEX idx_wallet_tx_user_id ON public.wallet_transactions(user_id);
CREATE INDEX idx_wallet_tx_reference ON public.wallet_transactions(reference_type, reference_id);
CREATE INDEX idx_wallet_tx_created_at ON public.wallet_transactions(created_at);

CREATE OR REPLACE FUNCTION public.prevent_wallet_tx_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'wallet_transactions is append-only; use a reverse transaction instead' USING ERRCODE = '42501'; END;
$$;
CREATE TRIGGER trg_wallet_tx_no_update BEFORE UPDATE ON public.wallet_transactions FOR EACH ROW EXECUTE FUNCTION public.prevent_wallet_tx_mutation();
CREATE TRIGGER trg_wallet_tx_no_delete BEFORE DELETE ON public.wallet_transactions FOR EACH ROW EXECUTE FUNCTION public.prevent_wallet_tx_mutation();

CREATE OR REPLACE FUNCTION public.create_wallet_transaction(
  _user_id uuid, _type text, _direction text, _amount numeric, _currency text DEFAULT 'YER',
  _reference_type text DEFAULT NULL, _reference_id uuid DEFAULT NULL,
  _description text DEFAULT NULL, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller uuid := auth.uid(); v_wallet record; v_before numeric; v_after numeric; v_tx_id uuid;
BEGIN
  IF v_caller IS NULL OR NOT public.has_role(v_caller, 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'amount must be > 0' USING ERRCODE = '22023'; END IF;
  IF _direction NOT IN ('credit','debit') THEN RAISE EXCEPTION 'invalid direction' USING ERRCODE = '22023'; END IF;
  IF _type NOT IN ('deposit','subscription_payment','refund','adjustment','manual_correction') THEN RAISE EXCEPTION 'invalid type' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_wallet FROM public.wallet_accounts WHERE user_id = _user_id AND currency = _currency FOR UPDATE;
  IF NOT FOUND THEN INSERT INTO public.wallet_accounts (user_id, currency) VALUES (_user_id, _currency) RETURNING * INTO v_wallet; END IF;
  IF v_wallet.status <> 'active' THEN RAISE EXCEPTION 'wallet is not active' USING ERRCODE = '42501'; END IF;
  v_before := v_wallet.balance;
  IF _direction = 'credit' THEN v_after := v_before + _amount;
  ELSE v_after := v_before - _amount;
    IF v_after < 0 THEN RAISE EXCEPTION 'insufficient balance' USING ERRCODE = '22023'; END IF;
  END IF;
  INSERT INTO public.wallet_transactions (wallet_account_id, user_id, type, direction, amount, currency, balance_before, balance_after, reference_type, reference_id, description, metadata, created_by)
  VALUES (v_wallet.id, _user_id, _type, _direction, _amount, _currency, v_before, v_after, _reference_type, _reference_id, _description, COALESCE(_metadata, '{}'::jsonb), v_caller) RETURNING id INTO v_tx_id;
  UPDATE public.wallet_accounts SET balance = v_after, updated_at = now() WHERE id = v_wallet.id;
  RETURN jsonb_build_object('transaction_id', v_tx_id, 'wallet_account_id', v_wallet.id, 'balance_before', v_before, 'balance_after', v_after);
END;
$$;
REVOKE ALL ON FUNCTION public.create_wallet_transaction(uuid,text,text,numeric,text,text,uuid,text,jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_wallet_transaction(uuid,text,text,numeric,text,text,uuid,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_wallet_account(_user_id uuid, _currency text DEFAULT 'YER')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.wallet_accounts WHERE user_id = _user_id AND currency = _currency;
  IF v_id IS NULL THEN INSERT INTO public.wallet_accounts (user_id, currency) VALUES (_user_id, _currency) RETURNING id INTO v_id; END IF;
  RETURN v_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.auto_create_wallet_for_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.ensure_wallet_account(NEW.user_id, 'YER'); RETURN NEW; END;
$$;
CREATE TRIGGER trg_profile_create_wallet AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.auto_create_wallet_for_profile();

INSERT INTO public.wallet_accounts (user_id, currency)
SELECT DISTINCT p.user_id, 'YER' FROM public.profiles p WHERE p.user_id IS NOT NULL ON CONFLICT (user_id, currency) DO NOTHING;

ALTER TABLE public.wallet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own wallet" ON public.wallet_accounts FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all wallets" ON public.wallet_accounts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view own wallet transactions" ON public.wallet_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all wallet transactions" ON public.wallet_transactions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
