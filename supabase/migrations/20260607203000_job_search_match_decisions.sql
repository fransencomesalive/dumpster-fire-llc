create table if not exists public.job_search_match_decisions (
  id text primary key default gen_random_uuid()::text,
  profile_id text not null default 'default' references public.job_search_profiles(id) on delete cascade,
  user_id uuid,
  job_id text references public.job_search_jobs(id) on delete cascade,
  company_id text not null references public.job_search_companies(id) on delete cascade,
  external_job_id text not null default '',
  source_provider text not null,
  title text not null default '',
  company_name text not null default '',
  included boolean not null default false,
  score integer not null default 0,
  fit_bucket text not null default 'skip',
  recommended_action text not null default 'skip',
  role_family text not null default '',
  confidence text not null default 'low',
  rules_version text not null default '',
  fit_summary text not null default '',
  positives text[] not null default '{}',
  risks text[] not null default '{}',
  evidence text[] not null default '{}',
  decision_context_json jsonb not null default '{}'::jsonb,
  decided_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists job_search_match_decisions_source_version_idx
  on public.job_search_match_decisions(profile_id, company_id, source_provider, external_job_id, rules_version);

create index if not exists job_search_match_decisions_job_idx
  on public.job_search_match_decisions(job_id, decided_at desc);

create index if not exists job_search_match_decisions_profile_decided_idx
  on public.job_search_match_decisions(profile_id, decided_at desc);

alter table public.job_search_match_decisions enable row level security;
