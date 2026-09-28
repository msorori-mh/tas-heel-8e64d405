CREATE TABLE public.lesson_lab_corrections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lesson_id uuid NOT NULL REFERENCES public.lessons(id),
 old_resource_id uuid NOT NULL UNIQUE REFERENCES public.lesson_resources(id),
 new_resource_id uuid NOT NULL UNIQUE REFERENCES public.lesson_resources(id),
 intake_id uuid NOT NULL UNIQUE REFERENCES public.lesson_component_intakes_v2(id),
 reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 500),
 old_sha256 text NOT NULL,
 new_sha256 text NOT NULL,
 corrected_by uuid NOT NULL REFERENCES auth.users(id),
 corrected_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT lesson_lab_corrections_distinct CHECK (old_resource_id <> new_resource_id)
);
GRANT SELECT ON public.lesson_lab_corrections TO authenticated;
GRANT ALL ON public.lesson_lab_corrections TO service_role;
ALTER TABLE public.lesson_lab_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Full admin reads lab corrections" ON public.lesson_lab_corrections FOR SELECT TO authenticated USING (public.is_full_admin(auth.uid()));
CREATE INDEX lesson_lab_corrections_lesson_idx ON public.lesson_lab_corrections(lesson_id);
-- Apply a restrictive read gate to every student table query, including direct PostgREST reads.
CREATE POLICY "Students cannot read replaced lab resources" ON public.lesson_resources AS RESTRICTIVE FOR SELECT TO authenticated USING (public.is_content_staff(auth.uid()) OR NOT EXISTS (SELECT 1 FROM public.lesson_lab_corrections c WHERE c.old_resource_id = lesson_resources.id));
CREATE OR REPLACE FUNCTION public.lesson_component_correct_lab_v2(_intake_id uuid, _old_resource_id uuid, _expected_old_sha256 text, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $fn$
DECLARE v_uid uuid := auth.uid(); v_intake public.lesson_component_intakes_v2; v_old public.lesson_resources; v_new public.lesson_resources; v_result jsonb; v_new_code text; v_index integer; v_count integer;
BEGIN
 IF v_uid IS NULL OR NOT public.is_full_admin(v_uid) THEN RAISE EXCEPTION 'LAB_CORRECTION_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(_reason,''))) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'LAB_CORRECTION_REASON_REQUIRED' USING ERRCODE='22023'; END IF;
 IF coalesce(_expected_old_sha256,'') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'LAB_CORRECTION_HASH_INVALID' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_intake FROM public.lesson_component_intakes_v2 WHERE id=_intake_id FOR UPDATE;
 IF v_intake.id IS NULL OR v_intake.status <> 'VERIFIED' OR v_intake.capability <> 'labExperimentHtml' OR v_intake.created_by <> v_uid THEN RAISE EXCEPTION 'LAB_CORRECTION_INTAKE_INVALID' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_intake.lesson_id::text||':labExperimentHtml',0));
 SELECT * INTO v_old FROM public.lesson_resources WHERE id=_old_resource_id AND lesson_id=v_intake.lesson_id AND resource_type='experiment' AND html_resource_type='INTERACTIVE' FOR UPDATE;
 IF v_old.id IS NULL OR v_old.metadata->>'cf11_verified_bundle_sha256' IS DISTINCT FROM _expected_old_sha256 OR EXISTS (SELECT 1 FROM public.lesson_lab_corrections WHERE old_resource_id=v_old.id) THEN RAISE EXCEPTION 'LAB_CORRECTION_STALE_TARGET' USING ERRCODE='23505'; END IF;
 IF v_old.metadata->>'cf11_publication_id' IS NULL THEN RAISE EXCEPTION 'LAB_CORRECTION_UNMANAGED_TARGET' USING ERRCODE='23514'; END IF;
 v_index := (v_intake.validation_summary->'labExperiment'->>'instanceIndex')::integer;
 v_count := (v_intake.validation_summary->'labExperiment'->>'instanceCount')::integer;
 IF v_index IS NULL OR v_count IS NULL OR v_index < 0 OR v_index >= v_count OR v_count > 99 THEN RAISE EXCEPTION 'LAB_CORRECTION_INSTANCE_INVALID' USING ERRCODE='22023'; END IF;
 v_new_code := public.normalize_resource_code(upper(v_intake.lesson_code)||'-LAB-'||lpad((v_index+1)::text,2,'0'));
 IF v_new_code = v_old.resource_code OR EXISTS(SELECT 1 FROM public.lesson_resources WHERE lesson_id=v_old.lesson_id AND resource_code=v_new_code) THEN RAISE EXCEPTION 'LAB_CORRECTION_SLOT_OCCUPIED' USING ERRCODE='23505'; END IF;
 v_result := public.lesson_component_publish_v2(_intake_id,'lcpv2:'||_intake_id::text||':publish');
 IF v_result->>'resource_code' IS DISTINCT FROM v_new_code OR (v_result->>'idempotent')::boolean IS DISTINCT FROM false THEN RAISE EXCEPTION 'LAB_CORRECTION_PUBLICATION_MISMATCH' USING ERRCODE='23514'; END IF;
 SELECT * INTO v_new FROM public.lesson_resources WHERE lesson_id=v_old.lesson_id AND resource_code=v_new_code FOR UPDATE;
 IF v_new.id IS NULL OR v_new.metadata->>'cf11_verified_bundle_sha256' IS DISTINCT FROM v_intake.source_sha256 THEN RAISE EXCEPTION 'LAB_CORRECTION_NEW_RESOURCE_INVALID' USING ERRCODE='23514'; END IF;
 INSERT INTO public.lesson_lab_corrections(lesson_id,old_resource_id,new_resource_id,intake_id,reason,old_sha256,new_sha256,corrected_by) VALUES (v_old.lesson_id,v_old.id,v_new.id,v_intake.id,btrim(_reason),_expected_old_sha256,v_intake.source_sha256,v_uid);
 INSERT INTO public.audit_logs(actor_id,action,target_type,target_id,metadata) VALUES (v_uid,'lesson_lab_correction','lesson_resource',v_old.id,jsonb_build_object('new_resource_id',v_new.id,'intake_id',v_intake.id,'reason',btrim(_reason),'old_sha256',_expected_old_sha256,'new_sha256',v_intake.source_sha256));
 RETURN v_result || jsonb_build_object('replaced_resource_id',v_old.id,'new_resource_id',v_new.id);
END $fn$;
REVOKE ALL ON FUNCTION public.lesson_component_correct_lab_v2(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lesson_component_correct_lab_v2(uuid,uuid,text,text) TO authenticated;
-- Security-definer legacy read bypasses RLS: exclude replaced rows explicitly.
CREATE OR REPLACE FUNCTION public.get_lesson_full_content(_lesson_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_lesson record; v_book jsonb; v_explanations jsonb; v_summary jsonb; v_assessments jsonb; v_resources jsonb;
BEGIN
 IF NOT public.can_access_lesson(_lesson_id) THEN RETURN jsonb_build_object('error','forbidden'); END IF;
 SELECT id,subject_id,unit_id,title,slug,duration,is_free,semester,video_url,content_text,content_pdf_url,sort_order INTO v_lesson FROM public.lessons WHERE id=_lesson_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
 SELECT to_jsonb(b) INTO v_book FROM (SELECT content,pdf_url,updated_at FROM public.lesson_book_contents WHERE lesson_id=_lesson_id LIMIT 1) b;
 IF v_book IS NULL AND (v_lesson.content_text IS NOT NULL OR v_lesson.content_pdf_url IS NOT NULL) THEN v_book:=jsonb_build_object('content',v_lesson.content_text,'pdf_url',v_lesson.content_pdf_url,'source','legacy'); END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.sort_order),'[]'::jsonb) INTO v_explanations FROM (SELECT id,title,content,sort_order FROM public.lesson_explanations WHERE lesson_id=_lesson_id ORDER BY sort_order) e;
 SELECT to_jsonb(s) INTO v_summary FROM (SELECT summary,key_points,study_tip FROM public.lesson_summaries WHERE lesson_id=_lesson_id LIMIT 1) s;
 SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.sort_order),'[]'::jsonb) INTO v_assessments FROM (SELECT id,title,instructions,sort_order FROM public.lesson_assessments WHERE lesson_id=_lesson_id ORDER BY sort_order) a;
 WITH combined AS (
 SELECT id::text AS id,resource_type::text AS resource_type,title,url,description,sort_order,'new' AS source FROM public.lesson_resources r WHERE lesson_id=_lesson_id AND (public.is_content_staff(auth.uid()) OR NOT EXISTS(SELECT 1 FROM public.lesson_lab_corrections c WHERE c.old_resource_id=r.id))
 UNION ALL SELECT 'legacy-video-'||v_lesson.id::text,'video','فيديو الدرس',v_lesson.video_url,NULL,0,'legacy' WHERE v_lesson.video_url IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.lesson_resources lr WHERE lr.lesson_id=_lesson_id AND lr.resource_type='video' AND lr.url=v_lesson.video_url)
 UNION ALL SELECT 'legacy-pdf-'||v_lesson.id::text,'pdf','ملف PDF',v_lesson.content_pdf_url,NULL,1,'legacy' WHERE v_lesson.content_pdf_url IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.lesson_resources lr WHERE lr.lesson_id=_lesson_id AND lr.resource_type='pdf' AND lr.url=v_lesson.content_pdf_url)
 UNION ALL SELECT 'legacy-sim-'||ls.id::text,'experiment',ls.title,ls.phet_url,ls.description,ls.sort_order+10,'legacy' FROM public.lesson_simulations ls WHERE ls.lesson_id=_lesson_id AND NOT EXISTS (SELECT 1 FROM public.lesson_resources lr WHERE lr.lesson_id=_lesson_id AND lr.resource_type='experiment' AND lr.url=ls.phet_url)
 ) SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.sort_order),'[]'::jsonb) INTO v_resources FROM combined c;
 RETURN jsonb_build_object('lesson',to_jsonb(v_lesson),'book',v_book,'explanations',v_explanations,'summary',v_summary,'assessments',v_assessments,'resources',v_resources);
END $fn$;