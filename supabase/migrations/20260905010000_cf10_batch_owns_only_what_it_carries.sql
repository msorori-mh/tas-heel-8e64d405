-- ============================================================================
-- CF10: الدفعة تملك ما تحمله فقط
-- ============================================================================
--
-- العطل الظاهر:
--   CF10_EXECUTE_FAILED: CF10_LIFECYCLE_CONFLICT: checkUnderstanding
--   عند رفع «محتوى الكتاب» وحده لدرس سبق أن راجع فريق المحتوى بعض مكوّناته.
--
-- السبب الجذري:
--   التجهيز يُنشئ سبعة صفوف في golden_lesson_domain_stage_entries دائمًا، وواحد
--   منها فقط يحمل ملفًا (source_path IS NOT NULL). لكن حرّاس دورة الحياة تعامل
--   السبعة كأنها كلها مِلك هذه الدفعة، فتشترط أن يكون كل مكوّن مُجهَّز إمّا غائبًا
--   أو DRAFT. وأي مكوّن سبق أن بلغ REVIEW أو READY يُسقط الدفعة كلها — حتى وإن
--   لم تكن الدفعة تحمل له ملفًا أصلًا.
--
--   هذا افتراض من زمن كانت فيه الدفعة تؤلّف الدرس كاملًا من الصفر. وهو نقيض
--   الهدف: نشر كل مكوّن على حدة.
--
-- الأخطر — عطل صامت لم يظهر بعد:
--   إعادة فتح دورة الحياة (من 20260827010000) تُنزل **كل** مكوّن مُجهَّز إلى DRAFT،
--   لا المكوّنات المحمولة فقط. فرفع «الخريطة الذهنية» وحدها كان سيُنزل «محتوى
--   الكتاب» المنشور من READY إلى DRAFT ويُخفيه عن الطلاب دون أي رسالة خطأ.
--   لم يظهر هذا بعدُ لأن الدفعات كانت تفشل قبل بلوغه.
--
-- المبدأ الواحد لكل الترقيعات السبعة:
--   الدفعة سلطة على ما تحمله فقط. ما لا تحمله ليس من شأنها: لا تكتبه، ولا تدّعي
--   عنه شيئًا، ولا تفشل بسببه.
--
-- ما لا يتغيّر إطلاقًا:
--   * CF10_ANSWER_LEAK_IN_OPTIONS و CF10_ANSWER_LEAK_IN_QUESTION_ROW يبقيان على
--     مستوى الدرس كله ومطلقين — تسريب الإجابات لا يُستثنى منه شيء.
--   * cf10_assert_no_answer_leak، CF10_PAYLOAD_HASH_MISMATCH، CF10_IDENTITY_CONFLICT،
--     CF10_WRITE_PLAN_HASH_MISMATCH، CF10_IDENTITY_BINDING_REQUIRED، وربط CF09.
--   * CF10 لا تزال تكتب DRAFT فقط ولا تنشر شيئًا.
--
-- كل مرساة تُشترط بعدد تطابق محدّد، وإلا توقّف كل شيء ولم يتغيّر شيء.
-- ============================================================================

DO $mig$
DECLARE
  src text; patched text; a text; r text; hits integer;

  -- المكوّن الذي تحمله الدفعة فعلًا: له ملف. والباقي مُعلن لا مرفوع.
  carried_join constant text :=
    E'              JOIN public.golden_lesson_domain_stage_entries e\n' ||
    E'                ON e.lifecycle_capability = l.capability\n' ||
    E'               AND e.batch_id = _batch_id\n' ||
    E'               AND e.source_path IS NOT NULL\n';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'golden_lesson_materialize_domain_batch'
     AND p.oid::regprocedure::text =
       'golden_lesson_materialize_domain_batch(uuid,uuid,text,text,text)';
  IF src IS NULL THEN
    RAISE EXCEPTION 'LCIP08_FUNCTION_MISSING' USING ERRCODE = 'P0002';
  END IF;
  IF position('LCIP-08' in src) > 0 THEN
    RAISE EXCEPTION 'LCIP08_ALREADY_APPLIED' USING ERRCODE = '23505';
  END IF;
  IF position('CF10_MANAGED_REVISION_TARGET_DRIFT' in src) = 0 THEN
    RAISE EXCEPTION 'LCIP08_REQUIRES_20260827010000' USING ERRCODE = '23514';
  END IF;
  patched := src;

  -- ==========================================================================
  -- A) إعادة فتح دورة الحياة تقتصر على المكوّنات المحمولة
  --    هذا هو الترقيع الذي يمنع خفض مكوّن منشور عند رفع مكوّن آخر.
  -- ==========================================================================
  a := E'    FROM public.golden_lesson_domain_stage_entries e\n' ||
       E'   WHERE e.batch_id = _batch_id\n' ||
       E'     AND l.lesson_id = lesson_row.id\n' ||
       E'     AND l.capability = e.lifecycle_capability\n' ||
       E'     AND l.applicability::text = e.applicability\n';
  r := E'    FROM public.golden_lesson_domain_stage_entries e\n' ||
       E'   WHERE e.batch_id = _batch_id\n' ||
       E'     -- LCIP-08: only a capability this batch actually carries is re-opened.\n' ||
       E'     -- Without this, uploading one component demotes every published sibling\n' ||
       E'     -- to DRAFT and silently hides it from students.\n' ||
       E'     AND e.source_path IS NOT NULL\n' ||
       E'     AND l.lesson_id = lesson_row.id\n' ||
       E'     AND l.capability = e.lifecycle_capability\n' ||
       E'     AND l.applicability::text = e.applicability\n';
  hits := (length(patched) - length(replace(patched, a, ''))) / length(a);
  IF hits <> 1 THEN
    RAISE EXCEPTION 'LCIP08_ANCHOR_A_RESET: % hits', hits USING ERRCODE = '22023';
  END IF;
  patched := replace(patched, a, r);

  -- ==========================================================================
  -- B) CF10_LIFECYCLE_CONFLICT يخصّ المكوّن المحمول فقط
  -- ==========================================================================
  a := E'    IF existing_status IS NOT NULL AND (\n' ||
       E'         existing_status IS DISTINCT FROM ''DRAFT''\n' ||
       E'      OR existing_applicability IS DISTINCT FROM expected_applicability) THEN\n';
  r := E'    -- LCIP-08: the status and applicability of a capability this batch does not\n' ||
       E'    -- carry are none of its business. It is still declared, still counted, and\n' ||
       E'    -- left exactly as the team last left it.\n' ||
       E'    IF (payloads->cap->>''text'') IS NOT NULL\n' ||
       E'       AND existing_status IS NOT NULL AND (\n' ||
       E'         existing_status IS DISTINCT FROM ''DRAFT''\n' ||
       E'      OR existing_applicability IS DISTINCT FROM expected_applicability) THEN\n';
  hits := (length(patched) - length(replace(patched, a, ''))) / length(a);
  IF hits <> 1 THEN
    RAISE EXCEPTION 'LCIP08_ANCHOR_B_CONFLICT: % hits', hits USING ERRCODE = '22023';
  END IF;
  patched := replace(patched, a, r);

  -- ==========================================================================
  -- C) تحديث بصمة المسودّة يخصّ المكوّن المحمول فقط
  --    بدونه: مكوّن غير محمول بصمته تُمسح إلى NULL لأن payload فارغ.
  -- ==========================================================================
  a := E'    IF existing_status = ''DRAFT''\n' ||
       E'       AND existing_draft_hash IS DISTINCT FROM (payloads->cap->>''sha256'') THEN\n';
  r := E'    -- LCIP-08: an absent payload has no sha256, so without this test the refresh\n' ||
       E'    -- would overwrite a sibling''s draft_hash with NULL.\n' ||
       E'    IF existing_status = ''DRAFT''\n' ||
       E'       AND (payloads->cap->>''text'') IS NOT NULL\n' ||
       E'       AND existing_draft_hash IS DISTINCT FROM (payloads->cap->>''sha256'') THEN\n';
  hits := (length(patched) - length(replace(patched, a, ''))) / length(a);
  IF hits <> 1 THEN
    RAISE EXCEPTION 'LCIP08_ANCHOR_C_REFRESH: % hits', hits USING ERRCODE = '22023';
  END IF;
  patched := replace(patched, a, r);

  -- ==========================================================================
  -- D) مجموعة المكوّنات المُجهَّزة: كلها لها صف، والمحمول منها DRAFT
  --    الحارس الأصلي كان يشترط DRAFT للسبعة، فيمنع أي درس فيه مكوّن مراجَع.
  -- ==========================================================================
  a := E'  IF (SELECT count(*) FROM public.lesson_capability_lifecycle l\n' ||
       E'       JOIN public.golden_lesson_domain_stage_entries e\n' ||
       E'         ON e.lifecycle_capability = l.capability AND e.batch_id = _batch_id\n' ||
       E'      WHERE l.lesson_id = lesson_row.id AND l.status = ''DRAFT'')\n';
  r := E'  -- LCIP-08: every staged capability must still have a lifecycle row -- that is what\n' ||
       E'  -- pins the staged set. Requiring all of them to be DRAFT additionally required the\n' ||
       E'  -- lesson to have nothing reviewed or published, which is the opposite of the point.\n' ||
       E'  -- The DRAFT obligation is asserted below, for the carried capabilities only.\n' ||
       E'  IF (SELECT count(*) FROM public.lesson_capability_lifecycle l\n' ||
       E'       JOIN public.golden_lesson_domain_stage_entries e\n' ||
       E'         ON e.lifecycle_capability = l.capability AND e.batch_id = _batch_id\n' ||
       E'      WHERE l.lesson_id = lesson_row.id)\n';
  hits := (length(patched) - length(replace(patched, a, ''))) / length(a);
  IF hits <> 1 THEN
    RAISE EXCEPTION 'LCIP08_ANCHOR_D_STAGED_SET: % hits', hits USING ERRCODE = '22023';
  END IF;
  patched := replace(patched, a, r);

  -- ==========================================================================
  -- E) CF10_LIFECYCLE_MUST_STAY_DRAFT يخصّ المكوّنات المحمولة
  -- ==========================================================================
  a := E'  IF EXISTS (SELECT 1 FROM public.lesson_capability_lifecycle\n' ||
       E'              WHERE lesson_id = lesson_row.id AND status <> ''DRAFT'') THEN\n' ||
       E'    RAISE EXCEPTION ''CF10_LIFECYCLE_MUST_STAY_DRAFT'' USING ERRCODE = ''23514'';\n' ||
       E'  END IF;\n';
  r := E'  -- LCIP-08: CF10 writes DRAFT and only DRAFT. The invariant is that nothing this\n' ||
       E'  -- batch touched came out of EXECUTE above DRAFT -- not that the whole lesson is\n' ||
       E'  -- unpublished. A sibling at REVIEW or READY is the normal steady state now.\n' ||
       E'  IF EXISTS (SELECT 1 FROM public.lesson_capability_lifecycle l\n' ||
       carried_join ||
       E'             WHERE l.lesson_id = lesson_row.id AND l.status <> ''DRAFT'') THEN\n' ||
       E'    RAISE EXCEPTION ''CF10_LIFECYCLE_MUST_STAY_DRAFT'' USING ERRCODE = ''23514'';\n' ||
       E'  END IF;\n';
  hits := (length(patched) - length(replace(patched, a, ''))) / length(a);
  IF hits <> 1 THEN
    RAISE EXCEPTION 'LCIP08_ANCHOR_E_MUST_STAY_DRAFT: % hits', hits USING ERRCODE = '22023';
  END IF;
  patched := replace(patched, a, r);

  -- ==========================================================================
  -- F) CF10_STUDENT_VISIBILITY_LEAK — موضعان
  --    lesson_student_visible صحيح متى كان أي مكوّن READY. فبعد نشر أول مكوّن
  --    كان هذا الحارس يمنع كل دفعة تالية إلى الأبد. المعنى المقصود يبقى: لم تجعل
  --    هذه الدفعة شيئًا مرئيًا.
  -- ==========================================================================
  a := E'  IF public.lesson_student_visible(lesson_row.id) THEN\n' ||
       E'    RAISE EXCEPTION ''CF10_STUDENT_VISIBILITY_LEAK'' USING ERRCODE = ''23514'';\n' ||
       E'  END IF;\n';
  r := E'  -- LCIP-08: lesson_student_visible() is true as soon as ANY capability is READY, so\n' ||
       E'  -- after the first component is published this refused every later batch forever.\n' ||
       E'  -- The meaning that matters is preserved: nothing this batch carried is visible.\n' ||
       E'  IF EXISTS (SELECT 1 FROM public.lesson_capability_lifecycle l\n' ||
       carried_join ||
       E'             WHERE l.lesson_id = lesson_row.id AND l.status <> ''DRAFT'') THEN\n' ||
       E'    RAISE EXCEPTION ''CF10_STUDENT_VISIBILITY_LEAK'' USING ERRCODE = ''23514'';\n' ||
       E'  END IF;\n';
  hits := (length(patched) - length(replace(patched, a, ''))) / length(a);
  IF hits <> 2 THEN
    RAISE EXCEPTION 'LCIP08_ANCHOR_F_VISIBILITY: % hits, expected 2', hits USING ERRCODE = '22023';
  END IF;
  patched := replace(patched, a, r);

  -- ==========================================================================
  -- G) حرّاس mindMap / simulation تخصّ الدفعة التي تحملهما
  --    CF10_HTML_PUBLICATION_CLAIMED يقول «CF11 نشرت هذا» — وهذه حقيقة مطلوبة
  --    بعد نشر الخريطة الذهنية، لا خطأ. تخطَّ المكوّن الذي لا تحمله الدفعة.
  -- ==========================================================================
  a := E'  FOREACH cap IN ARRAY ARRAY[''mindMap'',''simulation''] LOOP\n';
  r := E'  FOREACH cap IN ARRAY ARRAY[''mindMap'',''simulation''] LOOP\n' ||
       E'    -- LCIP-08: these assert that CF10 produced no HTML artefact and claimed no\n' ||
       E'    -- publication. Once CF11 has published the mind map, the claim is true and\n' ||
       E'    -- correct; asserting it against a batch that does not carry the capability\n' ||
       E'    -- turned a published sibling into a permanent refusal.\n' ||
       E'    CONTINUE WHEN NOT EXISTS (\n' ||
       E'      SELECT 1 FROM public.golden_lesson_domain_stage_entries e\n' ||
       E'       WHERE e.batch_id = _batch_id AND e.lifecycle_capability = cap\n' ||
       E'         AND e.source_path IS NOT NULL);\n';
  hits := (length(patched) - length(replace(patched, a, ''))) / length(a);
  IF hits <> 1 THEN
    RAISE EXCEPTION 'LCIP08_ANCHOR_G_HTML_LOOP: % hits', hits USING ERRCODE = '22023';
  END IF;
  patched := replace(patched, a, r);

  -- ==========================================================================
  -- H) حرّاس نسخ الأسئلة تخصّ الدفعة التي تحمل أسئلة
  --    الأسئلة تبقى مُصدَّرة بنسخ ومغلقة كما هي؛ الحارسان يفحصان أثر هذه الدفعة.
  -- ==========================================================================
  a := E'  IF EXISTS (\n' ||
       E'    SELECT 1 FROM public.question_revisions r\n' ||
       E'      JOIN public.questions q ON q.id = r.question_id\n' ||
       E'     WHERE q.lesson_id = lesson_row.id AND r.status <> ''DRAFT'') THEN\n';
  r := E'  -- LCIP-08: scoped to a batch that actually carries questions. Question versioning\n' ||
       E'  -- itself is unchanged -- revisions stay DRAFT and fail closed exactly as before.\n' ||
       E'  IF EXISTS (SELECT 1 FROM public.golden_lesson_domain_stage_entries e\n' ||
       E'              WHERE e.batch_id = _batch_id AND e.source_path IS NOT NULL\n' ||
       E'                AND e.lifecycle_capability IN (''checkUnderstanding'',''lessonAssessment''))\n' ||
       E'     AND EXISTS (\n' ||
       E'    SELECT 1 FROM public.question_revisions r\n' ||
       E'      JOIN public.questions q ON q.id = r.question_id\n' ||
       E'     WHERE q.lesson_id = lesson_row.id AND r.status <> ''DRAFT'') THEN\n';
  hits := (length(patched) - length(replace(patched, a, ''))) / length(a);
  IF hits <> 1 THEN
    RAISE EXCEPTION 'LCIP08_ANCHOR_H_REVISIONS: % hits', hits USING ERRCODE = '22023';
  END IF;
  patched := replace(patched, a, r);

  -- I) نفس المعالجة لمؤشّر النشر
  a := E'  IF EXISTS (SELECT 1 FROM public.questions\n' ||
       E'              WHERE lesson_id = lesson_row.id AND current_published_revision_id IS NOT NULL) THEN\n';
  r := E'  -- LCIP-08: see above.\n' ||
       E'  IF EXISTS (SELECT 1 FROM public.golden_lesson_domain_stage_entries e\n' ||
       E'              WHERE e.batch_id = _batch_id AND e.source_path IS NOT NULL\n' ||
       E'                AND e.lifecycle_capability IN (''checkUnderstanding'',''lessonAssessment''))\n' ||
       E'     AND EXISTS (SELECT 1 FROM public.questions\n' ||
       E'              WHERE lesson_id = lesson_row.id AND current_published_revision_id IS NOT NULL) THEN\n';
  hits := (length(patched) - length(replace(patched, a, ''))) / length(a);
  IF hits <> 1 THEN
    RAISE EXCEPTION 'LCIP08_ANCHOR_I_POINTER: % hits', hits USING ERRCODE = '22023';
  END IF;
  patched := replace(patched, a, r);

  EXECUTE patched;

  RAISE NOTICE 'LCIP-08 applied: a CF10 batch is authoritative over the components it carries, and only those.';
END
$mig$;

-- ============================================================================
-- إثبات: الترقيعات السبعة كلها موضعها، والحرّاس المطلقة لم تُمسّ
-- ============================================================================
DO $proof$
DECLARE d text; n integer;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n2 ON n2.oid = p.pronamespace
   WHERE n2.nspname = 'public'
     AND p.proname = 'golden_lesson_materialize_domain_batch'
     AND p.oid::regprocedure::text =
       'golden_lesson_materialize_domain_batch(uuid,uuid,text,text,text)';

  n := (length(d) - length(replace(d, 'LCIP-08', ''))) / length('LCIP-08');
  IF n < 9 THEN
    RAISE EXCEPTION 'LCIP08_PROOF_INCOMPLETE: % markers', n;
  END IF;

  -- المكوّن غير المحمول خارج نطاق كل حارس دورة حياة
  IF position(E'AND e.source_path IS NOT NULL\n     AND l.lesson_id = lesson_row.id' in d) = 0 THEN
    RAISE EXCEPTION 'LCIP08_PROOF_RESET_STILL_UNSCOPED';
  END IF;
  IF position(E'IF (payloads->cap->>''text'') IS NOT NULL\n       AND existing_status IS NOT NULL' in d) = 0 THEN
    RAISE EXCEPTION 'LCIP08_PROOF_CONFLICT_STILL_UNSCOPED';
  END IF;
  IF position('CONTINUE WHEN NOT EXISTS (' in d) = 0 THEN
    RAISE EXCEPTION 'LCIP08_PROOF_HTML_LOOP_STILL_UNSCOPED';
  END IF;

  -- لا يزال كل حارس موجودًا بالاسم: خُفِّف نطاقه، ولم يُحذف
  IF position('CF10_LIFECYCLE_CONFLICT' in d) = 0
     OR position('CF10_LIFECYCLE_MUST_STAY_DRAFT' in d) = 0
     OR position('CF10_LIFECYCLE_STAGED_SET_INVALID' in d) = 0
     OR position('CF10_STUDENT_VISIBILITY_LEAK' in d) = 0
     OR position('CF10_REVISION_MUST_STAY_DRAFT' in d) = 0
     OR position('CF10_PUBLISHED_POINTER_FORBIDDEN' in d) = 0
     OR position('CF10_HTML_PUBLICATION_CLAIMED' in d) = 0
     OR position('CF10_HTML_LEGACY_ROW_FORBIDDEN' in d) = 0
     OR position('CF10_HTML_CAPABILITY_READY_TOO_EARLY' in d) = 0 THEN
    RAISE EXCEPTION 'LCIP08_PROOF_A_GUARD_WAS_DELETED';
  END IF;

  -- تسريب الإجابات يبقى على مستوى الدرس كله ومطلقًا — لا استثناء
  IF position(E'IF EXISTS (\n    SELECT 1 FROM public.question_options o\n      JOIN public.question_revisions r ON r.id = o.question_revision_id\n      JOIN public.questions q ON q.id = r.question_id\n     WHERE q.lesson_id = lesson_row.id AND o.is_correct) THEN\n    RAISE EXCEPTION ''CF10_ANSWER_LEAK_IN_OPTIONS''' in d) = 0 THEN
    RAISE EXCEPTION 'LCIP08_PROOF_ANSWER_LEAK_OPTIONS_WAS_SCOPED';
  END IF;
  IF position(E'IF EXISTS (SELECT 1 FROM public.questions WHERE lesson_id = lesson_row.id AND correct_index >= 0) THEN\n    RAISE EXCEPTION ''CF10_ANSWER_LEAK_IN_QUESTION_ROW''' in d) = 0 THEN
    RAISE EXCEPTION 'LCIP08_PROOF_ANSWER_LEAK_ROW_WAS_SCOPED';
  END IF;

  -- والحرّاس الأخرى وإصلاحات LCIP السابقة
  IF position('cf10_assert_no_answer_leak' in d) = 0
     OR position('CF10_PAYLOAD_HASH_MISMATCH' in d) = 0
     OR position('CF10_IDENTITY_CONFLICT' in d) = 0
     OR position('CF10_WRITE_PLAN_HASH_MISMATCH' in d) = 0
     OR position('CF10_IDENTITY_BINDING_REQUIRED' in d) = 0
     OR position('CF10_MANAGED_REVISION_TARGET_DRIFT' in d) = 0
     OR position('LCIP-04' in d) = 0
     OR position('LCIP-05' in d) = 0 THEN
    RAISE EXCEPTION 'LCIP08_PROOF_NEIGHBOURING_GUARD_LOST';
  END IF;
  IF position('CF10_EMPTY_PAYLOAD' in d) > 0 THEN
    RAISE EXCEPTION 'LCIP08_PROOF_EMPTY_PAYLOAD_RETURNED';
  END IF;

  RAISE NOTICE 'LCIP-08 proof passed.';
END
$proof$;

-- Rollback: re-apply the reverse patch. The function is rewritten in place and no
-- domain row is written by this migration, so there is no data change to undo.
