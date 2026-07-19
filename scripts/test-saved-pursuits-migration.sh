#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/saved-pursuits-migration.XXXXXX")"
PG_DATA="$TEST_ROOT/data"
PG_SOCKET="$TEST_ROOT/socket"
PG_PORT="${SAVED_PURSUITS_TEST_PORT:-55483}"
PG_LOG="$TEST_ROOT/postgres.log"
PG_BIN="$(pg_config --bindir)"
INITDB="$PG_BIN/initdb"
PG_CTL="$PG_BIN/pg_ctl"
PSQL_BIN="$PG_BIN/psql"

cleanup() {
  if [[ -d "$PG_DATA" ]]; then
    "$PG_CTL" -D "$PG_DATA" -m fast stop >/dev/null 2>&1 || true
  fi
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

mkdir -p "$PG_SOCKET"
"$INITDB" -D "$PG_DATA" --auth=trust --username=postgres >/dev/null
"$PG_CTL" -D "$PG_DATA" -l "$PG_LOG" -o "-p $PG_PORT -k $PG_SOCKET" start >/dev/null

PSQL=("$PSQL_BIN" -X -q -v ON_ERROR_STOP=1 -h "$PG_SOCKET" -p "$PG_PORT" -U postgres -d postgres)

"${PSQL[@]}" >/dev/null <<'SQL'
create extension if not exists pgcrypto;
create schema auth;
create schema supabase_migrations;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

create table supabase_migrations.schema_migrations (
  version text primary key,
  name text not null
);

create table auth.users (
  id uuid primary key
);

create table public.candidate_profiles (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade
);

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  price_monthly integer not null default 0,
  unlimited_search boolean not null default true,
  profile_export boolean not null default false,
  pursuit_limit_monthly integer,
  outreach_limit_monthly integer,
  human_path_limit_monthly integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key,
  source text not null,
  source_url text not null,
  owner_user_id uuid references auth.users(id) on delete cascade,
  company_name text not null,
  title text not null,
  location text,
  remote_type text,
  employment_type text,
  compensation_text text,
  description text not null default '',
  responsibilities text[] not null default '{}',
  required_experience text[] not null default '{}',
  posted_at timestamptz,
  scraped_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.role_tracks (
  id uuid primary key,
  profile_id uuid not null references public.candidate_profiles(id) on delete cascade,
  name text not null,
  core_positioning text not null default ''
);

create table public.resumes (
  id uuid primary key,
  profile_id uuid not null references public.candidate_profiles(id) on delete cascade,
  name text not null
);

create table public.work_examples (
  id uuid primary key,
  profile_id uuid not null references public.candidate_profiles(id) on delete cascade,
  title text not null
);

create table public.pursuits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.candidate_profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  selected_role_track_id uuid references public.role_tracks(id) on delete set null,
  selected_resume_id uuid references public.resumes(id) on delete set null,
  selected_work_example_id uuid references public.work_examples(id) on delete set null,
  recommended_work_example_ids uuid[] not null default '{}',
  status text not null default 'saved',
  fit_summary text,
  risks text[] not null default '{}',
  outreach_angle text,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);

create table public.usage_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid references public.subscription_plans(id),
  usage_type text not null,
  quantity integer not null default 1 check (quantity > 0),
  related_job_id uuid references public.jobs(id) on delete set null,
  related_pursuit_id uuid references public.pursuits(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.saved_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid references public.candidate_profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);

create table public.job_scan_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.candidate_profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  status text not null default 'active',
  scan_context jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);

create table public.contact_suggestions (
  id uuid primary key default gen_random_uuid(),
  pursuit_id uuid not null references public.pursuits(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  name text not null,
  title text not null default '',
  company_name text not null default '',
  linkedin_url text,
  email text,
  contact_type text not null default 'unknown',
  confidence text not null default 'low',
  relevance_reason text not null default '',
  role_connection text not null default '',
  verification_notes text[] not null default '{}',
  selected_for_outreach boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  pursuit_id uuid not null references public.pursuits(id) on delete cascade,
  contact_suggestion_id uuid references public.contact_suggestions(id) on delete set null,
  channel text not null default 'other',
  recipient_type text not null,
  message text not null,
  selected_resume_id uuid references public.resumes(id) on delete set null,
  selected_role_track_id uuid references public.role_tracks(id) on delete set null,
  selected_work_example_id uuid references public.work_examples(id) on delete set null,
  status text not null default 'draft',
  rejection_reason text,
  previous_message text,
  regeneration_count smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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

alter table public.pursuits enable row level security;
alter table public.pursuit_events enable row level security;
create policy pursuits_owner on public.pursuits for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy pursuit_events_owner on public.pursuit_events for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant all on all tables in schema public to anon, authenticated, service_role;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003');

insert into public.candidate_profiles (id, user_id) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003');

insert into public.subscription_plans (
  id, name, pursuit_limit_monthly, outreach_limit_monthly, human_path_limit_monthly
) values
  ('20000000-0000-0000-0000-000000000001', 'tester', null, 50, 25),
  ('20000000-0000-0000-0000-000000000002', 'basic', null, 100, 50),
  ('20000000-0000-0000-0000-000000000003', 'pro', null, 500, 200),
  ('20000000-0000-0000-0000-000000000004', 'premium', null, null, null);

insert into public.user_subscriptions (
  user_id, plan_id, status, current_period_start, current_period_end
) values
  ('00000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', 'active', '2026-07-01', '2026-08-01'),
  ('00000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000004', 'active', '2026-07-01', '2026-08-01'),
  ('00000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000004', 'canceled', '2026-07-01', '2026-08-01');

insert into public.jobs (
  id, source, source_url, owner_user_id, company_name, title, location,
  description, responsibilities, required_experience, scraped_at
) values
  ('30000000-0000-0000-0000-000000000001', 'fixture', 'https://jobs.example/1', null, 'Acme', 'Director One', 'Denver', 'Lead one.', array['Lead'], array['Ten years'], '2026-07-01'),
  ('30000000-0000-0000-0000-000000000002', 'fixture', 'https://jobs.example/2', null, 'Acme', 'Director Two', 'Remote', 'Lead two.', array['Build'], array['Eight years'], '2026-07-02'),
  ('30000000-0000-0000-0000-000000000003', 'user_link', 'https://jobs.example/private', '00000000-0000-0000-0000-000000000002', 'Private', 'Private Role', null, 'Private.', '{}', '{}', '2026-07-03'),
  ('30000000-0000-0000-0000-000000000004', 'fixture', 'https://jobs.example/offer', null, 'Acme', 'Offer Role', null, 'Offer.', '{}', '{}', '2026-07-04'),
  ('30000000-0000-0000-0000-000000000005', 'fixture', 'https://jobs.example/new', null, 'Acme', 'New Role', null, 'New.', '{}', '{}', '2026-07-05'),
  ('30000000-0000-0000-0000-000000000006', 'fixture', 'https://jobs.example/u2a', null, 'Acme', 'U2 A', null, 'A.', '{}', '{}', '2026-07-06'),
  ('30000000-0000-0000-0000-000000000007', 'fixture', 'https://jobs.example/u2b', null, 'Acme', 'U2 B', null, 'B.', '{}', '{}', '2026-07-07');

insert into public.job_scan_results (user_id, profile_id, job_id, status, first_seen_at, last_seen_at) values
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'active', '2026-07-01', '2026-07-10'),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'expired', '2026-07-02', '2026-07-09'),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'active', '2026-07-03', '2026-07-08'),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000005', 'active', '2026-07-05', '2026-07-11'),
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000006', 'active', '2026-07-06', '2026-07-12'),
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000007', 'active', '2026-07-07', '2026-07-13');

insert into public.saved_jobs (user_id, profile_id, job_id, notes, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Legacy note.', '2026-07-01', '2026-07-11'),
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', null, '2026-07-02', '2026-07-09');

insert into public.pursuits (
  id, user_id, profile_id, job_id, status, last_activity_at, created_at, updated_at
) values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'responded', '2026-07-12', '2026-07-01', '2026-07-12'),
  ('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000005', 'rejected', '2026-07-13', '2026-07-05', '2026-07-13'),
  ('40000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004', 'offer', '2026-07-14', '2026-07-04', '2026-07-14'),
  ('40000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000006', 'saved', '2026-07-12', '2026-07-06', '2026-07-12'),
  ('40000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000007', 'saved', '2026-07-13', '2026-07-07', '2026-07-13');

insert into public.pursuit_events (
  id, pursuit_id, user_id, event_type, from_status, to_status, created_at
) values (
  '50000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'responded', 'applied', 'responded', '2026-07-12'
), (
  '50000000-0000-0000-0000-000000000004',
  '40000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000001',
  'offer', 'interviewing', 'offer', '2026-07-14'
);

insert into public.usage_ledger (
  user_id, usage_type, quantity, related_job_id, related_pursuit_id, created_at
) values (
  '00000000-0000-0000-0000-000000000001', 'pursuit', 1,
  '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '2026-07-01'
);
SQL

for migration in \
  20260718000100_saved_pursuits_foundation.sql \
  20260718000200_saved_pursuits_atomic_mutations.sql \
  20260718000300_saved_pursuits_data_readiness.sql
do
  "${PSQL[@]}" -f "$REPO_ROOT/supabase/migrations/$migration" >/dev/null
done

# Reapply the full Saved Pursuits chain to prove idempotence.
for migration in \
  20260718000100_saved_pursuits_foundation.sql \
  20260718000200_saved_pursuits_atomic_mutations.sql \
  20260718000300_saved_pursuits_data_readiness.sql
do
  "${PSQL[@]}" -f "$REPO_ROOT/supabase/migrations/$migration" >/dev/null
done

"${PSQL[@]}" -f "$REPO_ROOT/scripts/sql/saved-pursuits-production-preflight.sql" >/dev/null

"${PSQL[@]}" >/dev/null <<'SQL'
do $$
declare
  v_result jsonb;
  v_error text;
begin
  if (select count(*) from public.pursuits) <> 6 then
    raise exception 'saved_jobs conversion count failed';
  end if;

  if (select count(*) from public.pursuits where user_id = '00000000-0000-0000-0000-000000000001' and job_id = '30000000-0000-0000-0000-000000000002') <> 1 then
    raise exception 'missing canonical pursuit for saved job';
  end if;

  if (select notes from public.pursuits where id = '40000000-0000-0000-0000-000000000001') <> 'Legacy note.' then
    raise exception 'saved note was not preserved';
  end if;

  if (select job_snapshot ->> 'title' from public.pursuits where id = '40000000-0000-0000-0000-000000000001') <> 'Director One' then
    raise exception 'posting snapshot was not backfilled';
  end if;

  if not exists (
    select 1 from public.pursuit_tracking_events
    where pursuit_id = '40000000-0000-0000-0000-000000000001'
      and action = 'response_received'
      and occurred_at_known = true
  ) then
    raise exception 'known legacy event mapping failed';
  end if;

  if not exists (
    select 1 from public.pursuit_tracking_events
    where pursuit_id = '40000000-0000-0000-0000-000000000002'
      and action = 'not_moving_forward'
      and occurred_at_known = false
  ) then
    raise exception 'unknown scalar timestamp mapping failed';
  end if;

  if exists (
    select 1 from public.pursuit_tracking_events
    where pursuit_id = '40000000-0000-0000-0000-000000000004'
  ) then
    raise exception 'Offer must not map into new tracking';
  end if;

  if has_table_privilege('authenticated', 'public.pursuits', 'INSERT')
    or has_table_privilege('authenticated', 'public.pursuit_tracking_events', 'INSERT')
    or has_table_privilege('anon', 'public.pursuit_events', 'UPDATE')
  then
    raise exception 'client mutation grants were not revoked';
  end if;

  if has_function_privilege('authenticated', 'public.set_canonical_job_saved(uuid,uuid,uuid,boolean,jsonb,timestamptz)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.set_canonical_job_saved(uuid,uuid,uuid,boolean,jsonb,timestamptz)', 'EXECUTE')
  then
    raise exception 'canonical Save function grants are incorrect';
  end if;

  begin
    update public.pursuits
    set pursuit_metered_at = '2026-07-18'
    where id = '40000000-0000-0000-0000-000000000002';
    raise exception 'latch without ledger should have failed';
  exception when check_violation then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'pursuit_metered_latch_requires_ledger' then raise; end if;
  end;

  select public.set_canonical_job_saved(
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000005',
    true,
    '{"clientContext":"kept","title":"Caller override"}'::jsonb,
    '2026-07-18'
  ) into v_result;
  if v_result ->> 'status' <> 'saved' then raise exception 'canonical Save failed'; end if;
  if v_result #>> '{pursuit,job_snapshot,title}' <> 'New Role'
    or v_result #>> '{pursuit,job_snapshot,clientContext}' <> 'kept'
  then
    raise exception 'trusted snapshot merge failed';
  end if;

  select public.set_canonical_job_saved(
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000005',
    false,
    null,
    '2026-07-18'
  ) into v_result;
  if v_result ->> 'status' <> 'unsaved' then raise exception 'canonical Unsave failed'; end if;
  if not exists (select 1 from public.pursuits where job_id = '30000000-0000-0000-0000-000000000005') then
    raise exception 'Unsave deleted canonical pursuit';
  end if;

  select public.set_canonical_job_saved(
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000002',
    false,
    null,
    '2026-07-18'
  ) into v_result;
  if v_result ->> 'status' <> 'unsaved' then raise exception 'inactive Unsave failed'; end if;
  if not exists (select 1 from public.pursuits where job_id = '30000000-0000-0000-0000-000000000002') then
    raise exception 'inactive Unsave deleted canonical pursuit';
  end if;

  begin
    perform public.set_canonical_job_saved(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000002',
      true,
      '{}'::jsonb,
      '2026-07-18'
    );
    raise exception 'inactive Save should have failed';
  exception when no_data_found then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'owned active scan result not found' then raise; end if;
  end;

  begin
    perform public.set_canonical_job_saved(
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000003',
      true,
      '{}'::jsonb,
      '2026-07-18'
    );
    raise exception 'foreign private job should have failed';
  exception when no_data_found then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'owned job not found' then raise; end if;
  end;
end $$;

-- A matching ledger row drives the latch; direct latch mutation cannot bypass it.
insert into public.usage_ledger (
  user_id, usage_type, quantity, related_job_id, related_pursuit_id, created_at
) values (
  '00000000-0000-0000-0000-000000000001', 'pursuit', 1,
  '30000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000002', '2026-07-18'
);

do $$
declare
  v_error text;
begin
  if (select pursuit_metered_at from public.pursuits where id = '40000000-0000-0000-0000-000000000002') <> '2026-07-18'::timestamptz then
    raise exception 'ledger did not synchronize pursuit latch';
  end if;

  begin
    insert into public.usage_ledger (
      user_id, usage_type, quantity, related_job_id, related_pursuit_id, created_at
    ) values (
      '00000000-0000-0000-0000-000000000001', 'pursuit', 1,
      '30000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000002', '2026-07-18'
    );
    raise exception 'duplicate pursuit debit should have failed';
  exception when unique_violation then
    null;
  end;

  begin
    insert into public.usage_ledger (
      user_id, usage_type, quantity, created_at
    ) values (
      '00000000-0000-0000-0000-000000000003', 'outreach_message', 1, '2026-07-18'
    );
    raise exception 'inactive subscription should have failed';
  exception when raise_exception then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'subscription_inactive:canceled' then raise; end if;
  end;
end $$;

-- Transactional quota plus replay-before-quota behavior.
update public.subscription_plans
set pursuit_limit_monthly = 1, outreach_limit_monthly = 1
where name = 'premium';

select public.persist_initial_outreach_generation(
  '40000000-0000-0000-0000-000000000006',
  '00000000-0000-0000-0000-000000000002',
  '[{"message":"Hello.","recipient_type":"no_contact","channel":"other"}]'::jsonb,
  'quota-success-replay'
);

update public.subscription_plans
set pursuit_limit_monthly = 0, outreach_limit_monthly = 0
where name = 'premium';

do $$
declare
  v_result jsonb;
  v_error text;
begin
  select public.persist_initial_outreach_generation(
    '40000000-0000-0000-0000-000000000006',
    '00000000-0000-0000-0000-000000000002',
    '[{"message":"Hello.","recipient_type":"no_contact","channel":"other"}]'::jsonb,
    'quota-success-replay'
  ) into v_result;
  if coalesce((v_result ->> 'replayed')::boolean, false) is not true then
    raise exception 'idempotent replay did not precede quota';
  end if;

  begin
    perform public.persist_initial_outreach_generation(
      '40000000-0000-0000-0000-000000000007',
      '00000000-0000-0000-0000-000000000002',
      '[{"message":"Second.","recipient_type":"no_contact","channel":"other"}]'::jsonb,
      'quota-pursuit-failure'
    );
    raise exception 'pursuit quota should have failed';
  exception when raise_exception then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'pursuit_limit_reached:1:0' then raise; end if;
  end;

  if exists (
    select 1 from public.pursuit_outreach_generation_requests
    where pursuit_id = '40000000-0000-0000-0000-000000000007'
  ) then
    raise exception 'quota rejection did not roll back request persistence';
  end if;
end $$;

update public.subscription_plans
set pursuit_limit_monthly = null, outreach_limit_monthly = 0
where name = 'premium';

do $$
declare
  v_error text;
begin
  begin
    perform public.persist_initial_outreach_generation(
      '40000000-0000-0000-0000-000000000007',
      '00000000-0000-0000-0000-000000000002',
      '[{"message":"Second.","recipient_type":"no_contact","channel":"other"}]'::jsonb,
      'quota-outreach-failure'
    );
    raise exception 'outreach quota should have failed';
  exception when raise_exception then
    get stacked diagnostics v_error = message_text;
    if v_error <> 'outreach_message_limit_reached:1:0' then raise; end if;
  end;

  if exists (
    select 1 from public.usage_ledger
    where related_pursuit_id = '40000000-0000-0000-0000-000000000007'
  ) then
    raise exception 'outreach quota rejection did not roll back pursuit debit';
  end if;
end $$;

do $$
declare
  v_profile uuid := gen_random_uuid();
  v_job uuid := gen_random_uuid();
  v_pursuit uuid := gen_random_uuid();
begin
  insert into public.candidate_profiles (id, user_id)
  values (v_profile, '00000000-0000-0000-0000-000000000003');
  insert into public.jobs (id, source, source_url, company_name, title)
  values (v_job, 'fixture', 'https://jobs.example/fk', 'FK', 'FK');
  insert into public.pursuits (id, user_id, profile_id, job_id, status)
  values (v_pursuit, '00000000-0000-0000-0000-000000000003', v_profile, v_job, 'saved');

  delete from public.candidate_profiles where id = v_profile;
  if (select profile_id from public.pursuits where id = v_pursuit) is not null then
    raise exception 'profile FK did not SET NULL';
  end if;

  delete from public.jobs where id = v_job;
  if (select job_id from public.pursuits where id = v_pursuit) is not null then
    raise exception 'job FK did not SET NULL';
  end if;
end $$;
SQL

echo "Saved Pursuits migration verification passed."
