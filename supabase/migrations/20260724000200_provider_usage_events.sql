create table if not exists public.provider_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  pursuit_id uuid references public.pursuits(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  provider_category text not null check (
    provider_category in ('anthropic', 'exa')
  ),
  operation text not null check (btrim(operation) <> ''),
  model_version text not null check (btrim(model_version) <> ''),
  request_count integer not null default 1 check (request_count > 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  cache_write_tokens bigint not null default 0 check (cache_write_tokens >= 0),
  cache_read_tokens bigint not null default 0 check (cache_read_tokens >= 0),
  result_count integer not null default 0 check (result_count >= 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  outcome text not null check (outcome in ('success', 'empty', 'partial', 'failure')),
  estimated_cost_micros bigint not null check (estimated_cost_micros >= 0),
  rate_card_version text not null check (btrim(rate_card_version) <> ''),
  request_correlation_id text check (
    request_correlation_id is null or btrim(request_correlation_id) <> ''
  ),
  created_at timestamptz not null default now()
);

create index if not exists provider_usage_events_created_idx
  on public.provider_usage_events(created_at desc);

create index if not exists provider_usage_events_user_created_idx
  on public.provider_usage_events(user_id, created_at desc)
  where user_id is not null;

create index if not exists provider_usage_events_pursuit_created_idx
  on public.provider_usage_events(pursuit_id, created_at desc)
  where pursuit_id is not null;

create index if not exists provider_usage_events_correlation_idx
  on public.provider_usage_events(request_correlation_id)
  where request_correlation_id is not null;

alter table public.provider_usage_events enable row level security;

revoke all on table public.provider_usage_events from public, anon, authenticated;
grant select, insert on table public.provider_usage_events to service_role;
