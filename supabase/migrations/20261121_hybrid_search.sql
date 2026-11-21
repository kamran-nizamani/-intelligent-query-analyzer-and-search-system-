-- Migration: 20261121_hybrid_search.sql
-- Description: Sets up pure Supabase schema with pgvector, full-text search, RLS policies, and atomic hybrid search RRF function.

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. Documents Table (Metadata for indexed files)
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size BIGINT NOT NULL DEFAULT 0,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    content_kind TEXT NOT NULL DEFAULT 'document', -- 'document' | 'code'
    status TEXT NOT NULL DEFAULT 'uploaded',      -- 'uploaded' | 'indexed' | 'failed'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure columns exist if table was previously created with fewer columns
ALTER TABLE public.documents
    ADD COLUMN IF NOT EXISTS file_size BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS chunk_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS content_kind TEXT NOT NULL DEFAULT 'document',
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON public.documents(created_at DESC);

-- 3. Document Chunks Table (Text snippets, symbols, and 384-D dense embeddings)
CREATE TABLE IF NOT EXISTS public.document_chunks (
    id BIGSERIAL PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    chunk_text TEXT NOT NULL,
    source_kind TEXT NOT NULL DEFAULT 'document', -- 'document' | 'code'
    page_number INTEGER,
    line_start INTEGER,
    line_end INTEGER,
    symbol_name TEXT,
    symbol_kind TEXT,                           -- 'function' | 'class' | 'method' | 'module'
    language TEXT,                              -- 'python' | 'java' | 'javascript' | 'tsx' | etc.
    identifiers TEXT[] DEFAULT '{}',
    embedding VECTOR(384),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure columns exist if table previously created
ALTER TABLE public.document_chunks
    ADD COLUMN IF NOT EXISTS symbol_kind TEXT,
    ADD COLUMN IF NOT EXISTS language TEXT,
    ADD COLUMN IF NOT EXISTS identifiers TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Add generated full-text search (tsvector) column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'document_chunks' 
          AND column_name = 'fts'
    ) THEN
        ALTER TABLE public.document_chunks
            ADD COLUMN fts TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', chunk_text)) STORED;
    END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON public.document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_user_id ON public.document_chunks(user_id);
CREATE INDEX IF NOT EXISTS idx_chunks_fts ON public.document_chunks USING GIN(fts);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON public.document_chunks USING HNSW (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_chunks_language ON public.document_chunks(language) WHERE language IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chunks_symbol_kind ON public.document_chunks(symbol_kind) WHERE symbol_kind IS NOT NULL;

-- 4. Search Audit History Table
CREATE TABLE IF NOT EXISTS public.search_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    query_text TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'hybrid', -- 'hybrid' | 'semantic' | 'lexical'
    match_count INTEGER NOT NULL DEFAULT 0,
    latency_ms DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    filters JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_history_user_created ON public.search_history(user_id, created_at DESC);

-- 5. Row-Level Security (RLS) Policies
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;

-- Documents RLS Policies
DROP POLICY IF EXISTS "Users can view their own documents" ON public.documents;
CREATE POLICY "Users can view their own documents"
    ON public.documents FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own documents" ON public.documents;
CREATE POLICY "Users can insert their own documents"
    ON public.documents FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own documents" ON public.documents;
CREATE POLICY "Users can update their own documents"
    ON public.documents FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own documents" ON public.documents;
CREATE POLICY "Users can delete their own documents"
    ON public.documents FOR DELETE
    USING (auth.uid() = user_id);

-- Document Chunks RLS Policies
DROP POLICY IF EXISTS "Users can view their own document chunks" ON public.document_chunks;
CREATE POLICY "Users can view their own document chunks"
    ON public.document_chunks FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own document chunks" ON public.document_chunks;
CREATE POLICY "Users can insert their own document chunks"
    ON public.document_chunks FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own document chunks" ON public.document_chunks;
CREATE POLICY "Users can delete their own document chunks"
    ON public.document_chunks FOR DELETE
    USING (auth.uid() = user_id);

-- Search History RLS Policies
DROP POLICY IF EXISTS "Users can view their own search history" ON public.search_history;
CREATE POLICY "Users can view their own search history"
    ON public.search_history FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own search history" ON public.search_history;
CREATE POLICY "Users can insert their own search history"
    ON public.search_history FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own search history" ON public.search_history;
CREATE POLICY "Users can delete their own search history"
    ON public.search_history FOR DELETE
    USING (auth.uid() = user_id);

-- Storage bucket 'documents' security policies
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload their own files to documents bucket" ON storage.objects;
CREATE POLICY "Users can upload their own files to documents bucket"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'documents' 
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

DROP POLICY IF EXISTS "Users can read their own files in documents bucket" ON storage.objects;
CREATE POLICY "Users can read their own files in documents bucket"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'documents' 
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

DROP POLICY IF EXISTS "Users can delete their own files in documents bucket" ON storage.objects;
CREATE POLICY "Users can delete their own files in documents bucket"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'documents' 
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- 6. Atomic Hybrid Search with Reciprocal Rank Fusion (RRF k=60)
CREATE OR REPLACE FUNCTION public.hybrid_search_rrf(
    query_text TEXT,
    query_embedding VECTOR(384),
    match_limit INTEGER DEFAULT 10,
    filter_kind TEXT DEFAULT NULL,
    filter_language TEXT DEFAULT NULL,
    filter_symbol TEXT DEFAULT NULL,
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
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
WITH 
-- 1. Full-Text Search Candidates (BM25-style ranking via ts_rank_cd)
lexical_candidates AS (
    SELECT
        c.id,
        ROW_NUMBER() OVER (
            ORDER BY ts_rank_cd(c.fts, websearch_to_tsquery('english', query_text)) DESC
        ) AS rank
    FROM public.document_chunks c
    WHERE
        query_text IS NOT NULL 
        AND length(trim(query_text)) > 0
        AND c.fts @@ websearch_to_tsquery('english', query_text)
        AND (filter_kind IS NULL OR c.source_kind = filter_kind)
        AND (filter_language IS NULL OR c.language = lower(filter_language))
        AND (filter_symbol IS NULL OR c.symbol_kind = lower(filter_symbol))
    LIMIT 60
),

-- 2. Dense Vector Semantic Candidates (Cosine distance)
vector_candidates AS (
    SELECT
        c.id,
        ROW_NUMBER() OVER (
            ORDER BY c.embedding <=> query_embedding ASC
        ) AS rank
    FROM public.document_chunks c
    WHERE
        query_embedding IS NOT NULL
        AND c.embedding IS NOT NULL
        AND (filter_kind IS NULL OR c.source_kind = filter_kind)
        AND (filter_language IS NULL OR c.language = lower(filter_language))
        AND (filter_symbol IS NULL OR c.symbol_kind = lower(filter_symbol))
    LIMIT 60
),

-- 3. Reciprocal Rank Fusion of distinct candidates
combined_ids AS (
    SELECT id FROM lexical_candidates
    UNION
    SELECT id FROM vector_candidates
),

ranked_fusion AS (
    SELECT
        u.id,
        l.rank AS lexical_rank,
        v.rank AS vector_rank,
        COALESCE(1.0 / (rrf_k + l.rank), 0.0) + COALESCE(1.0 / (rrf_k + v.rank), 0.0) AS rrf_score
    FROM combined_ids u
    LEFT JOIN lexical_candidates l ON u.id = l.id
    LEFT JOIN vector_candidates v ON u.id = v.id
)

-- 4. Final join with document metadata
SELECT
    c.id AS chunk_id,
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
    rf.lexical_rank,
    rf.vector_rank,
    rf.rrf_score
FROM ranked_fusion rf
JOIN public.document_chunks c ON rf.id = c.id
JOIN public.documents d ON c.document_id = d.id
ORDER BY rf.rrf_score DESC
LIMIT match_limit;
$$;
