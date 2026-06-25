create table if not exists public.job_search_near_miss_reviews (
  id text primary key default gen_random_uuid()::text,
  profile_id text not null default 'default' references public.job_search_profiles(id) on delete cascade,
  review_key text not null,
  decision text not null check (decision in ('approve', 'reject', 'not_for_me')),
  reason text not null default '',
  title_signal text not null default '',
  company_name text not null default '',
  source_provider text not null default '',
  title text not null default '',
  source_url text not null default '',
  review_bucket text not null default '',
  rules_version text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists job_search_near_miss_reviews_profile_key_version_idx
  on public.job_search_near_miss_reviews(profile_id, review_key, rules_version);

create index if not exists job_search_near_miss_reviews_profile_updated_idx
  on public.job_search_near_miss_reviews(profile_id, updated_at desc);

alter table public.job_search_near_miss_reviews enable row level security;
