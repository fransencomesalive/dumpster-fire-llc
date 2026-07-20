#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/feedback-migration.XXXXXX")"
PG_DATA="$TEST_ROOT/data"
PG_SOCKET="$TEST_ROOT/socket"
PG_PORT="${FEEDBACK_TEST_PORT:-55484}"
PG_LOG="$TEST_ROOT/postgres.log"
PG_BIN="$(pg_config --bindir)"

cleanup() {
  if [[ -d "$PG_DATA" ]]; then
    "$PG_BIN/pg_ctl" -D "$PG_DATA" -m fast stop >/dev/null 2>&1 || true
  fi
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

mkdir -p "$PG_SOCKET"
"$PG_BIN/initdb" -D "$PG_DATA" --auth=trust --username=postgres >/dev/null
"$PG_BIN/pg_ctl" -D "$PG_DATA" -l "$PG_LOG" -o "-p $PG_PORT -k $PG_SOCKET" start >/dev/null

PSQL=("$PG_BIN/psql" -X -q -v ON_ERROR_STOP=1 -h "$PG_SOCKET" -p "$PG_PORT" -U postgres -d postgres)

"${PSQL[@]}" >/dev/null <<'SQL'
create extension if not exists pgcrypto;
create schema auth;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table public.candidate_profiles (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade
);

create table public.jobs (id uuid primary key);

create table public.pursuits (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade
);

create table public.outreach_messages (
  id uuid primary key,
  pursuit_id uuid not null references public.pursuits(id) on delete cascade
);

create table public.saved_message_feedback (
  id uuid primary key default gen_random_uuid(),
  outreach_message_id uuid not null references public.outreach_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  feedback_type text not null check (feedback_type in ('approved', 'edited', 'rejected')),
  edited_message text,
  rejection_reason text,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.candidate_profiles enable row level security;
alter table public.pursuits enable row level security;
alter table public.outreach_messages enable row level security;
alter table public.saved_message_feedback enable row level security;

create policy candidate_profiles_owner on public.candidate_profiles for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy pursuits_owner on public.pursuits for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy outreach_messages_owner on public.outreach_messages for all
  using (exists (
    select 1 from public.pursuits
    where pursuits.id = outreach_messages.pursuit_id
      and pursuits.user_id = auth.uid()
  ));
create policy saved_message_feedback_owner on public.saved_message_feedback for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant usage on schema public, auth to authenticated;
grant usage on schema public, auth to service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
SQL

"${PSQL[@]}" -f "$REPO_ROOT/supabase/migrations/20260719000100_feedback_capture.sql" >/dev/null

"${PSQL[@]}" >/dev/null <<'SQL'
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002');

insert into public.candidate_profiles (id, user_id) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002');

insert into public.jobs (id) values
  ('20000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002');

insert into public.pursuits (id, user_id) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002');

insert into public.outreach_messages (id, pursuit_id) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002');

insert into public.job_match_feedback (
  user_id, profile_id, job_id, reason_codes, match_score, match_label,
  matcher_version, match_evaluated_at, profile_version
) values (
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  array['wrong_role_title', 'wrong_comp'],
  72,
  'Potential Match',
  'public-match-v1',
  '2026-07-19',
  1
);

insert into public.saved_message_feedback (
  outreach_message_id, user_id, feedback_type, reason_codes,
  message_snapshot, message_revision, notes
) values (
  '40000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'needs_work',
  array['personal_voice_mismatch', 'would_not_send'],
  'Draft one.',
  0,
  'Not how I talk.'
);

do $$
begin
  begin
    insert into public.job_match_feedback (
      user_id, profile_id, job_id, reason_codes, match_score, match_label,
      matcher_version, match_evaluated_at, profile_version
    ) values (
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000002',
      array['unsupported'], 50, 'Weak Match', 'public-match-v1', '2026-07-19', 1
    );
    raise exception 'unsupported job feedback code should fail';
  exception when check_violation then null;
  end;

  begin
    insert into public.saved_message_feedback (
      outreach_message_id, user_id, feedback_type, reason_codes,
      message_snapshot, message_revision
    ) values (
      '40000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000002',
      'needs_work', '{}', 'Draft two.', 0
    );
    raise exception 'empty message feedback should fail';
  exception when check_violation then null;
  end;

  begin
    insert into public.saved_message_feedback (
      outreach_message_id, user_id, feedback_type, reason_codes,
      message_snapshot, message_revision
    ) values (
      '40000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000002',
      'needs_work', array['other'], null, 0
    );
    raise exception 'message feedback without its draft snapshot should fail';
  exception when check_violation then null;
  end;

  begin
    insert into public.saved_message_feedback (
      outreach_message_id, user_id, feedback_type, reason_codes,
      message_snapshot, message_revision
    ) values (
      '40000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000001',
      'needs_work', array['awkward_to_read'], 'Draft one.', 0
    );
    raise exception 'duplicate message revision should fail';
  exception when unique_violation then null;
  end;
end $$;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

do $$
begin
  if (select count(*) from public.job_match_feedback) <> 1 then
    raise exception 'job feedback RLS isolation failed';
  end if;

  if (select count(*) from public.saved_message_feedback) <> 1 then
    raise exception 'message feedback RLS isolation failed';
  end if;

  begin
    insert into public.job_match_feedback (
      user_id, profile_id, job_id, reason_codes, match_score, match_label,
      matcher_version, match_evaluated_at, profile_version
    ) values (
      '00000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000002',
      array['other'], 50, 'Weak Match', 'public-match-v1', '2026-07-19', 1
    );
    raise exception 'authenticated job feedback writes should be denied';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.saved_message_feedback (
      outreach_message_id, user_id, feedback_type, reason_codes,
      message_snapshot, message_revision
    ) values (
      '40000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000001',
      'needs_work', array['other'], 'Foreign draft.', 1
    );
    raise exception 'authenticated message feedback writes should be denied';
  exception when insufficient_privilege then null;
  end;
end $$;
SQL

echo "feedback migration tests passed"
