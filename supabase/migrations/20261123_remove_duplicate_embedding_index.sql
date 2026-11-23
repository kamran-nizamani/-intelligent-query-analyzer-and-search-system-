-- Keep the original HNSW vector index and remove the duplicate created during schema alignment.
drop index if exists public.document_chunks_embedding_hnsw_idx;
