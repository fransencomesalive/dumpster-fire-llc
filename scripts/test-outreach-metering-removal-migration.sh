#!/usr/bin/env bash
set -euo pipefail

export PGTZ=UTC

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d "/tmp/outreach-metering-removal.XXXXXX")"
PG_DATA="$TEST_ROOT/data"
PG_SOCKET="$TEST_ROOT/socket"
PG_PORT="${OUTREACH_METERING_TEST_PORT:-55496}"
PG_LOG="$TEST_ROOT/postgres.log"
PG_BIN="$(pg_config --bindir)"
MIGRATION="$REPO_ROOT/supabase/migrations/20260725000100_outreach_metering_removal.sql"
PREFLIGHT="$REPO_ROOT/scripts/preflight-outreach-metering-removal.sql"
POSTFLIGHT="$REPO_ROOT/scripts/postflight-outreach-metering-removal.sql"

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

# Recreate the post-00600 surface that Phase 2C replaces. The latch triggers
# are included so the regression exercises the real Apply Wizard invariant.
"${PSQL[@]}" >/dev/null <<'SQL'
create extension if not exists pgcrypto;
create schema auth;
create schema supabase_migrations;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create table auth.users (id uuid primary key);
create table supabase_migrations.schema_migrations (
  version text primary key,
  name text not null
);

create table public.subscription_plans (
  id uuid primary key,
  name text not null unique,
  pursuit_limit_monthly integer,
  outreach_limit_monthly integer,
  apply_wizard_limit_monthly integer
);

create table public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  source text not null check (source in ('stripe', 'access_code', 'manual')),
  status text not null check (status in ('trialing', 'active', 'past_due', 'canceled')),
  current_period_start timestamptz,
  current_period_end timestamptz
);

create table public.jobs (
  id uuid primary key,
  owner_user_id uuid references auth.users(id) on delete cascade
);

create table public.pursuits (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid,
  job_id uuid references public.jobs(id) on delete set null,
  selected_role_track_id uuid,
  selected_resume_id uuid,
  selected_work_example_id uuid,
  status text not null,
  pursuit_metered_at timestamptz,
  apply_wizard_metered_at timestamptz,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contact_suggestions (
  id uuid primary key,
  pursuit_id uuid not null references public.pursuits(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  selected_for_outreach boolean not null default false
);

create table public.pursuit_events (
  id uuid primary key default gen_random_uuid(),
  pursuit_id uuid not null references public.pursuits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  usage_type text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.usage_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid references public.subscription_plans(id),
  usage_type text not null check (
    usage_type in (
      'pursuit',
      'outreach_message',
      'human_path',
      'profile_export',
      'voice_fingerprint',
      'resume_highlights',
      'apply_wizard'
    )
  ),
  quantity integer not null default 1 check (quantity > 0),
  related_job_id uuid references public.jobs(id) on delete set null,
  related_pursuit_id uuid references public.pursuits(id) on delete set null,
  outreach_generation_request_id uuid,
  created_at timestamptz not null default now()
);

create table public.pursuit_outreach_generation_requests (
  id uuid primary key default gen_random_uuid(),
  pursuit_id uuid not null references public.pursuits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null check (length(btrim(idempotency_key)) between 1 and 220),
  request_payload jsonb not null check (jsonb_typeof(request_payload) = 'array'),
  pursuit_debit_added boolean not null default false,
  outreach_debit_quantity integer not null check (outreach_debit_quantity > 0),
  persisted_at timestamptz not null default now(),
  unique (pursuit_id, idempotency_key)
);

create table public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  pursuit_id uuid not null references public.pursuits(id) on delete cascade,
  contact_suggestion_id uuid references public.contact_suggestions(id) on delete set null,
  channel text not null default 'other',
  recipient_type text not null,
  message text not null,
  selected_resume_id uuid,
  selected_role_track_id uuid,
  selected_work_example_id uuid,
  status text not null default 'draft',
  generation_request_id uuid
    references public.pursuit_outreach_generation_requests(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pursuit_outreach_generation_requests enable row level security;

create unique index usage_ledger_one_apply_wizard_debit_idx
  on public.usage_ledger(user_id, related_pursuit_id)
  where usage_type = 'apply_wizard' and related_pursuit_id is not null;

create or replace function public.validate_apply_wizard_metered_latch()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ledger_at timestamptz;
begin
  if new.apply_wizard_metered_at is null then
    if tg_op = 'UPDATE' and old.apply_wizard_metered_at is not null then
      raise exception using
        errcode = '23514',
        message = 'apply_wizard_metered_latch_cannot_be_cleared';
    end if;
    return new;
  end if;

  select min(usage_ledger.created_at)
  into v_ledger_at
  from public.usage_ledger
  where usage_ledger.user_id = new.user_id
    and usage_ledger.related_pursuit_id = new.id
    and usage_ledger.usage_type = 'apply_wizard';

  if v_ledger_at is null then
    raise exception using
      errcode = '23514',
      message = 'apply_wizard_metered_latch_requires_ledger';
  end if;

  new.apply_wizard_metered_at := v_ledger_at;
  return new;
end;
$$;

create trigger pursuits_apply_wizard_latch_before_write
  before insert or update on public.pursuits
  for each row execute function public.validate_apply_wizard_metered_latch();

create or replace function public.sync_apply_wizard_latch_from_ledger()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.usage_type = 'apply_wizard' and new.related_pursuit_id is not null then
    update public.pursuits
    set apply_wizard_metered_at = coalesce(apply_wizard_metered_at, new.created_at)
    where pursuits.id = new.related_pursuit_id
      and pursuits.user_id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger usage_ledger_sync_apply_wizard_latch_after_insert
  after insert on public.usage_ledger
  for each row execute function public.sync_apply_wizard_latch_from_ledger();

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

grant select, insert, update, delete on all tables in schema public to service_role;

insert into public.subscription_plans (
  id,
  name,
  pursuit_limit_monthly,
  outreach_limit_monthly,
  apply_wizard_limit_monthly
) values (
  '10000000-0000-0000-0000-000000000001',
  'basic',
  0,
  0,
  1
);

insert into auth.users (id)
values ('20000000-0000-0000-0000-000000000001');

insert into public.user_subscriptions (
  user_id,
  plan_id,
  source,
  status
) values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'access_code',
  'active'
);

insert into public.jobs (id, owner_user_id) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001');

insert into public.pursuits (id, user_id, job_id, status) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'human_path_generated'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'human_path_generated'),
  ('40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'outreach_ready');

insert into public.contact_suggestions (id, pursuit_id, job_id, selected_for_outreach) values
  ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', true),
  ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', true);

insert into public.pursuit_outreach_generation_requests (
  id,
  pursuit_id,
  user_id,
  idempotency_key,
  request_payload,
  pursuit_debit_added,
  outreach_debit_quantity
) values (
  '60000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000001',
  'historical-request',
  '[{"message":"Historical.","recipient_type":"no_contact","channel":"other"}]'::jsonb,
  true,
  1
);

insert into public.outreach_messages (
  id,
  pursuit_id,
  recipient_type,
  message,
  generation_request_id
) values (
  '70000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000003',
  'no_contact',
  'Historical.',
  '60000000-0000-0000-0000-000000000001'
);

insert into public.usage_ledger (
  user_id,
  usage_type,
  quantity,
  related_job_id,
  related_pursuit_id,
  created_at
) values
  (
    '20000000-0000-0000-0000-000000000001',
    'pursuit',
    1,
    '30000000-0000-0000-0000-000000000003',
    '40000000-0000-0000-0000-000000000003',
    '2026-06-15T12:00:00Z'
  ),
  (
    '20000000-0000-0000-0000-000000000001',
    'outreach_message',
    1,
    '30000000-0000-0000-0000-000000000003',
    '40000000-0000-0000-0000-000000000003',
    '2026-06-15T12:00:00Z'
  );
SQL

"${PSQL[@]}" -f "$PREFLIGHT" >/dev/null

for _pass in 1 2 3; do
  "${PSQL[@]}" -f "$MIGRATION" >/dev/null
done

"${PSQL[@]}" >/dev/null <<'SQL'
insert into supabase_migrations.schema_migrations (version, name)
values ('20260725000100', 'outreach_metering_removal');
SQL

"${PSQL[@]}" >/dev/null <<'SQL'
-- The old rows remain exact, including their historical debit metadata.
do $$
declare
  v_result jsonb;
begin
  select public.persist_initial_outreach_generation(
    '40000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000001',
    '[{"message":"Historical.","recipient_type":"no_contact","channel":"other"}]'::jsonb,
    'historical-request'
  ) into v_result;

  if coalesce((v_result ->> 'replayed')::boolean, false) is not true
    or coalesce((v_result ->> 'pursuitDebited')::boolean, false) is not true
    or (v_result ->> 'outreachDebited')::integer <> 1
  then
    raise exception 'historical outreach replay metadata changed: %', v_result;
  end if;
end;
$$;

-- A successful Apply Wizard debit creates the immutable latch used by outreach.
insert into public.usage_ledger (
  user_id,
  usage_type,
  quantity,
  related_job_id,
  related_pursuit_id,
  created_at
) values (
  '20000000-0000-0000-0000-000000000001',
  'apply_wizard',
  1,
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '2026-07-15T12:00:00Z'
);

do $$
declare
  v_result jsonb;
  v_latch timestamptz;
  v_legacy_rows integer;
begin
  select apply_wizard_metered_at
  into v_latch
  from public.pursuits
  where id = '40000000-0000-0000-0000-000000000001';

  if v_latch <> '2026-07-15T12:00:00Z'::timestamptz then
    raise exception 'Apply Wizard latch was not established';
  end if;

  select count(*)::integer
  into v_legacy_rows
  from public.usage_ledger
  where usage_type in ('pursuit', 'outreach_message');

  select public.persist_initial_outreach_generation(
    '40000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '[
      {
        "id":"70000000-0000-0000-0000-000000000002",
        "contact_suggestion_id":"50000000-0000-0000-0000-000000000001",
        "message":"First.",
        "recipient_type":"likely_hiring_manager",
        "channel":"linkedin_dm"
      },
      {
        "id":"70000000-0000-0000-0000-000000000003",
        "contact_suggestion_id":"50000000-0000-0000-0000-000000000002",
        "message":"Second.",
        "recipient_type":"recruiter",
        "channel":"email"
      }
    ]'::jsonb,
    'phase-2c-success'
  ) into v_result;

  if coalesce((v_result ->> 'replayed')::boolean, true) is true
    or coalesce((v_result ->> 'pursuitDebited')::boolean, true) is true
    or (v_result ->> 'outreachDebited')::integer <> 0
    or jsonb_array_length(v_result -> 'messages') <> 2
  then
    raise exception 'new outreach metering result is wrong: %', v_result;
  end if;

  if (
    select count(*)::integer
    from public.usage_ledger
    where usage_type in ('pursuit', 'outreach_message')
  ) <> v_legacy_rows then
    raise exception 'new outreach created a legacy retail debit';
  end if;

  if exists (
    select 1
    from public.pursuit_outreach_generation_requests
    where idempotency_key = 'phase-2c-success'
      and (
        pursuit_debit_added
        or outreach_debit_quantity <> 0
      )
  ) then
    raise exception 'new request persisted nonzero legacy debit metadata';
  end if;

  if not exists (
    select 1
    from public.pursuit_events
    where pursuit_id = '40000000-0000-0000-0000-000000000001'
      and event_type = 'outreach_generated'
      and usage_type is null
      and payload ->> 'messageCount' = '2'
  ) then
    raise exception 'unmetered outreach event was not persisted';
  end if;
end;
$$;

-- An identical retry returns the original messages without writes or debits.
do $$
declare
  v_result jsonb;
  v_requests integer;
  v_messages integer;
  v_events integer;
begin
  select count(*) into v_requests from public.pursuit_outreach_generation_requests;
  select count(*) into v_messages from public.outreach_messages;
  select count(*) into v_events from public.pursuit_events;

  select public.persist_initial_outreach_generation(
    '40000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '[
      {
        "id":"70000000-0000-0000-0000-000000000002",
        "contact_suggestion_id":"50000000-0000-0000-0000-000000000001",
        "message":"First.",
        "recipient_type":"likely_hiring_manager",
        "channel":"linkedin_dm"
      },
      {
        "id":"70000000-0000-0000-0000-000000000003",
        "contact_suggestion_id":"50000000-0000-0000-0000-000000000002",
        "message":"Second.",
        "recipient_type":"recruiter",
        "channel":"email"
      }
    ]'::jsonb,
    'phase-2c-success'
  ) into v_result;

  if coalesce((v_result ->> 'replayed')::boolean, false) is not true
    or (v_result ->> 'outreachDebited')::integer <> 0
    or (select count(*) from public.pursuit_outreach_generation_requests) <> v_requests
    or (select count(*) from public.outreach_messages) <> v_messages
    or (select count(*) from public.pursuit_events) <> v_events
  then
    raise exception 'idempotent replay changed state: %', v_result;
  end if;
end;
$$;

-- A pursuit without the Apply Wizard latch cannot create a request, message,
-- event, or legacy debit.
do $$
declare
  v_error text;
  v_requests integer;
  v_messages integer;
  v_events integer;
  v_ledger integer;
begin
  select count(*) into v_requests from public.pursuit_outreach_generation_requests;
  select count(*) into v_messages from public.outreach_messages;
  select count(*) into v_events from public.pursuit_events;
  select count(*) into v_ledger from public.usage_ledger;

  begin
    perform public.persist_initial_outreach_generation(
      '40000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000001',
      '[{"message":"Blocked.","recipient_type":"no_contact","channel":"other"}]'::jsonb,
      'unlatched-request'
    );
    raise exception 'unlatched outreach should have failed';
  exception
    when check_violation then
      get stacked diagnostics v_error = message_text;
      if v_error <> 'apply_wizard_latch_required_for_outreach' then
        raise;
      end if;
  end;

  if (select count(*) from public.pursuit_outreach_generation_requests) <> v_requests
    or (select count(*) from public.outreach_messages) <> v_messages
    or (select count(*) from public.pursuit_events) <> v_events
    or (select count(*) from public.usage_ledger) <> v_ledger
  then
    raise exception 'unlatched outreach wrote partial state';
  end if;
end;
$$;

-- Apply Wizard still enforces the retail limit, while retired pursuit and
-- outreach_message types no longer consult their legacy zero limits.
do $$
declare
  v_error text;
begin
  begin
    insert into public.usage_ledger (
      user_id,
      usage_type,
      quantity,
      related_job_id,
      related_pursuit_id,
      created_at
    ) values (
      '20000000-0000-0000-0000-000000000001',
      'apply_wizard',
      1,
      '30000000-0000-0000-0000-000000000002',
      '40000000-0000-0000-0000-000000000002',
      '2026-07-16T12:00:00Z'
    );
    raise exception 'second Apply Wizard use should have reached the limit';
  exception
    when raise_exception then
      get stacked diagnostics v_error = message_text;
      if v_error <> 'apply_wizard_limit_reached:1:1' then
        raise;
      end if;
  end;

  insert into public.usage_ledger (
    user_id,
    usage_type,
    quantity,
    related_job_id,
    related_pursuit_id,
    created_at
  ) values
    (
      '20000000-0000-0000-0000-000000000001',
      'pursuit',
      5,
      '30000000-0000-0000-0000-000000000002',
      '40000000-0000-0000-0000-000000000002',
      '2026-07-16T12:00:00Z'
    ),
    (
      '20000000-0000-0000-0000-000000000001',
      'outreach_message',
      5,
      '30000000-0000-0000-0000-000000000002',
      '40000000-0000-0000-0000-000000000002',
      '2026-07-16T12:00:00Z'
    );
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'persist_initial_outreach_generation'
      and grantee = 'PUBLIC'
      and privilege_type = 'EXECUTE'
  )
    or has_function_privilege('anon', 'public.persist_initial_outreach_generation(uuid,uuid,jsonb,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.persist_initial_outreach_generation(uuid,uuid,jsonb,text)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.persist_initial_outreach_generation(uuid,uuid,jsonb,text)', 'EXECUTE')
  then
    raise exception 'outreach RPC execution privileges are unsafe';
  end if;
end;
$$;
SQL

"${PSQL[@]}" -f "$POSTFLIGHT" >/dev/null

echo "outreach metering removal migration tests passed"
