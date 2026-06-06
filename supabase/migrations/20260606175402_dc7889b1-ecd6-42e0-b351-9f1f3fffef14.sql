CREATE TABLE public.unit_practice_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
    subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    total integer NOT NULL,
    answered integer NOT NULL,
    correct integer NOT NULL,
    score integer NOT NULL,
    answers jsonb NOT NULL DEFAULT '[]'::jsonb,
    per_question jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT unit_practice_attempts_total_nonnegative CHECK (total >= 0),
    CONSTRAINT unit_practice_attempts_answered_nonnegative CHECK (answered >= 0),
    CONSTRAINT unit_practice_attempts_correct_nonnegative CHECK (correct >= 0),
    CONSTRAINT unit_practice_attempts_score_range CHECK (score >= 0 AND score <= 100),
    CONSTRAINT unit_practice_attempts_correct_lte_total CHECK (correct <= total),
    CONSTRAINT unit_practice_attempts_answered_lte_total CHECK (answered <= total)
);

CREATE INDEX idx_unit_practice_attempts_user_unit_created
    ON public.unit_practice_attempts (user_id, unit_id, created_at DESC);
CREATE INDEX idx_unit_practice_attempts_unit_created
    ON public.unit_practice_attempts (unit_id, created_at DESC);
CREATE INDEX idx_unit_practice_attempts_subject_created
    ON public.unit_practice_attempts (subject_id, created_at DESC);

GRANT SELECT ON public.unit_practice_attempts TO authenticated;
GRANT ALL ON public.unit_practice_attempts TO service_role;

ALTER TABLE public.unit_practice_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view their own attempts"
    ON public.unit_practice_attempts
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all attempts"
    ON public.unit_practice_attempts
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));