-- ===== 20260325010914_email_infra =====
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS supabase_vault;
CREATE EXTENSION IF NOT EXISTS pgmq;

DO $$ BEGIN PERFORM pgmq.create('auth_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('auth_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('transactional_emails_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.email_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT,
  template_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq')),
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Service role can read send log" ON public.email_send_log FOR SELECT USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Service role can insert send log" ON public.email_send_log FOR INSERT WITH CHECK (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Service role can update send log" ON public.email_send_log FOR UPDATE USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_email_send_log_created ON public.email_send_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_send_log_recipient ON public.email_send_log(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_send_log_message ON public.email_send_log(message_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_send_log_message_sent_unique ON public.email_send_log(message_id) WHERE status = 'sent';

CREATE TABLE IF NOT EXISTS public.email_send_state (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  retry_after_until TIMESTAMPTZ,
  batch_size INTEGER NOT NULL DEFAULT 10,
  send_delay_ms INTEGER NOT NULL DEFAULT 200,
  auth_email_ttl_minutes INTEGER NOT NULL DEFAULT 15,
  transactional_email_ttl_minutes INTEGER NOT NULL DEFAULT 60,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.email_send_state (id) VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE public.email_send_state ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Service role can manage send state" ON public.email_send_state FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name TEXT, payload JSONB)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name TEXT, batch_size INT, vt INT)
RETURNS TABLE(msg_id BIGINT, read_ct INT, message JSONB) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name TEXT, message_id BIGINT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue TEXT, dlq_name TEXT, message_id BIGINT, payload JSONB)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN PERFORM pgmq.create(dlq_name); EXCEPTION WHEN OTHERS THEN NULL; END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN PERFORM pgmq.delete(source_queue, message_id); EXCEPTION WHEN undefined_table THEN NULL; END;
  RETURN new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) TO service_role;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) TO service_role;

CREATE TABLE IF NOT EXISTS public.suppressed_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('unsubscribe', 'bounce', 'complaint')),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email)
);
ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Service role can read suppressed emails" ON public.suppressed_emails FOR SELECT USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Service role can insert suppressed emails" ON public.suppressed_emails FOR INSERT WITH CHECK (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_suppressed_emails_email ON public.suppressed_emails(email);

CREATE TABLE IF NOT EXISTS public.email_unsubscribe_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at TIMESTAMPTZ
);
ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Service role can read tokens" ON public.email_unsubscribe_tokens FOR SELECT USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Service role can insert tokens" ON public.email_unsubscribe_tokens FOR INSERT WITH CHECK (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Service role can mark tokens as used" ON public.email_unsubscribe_tokens FOR UPDATE USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_unsubscribe_tokens_token ON public.email_unsubscribe_tokens(token);

-- ===== 20260325011151 cron =====
SELECT cron.schedule(
  'check-subscription-expiry',
  '0 8 * * *',
  $CRON$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1) || '/functions/v1/check-subscription-expiry',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1)),
    body := '{}'::jsonb
  );
  $CRON$
);

-- ===== 20260325011431 get_user_email =====
CREATE OR REPLACE FUNCTION public.get_user_email(_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  SELECT email FROM auth.users WHERE id = _user_id
$$;

-- ===== 20260325012514 contact_submissions =====
CREATE TABLE public.contact_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL,
  subject text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can submit contact form" ON public.contact_submissions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Admins can manage contact submissions" ON public.contact_submissions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ===== 20260325014558 certificates =====
CREATE TABLE public.certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, subject_id)
);
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own certificates" ON public.certificates FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "System can insert certificates" ON public.certificates FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.check_and_issue_certificate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_subject_id uuid; v_total_lessons int; v_completed_lessons int;
BEGIN
  IF NEW.completed IS NOT TRUE THEN RETURN NEW; END IF;
  SELECT subject_id INTO v_subject_id FROM public.lessons WHERE id = NEW.lesson_id;
  IF v_subject_id IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_total_lessons FROM public.lessons WHERE subject_id = v_subject_id;
  SELECT count(*) INTO v_completed_lessons FROM public.user_progress up
    JOIN public.lessons l ON l.id = up.lesson_id
    WHERE up.user_id = NEW.user_id AND l.subject_id = v_subject_id AND up.completed = true;
  IF v_completed_lessons >= v_total_lessons AND v_total_lessons > 0 THEN
    INSERT INTO public.certificates (user_id, subject_id) VALUES (NEW.user_id, v_subject_id) ON CONFLICT (user_id, subject_id) DO NOTHING;
    INSERT INTO public.notifications (user_id, title, message, type) VALUES (NEW.user_id, 'شهادة إتمام جديدة 🎓', 'تهانينا! لقد أكملت جميع دروس المادة وحصلت على شهادة إتمام.', 'success');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trigger_check_certificate AFTER INSERT OR UPDATE ON public.user_progress FOR EACH ROW EXECUTE FUNCTION public.check_and_issue_certificate();

-- ===== 20260325191133 subscription_plans =====
CREATE TABLE public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  duration_type text NOT NULL CHECK (duration_type IN ('semester', 'annual')),
  duration_months integer NOT NULL DEFAULT 5,
  price numeric NOT NULL,
  currency text NOT NULL DEFAULT 'YER',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Plans viewable by authenticated" ON public.subscription_plans FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "Admins can manage plans" ON public.subscription_plans FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'));
ALTER TABLE public.subjects ADD COLUMN semester integer DEFAULT NULL;
ALTER TABLE public.subscriptions ADD COLUMN plan_id uuid REFERENCES public.subscription_plans(id);
ALTER TABLE public.payment_requests ADD COLUMN plan_id uuid REFERENCES public.subscription_plans(id);

-- ===== 20260325191838 =====
ALTER TABLE public.subscriptions ADD COLUMN semester integer DEFAULT NULL;

-- ===== 20260325192240 is_first_lesson_in_subject =====
CREATE OR REPLACE FUNCTION public.is_first_lesson_in_subject(_lesson_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lessons l
    WHERE l.id = _lesson_id
      AND l.sort_order = (SELECT MIN(l2.sort_order) FROM public.lessons l2 WHERE l2.subject_id = l.subject_id)
  )
$$;
DROP POLICY IF EXISTS "Paid lessons viewable by active subscribers" ON public.lessons;
CREATE POLICY "Paid lessons viewable by active subscribers" ON public.lessons FOR SELECT TO authenticated
USING (is_free = true OR is_first_lesson_in_subject(id) OR has_active_subscription(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

-- ===== 20260325192751 =====
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS semester integer DEFAULT NULL;
