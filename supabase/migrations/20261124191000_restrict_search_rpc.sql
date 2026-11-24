-- The browser uses a persisted anonymous Supabase session, which assumes the
-- authenticated Postgres role. Keep this invoker RPC unavailable to public/anon.
REVOKE ALL ON FUNCTION public.search_chunks_v3(text, vector, integer, text, text, text, text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_chunks_v3(text, vector, integer, text, text, text, text, integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_chunks_v3(text, vector, integer, text, text, text, text, integer, text) TO authenticated;
