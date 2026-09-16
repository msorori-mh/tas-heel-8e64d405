-- Execute ONLY on qwfvlppsffcmmbjpznkw. All fixture data rolls back.
BEGIN;
DO $$
DECLARE a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); administrator uuid:=gen_random_uuid();
BEGIN
  PERFORM set_config('capacity.user_a',a::text,true);
  PERFORM set_config('capacity.user_b',b::text,true);
  PERFORM set_config('capacity.admin',administrator::text,true);
  INSERT INTO auth.users(instance_id,id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  SELECT '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',
         id::text||'@capacity-rls.test.invalid',
         '{"provider":"email","providers":["email"],"test_only":true,"capacity_run":"capacityrls2026"}'::jsonb,
         '{"full_name":"TEST_ONLY CAPACITY RLS"}'::jsonb,now(),now()
  FROM unnest(array[a,b,administrator]) id;
  INSERT INTO public.user_roles(user_id,role) VALUES(administrator,'admin');
  INSERT INTO public.user_progress(user_id,lesson_id,progress_percent)
  VALUES(b,'98ea519e-36af-4d86-9a46-b00649fcdb52',20);
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('capacity.user_a'),true);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('capacity.user_a'),'role','authenticated')::text,true);
DO $$
DECLARE n int; denied boolean:=false;
BEGIN
  IF (SELECT count(*) FROM public.profiles WHERE user_id=current_setting('capacity.user_a')::uuid) <> 1
     OR EXISTS(SELECT 1 FROM public.profiles WHERE user_id=current_setting('capacity.user_b')::uuid)
     OR EXISTS(SELECT 1 FROM public.user_progress WHERE user_id=current_setting('capacity.user_b')::uuid)
  THEN RAISE EXCEPTION 'CAPACITY_CROSS_USER_READ'; END IF;
  INSERT INTO public.user_progress(user_id,lesson_id,progress_percent)
  VALUES(current_setting('capacity.user_a')::uuid,'98ea519e-36af-4d86-9a46-b00649fcdb52',25);
  UPDATE public.user_progress SET progress_percent=30 WHERE user_id=current_setting('capacity.user_a')::uuid;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>1 THEN RAISE EXCEPTION 'CAPACITY_OWN_UPDATE_DENIED'; END IF;
  UPDATE public.user_progress SET progress_percent=99 WHERE user_id=current_setting('capacity.user_b')::uuid;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>0 THEN RAISE EXCEPTION 'CAPACITY_CROSS_USER_UPDATE'; END IF;
  BEGIN
    INSERT INTO public.user_progress(user_id,lesson_id,progress_percent)
    VALUES(current_setting('capacity.user_b')::uuid,'98ea519e-36af-4d86-9a46-b00649fcdb52',99);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'CAPACITY_CROSS_USER_INSERT'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub',current_setting('capacity.admin'),true);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('capacity.admin'),'role','authenticated')::text,true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.profiles WHERE user_id=current_setting('capacity.user_b')::uuid)<>1
     OR (SELECT count(*) FROM public.user_progress WHERE user_id=current_setting('capacity.user_b')::uuid AND progress_percent=20)<>1
  THEN RAISE EXCEPTION 'CAPACITY_ADMIN_OR_OWNERSHIP_REGRESSION'; END IF;
END $$;
SELECT 'PASS: owner read/write, cross-user denial and administrator access' AS result;
ROLLBACK;
