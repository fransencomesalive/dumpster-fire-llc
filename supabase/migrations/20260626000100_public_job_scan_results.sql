create table if not exists public.job_scan_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.candidate_profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'actioned', 'expired')),
  scan_context jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);

create index if not exists job_scan_results_user_status_last_seen_idx on public.job_scan_results(user_id, status, last_seen_at desc);
create index if not exists job_scan_results_profile_status_idx on public.job_scan_results(profile_id, status);

alter table public.job_scan_results enable row level security;

create policy job_scan_results_owner on public.job_scan_results for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
