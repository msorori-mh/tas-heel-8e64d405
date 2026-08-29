-- Align the V2 interactive-resource writer with the closed lesson_resources
-- metadata contract. The previous V2 definition used private camelCase keys
-- rejected by validate_lesson_resource_metadata(). No data is rewritten.

BEGIN;

CREATE OR REPLACE FUNCTION public.lesson_component_publish_v2(
  _intake_id uuid,
  _idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid:=auth.uid();
  v_intake public.lesson_component_intakes_v2;
  v_lesson public.lessons;
  v_existing public.lesson_component_publications_v2;
  v_publication_id uuid:=gen_random_uuid();
  v_version integer;
  v_code text;
  v_resource_type text;
  v_interactive_contract jsonb;
  v_result jsonb;
  v_snapshot jsonb;
  v_writes integer:=0;
  v_rc integer;
BEGIN
  IF v_uid IS NULL OR NOT public.is_full_admin(v_uid) THEN
    RAISE EXCEPTION 'LCPV2_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  IF length(btrim(coalesce(_idempotency_key,''))) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'LCPV2_IDEMPOTENCY_KEY_INVALID' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_intake FROM public.lesson_component_intakes_v2
   WHERE id=_intake_id FOR UPDATE;
  IF v_intake.id IS NULL THEN RAISE EXCEPTION 'LCPV2_INTAKE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  IF v_intake.created_by IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'LCPV2_INTAKE_OWNER_MISMATCH' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_intake.lesson_id::text||':'||v_intake.capability,0));
  SELECT * INTO v_existing FROM public.lesson_component_publications_v2
   WHERE intake_id=v_intake.id OR idempotency_key=btrim(_idempotency_key) LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.intake_id IS DISTINCT FROM v_intake.id
       OR v_existing.source_sha256 IS DISTINCT FROM v_intake.source_sha256 THEN
      RAISE EXCEPTION 'LCPV2_IDEMPOTENCY_CONFLICT' USING ERRCODE='23505';
    END IF;
    RETURN v_existing.result||jsonb_build_object('idempotent',true,'writes_performed',0);
  END IF;
  IF v_intake.status<>'VERIFIED' THEN
    RAISE EXCEPTION 'LCPV2_INTAKE_NOT_VERIFIED: %',v_intake.status USING ERRCODE='23514';
  END IF;
  IF public.cf11_text_sha256(v_intake.payload_text) IS DISTINCT FROM v_intake.source_sha256 THEN
    RAISE EXCEPTION 'LCPV2_LIVE_HASH_MISMATCH' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_lesson FROM public.lessons WHERE id=v_intake.lesson_id FOR UPDATE;
  IF v_lesson.id IS NULL OR upper(v_lesson.slug) IS DISTINCT FROM v_intake.lesson_code THEN
    RAISE EXCEPTION 'LCPV2_LESSON_IDENTITY_DRIFT' USING ERRCODE='23514';
  END IF;
  PERFORM set_config('tamkeen.lesson_component_v2_write','on',true);
  PERFORM public.cf10_assert_no_answer_leak(v_intake.capability,v_intake.payload_text);

  IF v_intake.capability='officialBookContent' THEN
    INSERT INTO public.lesson_book_contents(lesson_id,content)
    VALUES (v_lesson.id,v_intake.payload_text)
    ON CONFLICT (lesson_id) DO UPDATE SET content=excluded.content,updated_at=now();
    GET DIAGNOSTICS v_rc=ROW_COUNT; v_writes:=v_writes+v_rc;
  ELSIF v_intake.capability='tamkeenExplanationHtml' THEN
    v_code:=upper(v_lesson.slug)||'-EXP';
    UPDATE public.lesson_explanations SET title='شرح تمكين',content=v_intake.payload_text,
      sort_order=0,updated_at=now() WHERE lesson_id=v_lesson.id AND explanation_code=v_code;
    GET DIAGNOSTICS v_rc=ROW_COUNT; v_writes:=v_writes+v_rc;
    IF v_rc=0 THEN
      INSERT INTO public.lesson_explanations(lesson_id,title,content,sort_order,explanation_code)
      VALUES (v_lesson.id,'شرح تمكين',v_intake.payload_text,0,v_code);
      v_writes:=v_writes+1;
    END IF;
  ELSIF v_intake.capability='lessonSummaryHtml' THEN
    INSERT INTO public.lesson_summaries(lesson_id,summary)
    VALUES (v_lesson.id,v_intake.payload_text)
    ON CONFLICT (lesson_id) DO UPDATE SET summary=excluded.summary,updated_at=now();
    GET DIAGNOSTICS v_rc=ROW_COUNT; v_writes:=v_writes+v_rc;
  ELSIF v_intake.capability IN ('mindMapHtml','labExperimentHtml') THEN
    v_interactive_contract:=public.cf11_assert_interactive_contract(
      v_intake.capability,v_intake.payload_text);
    v_code:=upper(v_lesson.slug)||CASE v_intake.capability
      WHEN 'mindMapHtml' THEN '-MINDMAP' ELSE '-EXPERIMENT' END;
    v_resource_type:=CASE v_intake.capability WHEN 'mindMapHtml' THEN 'mindmap' ELSE 'experiment' END;
    UPDATE public.lesson_resources SET resource_type=v_resource_type::public.lesson_resource_type,
      title=CASE v_intake.capability WHEN 'mindMapHtml' THEN 'الخريطة الذهنية' ELSE 'التجربة المعملية' END,
      url=public.cf10_inline_html_url(v_code),description=v_intake.payload_text,
      sort_order=CASE v_intake.capability WHEN 'mindMapHtml' THEN 4 ELSE 5 END,
      html_resource_type='INTERACTIVE',metadata=jsonb_build_object(
        'cf11_publication_id',v_publication_id,
        'cf11_published_at',now(),
        'cf11_published_by',v_uid,
        'cf11_body_sha256',public.cf11_text_sha256(v_intake.payload_text),
        'cf11_render_mode','INTERACTIVE',
        'cf11_verified_bundle_sha256',v_intake.source_sha256,
        'cf11_csp',v_interactive_contract),is_primary=false
     WHERE lesson_id=v_lesson.id AND resource_code=v_code;
    GET DIAGNOSTICS v_rc=ROW_COUNT; v_writes:=v_writes+v_rc;
    IF v_rc=0 THEN
      INSERT INTO public.lesson_resources(lesson_id,resource_type,title,url,description,sort_order,
        resource_code,html_resource_type,metadata,is_primary)
      VALUES (v_lesson.id,v_resource_type::public.lesson_resource_type,
        CASE v_intake.capability WHEN 'mindMapHtml' THEN 'الخريطة الذهنية' ELSE 'التجربة المعملية' END,
        public.cf10_inline_html_url(v_code),v_intake.payload_text,
        CASE v_intake.capability WHEN 'mindMapHtml' THEN 4 ELSE 5 END,
        v_code,'INTERACTIVE',jsonb_build_object(
          'cf11_publication_id',v_publication_id,
          'cf11_published_at',now(),
          'cf11_published_by',v_uid,
          'cf11_body_sha256',public.cf11_text_sha256(v_intake.payload_text),
          'cf11_render_mode','INTERACTIVE',
          'cf11_verified_bundle_sha256',v_intake.source_sha256,
          'cf11_csp',v_interactive_contract),false);
      v_writes:=v_writes+1;
    END IF;
  ELSE
    v_writes:=v_writes+public.lesson_component_publish_questions_v2(v_lesson.id,v_lesson.slug,
      v_lesson.subject_id,v_intake.capability,v_intake.payload_text::jsonb,
      v_intake.answers_payload,v_intake.source_sha256,v_uid);
  END IF;

  SELECT coalesce(max(publication_version),0)+1 INTO v_version
    FROM public.lesson_component_publications_v2
   WHERE lesson_id=v_lesson.id AND capability=v_intake.capability;
  v_snapshot:=jsonb_build_object('publisher','LCPV2','intakeId',v_intake.id,
    'capability',v_intake.lifecycle_capability,'packageCapability',v_intake.capability,
    'sourcePath',v_intake.original_file_name,'sourceSha256',v_intake.source_sha256,
    'publicationVersion',v_version,'publishedAt',now(),'publishedBy',v_uid);
  INSERT INTO public.lesson_capability_lifecycle(lesson_id,capability,status,applicability,
    draft_hash,draft_updated_at,reviewed_by,reviewed_at,ready_snapshot,ready_hash,ready_by,ready_at,
    evidence_origin,retirement_origin)
  VALUES (v_lesson.id,v_intake.lifecycle_capability,'READY','OPTIONAL',NULL,NULL,v_uid,now(),
    v_snapshot,v_intake.source_sha256,v_uid,now(),NULL,NULL)
  ON CONFLICT (lesson_id,capability) DO UPDATE SET status='READY',applicability='OPTIONAL',
    draft_hash=NULL,draft_updated_at=NULL,reviewed_by=excluded.reviewed_by,
    reviewed_at=excluded.reviewed_at,ready_snapshot=excluded.ready_snapshot,
    ready_hash=excluded.ready_hash,ready_by=excluded.ready_by,ready_at=excluded.ready_at,
    evidence_origin=NULL,retirement_origin=NULL,updated_at=now();
  GET DIAGNOSTICS v_rc=ROW_COUNT; v_writes:=v_writes+v_rc;

  IF NOT public.lesson_capability_ready(v_lesson.id,v_intake.lifecycle_capability) THEN
    RAISE EXCEPTION 'LCPV2_COMPONENT_NOT_VISIBLE' USING ERRCODE='23514';
  END IF;
  v_result:=jsonb_build_object('intake_id',v_intake.id,'lesson_id',v_lesson.id,
    'capability',v_intake.capability,'lifecycle_capability',v_intake.lifecycle_capability,
    'publication_version',v_version,'status','READY','source_sha256',v_intake.source_sha256,
    'student_can_see_this_component',true,'idempotent',false,'writes_performed',v_writes);
  INSERT INTO public.lesson_component_publications_v2(id,intake_id,lesson_id,capability,
    lifecycle_capability,publication_version,source_sha256,idempotency_key,result,published_by)
  VALUES (v_publication_id,v_intake.id,v_lesson.id,v_intake.capability,v_intake.lifecycle_capability,
    v_version,v_intake.source_sha256,btrim(_idempotency_key),v_result,v_uid);
  UPDATE public.lesson_component_intakes_v2 SET status='PUBLISHED',published_at=now()
   WHERE id=v_intake.id;
  INSERT INTO public.audit_logs(actor_id,action,target_type,target_id,metadata)
  VALUES (v_uid,'lesson_component_publish_v2','lesson_capability',v_lesson.id,v_result);
  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.lesson_component_publish_v2(uuid,text) IS
'Atomic publication of exactly one verified lesson component. Interactive resources use the closed CF11 metadata contract.';
REVOKE ALL ON FUNCTION public.lesson_component_publish_v2(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lesson_component_publish_v2(uuid,text) TO authenticated;

DO $proof$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.lesson_component_publish_v2(uuid,text)'::regprocedure) INTO d;
  IF position('''publisher'',''LCPV2''' in d)>0
     OR position('''publicationId''' in d)>0
     OR position('''sourceSha256''' in d)>0 THEN
    RAISE EXCEPTION 'LCPV2_UNSUPPORTED_RESOURCE_METADATA_STILL_PRESENT';
  END IF;
  IF position('''cf11_publication_id''' in d)=0
     OR position('''cf11_csp''' in d)=0
     OR position('v_interactive_contract' in d)=0 THEN
    RAISE EXCEPTION 'LCPV2_CF11_RESOURCE_METADATA_MISSING';
  END IF;
END
$proof$;

COMMIT;
