
CREATE OR REPLACE FUNCTION public.sync_profile_curriculum_track()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_gov_id uuid;
  v_default uuid;
  v_allowed boolean;
BEGIN
  -- استنتج governorate_id من النص القديم إن لزم
  IF NEW.governorate_id IS NULL AND NEW.governorate IS NOT NULL AND length(trim(NEW.governorate)) > 0 THEN
    SELECT id INTO v_gov_id FROM public.governorates WHERE name = trim(NEW.governorate) LIMIT 1;
    IF v_gov_id IS NOT NULL THEN NEW.governorate_id := v_gov_id; END IF;
  END IF;

  -- لا governorate → لا نفعل شيئًا خطيرًا
  IF NEW.governorate_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.curriculum_track_id IS NOT NULL THEN
    -- احترم اختيار التطبيق لكن تحقق أنه مسموح للمحافظة
    SELECT EXISTS (
      SELECT 1 FROM public.governorate_curriculum_map
      WHERE governorate_id = NEW.governorate_id
        AND curriculum_track_id = NEW.curriculum_track_id
    ) INTO v_allowed;

    -- fallback: السماح إن كان هو الـ default للمحافظة (حماية بيانات قديمة قبل ملء الخريطة)
    IF NOT v_allowed THEN
      SELECT default_curriculum_track_id INTO v_default
      FROM public.governorates WHERE id = NEW.governorate_id;
      IF v_default IS NOT NULL AND v_default = NEW.curriculum_track_id THEN
        v_allowed := true;
      END IF;
    END IF;

    IF NOT v_allowed THEN
      RAISE EXCEPTION 'curriculum_track_not_allowed_for_governorate'
        USING ERRCODE = '22023',
              HINT = 'اختر منهجاً مسموحاً لهذه المحافظة من governorate_curriculum_map';
    END IF;
  ELSE
    -- فارغ → املأ من default المحافظة
    SELECT default_curriculum_track_id INTO v_default
    FROM public.governorates WHERE id = NEW.governorate_id;
    NEW.curriculum_track_id := v_default;
  END IF;

  RETURN NEW;
END;
$function$;
