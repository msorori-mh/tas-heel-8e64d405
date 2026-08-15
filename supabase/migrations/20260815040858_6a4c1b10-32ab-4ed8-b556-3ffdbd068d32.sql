REVOKE ALL ON FUNCTION public._up_sessions(uuid, uuid, uuid, text, timestamptz, timestamptz) FROM authenticated;
REVOKE ALL ON FUNCTION public._up_occurrences(uuid, uuid, uuid, text, timestamptz, timestamptz) FROM authenticated;
REVOKE ALL ON FUNCTION public._up_progress(uuid) FROM authenticated;