CREATE TABLE public.lesson_question_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  answer_text text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lesson_question_notes_unique UNIQUE (student_id, question_id)
);

CREATE INDEX lesson_question_notes_student_lesson_idx
  ON public.lesson_question_notes (student_id, lesson_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_question_notes TO authenticated;
GRANT ALL ON public.lesson_question_notes TO service_role;

ALTER TABLE public.lesson_question_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students read own lesson question notes"
  ON public.lesson_question_notes FOR SELECT TO authenticated
  USING (auth.uid() = student_id);

CREATE POLICY "Students insert own lesson question notes"
  ON public.lesson_question_notes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Students update own lesson question notes"
  ON public.lesson_question_notes FOR UPDATE TO authenticated
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Students delete own lesson question notes"
  ON public.lesson_question_notes FOR DELETE TO authenticated
  USING (auth.uid() = student_id);

CREATE TRIGGER lesson_question_notes_set_updated_at
  BEFORE UPDATE ON public.lesson_question_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();