-- ============================================================================
-- CF10_ANSWER_COMPANION_MISSING — الرفيق مطلوب فقط حين تُرفع أسئلة
-- ============================================================================
--
-- العطل:
--   golden_lesson_materialize_domain_batch تُلزم بوجود «رفيق الإجابات» دائمًا:
--
--     IF companion IS NULL THEN
--       RAISE EXCEPTION 'CF10_ANSWER_COMPANION_MISSING';
--
--   ورفيق الإجابات ملف يولّده النظام من قوالب Excel لأسئلة الكتاب و«اختبر فهمك».
--   فحين لا تُرفع أسئلة لا وجود له أصلًا، وتسقط الدفعة كلها. هذه هي البوابة
--   التالية مباشرة بعد CF10_EMPTY_PAYLOAD على طريق رفع مكوّن واحد.
--
-- الإصلاح:
--   يبقى الرفيق إلزاميًا متى وُجدت أسئلة فعلًا في الدفعة، ولا يُطلب حين لا توجد.
--
-- الأمان — كل موضع يُستخدم فيه companion وهو NULL:
--   * خطة الكتابة: answerCompanionSha256 = NULL — مقبول.
--   * مقارنة إعادة التشغيل: NULL مقابل NULL — غير مختلفين، فلا تعارض كاذب.
--   * كتابة الأسئلة: coalesce((companion->>'body')::jsonb->'answers','[]') تُرجع
--     مصفوفة فارغة، وهذه البلوكات لا تعمل أصلًا بلا أسئلة.
--
-- لا يغيّر: cf10_assert_no_answer_leak، CF10_PAYLOAD_HASH_MISMATCH،
-- CF10_IDENTITY_CONFLICT، ولا CF10_STAGED_CAPABILITY_SET_INVALID.
--
-- طُبّق على الإنتاج يوم 2026-08-29 وسُجّل بهذا الرقم قبل أن يصل المستودع؛ هذا
-- الملف يجعل السلسلة قابلة لإعادة الإنتاج من الصفر.
-- ============================================================================

DO $mig$
DECLARE
  src text; patched text; a text; r text; hits integer;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'golden_lesson_materialize_domain_batch';
  IF src IS NULL THEN
    RAISE EXCEPTION 'LCIP05_FUNCTION_MISSING' USING ERRCODE = 'P0002';
  END IF;

  a := E'  IF companion IS NULL THEN\n' ||
       E'    RAISE EXCEPTION ''CF10_ANSWER_COMPANION_MISSING'' USING ERRCODE = ''22023'';\n' ||
       E'  END IF;';
  r := E'  -- LCIP-05: the answers companion exists only when question templates are part of\n' ||
       E'  -- this batch. Demanding it for a batch that carries no questions blocked every\n' ||
       E'  -- partial upload. It stays mandatory the moment questions are present.\n' ||
       E'  IF companion IS NULL\n' ||
       E'     AND ((payloads->''officialBookQuestions''->>''text'') IS NOT NULL\n' ||
       E'          OR (payloads->''selfTest''->>''text'') IS NOT NULL) THEN\n' ||
       E'    RAISE EXCEPTION ''CF10_ANSWER_COMPANION_MISSING'' USING ERRCODE = ''22023'';\n' ||
       E'  END IF;';

  hits := (length(src) - length(replace(src, a, ''))) / length(a);
  IF hits <> 1 THEN
    RAISE EXCEPTION 'LCIP05_ANCHOR_NOT_UNIQUE: % hits', hits USING ERRCODE = '22023';
  END IF;
  patched := replace(src, a, r);

  EXECUTE patched;

  RAISE NOTICE 'LCIP-05 applied: a batch without question templates no longer demands an answers companion.';
END
$mig$;

-- Proof: the raise still exists, it is now conditional, and the neighbouring guards
-- were not disturbed.
DO $proof$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'golden_lesson_materialize_domain_batch';

  IF position('CF10_ANSWER_COMPANION_MISSING' in d) = 0 THEN
    RAISE EXCEPTION 'LCIP05_PROOF_RAISE_DELETED';
  END IF;
  IF position(E'OR (payloads->''selfTest''->>''text'') IS NOT NULL) THEN' in d) = 0 THEN
    RAISE EXCEPTION 'LCIP05_PROOF_NOT_CONDITIONAL';
  END IF;
  IF position('cf10_assert_no_answer_leak' in d) = 0 THEN
    RAISE EXCEPTION 'LCIP05_PROOF_ANSWER_LEAK_GUARD_LOST';
  END IF;
  IF position('CF10_STAGED_CAPABILITY_SET_INVALID' in d) = 0 THEN
    RAISE EXCEPTION 'LCIP05_PROOF_STAGED_SET_GUARD_LOST';
  END IF;
END
$proof$;

-- Rollback: re-apply the reverse patch. No data changes to undo.
