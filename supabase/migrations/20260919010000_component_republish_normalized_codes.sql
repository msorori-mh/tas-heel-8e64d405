-- Match the canonical keys stored by the existing BEFORE triggers. Removing a
-- local upload does not remove the published row, so a new intake must find it.
-- Patch only the two assignments; preserve the live publisher and its grants.
BEGIN;

DO $migration$
DECLARE
  target regprocedure := to_regprocedure('public.lesson_component_publish_v2(uuid,text)');
  original text;
  patched text;
  before_acl aclitem[];
  before_owner oid;
  old_values text[] := ARRAY[
    $old$v_code:=upper(v_lesson.slug)||'-EXP';$old$,
    $old$v_code:=upper(v_lesson.slug)||'-MINDMAP';$old$
  ];
  new_values text[] := ARRAY[
    $new$v_code:=public.normalize_content_code(upper(v_lesson.slug)||'-EXP');$new$,
    $new$v_code:=public.normalize_resource_code(upper(v_lesson.slug)||'-MINDMAP');$new$
  ];
  old_count integer;
  new_count integer;
  i integer;
BEGIN
  IF target IS NULL
     OR to_regprocedure('public.normalize_content_code(text)') IS NULL
     OR to_regprocedure('public.normalize_resource_code(text)') IS NULL THEN
    RAISE EXCEPTION 'LCPV2_REPUBLISH_DEPENDENCY_MISSING';
  END IF;
  SELECT pg_get_functiondef(oid),proacl,proowner
    INTO original,before_acl,before_owner FROM pg_proc WHERE oid=target;
  patched := original;
  FOR i IN 1..array_length(old_values,1) LOOP
    old_count := (length(patched)-length(replace(patched,old_values[i],'')))/length(old_values[i]);
    new_count := (length(patched)-length(replace(patched,new_values[i],'')))/length(new_values[i]);
    IF old_count=1 AND new_count=0 THEN
      patched := replace(patched,old_values[i],new_values[i]);
    ELSIF old_count<>0 OR new_count<>1 THEN
      RAISE EXCEPTION 'LCPV2_REPUBLISH_ASSIGNMENT_DRIFT: %',i;
    END IF;
  END LOOP;
  IF patched IS DISTINCT FROM original THEN EXECUTE patched; END IF;
  IF pg_get_functiondef(target) IS DISTINCT FROM patched
     OR (SELECT proacl IS DISTINCT FROM before_acl OR proowner<>before_owner
           FROM pg_proc WHERE oid=target) THEN
    RAISE EXCEPTION 'LCPV2_REPUBLISH_POSTVERIFY_FAILED';
  END IF;
END
$migration$;

COMMIT;
