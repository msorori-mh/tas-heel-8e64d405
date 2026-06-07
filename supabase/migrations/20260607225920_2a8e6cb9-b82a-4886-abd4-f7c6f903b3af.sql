
-- A1.5h.2: Structured-path read policy for lesson-pdfs only.
-- Old policies (LIKE-based + admin) remain intact for backward compatibility
-- with flat-path legacy files. This policy is additive.

CREATE POLICY "Students read structured lesson-pdfs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'lesson-pdfs'
  AND (storage.foldername(name)) IS NOT NULL
  AND array_length(storage.foldername(name), 1) >= 1
  AND (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND public.can_access_lesson(((storage.foldername(name))[1])::uuid)
);
