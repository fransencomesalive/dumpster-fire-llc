#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d "/tmp/provider-usage.XXXXXX")"
PG_DATA="$TEST_ROOT/data"
PG_SOCKET="$TEST_ROOT/socket"
PG_PORT="${PROVIDER_USAGE_TEST_PORT:-55490}"
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
  create table public.jobs (id uuid primary key);
  create table public.pursuits (id uuid primary key);
" >/dev/null

"${PSQL[@]}" -f "$REPO_ROOT/supabase/migrations/20260724000200_provider_usage_events.sql" >/dev/null
"${PSQL[@]}" -f "$REPO_ROOT/supabase/migrations/20260724000200_provider_usage_events.sql" >/dev/null

"${PSQL[@]}" -c "
  insert into auth.users (id) values ('00000000-0000-0000-0000-000000000001');
  insert into public.pursuits (id) values ('00000000-0000-0000-0000-000000000002');
  insert into public.jobs (id) values ('00000000-0000-0000-0000-000000000003');

  insert into public.provider_usage_events (
    user_id,
    pursuit_id,
    job_id,
    provider_category,
    operation,
    model_version,
    request_count,
    input_tokens,
    output_tokens,
    cache_write_tokens,
    cache_read_tokens,
    result_count,
    duration_ms,
    outcome,
    estimated_cost_micros,
    rate_card_version,
    request_correlation_id
  ) values (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000003',
    'anthropic',
    'outreach_generation',
    'claude-opus-4-8',
    2,
    4000,
    900,
    250,
    1500,
    1,
    1250,
    'success',
    18750,
    'anthropic-2026-07-24',
    'outreach:user-1:pursuit-1:request-1'
  );
" >/dev/null

ROW="$("${PSQL[@]}" -At -F '|' -c "
  select provider_category, request_count, input_tokens, outcome, estimated_cost_micros
  from public.provider_usage_events;
")"
if [[ "$ROW" != "anthropic|2|4000|success|18750" ]]; then
  echo "Unexpected provider usage row: $ROW"
  exit 1
fi

SECURITY="$("${PSQL[@]}" -At -F '|' -c "
  select
    relrowsecurity,
    has_table_privilege('anon', 'public.provider_usage_events', 'select'),
    has_table_privilege('authenticated', 'public.provider_usage_events', 'insert'),
    has_table_privilege('service_role', 'public.provider_usage_events', 'select'),
    has_table_privilege('service_role', 'public.provider_usage_events', 'insert')
  from pg_class
  where oid = 'public.provider_usage_events'::regclass;
")"
if [[ "$SECURITY" != "t|f|f|t|t" ]]; then
  echo "Unexpected provider usage security posture: $SECURITY"
  exit 1
fi

FORBIDDEN_COLUMNS="$("${PSQL[@]}" -At -c "
  select count(*)
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'provider_usage_events'
    and column_name in (
      'raw_prompt',
      'resume_text',
      'generated_message',
      'contact_results',
      'provider_response',
      'exa_highlights'
    );
")"
if [[ "$FORBIDDEN_COLUMNS" != "0" ]]; then
  echo "Provider usage table contains forbidden content columns"
  exit 1
fi

if "${PSQL[@]}" -c "
  insert into public.provider_usage_events (
    provider_category, operation, model_version,
    outcome, estimated_cost_micros, rate_card_version
  ) values ('openai', 'unused_model', 'none', 'success', 0, 'none');
" >/dev/null 2>&1; then
  echo "Expected provider_category constraint to reject unsupported values"
  exit 1
fi

if "${PSQL[@]}" -c "
  insert into public.provider_usage_events (
    provider_category, operation, model_version, request_count,
    outcome, estimated_cost_micros, rate_card_version
  ) values ('exa', 'people_search', 'people-search-v1', 0, 'empty', 2000, 'exa-2026-07-24');
" >/dev/null 2>&1; then
  echo "Expected request_count constraint to reject zero"
  exit 1
fi

if "${PSQL[@]}" -c "
  insert into public.provider_usage_events (
    provider_category, operation, model_version,
    outcome, estimated_cost_micros, rate_card_version
  ) values ('exa', 'people_search', 'people-search-v1', 'unknown', 2000, 'exa-2026-07-24');
" >/dev/null 2>&1; then
  echo "Expected outcome constraint to reject unsupported values"
  exit 1
fi

if "${PSQL[@]}" -c "
  insert into public.provider_usage_events (
    provider_category, operation, model_version,
    outcome, estimated_cost_micros, rate_card_version
  ) values ('exa', 'people_search', 'people-search-v1', 'failure', -1, 'exa-2026-07-24');
" >/dev/null 2>&1; then
  echo "Expected estimated_cost_micros constraint to reject negative values"
  exit 1
fi

"${PSQL[@]}" -c "
  delete from auth.users where id = '00000000-0000-0000-0000-000000000001';
  delete from public.pursuits where id = '00000000-0000-0000-0000-000000000002';
  delete from public.jobs where id = '00000000-0000-0000-0000-000000000003';
" >/dev/null

RETAINED="$("${PSQL[@]}" -At -F '|' -c "
  select count(*), count(user_id), count(pursuit_id), count(job_id)
  from public.provider_usage_events;
")"
if [[ "$RETAINED" != "1|0|0|0" ]]; then
  echo "Expected de-identified provider usage row to survive related-record deletion: $RETAINED"
  exit 1
fi

echo "provider usage migration: passed"
