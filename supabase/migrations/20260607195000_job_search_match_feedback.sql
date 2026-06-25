create table if not exists public.job_search_match_feedback (
  id text primary key default gen_random_uuid()::text,
  profile_id text not null default 'default' references public.job_search_profiles(id) on delete cascade,
  user_id uuid,
  job_id text not null references public.job_search_jobs(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  reason text not null default '',
  match_version text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists job_search_match_feedback_profile_job_idx
  on public.job_search_match_feedback(profile_id, job_id);

create index if not exists job_search_match_feedback_profile_created_idx
  on public.job_search_match_feedback(profile_id, created_at desc);

alter table public.job_search_match_feedback enable row level security;
