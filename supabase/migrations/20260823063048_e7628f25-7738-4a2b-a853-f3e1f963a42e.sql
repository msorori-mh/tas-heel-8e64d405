DO $test$
DECLARE
  contract jsonb;
BEGIN
  contract := public.cf11_assert_interactive_contract(
    'mindMapHtml',
    '<!doctype html><html dir="rtl"><body><button onclick="this.dataset.opened=''true''">افتح</button><script>document.documentElement.dataset.ready="true";</script></body></html>'
  );
  IF contract->>'enforcement' IS DISTINCT FROM 'RUNTIME_WRAPPER'
     OR contract->>'sandbox' IS DISTINCT FROM 'allow-scripts'
     OR contract->>'network' IS DISTINCT FROM 'none' THEN
    RAISE EXCEPTION 'CF11_INTERACTIVE_CONTRACT_REGRESSION';
  END IF;

  BEGIN
    PERFORM public.cf11_assert_interactive_contract('mindMapHtml', '<script src="https://cdn.example/x.js"></script>');
    RAISE EXCEPTION 'CF11_EXPECTED_EXTERNAL_SCRIPT_REJECTION';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF11_HTML_EXTERNAL_URL%' AND SQLERRM NOT LIKE '%CF11_INTERACTIVE_EXTERNAL_SCRIPT%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.cf11_assert_interactive_contract('mindMapHtml', '<script>eval("1")</script>');
    RAISE EXCEPTION 'CF11_EXPECTED_DYNAMIC_EXECUTION_REJECTION';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%CF11_INTERACTIVE_DYNAMIC_EXECUTION%' THEN RAISE; END IF;
  END;
END;
$test$;