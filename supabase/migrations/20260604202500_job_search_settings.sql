create table if not exists public.job_search_settings (
  id text primary key default gen_random_uuid()::text,
  profile_id text not null unique default 'default' references public.job_search_profiles(id) on delete cascade,
  user_id uuid,
  scan_enabled boolean not null default false,
  scan_cadence text not null default 'manual' check (scan_cadence in ('manual', 'daily', 'weekdays', 'weekly')),
  digest_enabled boolean not null default false,
  digest_time text not null default '08:30',
  max_roles_per_scan integer not null default 25,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_search_settings_profile_idx on public.job_search_settings(profile_id);

alter table public.job_search_settings enable row level security;

insert into public.job_search_settings (
  profile_id,
  scan_enabled,
  scan_cadence,
  digest_enabled,
  digest_time,
  max_roles_per_scan
) values (
  'default',
  false,
  'manual',
  false,
  '08:30',
  25
) on conflict (profile_id) do nothing;
