-- Pin name resolution for the five functions reported by the security advisor.
begin;

alter function public._qb_json_str(text) set search_path = '';
alter function public._qb_json_num(numeric) set search_path = '';
alter function public.ministerial_build_model_code(text, text, integer, text, text) set search_path = '';
alter function public.prevent_wallet_tx_mutation() set search_path = '';
alter function public.lesson_component_v2_lifecycle(text) set search_path = '';

commit;
