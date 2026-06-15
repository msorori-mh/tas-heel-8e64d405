-- Add reference code columns for Excel import system (IMPORT-SYSTEM-02)
-- All columns nullable + partial unique index. No RLS changes. Safe backfill.

-- 1) subjects.code
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS code TEXT;

UPDATE public.subjects s
SET code = lower(regexp_replace(
    coalesce(s.slug,'subject') || '-' ||
    coalesce((SELECT g.slug FROM public.grades g WHERE g.id = s.grade_id), 'g') || '-' ||
    coalesce((SELECT t.track_code FROM public.curriculum_tracks t WHERE t.id = s.curriculum_track_id), 'all') ||
    case when s.semester is not null then '-s'||s.semester else '' end,
    '[^a-z0-9_-]+','-','g'))
WHERE code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS subjects_code_uniq ON public.subjects (code) WHERE code IS NOT NULL;

-- 2) units.code unique per subject
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS code TEXT;

UPDATE public.units u
SET code = (SELECT s.code FROM public.subjects s WHERE s.id = u.subject_id) || '-u' || lpad(u.sort_order::text, 2, '0')
WHERE code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS units_code_subject_uniq ON public.units (subject_id, code) WHERE code IS NOT NULL;

-- 3) questions.code (global)
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS code TEXT;

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn FROM public.questions WHERE code IS NULL
)
UPDATE public.questions q SET code = 'Q-' || lpad(r.rn::text, 6, '0')
FROM ranked r WHERE q.id = r.id;

CREATE UNIQUE INDEX IF NOT EXISTS questions_code_uniq ON public.questions (code) WHERE code IS NOT NULL;

-- 4) exam_templates.code (global)
ALTER TABLE public.exam_templates ADD COLUMN IF NOT EXISTS code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS exam_templates_code_uniq ON public.exam_templates (code) WHERE code IS NOT NULL;
