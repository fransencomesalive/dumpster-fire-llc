create table if not exists public.job_search_compiled_profiles (
  id text primary key default gen_random_uuid()::text,
  profile_id text not null default 'default' references public.job_search_profiles(id) on delete cascade,
  user_id uuid,
  source_kind text not null default 'resume_profile_preferences',
  input_summary text not null default '',
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  missing_inputs text[] not null default '{}',
  search_profile_json jsonb not null default '{}'::jsonb,
  matching_config_json jsonb not null default '{}'::jsonb,
  evidence_json jsonb not null default '{}'::jsonb,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_search_compiled_profiles_profile_created_idx
  on public.job_search_compiled_profiles(profile_id, created_at desc);

create index if not exists job_search_compiled_profiles_profile_applied_idx
  on public.job_search_compiled_profiles(profile_id, applied_at desc);

alter table public.job_search_compiled_profiles enable row level security;
