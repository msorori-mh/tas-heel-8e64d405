-- Multiple lab experiments for the active Golden Lesson component publisher.
-- Function-only contract upgrade: no table alteration and no existing-row rewrite.

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
  v_existing_resource public.lesson_resources;
  v_publication_id uuid:=gen_random_uuid();
  v_version integer;
  v_code text;
  v_legacy_code text;
  v_interactive_contract jsonb;
  v_lab_instance jsonb;
  v_instance_index integer:=0;
  v_instance_count integer:=1;
  v_instance_title text;
  v_instance_title_requested boolean:=false;
  v_resource_reused boolean:=false;
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

  IF v_intake.capability='labExperimentHtml' THEN
    v_lab_instance:=coalesce(v_intake.validation_summary->'labExperiment','{}'::jsonb);
    IF jsonb_typeof(v_lab_instance)<>'object' THEN
      RAISE EXCEPTION 'LCPV2_LAB_INSTANCE_INVALID' USING ERRCODE='22023';
    END IF;
    v_instance_index:=coalesce((v_lab_instance->>'instanceIndex')::integer,0);
    v_instance_count:=coalesce((v_lab_instance->>'instanceCount')::integer,1);
    v_instance_title:=nullif(btrim(v_lab_instance->>'instanceTitle'),'');
    v_instance_title_requested:=v_instance_title IS NOT NULL;
    IF v_instance_count NOT BETWEEN 1 AND 99
       OR v_instance_index NOT BETWEEN 0 AND v_instance_count-1
       OR length(coalesce(v_instance_title,''))>120 THEN
      RAISE EXCEPTION 'LCPV2_LAB_INSTANCE_INVALID' USING ERRCODE='22023';
    END IF;
  END IF;

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
  ELSIF v_intake.capability='mindMapHtml' THEN
    v_interactive_contract:=public.cf11_assert_interactive_contract(
      v_intake.capability,v_intake.payload_text);
    v_code:=upper(v_lesson.slug)||'-MINDMAP';
    UPDATE public.lesson_resources SET resource_type='mindmap'::public.lesson_resource_type,
      title='الخريطة الذهنية',url=public.cf10_inline_html_url(v_code),description=v_intake.payload_text,
      sort_order=4,html_resource_type='INTERACTIVE',metadata=jsonb_build_object(
        'cf11_publication_id',v_publication_id,'cf11_published_at',now(),
        'cf11_published_by',v_uid,'cf11_body_sha256',public.cf11_text_sha256(v_intake.payload_text),
        'cf11_render_mode','INTERACTIVE','cf11_verified_bundle_sha256',v_intake.source_sha256,
        'cf11_csp',v_interactive_contract),is_primary=false
     WHERE lesson_id=v_lesson.id AND resource_code=v_code;
    GET DIAGNOSTICS v_rc=ROW_COUNT; v_writes:=v_writes+v_rc;
    IF v_rc=0 THEN
      INSERT INTO public.lesson_resources(lesson_id,resource_type,title,url,description,sort_order,
        resource_code,html_resource_type,metadata,is_primary)
      VALUES (v_lesson.id,'mindmap'::public.lesson_resource_type,'الخريطة الذهنية',
        public.cf10_inline_html_url(v_code),v_intake.payload_text,4,v_code,'INTERACTIVE',
        jsonb_build_object('cf11_publication_id',v_publication_id,'cf11_published_at',now(),
          'cf11_published_by',v_uid,'cf11_body_sha256',public.cf11_text_sha256(v_intake.payload_text),
          'cf11_render_mode','INTERACTIVE','cf11_verified_bundle_sha256',v_intake.source_sha256,
          'cf11_csp',v_interactive_contract),false);
      v_writes:=v_writes+1;
    END IF;
  ELSIF v_intake.capability='labExperimentHtml' THEN
    v_interactive_contract:=public.cf11_assert_interactive_contract(
      v_intake.capability,v_intake.payload_text);
    v_legacy_code:=public.normalize_resource_code(upper(v_lesson.slug)||'-EXPERIMENT');
    v_code:=public.normalize_resource_code(upper(v_lesson.slug)||CASE
      WHEN v_instance_count=1 AND v_instance_index=0 THEN '-EXPERIMENT'
      ELSE '-LAB-'||lpad((v_instance_index+1)::text,2,'0') END);
    v_instance_title:=coalesce(v_instance_title,CASE
      WHEN v_instance_count=1 THEN 'التجربة المعملية'
      ELSE 'تجربة '||(v_instance_index+1)::text END);

    SELECT * INTO v_existing_resource FROM public.lesson_resources
     WHERE lesson_id=v_lesson.id AND resource_code=v_code FOR UPDATE;
    IF v_existing_resource.id IS NULL AND v_instance_count>1 AND v_instance_index=0 THEN
      SELECT * INTO v_existing_resource FROM public.lesson_resources
       WHERE lesson_id=v_lesson.id AND resource_code=v_legacy_code FOR UPDATE;
      IF v_existing_resource.id IS NOT NULL THEN
        v_code:=v_legacy_code;
      END IF;
    END IF;

    IF v_existing_resource.id IS NOT NULL THEN
      IF v_existing_resource.resource_type IS DISTINCT FROM 'experiment'::public.lesson_resource_type
         OR v_existing_resource.description IS DISTINCT FROM v_intake.payload_text
         OR public.cf11_text_sha256(v_existing_resource.description) IS DISTINCT FROM v_intake.source_sha256
         OR v_existing_resource.metadata->>'cf11_body_sha256' IS DISTINCT FROM v_intake.source_sha256
         OR v_existing_resource.metadata->>'cf11_render_mode' IS DISTINCT FROM 'INTERACTIVE'
         OR v_existing_resource.metadata->'cf11_csp' IS DISTINCT FROM v_interactive_contract
         OR v_existing_resource.url IS DISTINCT FROM public.cf10_inline_html_url(v_code)
         OR v_existing_resource.sort_order IS DISTINCT FROM 5+v_instance_index
         OR v_existing_resource.html_resource_type IS DISTINCT FROM 'INTERACTIVE'
         OR v_existing_resource.is_primary IS DISTINCT FROM false
         OR (v_existing_resource.title IS DISTINCT FROM v_instance_title
             AND (v_instance_title_requested OR v_code<>v_legacy_code)) THEN
        RAISE EXCEPTION 'LCPV2_LAB_PUBLISHED_RESOURCE_IMMUTABLE_CONFLICT: %',v_code
          USING ERRCODE='23505';
      END IF;
      IF NOT v_instance_title_requested AND v_code=v_legacy_code THEN
        v_instance_title:=v_existing_resource.title;
      END IF;
      v_resource_reused:=true;
    ELSE
      INSERT INTO public.lesson_resources(lesson_id,resource_type,title,url,description,sort_order,
        resource_code,html_resource_type,metadata,is_primary)
      VALUES (v_lesson.id,'experiment'::public.lesson_resource_type,v_instance_title,
        public.cf10_inline_html_url(v_code),v_intake.payload_text,5+v_instance_index,v_code,
        'INTERACTIVE',jsonb_build_object(
          'cf11_publication_id',v_publication_id,'cf11_published_at',now(),
          'cf11_published_by',v_uid,'cf11_body_sha256',public.cf11_text_sha256(v_intake.payload_text),
          'cf11_render_mode','INTERACTIVE','cf11_verified_bundle_sha256',v_intake.source_sha256,
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
    'publicationVersion',v_version,'publishedAt',now(),'publishedBy',v_uid)
    ||CASE WHEN v_intake.capability='labExperimentHtml' THEN jsonb_build_object(
      'resourceCode',v_code,'instanceIndex',v_instance_index,'instanceCount',v_instance_count,
      'instanceTitle',v_instance_title,'resourceReused',v_resource_reused) ELSE '{}'::jsonb END;
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
    'student_can_see_this_component',true,'idempotent',false,'writes_performed',v_writes)
    ||CASE WHEN v_intake.capability='labExperimentHtml' THEN jsonb_build_object(
      'resource_code',v_code,'instance_index',v_instance_index,'instance_count',v_instance_count,
      'instance_title',v_instance_title,'resource_reused',v_resource_reused) ELSE '{}'::jsonb END;
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
'Atomic publication of one verified lesson component. Lab instances use immutable, hash-pinned resource codes.';
REVOKE ALL ON FUNCTION public.lesson_component_publish_v2(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lesson_component_publish_v2(uuid,text) TO authenticated;

DO $proof$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.lesson_component_publish_v2(uuid,text)'::regprocedure) INTO d;
  IF position('''-LAB-''' in d)=0
     OR position('LCPV2_LAB_PUBLISHED_RESOURCE_IMMUTABLE_CONFLICT' in d)=0
     OR position('''cf11_verified_bundle_sha256''' in d)=0
     OR position('v_resource_reused' in d)=0 THEN
    RAISE EXCEPTION 'LCPV2_MULTI_LAB_CONTRACT_MISSING';
  END IF;
END
$proof$;

COMMIT;
