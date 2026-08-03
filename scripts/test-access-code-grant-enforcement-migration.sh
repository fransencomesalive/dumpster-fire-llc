#!/usr/bin/env bash
set -euo pipefail

export PGTZ=UTC

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d "/tmp/access-code-grant-enforcement.XXXXXX")"
PG_DATA="$TEST_ROOT/data"
PG_SOCKET="$TEST_ROOT/socket"
PG_PORT="${ACCESS_CODE_GRANT_TEST_PORT:-55503}"
PG_LOG="$TEST_ROOT/postgres.log"
PG_BIN="$(pg_config --bindir)"
THIRTY_DAY_MIGRATION="$REPO_ROOT/supabase/migrations/20260803000100_access_code_thirty_day_grant.sql"
ENFORCEMENT_MIGRATION="$REPO_ROOT/supabase/migrations/20260803000200_access_code_grant_enforcement.sql"

cleanup() {
  if [[ -d "$PG_DATA" ]]; then
    "$PG_BIN/pg_ctl" -D "$PG_DATA" -m fast stop >/dev/null 2>&1 || true
  fi
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

mkdir -p "$PG_SOCKET"
"$PG_BIN/initdb" -D "$PG_DATA" --auth=trust --username=postgres >/dev/null
if ! "$PG_BIN/pg_ctl" -D "$PG_DATA" -l "$PG_LOG" -o "-p $PG_PORT -k $PG_SOCKET" start >/dev/null; then
  cat "$PG_LOG"
  exit 1
fi

PSQL=("$PG_BIN/psql" -X -q -v ON_ERROR_STOP=1 -h "$PG_SOCKET" -p "$PG_PORT" -U postgres -d postgres)

"${PSQL[@]}" >/dev/null <<'SQL'
create extension if not exists pgcrypto;
create schema auth;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create table auth.users (id uuid primary key);

create table public.subscription_plans (
  id uuid primary key,
  name text not null unique,
  apply_wizard_limit_monthly integer
);

create table public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  status text not null check (status in ('trialing', 'active', 'past_due', 'canceled')),
  source text not null check (source in ('stripe', 'access_code', 'manual')),
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  stripe_status_raw text,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  latest_invoice_id text,
  last_stripe_event_created_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_subscriptions_period_check check (
    (current_period_start is null and current_period_end is null)
    or (
      current_period_start is not null
      and current_period_end is not null
      and current_period_end > current_period_start
    )
  )
);

create table public.access_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  plan_name text not null,
  max_uses integer check (max_uses is null or max_uses > 0),
  use_count integer not null default 0 check (use_count >= 0),
  expires_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.usage_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid references public.subscription_plans(id),
  usage_type text not null,
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now()
);

create table public.human_path_delegate_calls (
  user_id uuid not null,
  called_at timestamptz not null default now()
);

create table public.pursuits (
  id uuid primary key,
  user_id uuid not null,
  status text not null
);

create table public.contact_suggestions (
  id uuid primary key default gen_random_uuid(),
  pursuit_id uuid not null
);

create table public.pursuit_events (
  id uuid primary key default gen_random_uuid(),
  pursuit_id uuid not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.enforce_usage_ledger_quota()
returns trigger
language plpgsql
as $$
begin
  return new;
end;
$$;

create trigger usage_ledger_quota_before_insert
  before insert on public.usage_ledger
  for each row execute function public.enforce_usage_ledger_quota();

create or replace function public.persist_human_path_generation(
  p_pursuit_id uuid,
  p_user_id uuid,
  p_contacts jsonb,
  p_diagnostics jsonb,
  p_provider_version integer,
  p_generated_at timestamptz
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
begin
  insert into public.human_path_delegate_calls (user_id) values (p_user_id);
  return jsonb_build_object(
    'status', 'human_path_generated',
    'replayed', false,
    'debitAdded', jsonb_array_length(p_contacts) > 0
  );
end;
$$;

insert into public.subscription_plans (id, name, apply_wizard_limit_monthly)
values
  ('10000000-0000-0000-0000-000000000001', 'premium', 1),
  ('10000000-0000-0000-0000-000000000002', 'tester', 1);

insert into auth.users (id) values
  ('20000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000003'),
  ('20000000-0000-0000-0000-000000000004'),
  ('20000000-0000-0000-0000-000000000005');

-- This legacy row is deliberately permanent and must stay that way.
insert into public.user_subscriptions (
  user_id, plan_id, status, source, current_period_start, current_period_end
) values (
  '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000002',
  'active',
  'access_code',
  null,
  null
);

insert into public.access_codes (id, code, plan_name, max_uses) values
  ('30000000-0000-0000-0000-000000000001', 'DUMPSTERFRIENDS', 'premium', 25),
  ('30000000-0000-0000-0000-000000000002', 'SECOND-CODE', 'premium', 25);
SQL

"${PSQL[@]}" -f "$THIRTY_DAY_MIGRATION" >/dev/null

# Three passes prove the follow-up is safe to replay and does not rename its
# Human Path wrapper into itself on a later migration attempt.
for _pass in 1 2 3; do
  "${PSQL[@]}" -f "$ENFORCEMENT_MIGRATION" >/dev/null
done

"${PSQL[@]}" >/dev/null <<'SQL'
-- The pre-existing null-window grant is recorded but remains permanent.
do $$
declare
  v_count integer;
  v_period_start timestamptz;
  v_period_end timestamptz;
begin
  select count(*), min(current_period_start), min(current_period_end)
  into v_count, v_period_start, v_period_end
  from public.access_code_subscription_grants
  where user_id = '20000000-0000-0000-0000-000000000002';

  if v_count <> 1 or v_period_start is not null or v_period_end is not null then
    raise exception 'permanent access-code grant was not preserved';
  end if;

  perform public.expire_access_code_subscriptions('2100-01-01T00:00:00Z');
  if (select status from public.user_subscriptions
      where user_id = '20000000-0000-0000-0000-000000000002') <> 'active'
  then
    raise exception 'null-window access-code grant expired';
  end if;
end;
$$;

-- A new redemption creates exactly one 30-day stored grant.
do $$
declare
  v_now timestamptz := clock_timestamp();
  v_result jsonb;
  v_seconds numeric;
begin
  select public.redeem_access_code_subscription(
    '20000000-0000-0000-0000-000000000001',
    ' dumpster friends ',
    v_now
  ) into v_result;

  if v_result ->> 'status' <> 'redeemed'
    or coalesce((v_result ->> 'redeemed')::boolean, false) is not true
  then
    raise exception 'new access-code grant failed: %', v_result;
  end if;

  select extract(epoch from (current_period_end - current_period_start))
  into v_seconds
  from public.access_code_subscription_grants
  where user_id = '20000000-0000-0000-0000-000000000001';

  if v_seconds <> 2592000 then
    raise exception 'grant window was not exactly 30 days: %', v_seconds;
  end if;
end;
$$;

-- The sweep closes the timed grant, and its durable ledger prevents any code
-- from granting the same account a second window.
update public.user_subscriptions
set current_period_start = clock_timestamp() - interval '30 days 1 second',
    current_period_end = clock_timestamp() - interval '1 second',
    updated_at = clock_timestamp()
where user_id = '20000000-0000-0000-0000-000000000001';

do $$
declare
  v_expired integer;
  v_result jsonb;
  v_second_uses integer;
begin
  select public.expire_access_code_subscriptions(clock_timestamp()) into v_expired;
  if v_expired <> 1 then
    raise exception 'expected one swept grant, got %', v_expired;
  end if;

  select public.redeem_access_code_subscription(
    '20000000-0000-0000-0000-000000000001',
    'SECOND-CODE',
    clock_timestamp()
  ) into v_result;

  select use_count into v_second_uses
  from public.access_codes where code = 'SECOND-CODE';

  if v_result ->> 'status' <> 'access_code_already_redeemed'
    or coalesce((v_result ->> 'redeemed')::boolean, true) is not false
    or v_second_uses <> 0
  then
    raise exception 'second redemption was not blocked atomically: %, uses=%',
      v_result, v_second_uses;
  end if;
end;
$$;

-- A stored access-code window spans the UTC month boundary for quota purposes.
-- A prior-month use inside that stored window must block a current-month use.
insert into public.user_subscriptions (
  user_id, plan_id, status, source, current_period_start, current_period_end
) values (
  '20000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000001',
  'active',
  'access_code',
  (date_trunc('month', clock_timestamp() at time zone 'UTC') at time zone 'UTC') - interval '1 day',
  clock_timestamp() + interval '10 days'
);

insert into public.usage_ledger (user_id, usage_type, quantity, created_at)
values (
  '20000000-0000-0000-0000-000000000003',
  'apply_wizard',
  1,
  (date_trunc('month', clock_timestamp() at time zone 'UTC') at time zone 'UTC') - interval '12 hours'
);

do $$
begin
  begin
    insert into public.usage_ledger (user_id, usage_type, quantity, created_at)
    values (
      '20000000-0000-0000-0000-000000000003',
      'apply_wizard',
      1,
      clock_timestamp()
    );
    raise exception 'expected stored grant-window quota rejection';
  exception
    when raise_exception then
      if sqlerrm not like 'apply_wizard_limit_reached:1:1%' then
        raise;
      end if;
  end;
end;
$$;

-- Manual subscriptions retain UTC calendar-month accounting.
insert into public.user_subscriptions (
  user_id, plan_id, status, source
) values (
  '20000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000001',
  'active',
  'manual'
);

insert into public.usage_ledger (user_id, usage_type, quantity, created_at)
values (
  '20000000-0000-0000-0000-000000000004',
  'apply_wizard',
  1,
  (date_trunc('month', clock_timestamp() at time zone 'UTC') at time zone 'UTC') - interval '12 hours'
);

insert into public.usage_ledger (user_id, usage_type, quantity, created_at)
values (
  '20000000-0000-0000-0000-000000000004',
  'apply_wizard',
  1,
  clock_timestamp()
);

-- Human Path is stopped at the stored expiration boundary before the legacy
-- implementation can persist contacts, events, or usage.
insert into public.user_subscriptions (
  user_id, plan_id, status, source, current_period_start, current_period_end
) values (
  '20000000-0000-0000-0000-000000000005',
  '10000000-0000-0000-0000-000000000001',
  'active',
  'access_code',
  clock_timestamp() - interval '30 days 1 second',
  clock_timestamp() - interval '1 second'
);

do $$
declare
  v_result jsonb;
begin
  select public.persist_human_path_generation(
    gen_random_uuid(),
    '20000000-0000-0000-0000-000000000005',
    '[]'::jsonb,
    '{}'::jsonb,
    1,
    clock_timestamp()
  ) into v_result;

  if v_result ->> 'status' <> 'subscription_inactive'
    or (select status from public.user_subscriptions
        where user_id = '20000000-0000-0000-0000-000000000005') <> 'canceled'
    or exists (
      select 1 from public.human_path_delegate_calls
      where user_id = '20000000-0000-0000-0000-000000000005'
    )
  then
    raise exception 'Human Path crossed an expired grant boundary: %', v_result;
  end if;
end;
$$;

-- Human Path uses the same stored grant window before calling its delegate.
do $$
declare
  v_result jsonb;
begin
  select public.persist_human_path_generation(
    gen_random_uuid(),
    '20000000-0000-0000-0000-000000000003',
    '[{"name":"Contact"}]'::jsonb,
    '{}'::jsonb,
    1,
    clock_timestamp()
  ) into v_result;

  if v_result ->> 'status' <> 'limit_reached'
    or exists (
      select 1 from public.human_path_delegate_calls
      where user_id = '20000000-0000-0000-0000-000000000003'
    )
  then
    raise exception 'Human Path ignored the stored grant quota: %', v_result;
  end if;
end;
$$;

-- The grant ledger and all mutation functions are service-only.
do $$
declare
  v_public_table boolean;
  v_anon_table boolean;
  v_authenticated_table boolean;
  v_service_table boolean;
  v_public_redeem boolean;
  v_anon_redeem boolean;
  v_authenticated_redeem boolean;
  v_service_redeem boolean;
  v_public_human boolean;
  v_anon_human boolean;
  v_authenticated_human boolean;
  v_service_human boolean;
  v_service_unchecked_human boolean;
begin
  select
    has_table_privilege('public', 'public.access_code_subscription_grants', 'select'),
    has_table_privilege('anon', 'public.access_code_subscription_grants', 'select'),
    has_table_privilege('authenticated', 'public.access_code_subscription_grants', 'select'),
    has_table_privilege('service_role', 'public.access_code_subscription_grants', 'select')
  into v_public_table, v_anon_table, v_authenticated_table, v_service_table;

  select
    has_function_privilege('public', 'public.redeem_access_code_subscription(uuid,text,timestamptz)', 'execute'),
    has_function_privilege('anon', 'public.redeem_access_code_subscription(uuid,text,timestamptz)', 'execute'),
    has_function_privilege('authenticated', 'public.redeem_access_code_subscription(uuid,text,timestamptz)', 'execute'),
    has_function_privilege('service_role', 'public.redeem_access_code_subscription(uuid,text,timestamptz)', 'execute')
  into v_public_redeem, v_anon_redeem, v_authenticated_redeem, v_service_redeem;

  select
    has_function_privilege('public', 'public.persist_human_path_generation(uuid,uuid,jsonb,jsonb,integer,timestamptz)', 'execute'),
    has_function_privilege('anon', 'public.persist_human_path_generation(uuid,uuid,jsonb,jsonb,integer,timestamptz)', 'execute'),
    has_function_privilege('authenticated', 'public.persist_human_path_generation(uuid,uuid,jsonb,jsonb,integer,timestamptz)', 'execute'),
    has_function_privilege('service_role', 'public.persist_human_path_generation(uuid,uuid,jsonb,jsonb,integer,timestamptz)', 'execute')
  into v_public_human, v_anon_human, v_authenticated_human, v_service_human;

  select has_function_privilege(
    'service_role',
    'public.persist_human_path_generation_unchecked_20260803(uuid,uuid,jsonb,jsonb,integer,timestamptz)',
    'execute'
  ) into v_service_unchecked_human;

  if v_public_table or v_anon_table or v_authenticated_table or not v_service_table
    or v_public_redeem or v_anon_redeem or v_authenticated_redeem or not v_service_redeem
    or v_public_human or v_anon_human or v_authenticated_human or not v_service_human
    or v_service_unchecked_human
  then
    raise exception 'service-role ACL boundary is incorrect';
  end if;
end;
$$;
SQL

echo "access-code grant enforcement migration: passed"
