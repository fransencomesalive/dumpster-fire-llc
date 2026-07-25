#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d "/tmp/refinement-backoff.XXXXXX")"
PG_DATA="$TEST_ROOT/data"
PG_SOCKET="$TEST_ROOT/socket"
PG_PORT="${REFINEMENT_BACKOFF_TEST_PORT:-55492}"
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
if ! "$PG_BIN/pg_ctl" -D "$PG_DATA" -l "$PG_LOG" -o "-p $PG_PORT -k $PG_SOCKET" start >/dev/null; then
  cat "$PG_LOG"
  exit 1
fi

PSQL=("$PG_BIN/psql" -X -q -v ON_ERROR_STOP=1 -h "$PG_SOCKET" -p "$PG_PORT" -U postgres -d postgres)

"${PSQL[@]}" -c "
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create table public.jobs (
    id uuid primary key,
    owner_user_id uuid references auth.users(id),
    title text not null,
    company_name text not null,
    description text not null default '',
    responsibilities text[] not null default '{}',
    required_experience text[] not null default '{}',
    scraped_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
" >/dev/null

MIGRATION="$REPO_ROOT/supabase/migrations/20260724000400_posting_refinement_backoff.sql"
"${PSQL[@]}" -f "$MIGRATION" >/dev/null
"${PSQL[@]}" -f "$MIGRATION" >/dev/null

"${PSQL[@]}" -c "
  insert into auth.users (id) values ('00000000-0000-0000-0000-000000000001');
  insert into public.jobs (
    id, owner_user_id, title, company_name, description,
    responsibilities, required_experience, scraped_at
  ) values
    (
      '00000000-0000-0000-0000-000000000011',
      null, 'Shared incomplete', 'Example', 'Description',
      '{}', '{}', '2026-07-24T11:00:00Z'
    ),
    (
      '00000000-0000-0000-0000-000000000012',
      '00000000-0000-0000-0000-000000000001',
      'Private incomplete', 'Example', 'Description',
      '{}', '{}', '2026-07-24T12:00:00Z'
    ),
    (
      '00000000-0000-0000-0000-000000000013',
      null, 'Shared complete', 'Example', 'Description',
      array['Responsibility'], array['Requirement'], '2026-07-24T13:00:00Z'
    );
" >/dev/null

CLAIM="$("${PSQL[@]}" -At -F '|' -c "
  select id, attempt_token, attempt_content_hash, attempt_count
  from public.claim_posting_refinement('2026-07-24T14:00:00Z');
")"
IFS='|' read -r CLAIM_ID CLAIM_TOKEN CLAIM_HASH CLAIM_COUNT <<< "$CLAIM"
if [[ "$CLAIM_ID" != "00000000-0000-0000-0000-000000000011" || "$CLAIM_COUNT" != "1" ]]; then
  echo "Unexpected refinement claim: $CLAIM"
  exit 1
fi

PARTIAL="$("${PSQL[@]}" -At -F '|' -c "
  select applied, refinement_state, refinement_outcome
  from public.finish_posting_refinement(
    '$CLAIM_ID', '$CLAIM_TOKEN', '$CLAIM_HASH', 'partial',
    array['Filled responsibility'], '{}', '2026-07-24T14:01:00Z'
  );
")"
if [[ "$PARTIAL" != "t|partial|partial" ]]; then
  echo "Unexpected partial finish: $PARTIAL"
  exit 1
fi

"${PSQL[@]}" -c "
  insert into public.jobs (
    id, title, company_name, description, responsibilities, required_experience
  ) values (
    '00000000-0000-0000-0000-000000000014',
    'Retry job', 'Example', 'Description', '{}', '{}'
  );
" >/dev/null

for AT in \
  "2026-07-24T15:00:00Z" \
  "2026-07-24T15:16:00Z" \
  "2026-07-24T15:47:00Z"; do
  CLAIM="$("${PSQL[@]}" -At -F '|' -c "
    select id, attempt_token, attempt_content_hash
    from public.claim_posting_refinement('$AT');
  ")"
  IFS='|' read -r CLAIM_ID CLAIM_TOKEN CLAIM_HASH <<< "$CLAIM"
  FINISH="$("${PSQL[@]}" -At -F '|' -c "
    select applied, refinement_state
    from public.finish_posting_refinement(
      '$CLAIM_ID', '$CLAIM_TOKEN', '$CLAIM_HASH', 'no_fill',
      '{}', '{}', '$AT'::timestamptz + interval '1 minute'
    );
  ")"
done
if [[ "$FINISH" != "t|exhausted" ]]; then
  echo "Expected third genuine no-fill to exhaust: $FINISH"
  exit 1
fi

"${PSQL[@]}" -c "
  insert into public.jobs (
    id, title, company_name, description, responsibilities, required_experience
  ) values (
    '00000000-0000-0000-0000-000000000015',
    'Unavailable job', 'Example', 'Description', '{}', '{}'
  );
" >/dev/null
CLAIM="$("${PSQL[@]}" -At -F '|' -c "
  select id, attempt_token, attempt_content_hash
  from public.claim_posting_refinement('2026-07-24T16:00:00Z');
")"
IFS='|' read -r CLAIM_ID CLAIM_TOKEN CLAIM_HASH <<< "$CLAIM"
"${PSQL[@]}" -c "
  select * from public.finish_posting_refinement(
    '$CLAIM_ID', '$CLAIM_TOKEN', '$CLAIM_HASH', 'unavailable',
    '{}', '{}', '2026-07-24T16:01:00Z'
  );
" >/dev/null

BEFORE_REAPPLY="$("${PSQL[@]}" -At -F '|' -c "
  select refinement_state, refinement_attempt_count, refinement_no_fill_count
  from public.jobs where id = '$CLAIM_ID';
")"
"${PSQL[@]}" -f "$MIGRATION" >/dev/null
AFTER_REAPPLY="$("${PSQL[@]}" -At -F '|' -c "
  select refinement_state, refinement_attempt_count, refinement_no_fill_count
  from public.jobs where id = '$CLAIM_ID';
")"
if [[ "$BEFORE_REAPPLY" != "retryable|1|0" || "$AFTER_REAPPLY" != "$BEFORE_REAPPLY" ]]; then
  echo "Migration reapply changed retry state: $BEFORE_REAPPLY -> $AFTER_REAPPLY"
  exit 1
fi

STALE_CLAIM="$("${PSQL[@]}" -At -F '|' -c "
  update public.jobs
  set refinement_next_eligible_at = '2026-07-24T17:00:00Z'
  where id = '$CLAIM_ID';
  select id, attempt_token, attempt_content_hash
  from public.claim_posting_refinement('2026-07-24T17:00:00Z');
")"
IFS='|' read -r STALE_ID STALE_TOKEN STALE_HASH <<< "$STALE_CLAIM"
"${PSQL[@]}" -c "
  update public.jobs set description = 'Changed description' where id = '$STALE_ID';
" >/dev/null
STALE_FINISH="$("${PSQL[@]}" -At -F '|' -c "
  select applied
  from public.finish_posting_refinement(
    '$STALE_ID', '$STALE_TOKEN', '$STALE_HASH', 'complete',
    array['Old result'], array['Old requirement'], '2026-07-24T17:01:00Z'
  );
")"
if [[ "$STALE_FINISH" != "f" ]]; then
  echo "Expected stale content-hash finish to be rejected"
  exit 1
fi

SECURITY="$("${PSQL[@]}" -At -F '|' -c "
  select
    has_function_privilege('anon', 'public.claim_posting_refinement(timestamptz,interval)', 'execute'),
    has_function_privilege('authenticated', 'public.finish_posting_refinement(uuid,uuid,text,text,text[],text[],timestamptz)', 'execute'),
    has_function_privilege('service_role', 'public.claim_posting_refinement(timestamptz,interval)', 'execute');
")"
if [[ "$SECURITY" != "f|f|t" ]]; then
  echo "Unexpected refinement RPC security posture: $SECURITY"
  exit 1
fi

echo "posting refinement backoff migration: passed"
