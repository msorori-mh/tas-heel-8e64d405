-- PHET_WRAPPER_ATTRIBUTION_LINKS
-- Accept the common safe PhET wrapper shape: one simulation iframe plus
-- optional attribution/fallback anchors on the exact HTTPS PhET host.
-- Fetch-capable external resources remain forbidden.

BEGIN;

CREATE OR REPLACE FUNCTION public.cf11_is_allowed_phet_lab(_html text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  item record;
  frame_count integer := 0;
BEGIN
  IF coalesce(btrim(_html), '') = ''
     OR _html ~* '<(script|object|embed|form|base)\y'
     OR _html ~* '\son[a-z]+\s*='
     OR _html ~* 'url\(\s*["'']?(https?:)?//' THEN
    RETURN false;
  END IF;

  FOR item IN
    SELECT
      lower(m[1]) AS tag_name,
      lower(m[2]) AS attribute_name,
      btrim(coalesce(m[3], m[4], m[5], '')) AS ref
    FROM regexp_matches(
      _html,
      '<([A-Za-z][A-Za-z0-9:-]*)\y[^>]*\y(src|href|poster|srcset)\s*=\s*(?:"([^"]*)"|''([^'']*)''|([^\s>]+))',
      'gi'
    ) AS m
  LOOP
    IF item.ref !~* '^(https?:)?//' THEN
      CONTINUE;
    END IF;

    IF item.tag_name = 'iframe' AND item.attribute_name = 'src' THEN
      IF item.ref !~* '^https://phet\.colorado\.edu/sims/html/[A-Za-z0-9._~!$&()*+,;=:@%/-]+(\?[A-Za-z0-9._~!$&()*+,;=:@%/?-]*)?(#[A-Za-z0-9._~!$&()*+,;=:@%/?-]*)?$' THEN
        RETURN false;
      END IF;
      frame_count := frame_count + 1;
    ELSIF item.tag_name = 'a' AND item.attribute_name = 'href' THEN
      IF item.ref !~* '^https://phet\.colorado\.edu(?:[/?#][A-Za-z0-9._~!$&()*+,;=:@%/?#-]*)?$' THEN
        RETURN false;
      END IF;
    ELSE
      RETURN false;
    END IF;
  END LOOP;

  RETURN frame_count = 1;
END;
$function$;

COMMENT ON FUNCTION public.cf11_is_allowed_phet_lab(text) IS
  'Allows one exact HTTPS PhET simulation iframe plus optional exact-host PhET attribution links; denies every other external dependency.';

REVOKE ALL ON FUNCTION public.cf11_is_allowed_phet_lab(text) FROM PUBLIC, anon, authenticated;

DO $proof$
DECLARE
  v_wrapper text := '<html dir="rtl"><body><iframe src="https://phet.colorado.edu/sims/html/density/latest/density_all.html"></iframe><a href="https://phet.colorado.edu/ar/">PhET</a></body></html>';
  v_contract jsonb;
BEGIN
  IF NOT public.cf11_is_allowed_phet_lab(v_wrapper) THEN
    RAISE EXCEPTION 'PHET_ATTRIBUTION_WRAPPER_REJECTED';
  END IF;
  IF public.cf11_is_allowed_phet_lab('<iframe src="https://phet.colorado.edu/sims/html/density/latest/density_all.html"></iframe><img src="https://phet.colorado.edu/logo.png">')
     OR public.cf11_is_allowed_phet_lab('<iframe src="https://phet.colorado.edu/sims/html/density/latest/density_all.html"></iframe><a href="https://example.com/">Other</a>')
     OR public.cf11_is_allowed_phet_lab('<a href="https://phet.colorado.edu/ar/">PhET</a>') THEN
    RAISE EXCEPTION 'PHET_EXTERNAL_RESOURCE_GATE_WIDENED';
  END IF;

  v_contract := public.cf11_assert_interactive_contract('labExperimentHtml', v_wrapper);
  IF v_contract->>'externalProvider' <> 'PHET'
     OR v_contract->>'allowedOrigin' <> 'https://phet.colorado.edu'
     OR (v_contract->>'networkRequired')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'PHET_ATTRIBUTION_CONTRACT_METADATA_INVALID';
  END IF;
END
$proof$;

COMMIT;
