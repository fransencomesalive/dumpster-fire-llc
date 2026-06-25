create table if not exists public.job_search_candidate_dossiers (
  id text primary key default gen_random_uuid()::text,
  profile_id text not null default 'default' references public.job_search_profiles(id) on delete cascade,
  user_id uuid,
  version text not null default '1',
  updated_label text not null default '',
  raw_markdown text not null default '',
  parsed_json jsonb not null default '{}'::jsonb,
  validation_json jsonb not null default '{}'::jsonb,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_search_candidate_dossiers_profile_applied_idx
  on public.job_search_candidate_dossiers(profile_id, applied_at desc);

alter table public.job_search_candidate_dossiers enable row level security;
