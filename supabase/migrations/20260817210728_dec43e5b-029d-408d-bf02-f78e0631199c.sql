REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.subject_textbooks FROM authenticated;
REVOKE ALL ON public.subject_textbooks FROM anon, PUBLIC;
GRANT SELECT ON public.subject_textbooks TO authenticated;
GRANT ALL ON public.subject_textbooks TO service_role;