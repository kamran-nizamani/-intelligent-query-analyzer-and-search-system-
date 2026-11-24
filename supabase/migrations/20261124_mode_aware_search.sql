-- Search execution v2: honor the selected retrieval mode instead of always running hybrid.
-- SECURITY INVOKER is intentional: document_chunks RLS remains enforced for the caller.

CREATE OR REPLACE FUNCTION public.search_chunks_v2(
    query_text TEXT,
    query_embedding VECTOR(384),
    match_limit INTEGER DEFAULT 10,
    filter_kind TEXT DEFAULT NULL,
    filter_language TEXT DEFAULT NULL,
    filter_symbol TEXT DEFAULT NULL,
    search_mode TEXT DEFAULT 'hybrid',
    rrf_k INTEGER DEFAULT 60
)
RETURNS TABLE (
    chunk_id BIGINT,
    document_id UUID,
    file_name TEXT,
    storage_path TEXT,
    file_type TEXT,
    source_kind TEXT,
    chunk_text TEXT,
    page_number INTEGER,
    line_start INTEGER,
    line_end INTEGER,
    symbol_name TEXT,
    symbol_kind TEXT,
    language TEXT,
    identifiers TEXT[],
    lexical_rank BIGINT,
    vector_rank BIGINT,
    rrf_score DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
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
        WHERE search_mode IN ('hybrid', 'lexical')
          AND query_text IS NOT NULL
          AND length(trim(query_text)) > 0
          AND c.fts @@ websearch_to_tsquery('english', query_text)
          AND (filter_kind IS NULL OR c.source_kind = filter_kind)
          AND (filter_language IS NULL OR lower(c.language) = lower(filter_language))
          AND (filter_symbol IS NULL OR lower(c.symbol_kind) = lower(filter_symbol))
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
        WHERE search_mode IN ('hybrid', 'semantic')
          AND c.embedding IS NOT NULL
          AND (filter_kind IS NULL OR c.source_kind = filter_kind)
          AND (filter_language IS NULL OR lower(c.language) = lower(filter_language))
          AND (filter_symbol IS NULL OR lower(c.symbol_kind) = lower(filter_symbol))
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
    SELECT c.id,
           c.document_id,
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
           fused.rrf_score
    FROM ranked_fusion AS fused
    JOIN public.document_chunks AS c ON c.id = fused.id
    JOIN public.documents AS d ON d.id = c.document_id
    ORDER BY fused.rrf_score DESC, c.id ASC
    LIMIT GREATEST(1, LEAST(COALESCE(match_limit, 10), 100));
END;
$$;

COMMENT ON FUNCTION public.search_chunks_v2(TEXT, VECTOR, INTEGER, TEXT, TEXT, TEXT, TEXT, INTEGER)
IS 'Mode-aware lexical, semantic, and hybrid search using RRF; caller RLS is enforced.';
