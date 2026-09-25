-- HC Rank Tool schema
-- Run in the Supabase SQL editor (or via `supabase db push` once the CLI is linked).

create extension if not exists "pgcrypto";

-- One row per prepared Common Crawl domain-ranking release.
-- A batch always pins to exactly one release_id, even if a newer release
-- finishes preparing while the batch is running.
create table if not exists hc_releases (
  id uuid primary key default gen_random_uuid(),
  release_id text not null unique,        -- e.g. Common Crawl's own release label
  crawl_window text not null,             -- months covered, shown in exports
  source_url text not null,               -- official release page
  status text not null default 'preparing'
    check (status in ('preparing', 'validating', 'active', 'superseded')),
  domain_rules_version text not null,     -- registered-domain / suffix rules version used to build this table
  row_count bigint,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);

-- Full domain -> HC score/rank lookup table for a given release.
-- Must contain the *complete* release (not just top-N) for not_found_in_snapshot to be meaningful.
create table if not exists hc_domains (
  id bigserial primary key,
  release_id uuid not null references hc_releases(id) on delete cascade,
  domain text not null,
  hc_score double precision not null,
  hc_rank bigint not null,
  unique (release_id, domain)
);
create index if not exists hc_domains_release_rank_idx on hc_domains (release_id, hc_rank);

-- One row per uploaded batch.
create table if not exists hc_batches (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references hc_releases(id),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'completed_with_errors', 'partial')),
  total_rows int not null default 0,
  processed_rows int not null default 0,
  has_header boolean not null default true,
  source_url_column text,                 -- CSV column chosen to score, if uploaded as CSV
  band_mode text not null default 'disabled'
    check (band_mode in ('disabled', 'two', 'three')),
  band_cutoff_a int,
  band_cutoff_b int,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per accepted input row, in original order. Preserves duplicates and extra CSV columns.
create table if not exists hc_batch_rows (
  id bigserial primary key,
  batch_id uuid not null references hc_batches(id) on delete cascade,
  input_row_number int not null,          -- hc_input_row: stable, 1-based, excludes header
  original_link text not null,            -- hc_original_link
  extra_columns jsonb not null default '{}'::jsonb, -- other original CSV columns, preserved verbatim
  matched_domain text,                    -- hc_matched_domain
  hc_score double precision,
  hc_rank bigint,
  hc_band text check (hc_band in ('Stronger', 'Middle', 'Weaker')),
  status text not null default 'not_processed'
    check (status in (
      'found', 'invalid_input', 'unsupported_input',
      'not_found_in_snapshot', 'lookup_failed', 'not_processed'
    )),
  status_detail text,
  checked_at timestamptz,
  unique (batch_id, input_row_number)
);
create index if not exists hc_batch_rows_batch_rank_idx on hc_batch_rows (batch_id, hc_rank);
create index if not exists hc_batch_rows_batch_status_idx on hc_batch_rows (batch_id, status);

-- Internal-only access: batches and rows are only visible to their creator.
-- All lookup writes happen server-side with the service role key, which bypasses RLS.
alter table hc_batches enable row level security;
alter table hc_batch_rows enable row level security;

create policy "batches: owner read" on hc_batches
  for select using (auth.uid() = created_by);

create policy "batch_rows: owner read" on hc_batch_rows
  for select using (
    exists (
      select 1 from hc_batches b
      where b.id = hc_batch_rows.batch_id and b.created_by = auth.uid()
    )
  );
