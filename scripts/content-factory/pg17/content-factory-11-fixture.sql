-- =====================================================================================
-- CF11 PG17 FIXTURE
-- Layers a CF10-materialized "Iron" Golden Lesson on top of the CF04/07/08/09/10 rehearsal
-- surface, plus the three production objects CF11 depends on that no earlier fixture creates:
-- audit_logs, is_full_admin() and lesson_capability_transition() (production definitions).
--
-- The domain rows below are what CF10 leaves behind (verified separately by the CF10 suite):
-- lesson + book content + explanation + summary + 5 official + 40 self-test DRAFT questions +
-- an empty self-test assessment shell + seven DRAFT lifecycle rows, and NO mindmap/experiment
-- resource row. CF11 is the component under test here.
-- =====================================================================================

-- ---------------------------------------------------------------------------
-- Fixture-local hashing helpers. The CF11 migration installs the real
-- public.cf11_text_sha256 / public.cf11_script_csp_hash AFTER this file runs, so the fixture
-- cannot call them yet. These are byte-identical in behaviour and go through extensions.digest
-- exactly like the real ones -- there is no public.digest shim anywhere.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cf11fx_sha256(_value text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $fx$
  SELECT encode(extensions.digest(convert_to(coalesce(_value,''),'UTF8'),'sha256'),'hex');
$fx$;
CREATE OR REPLACE FUNCTION public.cf11fx_csp_hash(_script text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $fx$
  SELECT encode(extensions.digest(convert_to(coalesce(_script,''),'UTF8'),'sha256'),'base64');
$fx$;

-- The private asset bucket must exist before the fixture can register the stored object.
-- The CF11 migration re-asserts public=false / limits / MIME allowlist on top of this row.
INSERT INTO storage.buckets(id, name, public)
VALUES ('golden-lesson-assets','golden-lesson-assets',false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Production objects CF11 depends on.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid, action text NOT NULL, target_type text, target_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now());
GRANT INSERT, SELECT ON public.audit_logs TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_full_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.golden_lesson_has_role(_user_id, 'admin');
$$;

-- Verbatim production definition (pg_get_functiondef of the live function).
CREATE OR REPLACE FUNCTION public.lesson_capability_transition(
  _lesson_id uuid, _capability text, _to_status text,
  _snapshot jsonb DEFAULT NULL::jsonb, _hash text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $function$
DECLARE
  cur public.lesson_capability_lifecycle;
  frm text;
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT public.is_content_staff(uid) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF _to_status NOT IN ('DRAFT','REVIEW','READY') THEN
    RAISE EXCEPTION 'INVALID_STATUS' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO cur FROM public.lesson_capability_lifecycle
   WHERE lesson_id = _lesson_id AND capability = _capability FOR UPDATE;
  frm := COALESCE(cur.status, 'ABSENT');
  IF _to_status = 'READY' OR (frm = 'REVIEW' AND _to_status = 'DRAFT') THEN
    IF NOT public.is_full_admin(uid) THEN
      RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF _to_status = 'READY' AND frm <> 'REVIEW' THEN
    RAISE EXCEPTION 'READY_REQUIRES_REVIEW' USING ERRCODE = '22023';
  END IF;
  IF _to_status = 'READY' AND (_snapshot IS NULL OR _hash IS NULL) THEN
    RAISE EXCEPTION 'READY_REQUIRES_SNAPSHOT' USING ERRCODE = '22023';
  END IF;
  IF _to_status = 'REVIEW' AND frm <> 'DRAFT' THEN
    RAISE EXCEPTION 'REVIEW_REQUIRES_DRAFT' USING ERRCODE = '22023';
  END IF;
  IF cur.id IS NULL THEN
    IF _to_status <> 'DRAFT' THEN
      RAISE EXCEPTION 'LIFECYCLE_ROW_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    INSERT INTO public.lesson_capability_lifecycle
      (lesson_id, capability, status, draft_hash, draft_updated_at)
    VALUES (_lesson_id, _capability, 'DRAFT', _hash, now()) RETURNING * INTO cur;
  ELSE
    UPDATE public.lesson_capability_lifecycle
       SET status = _to_status,
           draft_hash = CASE WHEN _to_status = 'DRAFT' THEN COALESCE(_hash, draft_hash) ELSE draft_hash END,
           draft_updated_at = CASE WHEN _to_status = 'DRAFT' THEN now() ELSE draft_updated_at END,
           reviewed_by = CASE WHEN _to_status IN ('REVIEW','READY') THEN uid ELSE reviewed_by END,
           reviewed_at = CASE WHEN _to_status IN ('REVIEW','READY') THEN now() ELSE reviewed_at END,
           ready_snapshot = CASE WHEN _to_status = 'READY' THEN _snapshot ELSE ready_snapshot END,
           ready_hash = CASE WHEN _to_status = 'READY' THEN _hash ELSE ready_hash END,
           ready_by = CASE WHEN _to_status = 'READY' THEN uid ELSE ready_by END,
           ready_at = CASE WHEN _to_status = 'READY' THEN now() ELSE ready_at END
     WHERE id = cur.id RETURNING * INTO cur;
  END IF;
  INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
  VALUES (uid, 'lesson_capability_lifecycle_transition', 'lesson_capability', _lesson_id,
          jsonb_build_object('lesson_id', _lesson_id, 'capability', _capability,
                             'from_status', frm, 'to_status', cur.status));
  RETURN jsonb_build_object('lesson_id', _lesson_id, 'capability', _capability,
                            'from_status', frm, 'to_status', cur.status,
                            'ready_at', cur.ready_at);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.lesson_capability_transition(uuid,text,text,jsonb,text) TO authenticated;

-- A second real staff user so separation of duties can be exercised honestly.
INSERT INTO auth.users(id) VALUES ('10000000-0000-0000-0000-000000000005')
  ON CONFLICT DO NOTHING;
INSERT INTO public.user_roles(user_id, role)
VALUES ('10000000-0000-0000-0000-000000000005','admin') ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Iron curriculum identity.
-- ---------------------------------------------------------------------------
INSERT INTO public.grades VALUES ('40000000-0000-0000-0000-000000000012','GRADE-12');
INSERT INTO public.curriculum_tracks VALUES ('41000000-0000-0000-0000-000000000002','aden',true);
INSERT INTO public.subjects VALUES
  ('42000000-0000-0000-0000-000000000012','CHEM-G12','40000000-0000-0000-0000-000000000012');
INSERT INTO public.subject_curriculum_tracks VALUES
  ('42000000-0000-0000-0000-000000000012','41000000-0000-0000-0000-000000000001',true),
  ('42000000-0000-0000-0000-000000000012','41000000-0000-0000-0000-000000000002',true);

INSERT INTO public.lessons(id, slug, subject_id, unit_id, title, is_free, semester, sort_order)
VALUES ('43000000-0000-0000-0000-000000000012','iron-and-its-compounds',
        '42000000-0000-0000-0000-000000000012', NULL, 'الحديد ومركباته', true, 1, 1);

-- ---------------------------------------------------------------------------
-- CF04/07/08/09 chain rows for the Iron batch (already-approved, already-verified state).
-- ---------------------------------------------------------------------------
INSERT INTO public.golden_lesson_packages(
  id, package_code, profile_id, identity, current_version,
  current_manifest_sha256, current_canonical_sha256, review_status, created_by)
VALUES ('50000000-0000-0000-0000-000000000001','CHEM-G12-IRON-FE','GOLDEN_CHEMISTRY_V1',
        jsonb_build_object('gradeCode','GRADE-12','subjectCode','CHEM-G12',
                           'lessonCode','CHEM-G12-IRON','lessonSlug','iron-and-its-compounds'),
        1, repeat('1',64), repeat('2',64), 'APPROVED_FOR_STAGING',
        '10000000-0000-0000-0000-000000000003');

INSERT INTO public.golden_lesson_package_versions(
  id, package_id, version, manifest, client_manifest_sha256, canonical_manifest_sha256,
  created_by, verified_bundle_sha256, verified_storage_path, verified_file_count,
  verified_compressed_bytes, verified_uncompressed_bytes, bundle_verified_at)
VALUES ('50100000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',1,
        jsonb_build_object('schema','tamkeen.golden-lesson-package.v1','packageCode','CHEM-G12-IRON-FE'),
        repeat('1',64), repeat('2',64), '10000000-0000-0000-0000-000000000003',
        repeat('3',64), 'golden-lesson-intake/CHEM-G12-IRON-FE.zip', 12, 51262, 116867, now());

INSERT INTO public.golden_lesson_package_reviews(
  package_id, package_version, from_status, to_status, actor_id, actor_role, evidence, note)
VALUES ('50000000-0000-0000-0000-000000000001',1,'DRAFT','SUBMITTED',
        '10000000-0000-0000-0000-000000000001','CONTENT_EDITOR','{}'::jsonb,'submit'),
       ('50000000-0000-0000-0000-000000000001',1,'SUBMITTED','CONTENT_APPROVED',
        '10000000-0000-0000-0000-000000000003','CONTENT_REVIEWER','{}'::jsonb,'content ok'),
       ('50000000-0000-0000-0000-000000000001',1,'CONTENT_APPROVED','APPROVED_FOR_STAGING',
        '10000000-0000-0000-0000-000000000005','TECHNICAL_REVIEWER','{}'::jsonb,'tech ok');

INSERT INTO public.golden_lesson_domain_stage_batches(
  id, package_id, package_version, verified_bundle_sha256, stage_status, staged_by)
VALUES ('51000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',1,
        repeat('3',64),'STAGED','10000000-0000-0000-0000-000000000003');

INSERT INTO public.golden_lesson_identity_bindings(
  id, batch_id, grade_id, subject_id, lesson_id, unit_id, curriculum_track_ids,
  external_lesson_code, identity_snapshot, identity_sha256, bound_by)
VALUES ('52000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000001',
        '40000000-0000-0000-0000-000000000012','42000000-0000-0000-0000-000000000012',
        '43000000-0000-0000-0000-000000000012', NULL,
        ARRAY['41000000-0000-0000-0000-000000000001'::uuid,'41000000-0000-0000-0000-000000000002'::uuid],
        'CHEM-G12-IRON',
        jsonb_build_object('lessonSlug','iron-and-its-compounds'), repeat('4',64),
        '10000000-0000-0000-0000-000000000003');

-- ---------------------------------------------------------------------------
-- Staged capability payloads + the CF10 materialization ledger row + domain rows.
-- ---------------------------------------------------------------------------
DO $fixture$
DECLARE
  v_lesson uuid := '43000000-0000-0000-0000-000000000012';
  v_subject uuid := '42000000-0000-0000-0000-000000000012';
  v_batch uuid := '51000000-0000-0000-0000-000000000001';
  v_actor uuid := '10000000-0000-0000-0000-000000000003';
  v_script text;
  v_lab text;
  v_mind text;
  v_book text;
  v_assessment uuid;
  v_qid uuid;
  v_rev uuid;
  i integer;
  caps text[] := ARRAY['officialBookContent','tamkeenExplanationHtml','lessonSummaryHtml',
                       'mindMapHtml','labExperimentHtml','officialBookQuestions','selfTest'];
  -- Production vocabulary (verified against the live lesson_capability_lifecycle rows):
  -- quickReview / checkUnderstanding / lessonAssessment, NOT lessonSummary/officialBookQuestions/selfTest.
  lifecycle_caps text[] := ARRAY['officialBookContent','tamkeenExplanation','quickReview',
                                 'mindMap','simulation','checkUnderstanding','lessonAssessment'];
  cap text;
BEGIN
  -- Official body: real leaf asset reference, no path, no data URI.
  v_book := '<section data-tamkeen-section="official"><h2>الحديد ومركباته</h2>'
         || '<p>ΔH = -25 kJ · Fe<sup>2+</sup> / Fe<sup>3+</sup></p>'
         || '<img src="official-figure-1-1.jpg" alt="شكل (1-1) الفرن العالي (اللافح)">'
         || '<table><thead><tr><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th></tr></thead>'
         || '<tbody><tr><td>a</td><td>b</td><td>c</td><td>d</td><td>e</td><td>f</td></tr></tbody></table>'
         || '</section>';

  -- Mind map: JS-free details/summary tree.
  v_mind := '<section data-tamkeen-render="STATIC"><details open><summary>الحديد</summary>'
         || '<details><summary>الاستخلاص</summary><p>الفرن العالي</p></details>'
         || '<details><summary>المركبات</summary><p>Fe<sub>2</sub>O<sub>3</sub></p></details>'
         || '</details></section>';

  -- Lab: single inline script, CSP pins its ACTUAL sha256, connect-src 'none', zero URLs.
  v_script := 'const s={fe2:0,fe3:0};'
           || 'document.addEventListener("click",function(e){'
           || 'const a=e.target.getAttribute("data-act");if(!a)return;'
           || 'if(a==="reset"){s.fe2=0;s.fe3=0;}else{s[a]=s[a]+1;}'
           || 'document.getElementById("out").textContent=s.fe2+"/"+s.fe3;});';
  v_lab := '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">'
        || '<meta http-equiv="Content-Security-Policy" content="default-src ''none''; '
        || 'connect-src ''none''; img-src ''none''; style-src ''self''; '
        || 'script-src ''sha256-' || public.cf11fx_csp_hash(v_script) || '''">'
        || '</head><body data-tamkeen-sandbox="allow-scripts" data-tamkeen-render="INTERACTIVE">'
        || '<button data-act="fe2">Fe2+</button><button data-act="fe3">Fe3+</button>'
        || '<button data-act="reset">إعادة</button><output id="out">0/0</output>'
        || '<script>' || v_script || '</script></body></html>';

  -- Stage entries (CF08 output).
  FOREACH cap IN ARRAY caps LOOP
    INSERT INTO public.golden_lesson_domain_stage_entries(
      batch_id, capability, lifecycle_capability, target_plan, applicability, authority,
      source_path, source_sha256, source_payload)
    VALUES (v_batch, cap,
            lifecycle_caps[array_position(caps, cap)],
            'CF10', 'REQUIRED',
            CASE WHEN cap IN ('officialBookContent','officialBookQuestions') THEN 'OFFICIAL' ELSE 'TAMKEEN' END,
            cap || '.src',
            public.cf11fx_sha256(CASE cap WHEN 'mindMapHtml' THEN v_mind
                                             WHEN 'labExperimentHtml' THEN v_lab
                                             ELSE cap END),
            convert_to(CASE cap WHEN 'mindMapHtml' THEN v_mind
                                WHEN 'labExperimentHtml' THEN v_lab
                                ELSE cap END, 'UTF8'));
  END LOOP;

  -- CF10 domain rows.
  INSERT INTO public.lesson_book_contents(lesson_id, content) VALUES (v_lesson, v_book);
  INSERT INTO public.lesson_explanations(lesson_id, title, content, sort_order, explanation_code)
  VALUES (v_lesson, 'شرح تمكين', '<section><p>شرح الحديد</p></section>', 0, 'CHEM-G12-IRON-EXP');
  INSERT INTO public.lesson_summaries(lesson_id, summary)
  VALUES (v_lesson, '<section><p>خلاصة الحديد</p></section>');
  INSERT INTO public.lesson_assessments(lesson_id, title, instructions, sort_order, assessment_code)
  VALUES (v_lesson, 'اختبر نفسك', NULL, 0, 'CHEM-G12-IRON-SELFTEST')
  RETURNING id INTO v_assessment;

  -- 5 official (manual, no options) + 40 self-test (MCQ) DRAFT questions.
  FOR i IN 1..45 LOOP
    INSERT INTO public.questions(lesson_id, subject_id, question_text, options, correct_index,
                                 question_type, sort_order, code, created_by)
    VALUES (v_lesson, v_subject,
            CASE WHEN i <= 5 THEN 'سؤال كتاب رقم ' || i ELSE 'سؤال اختبر نفسك رقم ' || (i-5) END,
            '[]'::jsonb, -1,
            CASE WHEN i <= 5 THEN 'SHORT_ANSWER' ELSE 'SINGLE_CHOICE' END,
            i - 1,
            CASE WHEN i <= 5 THEN 'CHEM-G12-IRON-OFFQ-' || i
                 ELSE 'CHEM-G12-IRON-SELF-' || lpad((i-5)::text, 2, '0') END,
            v_actor)
    RETURNING id INTO v_qid;

    INSERT INTO public.question_revisions(question_id, revision_number, status, interaction_type,
                                          grading_mode, question_text, max_score,
                                          manual_grading_required, created_by)
    VALUES (v_qid, 1, 'DRAFT',
            CASE WHEN i <= 5 THEN 'SHORT_ANSWER' ELSE 'SINGLE_CHOICE' END,
            CASE WHEN i <= 5 THEN 'MANUAL' ELSE 'AUTO_SINGLE' END,
            CASE WHEN i <= 5 THEN 'سؤال كتاب رقم ' || i ELSE 'سؤال اختبر نفسك رقم ' || (i-5) END,
            1, i <= 5, v_actor)
    RETURNING id INTO v_rev;

    IF i > 5 THEN
      INSERT INTO public.question_options(question_revision_id, option_code, body, sort_order, is_correct)
      VALUES (v_rev,'A','خيار أ',0,true), (v_rev,'B','خيار ب',1,false),
             (v_rev,'C','خيار ج',2,false), (v_rev,'D','خيار د',3,false);
      INSERT INTO public.question_option_rationales(question_id, question_revision_id, option_id, why_correct)
      VALUES (v_qid, v_rev, 'A', 'التعليل الصحيح');
    ELSE
      INSERT INTO public.official_question_answers(question_id, revision_id, model_answer, explanation)
      VALUES (v_qid, v_rev, 'الإجابة النموذجية', 'الشرح الرسمي');
    END IF;

    INSERT INTO public.question_targets(question_id, target_type, subject_id, lesson_id,
                                        is_primary, created_by, revision_id)
    VALUES (v_qid, 'LESSON', v_subject, v_lesson, true, v_actor, v_rev);

    UPDATE public.question_revisions
       SET payload_hash = public._qb_compute_revision_payload_hash(v_rev)
     WHERE id = v_rev;
  END LOOP;

  -- Seven DRAFT lifecycle rows (all REQUIRED for this profile).
  FOREACH cap IN ARRAY lifecycle_caps LOOP
    INSERT INTO public.lesson_capability_lifecycle(lesson_id, capability, status, applicability,
                                                   draft_hash, draft_updated_at)
    VALUES (v_lesson, cap, 'DRAFT', 'REQUIRED', public.cf11fx_sha256(cap), now());
  END LOOP;

  -- CF10 ledger row.
  INSERT INTO public.golden_lesson_domain_materializations(
    batch_id, binding_id, subject_id, lesson_id, lesson_created, idempotency_key,
    write_plan, write_plan_sha256, result, materialized_by)
  VALUES (v_batch,'52000000-0000-0000-0000-000000000001', v_subject, v_lesson, true,
          'cf10-iron-fixture-key', '{"schema":"cf10.fixture"}'::jsonb, repeat('5',64),
          jsonb_build_object('mode','EXECUTE'), v_actor);

  -- The verified furnace asset, already uploaded to the private bucket by the server function.
  INSERT INTO storage.objects(bucket_id, name)
  VALUES ('golden-lesson-assets',
          v_lesson::text || '/a5e17da2c7343bc3f4289a3258f646d635e7a8365b84f2b7c7209134f0614daf-official-figure-1-1.jpg');
END
$fixture$;

-- Helper for the assert file.
CREATE OR REPLACE FUNCTION public.cf11_iron_assets()
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_array(jsonb_build_object(
    'assetCode','OFFICIAL-FIGURE-1-1',
    'fileName','official-figure-1-1.jpg',
    'mimeType','image/jpeg',
    'sha256','a5e17da2c7343bc3f4289a3258f646d635e7a8365b84f2b7c7209134f0614daf',
    'bytes', 26742,
    'altTextAr','شكل (1-1) الفرن العالي (اللافح)',
    'storageBucket','golden-lesson-assets',
    'storagePath','43000000-0000-0000-0000-000000000012/a5e17da2c7343bc3f4289a3258f646d635e7a8365b84f2b7c7209134f0614daf-official-figure-1-1.jpg'));
$$;
GRANT EXECUTE ON FUNCTION public.cf11_iron_assets() TO authenticated;
