-- MINISTERIAL_QUESTION_MEDIA_V1 — local-only stand-in for Supabase Storage.
--
-- Production has the real `storage` schema. The disposable PG17 rehearsal only
-- needs the two relations the media migration touches:
--   * storage.buckets  — the private `question-media` bucket (runbook step)
--   * storage.objects  — rows whose metadata (size/mimetype) execute verifies
-- so bucket policies are created and `_ministerial_media_object_verified()` is
-- exercised for real instead of being skipped.
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL REFERENCES storage.buckets(id),
  name text NOT NULL,
  owner uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket_id, name)
);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Runbook prerequisite mirrored locally: private bucket, no public flag.
INSERT INTO storage.buckets (id, name, public)
VALUES ('question-media', 'question-media', false)
ON CONFLICT (id) DO NOTHING;
