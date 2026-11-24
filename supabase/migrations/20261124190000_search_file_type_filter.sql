-- Add server-side file-type filtering without changing the existing v2 RPC contract.
CREATE OR REPLACE FUNCTION public.search_chunks_v3(
    query_text text,
    query_embedding vector,
    match_limit integer DEFAULT 10,
    filter_kind text DEFAULT NULL,
    filter_language text DEFAULT NULL,
    filter_symbol text DEFAULT NULL,
    search_mode text DEFAULT 'hybrid',
    rrf_k integer DEFAULT 60,
    filter_type text DEFAULT NULL
)
RETURNS TABLE(
    chunk_id text,
    document_id text,
    file_name text,
    storage_path text,
    file_type text,
    source_kind text,
    chunk_text text,
    page_number integer,
    line_start integer,
    line_end integer,
    symbol_name text,
    symbol_kind text,
    language text,
    identifiers text[],
    lexical_rank bigint,
    vector_rank bigint,
    rrf_score double precision
)
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    IF search_mode NOT IN ('hybrid', 'semantic', 'lexical') THEN
        RAISE EXCEPTION 'Unsupported search mode: %', search_mode
            USING ERRCODE = '22023';
    END IF;

    IF search_mode IN ('semantic', 'hybrid') AND query_embedding IS NULL THEN
        RAISE EXCEPTION 'A query embedding is required for % search', search_mode
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    WITH lexical_candidates AS (
        SELECT c.id,
               ROW_NUMBER() OVER (
                   ORDER BY ts_rank_cd(c.fts, websearch_to_tsquery('english', query_text)) DESC,
                            c.id ASC
               ) AS rank
        FROM public.document_chunks AS c
        JOIN public.documents AS d ON d.id = c.document_id
        WHERE search_mode IN ('hybrid', 'lexical')
          AND query_text IS NOT NULL
          AND length(trim(query_text)) > 0
          AND c.fts @@ websearch_to_tsquery('english', query_text)
          AND (filter_kind IS NULL OR c.source_kind = filter_kind)
          AND (filter_language IS NULL OR lower(c.language) = lower(filter_language))
          AND (filter_symbol IS NULL OR lower(c.symbol_kind) = lower(filter_symbol))
          AND (
              filter_type IS NULL
              OR (upper(filter_type) = 'JS' AND upper(d.file_type) IN ('JS', 'JSX'))
              OR upper(d.file_type) = upper(filter_type)
          )
        ORDER BY ts_rank_cd(c.fts, websearch_to_tsquery('english', query_text)) DESC,
                 c.id ASC
        LIMIT 60
    ),
    vector_candidates AS (
        SELECT c.id,
               ROW_NUMBER() OVER (
                   ORDER BY c.embedding <=> query_embedding ASC, c.id ASC
               ) AS rank
        FROM public.document_chunks AS c
        JOIN public.documents AS d ON d.id = c.document_id
        WHERE search_mode IN ('hybrid', 'semantic')
          AND c.embedding IS NOT NULL
          AND (filter_kind IS NULL OR c.source_kind = filter_kind)
          AND (filter_language IS NULL OR lower(c.language) = lower(filter_language))
          AND (filter_symbol IS NULL OR lower(c.symbol_kind) = lower(filter_symbol))
          AND (
              filter_type IS NULL
              OR (upper(filter_type) = 'JS' AND upper(d.file_type) IN ('JS', 'JSX'))
              OR upper(d.file_type) = upper(filter_type)
          )
        ORDER BY c.embedding <=> query_embedding ASC, c.id ASC
        LIMIT 60
    ),
    combined_ids AS (
        SELECT id FROM lexical_candidates
        UNION
        SELECT id FROM vector_candidates
    ),
    ranked_fusion AS (
        SELECT ids.id,
               lexical.rank AS lexical_rank,
               semantic.rank AS vector_rank,
               CASE
                   WHEN search_mode = 'lexical'
                       THEN COALESCE(1.0 / (rrf_k + lexical.rank), 0.0)
                   WHEN search_mode = 'semantic'
                       THEN COALESCE(1.0 / (rrf_k + semantic.rank), 0.0)
                   ELSE COALESCE(1.0 / (rrf_k + lexical.rank), 0.0)
                      + COALESCE(1.0 / (rrf_k + semantic.rank), 0.0)
               END AS rrf_score
        FROM combined_ids AS ids
        LEFT JOIN lexical_candidates AS lexical ON lexical.id = ids.id
        LEFT JOIN vector_candidates AS semantic ON semantic.id = ids.id
    )
    SELECT c.id::TEXT,
           c.document_id::TEXT,
           d.file_name,
           d.storage_path,
           d.file_type,
           c.source_kind,
           c.chunk_text,
           c.page_number,
           c.line_start,
           c.line_end,
           c.symbol_name,
           c.symbol_kind,
           c.language,
           c.identifiers,
           fused.lexical_rank,
           fused.vector_rank,
           fused.rrf_score::DOUBLE PRECISION
    FROM ranked_fusion AS fused
    JOIN public.document_chunks AS c ON c.id = fused.id
    JOIN public.documents AS d ON d.id = c.document_id
    ORDER BY fused.rrf_score DESC, c.id ASC
    LIMIT GREATEST(1, LEAST(COALESCE(match_limit, 10), 100));
END;
$function$;
