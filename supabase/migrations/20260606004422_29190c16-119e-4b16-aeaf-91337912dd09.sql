-- ===== 20260325213035 referrals =====
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referred_by text;
CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL,
  referred_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  referrer_reward_applied boolean NOT NULL DEFAULT false,
  referred_reward_applied boolean NOT NULL DEFAULT false,
  discount_percent integer NOT NULL DEFAULT 10,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  UNIQUE(referred_id)
);
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own referrals" ON public.referrals FOR SELECT TO authenticated USING (auth.uid() = referrer_id OR auth.uid() = referred_id);
CREATE POLICY "Admins can manage referrals" ON public.referrals FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can insert referrals" ON public.referrals FOR INSERT TO authenticated WITH CHECK (auth.uid() = referred_id);

CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := upper(substr(md5(NEW.user_id::text || now()::text), 1, 8));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER set_referral_code BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW WHEN (NEW.referral_code IS NULL) EXECUTE FUNCTION public.generate_referral_code();
UPDATE public.profiles SET referral_code = upper(substr(md5(user_id::text || now()::text), 1, 8)) WHERE referral_code IS NULL;

-- ===== 20260325235033 RLS fixes =====
DROP POLICY IF EXISTS "System can insert certificates" ON public.certificates;
CREATE POLICY "Only admins can insert certificates" ON public.certificates FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can view all progress" ON public.user_progress FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "Users can insert own payment requests" ON public.payment_requests;
CREATE POLICY "Users can insert own payment requests" ON public.payment_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own subscriptions" ON public.subscriptions;
CREATE POLICY "Users can insert own subscriptions" ON public.subscriptions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can view own payment requests" ON public.payment_requests;
CREATE POLICY "Users can view own payment requests" ON public.payment_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.subscriptions;
CREATE POLICY "Users can view own subscriptions" ON public.subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ===== 20260325235045 search_path =====
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;

-- ===== 20260326003642 weekly_schedule =====
CREATE TABLE public.weekly_schedule (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  period_number integer NOT NULL CHECK (period_number BETWEEN 1 AND 10),
  subject_name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, day_of_week, period_number)
);
ALTER TABLE public.weekly_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own schedule" ON public.weekly_schedule FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own schedule" ON public.weekly_schedule FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own schedule" ON public.weekly_schedule FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own schedule" ON public.weekly_schedule FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ===== 20260326004059 profile fields =====
ALTER TABLE public.profiles ADD COLUMN governorate text;
ALTER TABLE public.profiles ADD COLUMN school_name text;

-- ===== 20260326010051 gamification =====
CREATE TABLE public.badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL DEFAULT 'Award',
  color text NOT NULL DEFAULT '#f59e0b',
  condition_type text NOT NULL,
  condition_value integer NOT NULL DEFAULT 1,
  points_reward integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.student_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  points integer NOT NULL DEFAULT 0,
  reason text NOT NULL,
  reference_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.student_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id uuid NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  earned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge_id)
);
CREATE INDEX idx_student_points_user ON public.student_points(user_id);
CREATE INDEX idx_student_badges_user ON public.student_badges(user_id);
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Badges viewable by everyone" ON public.badges FOR SELECT TO public USING (true);
CREATE POLICY "Admins can manage badges" ON public.badges FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view own points" ON public.student_points FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all points" ON public.student_points FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "System can insert points" ON public.student_points FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own badges" ON public.student_badges FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all badges" ON public.student_badges FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "System can insert badges" ON public.student_badges FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.get_user_total_points(_user_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(SUM(points), 0)::integer FROM public.student_points WHERE user_id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.award_points_on_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_points integer; v_badge record; v_lessons_completed integer; v_total_points integer; v_certificates integer;
BEGIN
  IF NEW.completed IS NOT TRUE THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM student_points WHERE user_id = NEW.user_id AND reason = 'lesson_completed' AND reference_id = NEW.lesson_id) THEN RETURN NEW; END IF;
  v_points := 10;
  IF NEW.quiz_score IS NOT NULL AND NEW.quiz_score >= 80 THEN v_points := v_points + 5; END IF;
  INSERT INTO student_points (user_id, points, reason, reference_id) VALUES (NEW.user_id, v_points, 'lesson_completed', NEW.lesson_id);
  SELECT count(*) INTO v_lessons_completed FROM user_progress WHERE user_id = NEW.user_id AND completed = true;
  SELECT COALESCE(SUM(points), 0) INTO v_total_points FROM student_points WHERE user_id = NEW.user_id;
  SELECT count(*) INTO v_certificates FROM certificates WHERE user_id = NEW.user_id;
  FOR v_badge IN SELECT * FROM badges LOOP
    IF EXISTS (SELECT 1 FROM student_badges WHERE user_id = NEW.user_id AND badge_id = v_badge.id) THEN CONTINUE; END IF;
    IF (v_badge.condition_type = 'lessons_completed' AND v_lessons_completed >= v_badge.condition_value)
    OR (v_badge.condition_type = 'points_earned' AND v_total_points >= v_badge.condition_value)
    OR (v_badge.condition_type = 'certificates_earned' AND v_certificates >= v_badge.condition_value)
    THEN
      INSERT INTO student_badges (user_id, badge_id) VALUES (NEW.user_id, v_badge.id);
      IF v_badge.points_reward > 0 THEN
        INSERT INTO student_points (user_id, points, reason, reference_id) VALUES (NEW.user_id, v_badge.points_reward, 'badge_earned', v_badge.id);
      END IF;
      INSERT INTO notifications (user_id, title, message, type) VALUES (NEW.user_id, 'شارة جديدة 🏆', 'تهانينا! حصلت على شارة: ' || v_badge.name, 'success');
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER tr_award_points_on_progress AFTER INSERT OR UPDATE ON public.user_progress FOR EACH ROW EXECUTE FUNCTION public.award_points_on_progress();

INSERT INTO public.badges (name, description, icon, color, condition_type, condition_value, points_reward, sort_order) VALUES
('المبتدئ', 'أكمل أول درس', 'BookOpen', '#3b82f6', 'lessons_completed', 1, 5, 1),
('المتعلم النشط', 'أكمل 10 دروس', 'Flame', '#f97316', 'lessons_completed', 10, 20, 2),
('المثابر', 'أكمل 25 درساً', 'Target', '#8b5cf6', 'lessons_completed', 25, 50, 3),
('الخبير', 'أكمل 50 درساً', 'Crown', '#eab308', 'lessons_completed', 50, 100, 4),
('الأسطورة', 'أكمل 100 درس', 'Star', '#ef4444', 'lessons_completed', 100, 200, 5),
('جامع النقاط', 'احصل على 100 نقطة', 'Coins', '#10b981', 'points_earned', 100, 10, 6),
('نجم النقاط', 'احصل على 500 نقطة', 'Gem', '#6366f1', 'points_earned', 500, 30, 7),
('حامل الشهادة', 'احصل على أول شهادة إتمام', 'Award', '#f59e0b', 'certificates_earned', 1, 25, 8),
('المتفوق', 'احصل على 3 شهادات إتمام', 'Trophy', '#ec4899', 'certificates_earned', 3, 75, 9);

-- ===== 20260326011103 lesson_comments =====
CREATE TABLE public.lesson_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  parent_id uuid REFERENCES public.lesson_comments(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lesson_comments_lesson ON public.lesson_comments(lesson_id);
CREATE INDEX idx_lesson_comments_parent ON public.lesson_comments(parent_id);
ALTER TABLE public.lesson_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view comments" ON public.lesson_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own comments" ON public.lesson_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own comments" ON public.lesson_comments FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own comments" ON public.lesson_comments FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage comments" ON public.lesson_comments FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
ALTER PUBLICATION supabase_realtime ADD TABLE public.lesson_comments;

-- ===== 20260326012502 ai_usage_logs =====
CREATE TABLE public.ai_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  feature text NOT NULL,
  model text,
  tokens_used integer DEFAULT 0,
  success boolean DEFAULT true,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view all AI logs" ON public.ai_usage_logs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Service role can insert AI logs" ON public.ai_usage_logs FOR INSERT TO public WITH CHECK (true);
CREATE INDEX idx_ai_usage_logs_created_at ON public.ai_usage_logs(created_at DESC);
CREATE INDEX idx_ai_usage_logs_feature ON public.ai_usage_logs(feature);

-- ===== 20260326012513 =====
DROP POLICY "Service role can insert AI logs" ON public.ai_usage_logs;
CREATE POLICY "Authenticated can insert own AI logs" ON public.ai_usage_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ===== 20260326012803 =====
CREATE POLICY "Service role can insert AI logs" ON public.ai_usage_logs FOR INSERT TO public WITH CHECK (auth.role() = 'service_role');

-- ===== 20260326012932 lesson_summaries =====
CREATE TABLE public.lesson_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  summary text NOT NULL,
  key_points jsonb NOT NULL DEFAULT '[]',
  study_tip text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(lesson_id)
);
ALTER TABLE public.lesson_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can view summaries" ON public.lesson_summaries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can manage summaries" ON public.lesson_summaries FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ===== 20260326013257 =====
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS semester integer;

-- ===== 20260326015506 check_ai_error_rate =====
CREATE OR REPLACE FUNCTION public.check_ai_error_rate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_total integer; v_errors integer; v_error_rate numeric; v_threshold numeric := 20; v_admin record; v_last_notification timestamp;
BEGIN
  IF NEW.success IS NOT FALSE THEN RETURN NEW; END IF;
  SELECT count(*), count(*) FILTER (WHERE success = false) INTO v_total, v_errors
  FROM (SELECT success FROM ai_usage_logs ORDER BY created_at DESC LIMIT 50) recent;
  IF v_total < 10 THEN RETURN NEW; END IF;
  v_error_rate := (v_errors::numeric / v_total::numeric) * 100;
  IF v_error_rate >= v_threshold THEN
    SELECT max(created_at) INTO v_last_notification FROM notifications
    WHERE type = 'warning' AND title = 'تنبيه: ارتفاع أخطاء الذكاء الاصطناعي ⚠️' AND created_at > now() - interval '1 hour';
    IF v_last_notification IS NOT NULL THEN RETURN NEW; END IF;
    FOR v_admin IN SELECT user_id FROM user_roles WHERE role = 'admin' LOOP
      INSERT INTO notifications (user_id, title, message, type)
      VALUES (v_admin.user_id, 'تنبيه: ارتفاع أخطاء الذكاء الاصطناعي ⚠️',
        'معدل أخطاء الذكاء الاصطناعي وصل إلى ' || round(v_error_rate, 1) || '% في آخر ' || v_total || ' طلب. الخطأ الأخير: ' || COALESCE(NEW.error_message, 'غير محدد'),
        'warning');
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_ai_error_check_rate AFTER INSERT ON ai_usage_logs FOR EACH ROW EXECUTE FUNCTION check_ai_error_rate();

-- ===== 20260326020417 =====
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS parent_email text, ADD COLUMN IF NOT EXISTS parent_phone text;

-- ===== 20260326024255 =====
CREATE POLICY "Service role can manage user_roles" ON public.user_roles FOR ALL TO public USING (auth.role() = 'service_role'::text) WITH CHECK (auth.role() = 'service_role'::text);

-- ===== 20260326024959 dashboard_stats =====
CREATE MATERIALIZED VIEW IF NOT EXISTS public.dashboard_stats AS
SELECT
  (SELECT count(*) FROM public.grades) AS total_grades,
  (SELECT count(*) FROM public.subjects) AS total_subjects,
  (SELECT count(*) FROM public.lessons) AS total_lessons,
  (SELECT count(*) FROM public.questions) AS total_questions,
  (SELECT count(*) FROM public.profiles) AS total_students,
  (SELECT count(*) FROM public.payment_requests WHERE status = 'pending') AS pending_payments,
  (SELECT count(*) FROM public.payment_requests WHERE status = 'approved') AS approved_payments,
  (SELECT count(*) FROM public.payment_requests WHERE status = 'rejected') AS rejected_payments,
  (SELECT COALESCE(SUM(amount), 0) FROM public.payment_requests WHERE status = 'approved') AS total_revenue,
  (SELECT count(*) FROM public.subscriptions WHERE status = 'active') AS active_subscriptions,
  (SELECT count(*) FROM public.subscriptions WHERE status = 'pending') AS pending_subscriptions,
  (SELECT count(*) FROM public.subscriptions WHERE status = 'expired') AS expired_subscriptions;
CREATE UNIQUE INDEX IF NOT EXISTS dashboard_stats_single_row ON public.dashboard_stats ((1));
CREATE OR REPLACE FUNCTION public.refresh_dashboard_stats()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN REFRESH MATERIALIZED VIEW CONCURRENTLY public.dashboard_stats; END;
$$;
GRANT SELECT ON public.dashboard_stats TO authenticated;
GRANT SELECT ON public.dashboard_stats TO anon;

-- ===== 20260326025012 move dashboard_stats to extensions =====
ALTER MATERIALIZED VIEW public.dashboard_stats SET SCHEMA extensions;
DROP FUNCTION IF EXISTS public.refresh_dashboard_stats();
CREATE OR REPLACE FUNCTION public.refresh_dashboard_stats()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.dashboard_stats; END;
$$;
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS TABLE(total_grades bigint, total_subjects bigint, total_lessons bigint, total_questions bigint, total_students bigint, pending_payments bigint, approved_payments bigint, rejected_payments bigint, total_revenue numeric, active_subscriptions bigint, pending_subscriptions bigint, expired_subscriptions bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT * FROM extensions.dashboard_stats LIMIT 1;
$$;
