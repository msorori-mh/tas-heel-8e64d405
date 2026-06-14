
-- Add missing columns to payment_methods
ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS barcode_url text;

-- Type validation trigger
CREATE OR REPLACE FUNCTION public.validate_payment_method_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.type NOT IN ('bank','exchange','ewallet','network_transfer','kuraimi_transfer','hasib_point') THEN
    RAISE EXCEPTION 'type must be bank, exchange, ewallet, network_transfer, kuraimi_transfer, or hasib_point';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_payment_method_type_trigger ON public.payment_methods;
CREATE TRIGGER validate_payment_method_type_trigger
BEFORE INSERT OR UPDATE ON public.payment_methods
FOR EACH ROW EXECUTE FUNCTION public.validate_payment_method_type();

-- updated_at trigger using existing helper
DROP TRIGGER IF EXISTS set_payment_methods_updated_at ON public.payment_methods;
CREATE TRIGGER set_payment_methods_updated_at
BEFORE UPDATE ON public.payment_methods
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage policies for payment-logos and payment-barcodes (private buckets)
DROP POLICY IF EXISTS "Authenticated can read payment logos" ON storage.objects;
CREATE POLICY "Authenticated can read payment logos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'payment-logos');

DROP POLICY IF EXISTS "Authenticated can read payment barcodes" ON storage.objects;
CREATE POLICY "Authenticated can read payment barcodes"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'payment-barcodes');

DROP POLICY IF EXISTS "Admins manage payment logos" ON storage.objects;
CREATE POLICY "Admins manage payment logos"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'payment-logos' AND public.has_role(auth.uid(),'admin'::public.app_role))
WITH CHECK (bucket_id = 'payment-logos' AND public.has_role(auth.uid(),'admin'::public.app_role));

DROP POLICY IF EXISTS "Admins manage payment barcodes" ON storage.objects;
CREATE POLICY "Admins manage payment barcodes"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'payment-barcodes' AND public.has_role(auth.uid(),'admin'::public.app_role))
WITH CHECK (bucket_id = 'payment-barcodes' AND public.has_role(auth.uid(),'admin'::public.app_role));
