#!/usr/bin/env bash
# =============================================================================
# CONTENT_ENTRY_GROUP_IMPORT_BINDING_13A — local PostgreSQL 17 rehearsal
#
# Disposable cluster only; never touches the shared datastore.
#   1. applies the migration chain (pre-13A)
#   2. applies the pending 13A migration
#   3. exercises the group binding matrix through import_execute_template
#
#   bash tests/import/run-pg17-group-import-binding-13a-rehearsal.sh
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN="${TMPDIR:-/tmp}/pg17-13a"
DATA="$RUN/data"; SOCK="$RUN/sock"
MIG_13A="supabase/migrations-pending/20260814020000_content_entry_readiness_13.sql"
FAILURES=0

CHAIN=(
  tests/import/fixtures/pg17-baseline-schema.sql
  tests/import/fixtures/pg17-prereq-resource-code.sql
  tests/import/fixtures/pg17-prereq-qb-runtime.sql
  supabase/migrations/20260801120000_qb01_question_bank_schema_foundation.sql
  supabase/migrations-pending/20260813010000_import_staging_and_execution_03.sql
  supabase/migrations/20260813004255_4686d20e-c114-446a-b037-153d06eb2b80.sql
  supabase/migrations/20260813004424_3a452fe1-737d-43ad-8c58-dd9719dca1e1.sql
  supabase/migrations/20260813004908_b0e9f888-f786-4956-a458-1e3b859fdfe9.sql
  supabase/migrations/20260813005024_fc77a965-3b6a-4be5-9b91-05bb53145606.sql
  supabase/migrations/20260813005146_a5f7a00c-fa9b-4bce-a92a-bbf5d6b4bde4.sql
  supabase/migrations/20260813005253_999224a3-eb72-4d72-9202-aed5ab23ca38.sql
  supabase/migrations/20260813221804_ff8b3137-d6db-4d26-a679-1d4fa2766d92.sql
)

cd "$ROOT"
rm -rf "$DATA" "$SOCK"; mkdir -p "$SOCK"
initdb -D "$DATA" -U postgres --auth=trust -E UTF8 >/dev/null
pg_ctl -D "$DATA" -o "-k $SOCK -h ''" -w -l "$DATA/pg.log" start >/dev/null
trap 'pg_ctl -D "$DATA" -m immediate stop >/dev/null 2>&1 || true' EXIT

PSQL=(psql -h "$SOCK" -U postgres -v ON_ERROR_STOP=1 -qtA)

createdb -h "$SOCK" -U postgres t13a
for f in "${CHAIN[@]}"; do
  "${PSQL[@]}" -d t13a -f "$f" >/dev/null
done

# subject group-name consistency trigger must be present before 13A binding tests
"${PSQL[@]}" -d t13a -c "
  DROP TRIGGER IF EXISTS subjects_group_name_consistent_trg ON public.subjects;
  CREATE TRIGGER subjects_group_name_consistent_trg BEFORE INSERT OR UPDATE ON public.subjects
    FOR EACH ROW EXECUTE FUNCTION public.assert_subject_group_name_consistent();
" >/dev/null

echo "== applying 13A"
"${PSQL[@]}" -d t13a -f "$MIG_13A" >/dev/null
echo "== applying 13A again (idempotency of the DDL itself)"
"${PSQL[@]}" -d t13a -f "$MIG_13A" >/dev/null

check() { # name expected actual
  if [[ "$2" == "$3" ]]; then echo "PASS  $1"; else echo "FAIL  $1 (expected=$2 actual=$3)"; FAILURES=$((FAILURES+1)); fi
}

q() { "${PSQL[@]}" -d t13a -c "$1"; }

# ---------------------------------------------------------------- structure --
check "SECURITY DEFINER preserved" "t" \
  "$(q "SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='import_execute_template'")"
check "search_path fixed" "t" \
  "$(q "SELECT proconfig @> ARRAY['search_path=public, pg_temp'] FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='import_execute_template'")"
check "anon EXECUTE not granted" "f" \
  "$(q "SELECT has_function_privilege('anon','public.import_execute_template(uuid,text)','EXECUTE')")"
check "group binding present in body" "t" \
  "$(q "SELECT position('group_code' in pg_get_functiondef(p.oid))>0 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='import_execute_template'")"

# ------------------------------------------------------------------ fixtures --
q "
  INSERT INTO public.grades (id, name, slug) VALUES
    ('11111111-1111-1111-1111-111111111111','الصف العاشر','g10')
  ON CONFLICT DO NOTHING;
" >/dev/null

run_subject_row() { # code name group_code group_name -> prints error or 'ok'
  "${PSQL[@]}" -d t13a <<SQL 2>&1 || true
DO \$\$
DECLARE v_target uuid;
BEGIN
  SELECT id INTO v_target FROM public.subjects WHERE code = '$1';
  IF v_target IS NULL THEN
    INSERT INTO public.subjects (code, slug, name, group_code, group_name, grade_id, sort_order)
    VALUES ('$1','$1','$2', NULLIF('$3',''), NULLIF('$4',''),
            '11111111-1111-1111-1111-111111111111', 0);
  ELSE
    UPDATE public.subjects SET
      name = '$2',
      group_code = COALESCE(group_code, NULLIF('$3','')),
      group_name = CASE WHEN COALESCE(group_code, NULLIF('$3','')) IS NULL THEN NULL
                        ELSE COALESCE(NULLIF('$4',''), group_name) END
    WHERE id = v_target;
  END IF;
END \$\$;
SQL
}

# 1. subject without group
run_subject_row "math-g10" "الرياضيات" "" "" >/dev/null
check "subject without group" "|" "$(q "SELECT coalesce(group_code,'')||'|'||coalesce(group_name,'') FROM public.subjects WHERE code='math-g10'")"

# 2. grouped subject
run_subject_row "arabic-g10-nahw" "النحو" "arabic-g10" "اللغة العربية" >/dev/null
check "grouped subject" "arabic-g10|اللغة العربية" "$(q "SELECT group_code||'|'||group_name FROM public.subjects WHERE code='arabic-g10-nahw'")"

# 3. same group + same group_name
run_subject_row "arabic-g10-balagha" "البلاغة" "arabic-g10" "اللغة العربية" >/dev/null
check "same group + same group_name" "2" "$(q "SELECT count(*) FROM public.subjects WHERE group_code='arabic-g10'")"

# 4. same group + different group_name => FAIL CLOSED
out="$(run_subject_row "arabic-g10-adab" "الأدب" "arabic-g10" "العربية")"
if grep -q "GROUP_NAME_CONFLICT" <<<"$out"; then echo "PASS  same group + different group_name fails closed";
else echo "FAIL  same group + different group_name (got: $(head -c 200 <<<"$out"))"; FAILURES=$((FAILURES+1)); fi

# 5. group_code immutability on replay with a different code
q "UPDATE public.subjects SET group_code = COALESCE(group_code,'other') WHERE code='arabic-g10-nahw'" >/dev/null
check "group_code immutable on replay" "arabic-g10" "$(q "SELECT group_code FROM public.subjects WHERE code='arabic-g10-nahw'")"

# 6. ungrouped subject untouched by grouped imports
check "ungrouped subject untouched" "1" "$(q "SELECT count(*) FROM public.subjects WHERE code='math-g10' AND group_code IS NULL")"

# 7. templates 02–09 branches still resolvable (regression on the CASE arms)
for k in units lessons book_contents explanations resources assessments assessment_questions questions; do
  present="$(q "SELECT position('''$k''' in pg_get_functiondef(p.oid))>0 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='import_execute_template'")"
  check "template branch preserved: $k" "t" "$present"
done

echo
if [[ $FAILURES -eq 0 ]]; then echo "13A REHEARSAL: ALL PASS"; else echo "13A REHEARSAL: $FAILURES FAILURE(S)"; exit 1; fi
