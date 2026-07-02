-- Access codes: invite codes that grant a subscription plan (e.g. free tester access).
-- Admin-owned: RLS enabled with no policy, so only the service role can read/write.

create table if not exists public.access_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  plan_name text not null check (plan_name in ('tester', 'basic', 'pro', 'premium')),
  max_uses integer check (max_uses is null or max_uses > 0),
  use_count integer not null default 0 check (use_count >= 0),
  expires_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists access_codes_code_idx on public.access_codes(code);

alter table public.access_codes enable row level security;
