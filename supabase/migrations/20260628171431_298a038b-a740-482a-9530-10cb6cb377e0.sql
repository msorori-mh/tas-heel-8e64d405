-- IMPORT-JOBS-FOUNDATION-01: persistence for import job tracking (no import execution).

CREATE TABLE public.import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  import_type text NOT NULL,
  template_key text,
  original_filename text,
  file_size_bytes bigint,
  mime_type text,
  status text NOT NULL DEFAULT 'draft',
  mode text NOT NULL DEFAULT 'dry_run',
  total_rows integer NOT NULL DEFAULT 0,
  valid_rows integer NOT NULL DEFAULT 0,
  invalid_rows integer NOT NULL DEFAULT 0,
  warning_rows integer NOT NULL DEFAULT 0,
  inserted_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  CONSTRAINT import_jobs_import_type_check CHECK (
    import_type IN ('structure', 'questions', 'exam_templates', 'config', 'mixed')
  ),
  CONSTRAINT import_jobs_status_check CHECK (
    status IN ('draft','validating','validated','validation_failed','executing','completed','failed','cancelled')
  ),
  CONSTRAINT import_jobs_mode_check CHECK (mode IN ('dry_run','execute')),
  CONSTRAINT import_jobs_total_rows_nonneg CHECK (total_rows >= 0),
  CONSTRAINT import_jobs_valid_rows_nonneg CHECK (valid_rows >= 0),
  CONSTRAINT import_jobs_invalid_rows_nonneg CHECK (invalid_rows >= 0),
  CONSTRAINT import_jobs_warning_rows_nonneg CHECK (warning_rows >= 0),
  CONSTRAINT import_jobs_inserted_count_nonneg CHECK (inserted_count >= 0),
  CONSTRAINT import_jobs_updated_count_nonneg CHECK (updated_count >= 0),
  CONSTRAINT import_jobs_skipped_count_nonneg CHECK (skipped_count >= 0),
  CONSTRAINT import_jobs_file_size_nonneg CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0)
);

COMMENT ON TABLE public.import_jobs IS 'Tracks import operations (preview, validation, execute). Does not perform imports itself.';
COMMENT ON COLUMN public.import_jobs.created_by IS 'Admin user who initiated the import job.';
COMMENT ON COLUMN public.import_jobs.summary IS 'Aggregated validation/execute results (counts, sheet breakdown, etc.).';
COMMENT ON COLUMN public.import_jobs.metadata IS 'Opaque job context (upload refs, parser version, options).';

CREATE INDEX import_jobs_created_by_idx ON public.import_jobs (created_by);
CREATE INDEX import_jobs_status_idx ON public.import_jobs (status);
CREATE INDEX import_jobs_import_type_idx ON public.import_jobs (import_type);
CREATE INDEX import_jobs_created_at_idx ON public.import_jobs (created_at DESC);

CREATE TRIGGER trg_import_jobs_updated_at
  BEFORE UPDATE ON public.import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_jobs TO authenticated;
GRANT ALL ON public.import_jobs TO service_role;

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage import jobs"
  ON public.import_jobs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.import_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  sheet_name text,
  row_number integer,
  column_name text,
  field_name text,
  severity text NOT NULL DEFAULT 'error',
  error_code text NOT NULL,
  message text NOT NULL,
  entity_type text,
  entity_code text,
  raw_value text,
  row_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT import_errors_severity_check CHECK (severity IN ('error','warning')),
  CONSTRAINT import_errors_row_number_pos CHECK (row_number IS NULL OR row_number >= 1)
);

COMMENT ON TABLE public.import_errors IS 'Per-row validation errors and warnings for an import job. Does not perform imports itself.';
COMMENT ON COLUMN public.import_errors.row_data IS 'Snapshot of the source row; may contain sensitive values — admin-only via RLS.';
COMMENT ON COLUMN public.import_errors.error_code IS 'Stable machine-readable code for grouping and UI display.';

CREATE INDEX import_errors_job_id_idx ON public.import_errors (job_id);
CREATE INDEX import_errors_severity_idx ON public.import_errors (severity);
CREATE INDEX import_errors_sheet_row_idx ON public.import_errors (job_id, sheet_name, row_number);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_errors TO authenticated;
GRANT ALL ON public.import_errors TO service_role;

ALTER TABLE public.import_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage import errors"
  ON public.import_errors FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));