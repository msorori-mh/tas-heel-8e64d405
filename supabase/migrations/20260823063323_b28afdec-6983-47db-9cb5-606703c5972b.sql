CREATE OR REPLACE FUNCTION public.cf11_html_asset_refs(_html text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(array_agg(DISTINCT m[1]), ARRAY[]::text[])
    FROM regexp_matches(
      coalesce(_html,''),
      '<img\y[^>]*\ysrc\s*=\s*["'']([^"''>]+)["'']',
      'gi'
    ) AS t(m)
   WHERE m[1] !~* '^data:image/(png|jpeg|jpg|gif|webp);base64,';
$$;

REVOKE ALL ON FUNCTION public.cf11_html_asset_refs(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cf11_html_asset_refs(text) TO service_role;