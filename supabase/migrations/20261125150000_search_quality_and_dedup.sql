-- Search quality, chunk-content hashes, and a versioned relevance-aware RPC.
-- Existing search_chunks_v3 and hybrid_search_rrf contracts remain untouched.
-- The 0.55 cosine-distance cutoff (similarity >= 0.45) is a conservative starting
-- point; it must be calibrated against labelled project queries before being tuned.

ALTER TABLE public.document_chunks
    ADD COLUMN IF NOT EXISTS content_hash text;

CREATE OR REPLACE FUNCTION public.set_document_chunk_content_hash()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $trigger$
BEGIN
    NEW.content_hash := md5(regexp_replace(lower(trim(NEW.chunk_text)), '\s+', ' ', 'g'));
    RETURN NEW;
END;
$trigger$;

UPDATE public.document_chunks
SET content_hash = md5(regexp_replace(lower(trim(chunk_text)), '\s+', ' ', 'g'))
WHERE content_hash IS NULL;

DROP TRIGGER IF EXISTS trg_document_chunks_content_hash ON public.document_chunks;
CREATE TRIGGER trg_document_chunks_content_hash
BEFORE INSERT OR UPDATE OF chunk_text ON public.document_chunks
FOR EACH ROW
EXECUTE FUNCTION public.set_document_chunk_content_hash();

CREATE INDEX IF NOT EXISTS idx_chunks_content_hash
    ON public.document_chunks(content_hash);
CREATE INDEX IF NOT EXISTS idx_chunks_source_kind
    ON public.document_chunks(source_kind);
CREATE INDEX IF NOT EXISTS idx_chunks_user_kind_lang_sym
    ON public.document_chunks(user_id, source_kind, language, symbol_kind);
CREATE INDEX IF NOT EXISTS idx_documents_file_type
    ON public.documents(file_type);

-- Relevance-aware retrieval. Keep v3 unchanged for safe rollout and rollback.
-- Cosine distance is measured on the same normalized 384-D MiniLM embeddings
-- used by the browser. A candidate must pass the distance gate before it can
-- enter the semantic rank list; RRF scores remain rank-fusion scores, not probabilities.
CREATE OR REPLACE FUNCTION public.search_chunks_v4(
    query_text text,
    query_embedding extensions.vector(384),
    match_limit integer DEFAULT 10,
    filter_kind text DEFAULT NULL,
    filter_language text DEFAULT NULL,
    filter_symbol text DEFAULT NULL,
    search_mode text DEFAULT 'hybrid',
    rrf_k integer DEFAULT 60,
    filter_type text DEFAULT NULL,
    max_cosine_distance double precision DEFAULT 0.55,
    max_per_document integer DEFAULT 3,
    lexical_weight double precision DEFAULT 1.2,
    semantic_weight double precision DEFAULT 1.0
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
    rrf_score double precision,
    vector_similarity double precision
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
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

    IF max_cosine_distance IS NULL OR max_cosine_distance < 0 OR max_cosine_distance > 2 THEN
        RAISE EXCEPTION 'max_cosine_distance must be between 0 and 2'
            USING ERRCODE = '22023';
    END IF;

    IF lexical_weight IS NULL OR lexical_weight < 0
       OR semantic_weight IS NULL OR semantic_weight < 0 THEN
        RAISE EXCEPTION 'RRF weights must be non-negative'
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
          AND d.status = 'indexed'
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
               ) AS rank,
               (1.0 - (c.embedding <=> query_embedding))::double precision AS similarity
        FROM public.document_chunks AS c
        JOIN public.documents AS d ON d.id = c.document_id
        WHERE search_mode IN ('semantic', 'hybrid')
          AND d.status = 'indexed'
          AND c.embedding IS NOT NULL
          AND (c.embedding <=> query_embedding) <= max_cosine_distance
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
               semantic.similarity AS vector_similarity,
               CASE
                   WHEN search_mode = 'lexical'
                       THEN COALESCE(lexical_weight / (rrf_k + lexical.rank), 0.0)
                   WHEN search_mode = 'semantic'
                       THEN COALESCE(semantic_weight / (rrf_k + semantic.rank), 0.0)
                   ELSE COALESCE(lexical_weight / (rrf_k + lexical.rank), 0.0)
                      + COALESCE(semantic_weight / (rrf_k + semantic.rank), 0.0)
               END AS rrf_score
        FROM combined_ids AS ids
        LEFT JOIN lexical_candidates AS lexical ON lexical.id = ids.id
        LEFT JOIN vector_candidates AS semantic ON semantic.id = ids.id
    ),
    candidate_rows AS (
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
               fused.rrf_score,
               fused.vector_similarity,
               c.content_hash
        FROM ranked_fusion AS fused
        JOIN public.document_chunks AS c ON c.id = fused.id
        JOIN public.documents AS d ON d.id = c.document_id
    ),
    deduplicated AS (
        SELECT candidate_rows.*,
               ROW_NUMBER() OVER (
                   PARTITION BY content_hash
                   ORDER BY rrf_score DESC, id ASC
               ) AS duplicate_rank
        FROM candidate_rows
    ),
    diversified AS (
        SELECT deduplicated.*,
               ROW_NUMBER() OVER (
                   PARTITION BY document_id
                   ORDER BY rrf_score DESC, id ASC
               ) AS document_rank
        FROM deduplicated
        WHERE duplicate_rank = 1
    )
    SELECT id::text,
           document_id::text,
           file_name,
           storage_path,
           file_type,
           source_kind,
           chunk_text,
           page_number,
           line_start,
           line_end,
           symbol_name,
           symbol_kind,
           language,
           identifiers,
           lexical_rank,
           vector_rank,
           rrf_score::double precision,
           vector_similarity
    FROM diversified
    WHERE document_rank <= GREATEST(1, LEAST(COALESCE(max_per_document, 3), 20))
    ORDER BY rrf_score DESC, id ASC
    LIMIT GREATEST(1, LEAST(COALESCE(match_limit, 10), 100));
END;
$function$;

REVOKE ALL ON FUNCTION public.search_chunks_v4(
    text, extensions.vector, integer, text, text, text, text, integer, text, double precision, integer, double precision, double precision
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_chunks_v4(
    text, extensions.vector, integer, text, text, text, text, integer, text, double precision, integer, double precision, double precision
) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_chunks_v4(
    text, extensions.vector, integer, text, text, text, text, integer, text, double precision, integer, double precision, double precision
) TO authenticated;

COMMENT ON FUNCTION public.search_chunks_v4(
    text, extensions.vector, integer, text, text, text, text, integer, text, double precision, integer, double precision, double precision
) IS 'Relevance-gated lexical, semantic, and hybrid retrieval with exact chunk deduplication and per-document diversity; respects caller RLS.';
