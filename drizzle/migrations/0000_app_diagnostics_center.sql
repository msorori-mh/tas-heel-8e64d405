-- DIAGNOSTICS-CENTER-01 — additive only.
CREATE TABLE IF NOT EXISTS public.app_diagnostic_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  source text NOT NULL CHECK (source IN ('client', 'server', 'google_play', 'crashlytics')),
  event_type text NOT NULL CHECK (char_length(event_type) BETWEEN 1 AND 64),
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'fatal')),
  fingerprint text NOT NULL CHECK (char_length(fingerprint) BETWEEN 4 AND 64),
  message text NOT NULL CHECK (char_length(message) <= 500),
  stack text CHECK (char_length(stack) <= 4000),
  route text CHECK (char_length(route) <= 200),
  action text CHECK (char_length(action) <= 120),
  app_version text CHECK (char_length(app_version) <= 64),
  app_build text CHECK (char_length(app_build) <= 64),
  platform text CHECK (char_length(platform) <= 32),
  os_version text CHECK (char_length(os_version) <= 64),
  device_model text CHECK (char_length(device_model) <= 96),
  network_type text CHECK (char_length(network_type) <= 32),
  online boolean,
  session_id text CHECK (char_length(session_id) <= 64),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(metadata) <= 4096),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_diagnostic_events_created_at_idx ON public.app_diagnostic_events (created_at DESC);
CREATE INDEX IF NOT EXISTS app_diagnostic_events_fingerprint_idx ON public.app_diagnostic_events (fingerprint, created_at DESC);
CREATE INDEX IF NOT EXISTS app_diagnostic_events_app_version_idx ON public.app_diagnostic_events (app_version);
CREATE INDEX IF NOT EXISTS app_diagnostic_events_event_type_idx ON public.app_diagnostic_events (event_type);
CREATE INDEX IF NOT EXISTS app_diagnostic_events_user_id_idx ON public.app_diagnostic_events (user_id);

GRANT SELECT, INSERT ON public.app_diagnostic_events TO authenticated;
GRANT ALL ON public.app_diagnostic_events TO service_role;
ALTER TABLE public.app_diagnostic_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "diagnostic events insert own" ON public.app_diagnostic_events;
CREATE POLICY "diagnostic events insert own"
  ON public.app_diagnostic_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "diagnostic events full admin read" ON public.app_diagnostic_events;
CREATE POLICY "diagnostic events full admin read"
  ON public.app_diagnostic_events FOR SELECT TO authenticated
  USING (public.is_full_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.app_diagnostic_issue_state (
  fingerprint text PRIMARY KEY CHECK (char_length(fingerprint) BETWEEN 4 AND 64),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'investigating', 'resolved', 'ignored')),
  note text CHECK (char_length(note) <= 500),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.app_diagnostic_issue_state TO authenticated;
GRANT ALL ON public.app_diagnostic_issue_state TO service_role;
ALTER TABLE public.app_diagnostic_issue_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "diagnostic issue state full admin" ON public.app_diagnostic_issue_state;
CREATE POLICY "diagnostic issue state full admin"
  ON public.app_diagnostic_issue_state FOR ALL TO authenticated
  USING (public.is_full_admin(auth.uid()))
  WITH CHECK (public.is_full_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.app_diagnostics_window(_window text)
RETURNS interval LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _window
    WHEN '24h' THEN interval '24 hours'
    WHEN '7d'  THEN interval '7 days'
    WHEN '30d' THEN interval '30 days'
    ELSE interval '24 hours'
  END
$$;

CREATE OR REPLACE FUNCTION public.admin_diagnostics_summary(_window text DEFAULT '24h')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _since timestamptz;
  _bucket text;
  _result jsonb;
BEGIN
  IF NOT public.is_full_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  _since := now() - public.app_diagnostics_window(_window);
  _bucket := CASE WHEN _window = '24h' THEN 'hour' ELSE 'day' END;

  SELECT jsonb_build_object(
    'window', COALESCE(_window, '24h'),
    'total_events', (SELECT count(*) FROM app_diagnostic_events e WHERE e.created_at >= _since),
    'affected_users', (SELECT count(DISTINCT e.user_id) FROM app_diagnostic_events e WHERE e.created_at >= _since AND e.user_id IS NOT NULL),
    'critical_events', (SELECT count(*) FROM app_diagnostic_events e WHERE e.created_at >= _since AND e.severity IN ('error', 'fatal')),
    'new_issues', (SELECT count(*) FROM (
        SELECT e.fingerprint FROM app_diagnostic_events e
        WHERE e.created_at >= _since
        GROUP BY e.fingerprint
        HAVING COALESCE((SELECT s.status FROM app_diagnostic_issue_state s WHERE s.fingerprint = e.fingerprint), 'new') = 'new'
      ) q),
    'top_app_versions', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT COALESCE(e.app_version, 'غير معروف') AS label, count(*) AS count
        FROM app_diagnostic_events e WHERE e.created_at >= _since GROUP BY 1 ORDER BY 2 DESC LIMIT 5) x), '[]'::jsonb),
    'top_platforms', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT COALESCE(e.platform, 'غير معروف') AS label, count(*) AS count
        FROM app_diagnostic_events e WHERE e.created_at >= _since GROUP BY 1 ORDER BY 2 DESC LIMIT 5) x), '[]'::jsonb),
    'top_routes', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT COALESCE(e.route, 'غير معروف') AS label, count(*) AS count
        FROM app_diagnostic_events e WHERE e.created_at >= _since GROUP BY 1 ORDER BY 2 DESC LIMIT 5) x), '[]'::jsonb),
    'timeline', COALESCE((SELECT jsonb_agg(x ORDER BY x.bucket) FROM (
        SELECT date_trunc(_bucket, e.created_at) AS bucket, count(*) AS count
        FROM app_diagnostic_events e WHERE e.created_at >= _since GROUP BY 1) x), '[]'::jsonb)
  ) INTO _result;

  RETURN _result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_diagnostics_issues(_window text DEFAULT '24h', _limit integer DEFAULT 100)
RETURNS TABLE (
  fingerprint text, severity text, event_type text, source text, message text,
  event_count bigint, affected_users bigint, first_seen timestamptz, last_seen timestamptz,
  app_version text, platform text, route text, status text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _since timestamptz;
BEGIN
  IF NOT public.is_full_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  _since := now() - public.app_diagnostics_window(_window);

  RETURN QUERY
  SELECT
    e.fingerprint,
    (array_agg(e.severity ORDER BY CASE e.severity WHEN 'fatal' THEN 0 WHEN 'error' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END))[1],
    (array_agg(e.event_type ORDER BY e.created_at DESC))[1],
    (array_agg(e.source ORDER BY e.created_at DESC))[1],
    (array_agg(e.message ORDER BY e.created_at DESC))[1],
    count(*)::bigint,
    count(DISTINCT e.user_id)::bigint,
    min(e.created_at),
    max(e.created_at),
    (array_agg(e.app_version ORDER BY e.created_at DESC))[1],
    (array_agg(e.platform ORDER BY e.created_at DESC))[1],
    (array_agg(e.route ORDER BY e.created_at DESC))[1],
    COALESCE((SELECT s.status FROM app_diagnostic_issue_state s WHERE s.fingerprint = e.fingerprint), 'new')
  FROM app_diagnostic_events e
  WHERE e.created_at >= _since
  GROUP BY e.fingerprint
  ORDER BY count(*) DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 100), 1), 500);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_diagnostics_issue_detail(_fingerprint text, _limit integer DEFAULT 20)
RETURNS TABLE (
  id uuid, created_at timestamptz, severity text, source text, event_type text, message text,
  stack text, route text, action text, app_version text, app_build text, platform text,
  os_version text, device_model text, network_type text, online boolean, session_id text, metadata jsonb
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_full_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT e.id, e.created_at, e.severity, e.source, e.event_type, e.message, e.stack,
         e.route, e.action, e.app_version, e.app_build, e.platform, e.os_version,
         e.device_model, e.network_type, e.online, e.session_id, e.metadata
  FROM app_diagnostic_events e
  WHERE e.fingerprint = _fingerprint
  ORDER BY e.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 20), 1), 100);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_diagnostics_set_issue_status(_fingerprint text, _status text, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _row app_diagnostic_issue_state;
BEGIN
  IF NOT public.is_full_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _status NOT IN ('new', 'investigating', 'resolved', 'ignored') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;
  IF _fingerprint IS NULL OR char_length(_fingerprint) < 4 OR char_length(_fingerprint) > 64 THEN
    RAISE EXCEPTION 'invalid_fingerprint' USING ERRCODE = '22023';
  END IF;

  INSERT INTO app_diagnostic_issue_state (fingerprint, status, note, updated_by, updated_at)
  VALUES (_fingerprint, _status, left(_note, 500), auth.uid(), now())
  ON CONFLICT (fingerprint) DO UPDATE
    SET status = EXCLUDED.status, note = EXCLUDED.note, updated_by = EXCLUDED.updated_by, updated_at = now()
  RETURNING * INTO _row;

  RETURN jsonb_build_object('fingerprint', _row.fingerprint, 'status', _row.status, 'updated_at', _row.updated_at);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_diagnostics_summary(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_diagnostics_issues(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_diagnostics_issue_detail(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_diagnostics_set_issue_status(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.app_diagnostics_window(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_diagnostics_summary(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_diagnostics_issues(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_diagnostics_issue_detail(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_diagnostics_set_issue_status(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_diagnostics_window(text) TO authenticated;