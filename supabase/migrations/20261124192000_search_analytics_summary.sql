-- Aggregate search analytics in Postgres so the browser never downloads the
-- complete search-history table just to calculate totals and averages.
CREATE OR REPLACE FUNCTION public.get_search_analytics()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
    SELECT jsonb_build_object(
        'total_searches', count(*)::bigint,
        'avg_latency_ms', COALESCE(round(avg(latency_ms)::numeric, 1), 0),
        'mode_breakdown', COALESCE(
            (
                SELECT jsonb_object_agg(mode_name, mode_count)
                FROM (
                    SELECT COALESCE(mode, 'hybrid') AS mode_name, count(*)::bigint AS mode_count
                    FROM public.search_history
                    GROUP BY COALESCE(mode, 'hybrid')
                ) AS mode_counts
            ),
            '{}'::jsonb
        )
    )
    FROM public.search_history;
$function$;

REVOKE ALL ON FUNCTION public.get_search_analytics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_search_analytics() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_search_analytics() TO authenticated;
