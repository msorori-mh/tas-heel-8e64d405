-- Cover foreign keys on the high-growth question and exam write paths.
begin;

create index if not exists question_targets_subject_id_idx on public.question_targets (subject_id);
create index if not exists question_targets_lesson_id_idx on public.question_targets (lesson_id);
create index if not exists question_targets_revision_question_idx on public.question_targets (revision_id, question_id);
create index if not exists question_targets_question_id_idx on public.question_targets (question_id);
create index if not exists question_targets_unit_id_idx on public.question_targets (unit_id);
create index if not exists exam_session_questions_logical_question_id_idx on public.exam_session_questions (logical_question_id);
create index if not exists exam_session_questions_question_revision_id_idx on public.exam_session_questions (question_revision_id);
create index if not exists exam_session_answers_question_revision_id_idx on public.exam_session_answers (question_revision_id);
create index if not exists exam_session_answers_session_question_idx on public.exam_session_answers (session_id, exam_session_question_id);
create index if not exists exam_session_answers_assigned_grader_id_idx on public.exam_session_answers (assigned_grader_id);
create index if not exists ministerial_exam_questions_question_id_idx on public.ministerial_exam_questions (question_id);
create index if not exists ministerial_exam_questions_published_revision_id_idx on public.ministerial_exam_questions (published_revision_id);
create index if not exists exam_template_questions_question_id_idx on public.exam_template_questions (question_id);

commit;
