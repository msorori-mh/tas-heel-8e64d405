
ALTER TABLE public.payment_methods DROP CONSTRAINT IF EXISTS payment_methods_type_check;
ALTER TABLE public.payment_methods ADD CONSTRAINT payment_methods_type_check
  CHECK (type = ANY (ARRAY['bank','exchange','ewallet','network_transfer','kuraimi_transfer','hasib_point']));
