GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.questions,
  public.question_revisions,
  public.question_options,
  public.question_accepted_answers,
  public.question_targets,
  public.question_solutions,
  public.question_solution_steps,
  public.question_media
TO service_role;