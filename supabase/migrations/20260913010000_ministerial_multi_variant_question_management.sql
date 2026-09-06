-- Multiple ministerial variants per year are identified by variant_code (m01..m99).
-- This migration adds RPC-only question management for content staff.

CREATE OR REPLACE FUNCTION public.ministerial_model_questions_admin_list(_model_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_actor uuid := auth.uid(); v_result jsonb;
BEGIN
  IF v_actor IS NULL OR NOT public.can_publish_ministerial_exams(v_actor) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ministerial_exam_models WHERE id = _model_id) THEN
    RAISE EXCEPTION 'model_not_found' USING ERRCODE = 'P0002';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'question_id', mq.question_id, 'question_code', mq.source_question_code,
    'question_text', qr.question_text, 'display_order', mq.sort_order, 'marks', mq.marks,
    'options', coalesce((SELECT jsonb_agg(jsonb_build_object('option_code', qo.option_code, 'body', qo.body, 'is_correct', qo.is_correct) ORDER BY qo.sort_order) FROM public.question_options qo WHERE qo.question_revision_id = mq.published_revision_id), '[]'::jsonb),
    'model_answer', qs.model_answer, 'explanation', qs.explanation
  ) ORDER BY mq.sort_order), '[]'::jsonb) INTO v_result
  FROM public.ministerial_exam_questions mq
  JOIN public.question_revisions qr ON qr.id = mq.published_revision_id
  LEFT JOIN public.question_solutions qs ON qs.question_revision_id = mq.published_revision_id AND qs.solution_code = 'MODEL'
  WHERE mq.model_id = _model_id;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.ministerial_model_question_update(
  _model_id uuid, _question_id uuid, _question_text text, _options jsonb,
  _correct_option_code text, _model_answer text, _explanation text,
  _display_order integer, _marks numeric, _reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid(); v_model public.ministerial_exam_models; v_membership public.ministerial_exam_questions;
  v_old_revision uuid; v_new_revision uuid; v_revision_number integer; v_track text; v_option jsonb;
  v_legacy_options jsonb; v_correct_index integer;
BEGIN
  IF v_actor IS NULL OR NOT public.can_publish_ministerial_exams(v_actor) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF coalesce(trim(_question_text),'')='' OR coalesce(trim(_reason),'')='' OR _display_order < 1 OR _marks <= 0 THEN RAISE EXCEPTION 'invalid_question_payload' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_model FROM public.ministerial_exam_models WHERE id=_model_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'model_not_found' USING ERRCODE='P0002'; END IF;
  IF EXISTS (SELECT 1 FROM public.exam_sessions WHERE ministerial_model_id=_model_id) THEN RAISE EXCEPTION 'MINISTERIAL_EDIT_BLOCKED_SESSIONS_EXIST' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_membership FROM public.ministerial_exam_questions WHERE model_id=_model_id AND question_id=_question_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'question_not_in_model' USING ERRCODE='P0002'; END IF;
  IF EXISTS (SELECT 1 FROM public.ministerial_exam_questions WHERE model_id=_model_id AND sort_order=_display_order AND question_id<>_question_id) THEN RAISE EXCEPTION 'display_order_already_used' USING ERRCODE='23505'; END IF;
  SELECT ct.track_code INTO v_track FROM public.curriculum_tracks ct WHERE ct.id=v_model.curriculum_track_id;
  IF v_track='sanaa' AND (jsonb_typeof(_options)<>'array' OR jsonb_array_length(_options)<>4 OR upper(coalesce(_correct_option_code,'')) NOT IN ('A','B','C','D')) THEN RAISE EXCEPTION 'sanaa_question_requires_four_options' USING ERRCODE='22023'; END IF;
  IF v_track='aden' AND coalesce(trim(_model_answer),'')='' THEN RAISE EXCEPTION 'aden_question_requires_model_answer' USING ERRCODE='22023'; END IF;
  v_old_revision := v_membership.published_revision_id;
  SELECT coalesce(max(revision_number),0)+1 INTO v_revision_number FROM public.question_revisions WHERE question_id=_question_id;
  INSERT INTO public.question_revisions(question_id,revision_number,status,interaction_type,grading_mode,educational_label,question_text,max_score,allow_partial,requires_media,manual_grading_required,payload_hash_version,source_payload_hash,created_by)
  VALUES(_question_id,v_revision_number,'DRAFT',CASE WHEN v_track='sanaa' THEN 'SINGLE_CHOICE' ELSE 'LONG_TEXT' END,CASE WHEN v_track='sanaa' THEN 'AUTO_SINGLE' ELSE 'MANUAL' END,'MINISTERIAL_PREVIOUS_EXAM',trim(_question_text),_marks,false,false,v_track='aden','canonical_payload_v1',public.cf10_text_sha256(jsonb_build_object('question_text',trim(_question_text),'options',_options,'correct_option_code',_correct_option_code,'model_answer',_model_answer,'explanation',_explanation,'marks',_marks)::text),v_actor) RETURNING id INTO v_new_revision;
  IF v_track='sanaa' THEN
    FOR v_option IN SELECT value FROM jsonb_array_elements(_options) LOOP
      IF upper(coalesce(v_option->>'option_code','')) NOT IN ('A','B','C','D') OR coalesce(trim(v_option->>'body'),'')='' THEN RAISE EXCEPTION 'invalid_option' USING ERRCODE='22023'; END IF;
      INSERT INTO public.question_options(question_revision_id,option_code,body,sort_order,is_correct) VALUES(v_new_revision,upper(v_option->>'option_code'),trim(v_option->>'body'),ascii(upper(v_option->>'option_code'))-65,upper(v_option->>'option_code')=upper(_correct_option_code));
    END LOOP;
  END IF;
  INSERT INTO public.question_solutions(question_revision_id,solution_code,solution_type,sort_order,model_answer,explanation,reveal_policy,created_by) VALUES(v_new_revision,'MODEL','MODEL',0,nullif(trim(_model_answer),''),nullif(trim(_explanation),''),'AFTER_SUBMIT',v_actor);
  UPDATE public.question_revisions SET payload_hash=public._qb_compute_revision_payload_hash(v_new_revision) WHERE id=v_new_revision;
  UPDATE public.question_revisions SET status='APPROVED',reviewed_at=now(),reviewed_by=v_actor WHERE id=v_new_revision;
  UPDATE public.questions SET current_published_revision_id=NULL WHERE id=_question_id;
  UPDATE public.question_revisions SET status='SUPERSEDED',superseded_at=now() WHERE id=v_old_revision;
  UPDATE public.question_revisions SET status='PUBLISHED',published_at=now(),published_by=v_actor WHERE id=v_new_revision;
  SELECT coalesce(jsonb_agg(value->>'body' ORDER BY value->>'option_code'),'[]'::jsonb) INTO v_legacy_options FROM jsonb_array_elements(CASE WHEN v_track='sanaa' THEN _options ELSE '[]'::jsonb END);
  v_correct_index := CASE upper(coalesce(_correct_option_code,'')) WHEN 'A' THEN 0 WHEN 'B' THEN 1 WHEN 'C' THEN 2 WHEN 'D' THEN 3 ELSE -1 END;
  UPDATE public.questions SET question_text=trim(_question_text),options=v_legacy_options,correct_index=v_correct_index,explanation=nullif(trim(_explanation),''),sort_order=_display_order,current_published_revision_id=v_new_revision WHERE id=_question_id;
  UPDATE public.ministerial_exam_questions SET published_revision_id=v_new_revision,sort_order=_display_order,marks=_marks WHERE model_id=_model_id AND question_id=_question_id;
  UPDATE public.exam_template_questions SET sort_order=_display_order,points=_marks WHERE template_id=v_model.template_id AND question_id=_question_id;
  UPDATE public.ministerial_exam_models SET status='draft',published_at=NULL,published_by=NULL WHERE id=_model_id;
  INSERT INTO public.audit_logs(actor_id,action,target_type,target_id,metadata) VALUES(v_actor,'ministerial_question_update','question',_question_id,jsonb_build_object('model_id',_model_id,'old_revision_id',v_old_revision,'new_revision_id',v_new_revision,'reason',_reason));
  RETURN jsonb_build_object('question_id',_question_id,'published_revision_id',v_new_revision,'status','draft');
END; $$;

CREATE OR REPLACE FUNCTION public.ministerial_model_question_delete(_model_id uuid,_question_id uuid,_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_actor uuid:=auth.uid(); v_model public.ministerial_exam_models; v_removed integer;
BEGIN
  IF v_actor IS NULL OR NOT public.can_publish_ministerial_exams(v_actor) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF coalesce(trim(_reason),'')='' THEN RAISE EXCEPTION 'reason_required' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_model FROM public.ministerial_exam_models WHERE id=_model_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'model_not_found' USING ERRCODE='P0002'; END IF;
  IF EXISTS (SELECT 1 FROM public.exam_sessions WHERE ministerial_model_id=_model_id) THEN RAISE EXCEPTION 'MINISTERIAL_DELETE_BLOCKED_SESSIONS_EXIST' USING ERRCODE='42501'; END IF;
  DELETE FROM public.exam_template_questions WHERE template_id=v_model.template_id AND question_id=_question_id;
  DELETE FROM public.ministerial_exam_questions WHERE model_id=_model_id AND question_id=_question_id; GET DIAGNOSTICS v_removed=ROW_COUNT;
  IF v_removed=0 THEN RAISE EXCEPTION 'question_not_in_model' USING ERRCODE='P0002'; END IF;
  UPDATE public.ministerial_exam_models SET status='draft',published_at=NULL,published_by=NULL WHERE id=_model_id;
  INSERT INTO public.audit_logs(actor_id,action,target_type,target_id,metadata) VALUES(v_actor,'ministerial_question_delete','question',_question_id,jsonb_build_object('model_id',_model_id,'reason',_reason));
  RETURN jsonb_build_object('removed',v_removed,'status','draft');
END; $$;

REVOKE ALL ON FUNCTION public.ministerial_model_questions_admin_list(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.ministerial_model_question_update(uuid,uuid,text,jsonb,text,text,text,integer,numeric,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.ministerial_model_question_delete(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ministerial_model_questions_admin_list(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.ministerial_model_question_update(uuid,uuid,text,jsonb,text,text,text,integer,numeric,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.ministerial_model_question_delete(uuid,uuid,text) TO authenticated,service_role;
