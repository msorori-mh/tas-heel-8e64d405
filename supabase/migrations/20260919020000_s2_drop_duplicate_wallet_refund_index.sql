-- Keep the later one-refund-per-subscription index; both definitions were identical.
begin;

drop index if exists public.uniq_wallet_tx_subscription_refund;

commit;
