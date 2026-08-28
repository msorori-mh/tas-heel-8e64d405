-- ============================================================================
-- إصلاح: CF10_EMPTY_PAYLOAD — رفع مكوّن واحد كان يفشل عند التجهيز
-- ============================================================================
--
-- العطل:
--   golden_lesson_materialize_domain_batch ترفض أي مكوّن مُجهَّز بلا ملف:
--
--     IF entry.applicability = 'REQUIRED' AND payload_text IS NULL THEN
--       RAISE EXCEPTION 'CF10_EMPTY_PAYLOAD: %', entry.capability;
--
--   والتجهيز يُرسل المكوّنات السبعة دائمًا (ستة منها REQUIRED)، فرفع مكوّن
--   واحد يُسقط العملية كلها عند أول مكوّن فارغ.
--
-- الإصلاح — سبعة ترقيعات مُثبَّتة بمرساة:
--   1. حذف رفع الخطأ: المكوّن بلا ملف ليس خطأً، بل ببساطة ليس جزءًا من هذه الدفعة.
--   2..4. الكتابة لا تحدث إطلاقًا عند حمولة NULL (محتوى الكتاب، الشرح، الملخص).
--   5..7. ولا يُرفع تعارض بصمة على حمولة NULL.
--
--   البلوكان 4/5 (الخريطة والتجربة) و6/7 (أسئلة الكتاب واختبر فهمك) يتخطّون
--   الحمولة الفارغة أصلاً — لم يكن ينقص إلا الثلاثة الأولى.
--
-- الأمان: كل مرساة يجب أن تُطابق مرة واحدة بالضبط وإلا توقّف كل شيء ولم يتغيّر
-- شيء. ولا يُكتب محتوى فارغ، فلا يصل الطالب مكوّنٌ لم يُرفع.
--
-- لا يغيّر: فحص تسريب الإجابات، تعارض الهوية، بصمات الملفات المرفوعة فعلًا،
-- ولا صفوف دورة الحياة.
-- ============================================================================

DO $mig$
DECLARE
  src text; patched text; a text; b text; r text; hits integer; hits2 integer; tbl text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'golden_lesson_materialize_domain_batch';
  IF src IS NULL THEN
    RAISE EXCEPTION 'LCIP04_FUNCTION_MISSING' USING ERRCODE = 'P0002';
  END IF;
  patched := src;

  -- 1) المكوّن بلا ملف ليس خطأً
  a := E'    IF entry.applicability = ''REQUIRED'' AND payload_text IS NULL THEN\n' ||
       E'      RAISE EXCEPTION ''CF10_EMPTY_PAYLOAD: %'', entry.capability USING ERRCODE = ''22023'';\n' ||
       E'    END IF;';
  r := E'    -- LCIP-04: an unauthored capability is absent from this batch, not an error.\n' ||
       E'    -- Every domain write below skips a NULL payload, so nothing empty is materialised.';
  hits := (length(patched) - length(replace(patched, a, ''))) / length(a);
  IF hits <> 1 THEN
    RAISE EXCEPTION 'LCIP04_ANCHOR_EMPTY_PAYLOAD: % hits', hits USING ERRCODE = '22023';
  END IF;
  patched := replace(patched, a, r);

  -- 2..4) لا تعارض بصمة على حمولة فارغة
  --
  -- لفرع التعارض صيغتان قائمتان فعلًا، وكلتاهما تبدأ بنفس السطر:
  --   * الصيغة الأصلية: الرفض مباشرةً بعد ELSIF.
  --   * صيغة 20260827010000 (المراجعة المُدارة): الرفض داخل IF binding_count.
  -- الإنتاج على الأولى، وسلسلة المستودع على الثانية. التعديل المطلوب واحد في
  -- الحالتين: إضافة شرط payload_text IS NOT NULL إلى سطر ELSIF نفسه. فنقبل أيّ
  -- الصيغتين، ونشترط أن تُطابق واحدة منهما مرة واحدة بالضبط — لا صفرًا ولا اثنتين.
  FOREACH tbl IN ARRAY ARRAY['lesson_book_contents','lesson_explanations','lesson_summaries'] LOOP
    a := E'  ELSIF existing_hash IS DISTINCT FROM new_hash THEN\n' ||
         E'    RAISE EXCEPTION ''CF10_CONTENT_HASH_CONFLICT: ' || tbl || E''' USING ERRCODE = ''23514'';';
    b := E'  ELSIF existing_hash IS DISTINCT FROM new_hash THEN\n' ||
         E'    IF binding_count IS DISTINCT FROM 1 THEN\n' ||
         E'      RAISE EXCEPTION ''CF10_CONTENT_HASH_CONFLICT: ' || tbl || E''' USING ERRCODE = ''23514'';';
    hits  := (length(patched) - length(replace(patched, a, ''))) / length(a);
    hits2 := (length(patched) - length(replace(patched, b, ''))) / length(b);
    IF hits + hits2 <> 1 THEN
      RAISE EXCEPTION 'LCIP04_ANCHOR_CONFLICT % : % plain / % managed', tbl, hits, hits2
        USING ERRCODE = '22023';
    END IF;
    IF hits = 1 THEN
      r := replace(a, E'  ELSIF existing_hash',
                      E'  ELSIF payload_text IS NOT NULL AND existing_hash');
      patched := replace(patched, a, r);
    ELSE
      r := replace(b, E'  ELSIF existing_hash',
                      E'  ELSIF payload_text IS NOT NULL AND existing_hash');
      patched := replace(patched, b, r);
    END IF;
  END LOOP;

  -- 5) محتوى الكتاب: لا إدراج على حمولة فارغة
  a := E'  IF existing_hash IS NULL THEN\n    INSERT INTO public.lesson_book_contents(lesson_id, content)';
  r := E'  IF existing_hash IS NULL AND payload_text IS NOT NULL THEN\n    INSERT INTO public.lesson_book_contents(lesson_id, content)';
  hits := (length(patched) - length(replace(patched, a, ''))) / length(a);
  IF hits <> 1 THEN
    RAISE EXCEPTION 'LCIP04_ANCHOR_INSERT_BOOK: % hits', hits USING ERRCODE = '22023';
  END IF;
  patched := replace(patched, a, r);

  -- 6) شرح تمكين
  a := E'  IF existing_hash IS NULL THEN\n    INSERT INTO public.lesson_explanations(lesson_id, title, content, sort_order, explanation_code)';
  r := E'  IF existing_hash IS NULL AND payload_text IS NOT NULL THEN\n    INSERT INTO public.lesson_explanations(lesson_id, title, content, sort_order, explanation_code)';
  hits := (length(patched) - length(replace(patched, a, ''))) / length(a);
  IF hits <> 1 THEN
    RAISE EXCEPTION 'LCIP04_ANCHOR_INSERT_EXPL: % hits', hits USING ERRCODE = '22023';
  END IF;
  patched := replace(patched, a, r);

  -- 7) ملخص الدرس
  a := E'  IF existing_hash IS NULL THEN\n    INSERT INTO public.lesson_summaries(lesson_id, summary)';
  r := E'  IF existing_hash IS NULL AND payload_text IS NOT NULL THEN\n    INSERT INTO public.lesson_summaries(lesson_id, summary)';
  hits := (length(patched) - length(replace(patched, a, ''))) / length(a);
  IF hits <> 1 THEN
    RAISE EXCEPTION 'LCIP04_ANCHOR_INSERT_SUMM: % hits', hits USING ERRCODE = '22023';
  END IF;
  patched := replace(patched, a, r);

  EXECUTE patched;

  RAISE NOTICE 'LCIP-04 applied: a batch carrying one component no longer fails on the empty six.';
END
$mig$;

-- Rollback: re-apply the reverse patch, or restore golden_lesson_materialize_domain_batch
-- from 20260819230000_content_factory_10_domain_materialization.sql. NOTE the repository
-- copy has drifted from production; prefer the reverse patch. No data changes to undo.
