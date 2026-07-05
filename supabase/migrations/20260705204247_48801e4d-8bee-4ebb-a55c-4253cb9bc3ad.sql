DROP POLICY IF EXISTS "Admins can view wallet topup receipts" ON storage.objects;

CREATE POLICY "Admins can view wallet topup receipts"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'receipts'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM public.wallet_topup_requests wtr
      WHERE wtr.receipt_path = storage.objects.name
    )
  );