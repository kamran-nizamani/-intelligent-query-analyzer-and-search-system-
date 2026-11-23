-- Align the existing prototype schema with the Supabase-native browser client.
-- Existing tables were empty when this migration was applied.

create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='name')
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='file_name') then
    alter table public.documents rename column name to file_name;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='document_chunks' and column_name='content')
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='document_chunks' and column_name='chunk_text') then
    alter table public.document_chunks rename column content to chunk_text;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='document_chunks' and column_name='start_line')
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='document_chunks' and column_name='line_start') then
    alter table public.document_chunks rename column start_line to line_start;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='document_chunks' and column_name='end_line')
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='document_chunks' and column_name='line_end') then
    alter table public.document_chunks rename column end_line to line_end;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='search_history' and column_name='query')
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='search_history' and column_name='query_text') then
    alter table public.search_history rename column query to query_text;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='search_history' and column_name='results_count')
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='search_history' and column_name='match_count') then
    alter table public.search_history rename column results_count to match_count;
  end if;
end $$;

alter table public.documents
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists file_name text,
  add column if not exists updated_at timestamptz not null default now();
update public.documents set file_name = coalesce(file_name, 'untitled') where file_name is null;
alter table public.documents alter column file_name set not null;
do $
begin
  if (select data_type from information_schema.columns where table_schema='public' and table_name='documents' and column_name='id') = 'text' then
    alter table public.documents alter column id set default gen_random_uuid()::text;
  elsif (select data_type from information_schema.columns where table_schema='public' and table_name='documents' and column_name='id') = 'uuid' then
    alter table public.documents alter column id set default gen_random_uuid();
  end if;
end $;

alter table public.document_chunks
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists chunk_text text,
  add column if not exists source_kind text not null default 'document',
  add column if not exists symbol_kind text,
  add column if not exists identifiers text[] not null default '{}',
  add column if not exists line_start integer,
  add column if not exists line_end integer,
  add column if not exists chunk_index integer not null default 0,
  add column if not exists file_path text;
update public.document_chunks set chunk_text = '' where chunk_text is null;
alter table public.document_chunks alter column chunk_text set not null;
alter table public.document_chunks alter column source_kind set default 'document';
do $
begin
  if (select data_type from information_schema.columns where table_schema='public' and table_name='document_chunks' and column_name='id') = 'text' then
    alter table public.document_chunks alter column id set default gen_random_uuid()::text;
  elsif (select data_type from information_schema.columns where table_schema='public' and table_name='document_chunks' and column_name='id') = 'uuid' then
    alter table public.document_chunks alter column id set default gen_random_uuid();
  end if;
end $;

alter table public.search_history
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists query_text text,
  add column if not exists match_count integer not null default 0,
  add column if not exists filters jsonb not null default '{}'::jsonb;
update public.search_history set query_text = coalesce(query_text, '') where query_text is null;
alter table public.search_history alter column query_text set not null;
do $
begin
  if (select data_type from information_schema.columns where table_schema='public' and table_name='search_history' and column_name='id') = 'text' then
    alter table public.search_history alter column id set default gen_random_uuid()::text;
  elsif (select data_type from information_schema.columns where table_schema='public' and table_name='search_history' and column_name='id') = 'uuid' then
    alter table public.search_history alter column id set default gen_random_uuid();
  end if;
end $;

alter table public.documents alter column user_id set not null;
alter table public.document_chunks alter column user_id set not null;
alter table public.search_history alter column user_id set not null;

create index if not exists documents_user_created_idx on public.documents(user_id, created_at desc);
create index if not exists chunks_user_document_idx on public.document_chunks(user_id, document_id);
create index if not exists search_history_user_created_idx on public.search_history(user_id, created_at desc);

-- Reuse any existing full-text/vector index from the earlier schema instead of duplicating it.
do $
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and tablename='document_chunks'
      and indexdef ilike '%using gin%' and (indexdef ilike '%fts%' or indexdef ilike '%to_tsvector%')
  ) then
    create index chunks_fts_idx on public.document_chunks using gin (to_tsvector('english', chunk_text));
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and tablename='document_chunks'
      and indexdef ilike '%using hnsw%' and indexdef ilike '%embedding%'
  ) then
    create index chunks_embedding_hnsw_idx on public.document_chunks using hnsw (embedding vector_cosine_ops);
  end if;
end $;

alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.search_history enable row level security;

drop policy if exists "iqa_documents_select_own" on public.documents;
drop policy if exists "iqa_documents_insert_own" on public.documents;
drop policy if exists "iqa_documents_update_own" on public.documents;
drop policy if exists "iqa_documents_delete_own" on public.documents;
create policy "iqa_documents_select_own" on public.documents for select to authenticated using ((select auth.uid()) = user_id);
create policy "iqa_documents_insert_own" on public.documents for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "iqa_documents_update_own" on public.documents for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "iqa_documents_delete_own" on public.documents for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "iqa_chunks_select_own" on public.document_chunks;
drop policy if exists "iqa_chunks_insert_own" on public.document_chunks;
drop policy if exists "iqa_chunks_delete_own" on public.document_chunks;
create policy "iqa_chunks_select_own" on public.document_chunks for select to authenticated using ((select auth.uid()) = user_id);
create policy "iqa_chunks_insert_own" on public.document_chunks for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "iqa_chunks_delete_own" on public.document_chunks for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "iqa_history_select_own" on public.search_history;
drop policy if exists "iqa_history_insert_own" on public.search_history;
drop policy if exists "iqa_history_delete_own" on public.search_history;
create policy "iqa_history_select_own" on public.search_history for select to authenticated using ((select auth.uid()) = user_id);
create policy "iqa_history_insert_own" on public.search_history for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "iqa_history_delete_own" on public.search_history for delete to authenticated using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
on conflict (id) do update set public = false;
drop policy if exists "iqa_storage_select_own" on storage.objects;
drop policy if exists "iqa_storage_insert_own" on storage.objects;
drop policy if exists "iqa_storage_update_own" on storage.objects;
drop policy if exists "iqa_storage_delete_own" on storage.objects;
create policy "iqa_storage_select_own" on storage.objects for select to authenticated
using (bucket_id = 'documents' and (select auth.uid())::text = (storage.foldername(name))[1]);
create policy "iqa_storage_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'documents' and (select auth.uid())::text = (storage.foldername(name))[1]);
create policy "iqa_storage_update_own" on storage.objects for update to authenticated
using (bucket_id = 'documents' and (select auth.uid())::text = (storage.foldername(name))[1])
with check (bucket_id = 'documents' and (select auth.uid())::text = (storage.foldername(name))[1]);
create policy "iqa_storage_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'documents' and (select auth.uid())::text = (storage.foldername(name))[1]);

create or replace function public.hybrid_search_rrf(
  query_text text,
  query_embedding extensions.vector(384),
  match_limit integer default 10,
  filter_kind text default null,
  filter_language text default null,
  filter_symbol text default null,
  rrf_k integer default 60,
  search_mode text default 'hybrid'
)
returns table (
  chunk_id text, document_id text, file_name text, storage_path text, file_type text,
  source_kind text, chunk_text text, page_number integer, line_start integer, line_end integer,
  symbol_name text, symbol_kind text, language text, identifiers text[],
  lexical_rank bigint, vector_rank bigint, rrf_score double precision
)
language sql stable security invoker
set search_path = public, extensions
as $function$
with lexical_candidates as (
  select c.id, row_number() over (
    order by ts_rank_cd(to_tsvector('english', c.chunk_text), websearch_to_tsquery('english', query_text)) desc
  ) as rank
  from public.document_chunks c
  where search_mode <> 'semantic'
    and nullif(trim(query_text), '') is not null
    and to_tsvector('english', c.chunk_text) @@ websearch_to_tsquery('english', query_text)
    and (filter_kind is null or c.source_kind = filter_kind)
    and (filter_language is null or lower(c.language) = lower(filter_language))
    and (filter_symbol is null or lower(c.symbol_kind) = lower(filter_symbol))
  order by rank limit 60
),
vector_candidates as (
  select c.id, row_number() over (order by c.embedding <=> query_embedding) as rank
  from public.document_chunks c
  where search_mode <> 'lexical' and query_embedding is not null and c.embedding is not null
    and (filter_kind is null or c.source_kind = filter_kind)
    and (filter_language is null or lower(c.language) = lower(filter_language))
    and (filter_symbol is null or lower(c.symbol_kind) = lower(filter_symbol))
  order by c.embedding <=> query_embedding limit 60
),
candidate_ids as (
  select id from lexical_candidates union select id from vector_candidates
),
fused as (
  select ids.id, l.rank as lexical_rank, v.rank as vector_rank,
    coalesce(1.0 / (rrf_k + l.rank), 0.0) + coalesce(1.0 / (rrf_k + v.rank), 0.0) as rrf_score
  from candidate_ids ids
  left join lexical_candidates l on l.id = ids.id
  left join vector_candidates v on v.id = ids.id
)
select c.id::text, c.document_id::text, d.file_name, d.storage_path, d.file_type, c.source_kind,
  c.chunk_text, c.page_number, c.line_start, c.line_end, c.symbol_name, c.symbol_kind,
  c.language, c.identifiers, f.lexical_rank, f.vector_rank, f.rrf_score
from fused f
join public.document_chunks c on c.id = f.id
join public.documents d on d.id = c.document_id
order by f.rrf_score desc
limit greatest(1, least(match_limit, 100));
$function$;

grant execute on function public.hybrid_search_rrf(text, extensions.vector, integer, text, text, text, integer, text) to authenticated;
