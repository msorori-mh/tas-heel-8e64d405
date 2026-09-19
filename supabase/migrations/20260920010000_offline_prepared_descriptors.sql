-- Additive cache only. Source bodies, timestamps, publishing and RLS are unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public._offline_text_descriptor_v1(_body text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog AS $fn$
DECLARE
  body text := coalesce(_body, '');
  normalized text;
  leak boolean;
BEGIN
  -- ECMAScript whitespace, including NBSP and BOM. Hash the original UTF-8 bytes.
  normalized := regexp_replace(body, U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]', ' ', 'g');
  leak := normalized ~* $re$(data-answer|data-correct|correct-answer|data-rationale) *=|(?:data|aria)-(?:answer-key|correct-answer|model-answer|rationale) *=$re$
    OR normalized ~* $re$class=["'](?:[^"']*[^A-Za-z0-9_])?(?:answer-key|solution-text|teacher-note|explanation-hidden|model-answer)(?:[^A-Za-z0-9_][^"']*)?["']$re$
    OR normalized ~* $re$id=["'](?:[^"']*[^A-Za-z0-9_])?(?:answer-key|solution-text|teacher-note|model-answer)(?:[^A-Za-z0-9_][^"']*)?["']$re$
    OR normalized ~* $re$(?:class|id)=["'][^"']*(?:answer_key|correct-answer|correct_answer|solution_steps|hidden-explanation)[^"']*["']$re$;
  RETURN jsonb_build_object(
    'version', 1,
    'byteSize', octet_length(body),
    'sha256', encode(sha256(convert_to(body, 'UTF8')), 'hex'),
    'empty', btrim(normalized) = '',
    'answerLeak', leak,
    'remote', normalized ~* $re$(?:src|href) *= *["'](?:https?:)?//|url\( *["']?(?:https?:)?//|(?:^|[^A-Za-z0-9_])fetch *\( *["']https?://$re$
  );
END;
$fn$;
REVOKE ALL ON FUNCTION public._offline_text_descriptor_v1(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._offline_text_descriptor_v1(text) TO service_role;

CREATE TABLE public.offline_prepared_descriptors (
  source_table text NOT NULL CHECK (source_table IN ('lesson_book_contents','lesson_explanations','lesson_summaries','lesson_resources','lesson_capability_lifecycle')),
  source_id uuid NOT NULL,
  lesson_id uuid NOT NULL,
  descriptor jsonb NOT NULL,
  PRIMARY KEY (source_table, source_id)
);
ALTER TABLE public.offline_prepared_descriptors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.offline_prepared_descriptors FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.offline_prepared_descriptors TO authenticated;
GRANT ALL ON public.offline_prepared_descriptors TO service_role;
-- Always consult the original source RLS. A descriptor grants no new access.
CREATE POLICY offline_descriptor_source_read ON public.offline_prepared_descriptors
FOR SELECT TO authenticated USING (
  CASE source_table
    WHEN 'lesson_book_contents' THEN EXISTS (SELECT 1 FROM public.lesson_book_contents s WHERE s.id=source_id AND s.lesson_id=offline_prepared_descriptors.lesson_id)
    WHEN 'lesson_explanations' THEN EXISTS (SELECT 1 FROM public.lesson_explanations s WHERE s.id=source_id AND s.lesson_id=offline_prepared_descriptors.lesson_id)
    WHEN 'lesson_summaries' THEN EXISTS (SELECT 1 FROM public.lesson_summaries s WHERE s.id=source_id AND s.lesson_id=offline_prepared_descriptors.lesson_id)
    WHEN 'lesson_resources' THEN EXISTS (SELECT 1 FROM public.lesson_resources s WHERE s.id=source_id AND s.lesson_id=offline_prepared_descriptors.lesson_id)
    WHEN 'lesson_capability_lifecycle' THEN EXISTS (SELECT 1 FROM public.lesson_capability_lifecycle s JOIN public.lessons l ON l.id=s.lesson_id WHERE s.id=source_id AND s.lesson_id=offline_prepared_descriptors.lesson_id)
    ELSE false
  END
);

-- Conservative domain of the JS verifier: safe integer numbers and protocol keys.
CREATE FUNCTION public._offline_snapshot_canonical_safe_v1(_value jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
BEGIN
  CASE jsonb_typeof(_value)
    WHEN 'number' THEN RETURN (_value::text ~ '^-?(0|[1-9][0-9]*)$') AND abs((_value::text)::numeric)<=9007199254740991;
    WHEN 'array' THEN RETURN NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_value) e WHERE NOT public._offline_snapshot_canonical_safe_v1(e));
    WHEN 'object' THEN RETURN NOT EXISTS (SELECT 1 FROM jsonb_each(_value) e WHERE octet_length(e.key)<>length(e.key) OR NOT public._offline_snapshot_canonical_safe_v1(e.value));
    ELSE RETURN true;
  END CASE;
END;
$fn$;
REVOKE ALL ON FUNCTION public._offline_snapshot_canonical_safe_v1(jsonb) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public._offline_snapshot_descriptor_v1(_lesson uuid, _capability text, _hash text, _snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $fn$
DECLARE
  field text;
  hashes jsonb := '[]';
  valid boolean := false;
BEGIN
  field := CASE _capability WHEN 'officialBookContent' THEN 'content' WHEN 'tamkeenExplanation' THEN 'content' WHEN 'quickReview' THEN 'summary' END;
  IF field IS NOT NULL AND _snapshot->>'snapshotVersion'='v3.snapshot.1'
     AND _snapshot->>'lessonId'=_lesson::text AND _snapshot->>'capability'=_capability
     AND jsonb_typeof(_snapshot->'payload')='array' AND public._offline_snapshot_canonical_safe_v1(_snapshot) THEN
    valid := encode(sha256(convert_to(public._v3_canonical_json_v1(_snapshot),'UTF8')),'hex')=_hash;
    IF valid THEN
      SELECT coalesce(jsonb_agg(encode(sha256(convert_to(item->>field,'UTF8')),'hex')), '[]'::jsonb)
      INTO hashes FROM jsonb_array_elements(_snapshot->'payload') item WHERE jsonb_typeof(item->field)='string';
    END IF;
  END IF;
  RETURN jsonb_build_object('snapshotVersion','offline.snapshot.descriptor.1','lessonId',_lesson,'capability',_capability,'snapshotHash',_hash,'verified',coalesce(valid,false),'bodyHashes',hashes);
END;
$fn$;
REVOKE ALL ON FUNCTION public._offline_snapshot_descriptor_v1(uuid,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._offline_snapshot_descriptor_v1(uuid,text,text,jsonb) TO service_role;

CREATE FUNCTION public._offline_refresh_descriptor_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE value jsonb;
BEGIN
  IF TG_OP='DELETE' THEN
    DELETE FROM public.offline_prepared_descriptors WHERE source_table=TG_TABLE_NAME AND source_id=OLD.id;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' AND OLD.id IS DISTINCT FROM NEW.id THEN
    DELETE FROM public.offline_prepared_descriptors WHERE source_table=TG_TABLE_NAME AND source_id=OLD.id;
  END IF;
  IF TG_TABLE_NAME='lesson_capability_lifecycle' THEN
    value := public._offline_snapshot_descriptor_v1(NEW.lesson_id,NEW.capability,NEW.ready_hash,NEW.ready_snapshot);
  ELSIF TG_TABLE_NAME='lesson_summaries' THEN
    value := public._offline_text_descriptor_v1(NEW.summary);
  ELSIF TG_TABLE_NAME='lesson_resources' THEN
    value := public._offline_text_descriptor_v1(NEW.description);
  ELSE
    value := public._offline_text_descriptor_v1(NEW.content);
  END IF;
  INSERT INTO public.offline_prepared_descriptors(source_table,source_id,lesson_id,descriptor)
  VALUES (TG_TABLE_NAME,NEW.id,NEW.lesson_id,value)
  ON CONFLICT (source_table,source_id) DO UPDATE SET lesson_id=EXCLUDED.lesson_id,descriptor=EXCLUDED.descriptor;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public._offline_refresh_descriptor_v1() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER offline_descriptor_books AFTER INSERT OR UPDATE OF content,lesson_id,id OR DELETE ON public.lesson_book_contents FOR EACH ROW EXECUTE FUNCTION public._offline_refresh_descriptor_v1();
CREATE TRIGGER offline_descriptor_explanations AFTER INSERT OR UPDATE OF content,lesson_id,id OR DELETE ON public.lesson_explanations FOR EACH ROW EXECUTE FUNCTION public._offline_refresh_descriptor_v1();
CREATE TRIGGER offline_descriptor_summaries AFTER INSERT OR UPDATE OF summary,lesson_id,id OR DELETE ON public.lesson_summaries FOR EACH ROW EXECUTE FUNCTION public._offline_refresh_descriptor_v1();
CREATE TRIGGER offline_descriptor_resources AFTER INSERT OR UPDATE OF description,lesson_id,id OR DELETE ON public.lesson_resources FOR EACH ROW EXECUTE FUNCTION public._offline_refresh_descriptor_v1();
CREATE TRIGGER offline_descriptor_lifecycle AFTER INSERT OR UPDATE OF ready_snapshot,ready_hash,capability,lesson_id,id OR DELETE ON public.lesson_capability_lifecycle FOR EACH ROW EXECUTE FUNCTION public._offline_refresh_descriptor_v1();

-- Explicit bounded backfill. It never UPDATEs a content row or invokes publication.
-- Row locks serialize with writers so an old snapshot cannot overwrite a new descriptor.
CREATE FUNCTION public.offline_backfill_descriptors_v1(_source text, _limit integer DEFAULT 8)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE r record; value jsonb; count_rows integer := 0; inserted_rows integer; body_column text;
BEGIN
  IF _source IS NULL OR _limit IS NULL OR _source NOT IN ('lesson_book_contents','lesson_explanations','lesson_summaries','lesson_resources','lesson_capability_lifecycle') OR _limit NOT BETWEEN 1 AND 16 THEN
    RAISE EXCEPTION 'OFFLINE_BACKFILL_INVALID' USING ERRCODE='22023';
  END IF;
  body_column := CASE _source WHEN 'lesson_summaries' THEN 'summary' WHEN 'lesson_resources' THEN 'description' ELSE 'content' END;
  IF _source='lesson_capability_lifecycle' THEN
    FOR r IN SELECT s.id,s.lesson_id,s.capability,s.ready_hash,s.ready_snapshot FROM public.lesson_capability_lifecycle s
      WHERE NOT EXISTS (SELECT 1 FROM public.offline_prepared_descriptors d WHERE d.source_table=_source AND d.source_id=s.id)
      ORDER BY s.id LIMIT _limit FOR UPDATE OF s SKIP LOCKED
    LOOP
      value := public._offline_snapshot_descriptor_v1(r.lesson_id,r.capability,r.ready_hash,r.ready_snapshot);
      INSERT INTO public.offline_prepared_descriptors VALUES (_source,r.id,r.lesson_id,value) ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS inserted_rows = ROW_COUNT;
      count_rows := count_rows+inserted_rows;
    END LOOP;
  ELSE
    FOR r IN EXECUTE format('SELECT s.id,s.lesson_id,s.%I AS body FROM public.%I s WHERE NOT EXISTS (SELECT 1 FROM public.offline_prepared_descriptors d WHERE d.source_table=$1 AND d.source_id=s.id) ORDER BY s.id LIMIT $2 FOR UPDATE OF s SKIP LOCKED',body_column,_source) USING _source,_limit
    LOOP
      value := public._offline_text_descriptor_v1(r.body);
      INSERT INTO public.offline_prepared_descriptors VALUES (_source,r.id,r.lesson_id,value) ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS inserted_rows = ROW_COUNT;
      count_rows := count_rows+inserted_rows;
    END LOOP;
  END IF;
  RETURN count_rows;
END;
$fn$;
REVOKE ALL ON FUNCTION public.offline_backfill_descriptors_v1(text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.offline_backfill_descriptors_v1(text,integer) TO service_role;

-- A single RLS-preserving read contains no source body or publication snapshot.
CREATE FUNCTION public.offline_manifest_sources_v1(_lesson_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE result jsonb;
BEGIN
  IF coalesce(cardinality(_lesson_ids),0)>64 THEN RAISE EXCEPTION 'OFFLINE_SOURCE_BATCH_TOO_LARGE' USING ERRCODE='22023'; END IF;
  WITH allowed AS MATERIALIZED (SELECT id FROM public.lessons WHERE id=ANY(_lesson_ids)),
  books AS (SELECT b.id,b.lesson_id,b.updated_at,d.descriptor AS offline_metadata_v1 FROM public.lesson_book_contents b JOIN allowed a ON a.id=b.lesson_id LEFT JOIN public.offline_prepared_descriptors d ON d.source_table='lesson_book_contents' AND d.source_id=b.id),
  explanations AS (SELECT b.id,b.lesson_id,b.title,b.sort_order,b.updated_at,d.descriptor AS offline_metadata_v1 FROM public.lesson_explanations b JOIN allowed a ON a.id=b.lesson_id LEFT JOIN public.offline_prepared_descriptors d ON d.source_table='lesson_explanations' AND d.source_id=b.id),
  summaries AS (SELECT b.id,b.lesson_id,b.updated_at,d.descriptor AS offline_metadata_v1 FROM public.lesson_summaries b JOIN allowed a ON a.id=b.lesson_id LEFT JOIN public.offline_prepared_descriptors d ON d.source_table='lesson_summaries' AND d.source_id=b.id),
  resources AS (SELECT b.id,b.lesson_id,b.title,b.url,b.resource_type,b.html_resource_type,b.metadata,b.sort_order,b.created_at,d.descriptor AS offline_metadata_v1 FROM public.lesson_resources b JOIN allowed a ON a.id=b.lesson_id LEFT JOIN public.offline_prepared_descriptors d ON d.source_table='lesson_resources' AND d.source_id=b.id WHERE b.resource_type IN ('mindmap','experiment')),
  ready AS (SELECT b.lesson_id,b.capability,b.ready_hash,b.ready_at,d.descriptor AS ready_descriptor FROM public.lesson_capability_lifecycle b JOIN allowed a ON a.id=b.lesson_id LEFT JOIN public.offline_prepared_descriptors d ON d.source_table='lesson_capability_lifecycle' AND d.source_id=b.id WHERE b.status='READY'),
  gates AS (SELECT g.* FROM allowed a CROSS JOIN LATERAL public.lesson_student_content_gate(a.id) g)
  SELECT jsonb_build_object('version',1,
    'pending',EXISTS(SELECT 1 FROM books WHERE offline_metadata_v1 IS NULL) OR EXISTS(SELECT 1 FROM explanations WHERE offline_metadata_v1 IS NULL) OR EXISTS(SELECT 1 FROM summaries WHERE offline_metadata_v1 IS NULL) OR EXISTS(SELECT 1 FROM resources WHERE offline_metadata_v1 IS NULL) OR EXISTS(SELECT 1 FROM ready WHERE ready_descriptor IS NULL),
    'gates',coalesce((SELECT jsonb_agg(gates) FROM gates),'[]'),
    'ready',coalesce((SELECT jsonb_agg(ready) FROM ready),'[]'),
    'books',coalesce((SELECT jsonb_agg(books) FROM books),'[]'),
    'explanations',coalesce((SELECT jsonb_agg(explanations) FROM explanations),'[]'),
    'summaries',coalesce((SELECT jsonb_agg(summaries) FROM summaries),'[]'),
    'resources',coalesce((SELECT jsonb_agg(resources) FROM resources),'[]')) INTO result;
  RETURN result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.offline_manifest_sources_v1(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.offline_manifest_sources_v1(uuid[]) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
