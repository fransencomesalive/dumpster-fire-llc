-- Public job ingestion: connector source config + normalized-field columns on the public jobs
-- table. Defensive/idempotent so it is safe to re-run. No seed rows are inserted; an empty
-- job_sources table makes ingestion a no-op.

-- Preserve every normalized connector field when ingesting into the public jobs table.
alter table public.jobs
  add column if not exists external_job_id text,
  add column if not exists apply_url text,
  add column if not exists department text,
  add column if not exists salary_min integer,
  add column if not exists salary_max integer;

create table if not exists public.job_sources (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  website_url text not null default '',
  careers_url text not null default '',
  ats_provider text not null check (ats_provider in ('greenhouse', 'lever', 'ashby', 'icims', 'workday', 'magnit', 'html')),
  ats_board_token text not null default '',
  status text not null default 'active' check (status in ('active', 'paused')),
  workday_variants text[] not null default '{}',
  last_scanned_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ats_provider, ats_board_token, careers_url)
);

create index if not exists job_sources_status_idx on public.job_sources(status);

-- Ingest config is admin-owned. Enable RLS with no public policy so only the service role
-- (which bypasses RLS) can read or write it.
alter table public.job_sources enable row level security;
