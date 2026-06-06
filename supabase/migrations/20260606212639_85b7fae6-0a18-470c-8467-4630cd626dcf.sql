-- 1) Remove unused realtime publication for notifications & lesson_comments
--    (no client subscribes; eliminates risk of cross-user channel snooping)
ALTER PUBLICATION supabase_realtime DROP TABLE public.notifications;
ALTER PUBLICATION supabase_realtime DROP TABLE public.lesson_comments;

-- 2) Add UPDATE + DELETE policies on storage.objects for 'receipts' bucket,
--    scoped to the file owner, and locked while a linked payment_request is under review.

-- Users can delete their own receipt files ONLY when no pending/approved payment_request references them.
CREATE POLICY "Users can delete own receipts when not under review"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'receipts'
  AND owner = auth.uid()
  AND NOT EXISTS (
    SELECT 1 FROM public.payment_requests pr
    WHERE pr.user_id = auth.uid()
      AND pr.receipt_url IS NOT NULL
      AND pr.receipt_url LIKE '%' || storage.objects.name
      AND pr.status IN ('pending','approved')
  )
);

-- Users can update (replace) their own receipt files ONLY before a pending review starts.
CREATE POLICY "Users can update own receipts when not submitted"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'receipts'
  AND owner = auth.uid()
  AND NOT EXISTS (
    SELECT 1 FROM public.payment_requests pr
    WHERE pr.user_id = auth.uid()
      AND pr.receipt_url IS NOT NULL
      AND pr.receipt_url LIKE '%' || storage.objects.name
      AND pr.status IN ('pending','approved')
  )
)
WITH CHECK (
  bucket_id = 'receipts'
  AND owner = auth.uid()
);