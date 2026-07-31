#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d "/tmp/subscription-qa-cleanup.XXXXXX")"
PG_DATA="$TEST_ROOT/data"
PG_SOCKET="$TEST_ROOT/socket"
PG_PORT="${SUBSCRIPTION_QA_CLEANUP_TEST_PORT:-55498}"
PG_LOG="$TEST_ROOT/postgres.log"
PG_BIN="$(pg_config --bindir)"
MIGRATION="$REPO_ROOT/supabase/migrations/20260730000300_subscription_qa_provider_cleanup.sql"
ACL_MIGRATION="$REPO_ROOT/supabase/migrations/20260730000400_provider_usage_service_role_acl.sql"

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

fail() {
  echo "subscription QA cleanup migration: FAILED - $1" >&2
  exit 1
}

"${PSQL[@]}" >/dev/null <<'SQL'
create schema auth;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create table auth.users (
  id uuid primary key,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

create table public.provider_usage_events (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete set null
);

revoke all on table public.provider_usage_events from public, anon, authenticated;
grant all on table public.provider_usage_events to service_role;
SQL

"${PSQL[@]}" -f "$MIGRATION" >/dev/null
"${PSQL[@]}" -f "$MIGRATION" >/dev/null
"${PSQL[@]}" -f "$ACL_MIGRATION" >/dev/null
"${PSQL[@]}" -f "$ACL_MIGRATION" >/dev/null

QA_USER="00000000-0000-0000-0000-000000000001"
REAL_USER="00000000-0000-0000-0000-000000000002"

"${PSQL[@]}" -c "
  insert into auth.users (id, raw_user_meta_data) values
    ('$QA_USER', '{\"qa_scope\":\"subscription_flag_on\"}'),
    ('$REAL_USER', '{\"qa_scope\":\"customer\"}');
  insert into public.provider_usage_events (id, user_id) values
    ('10000000-0000-0000-0000-000000000001', '$QA_USER'),
    ('10000000-0000-0000-0000-000000000002', '$REAL_USER');
" >/dev/null

SERVICE_EXECUTE="$("${PSQL[@]}" -At -c "
  select has_function_privilege(
    'service_role',
    'public.delete_subscription_qa_provider_usage_events(uuid)',
    'EXECUTE'
  );")"
[[ "$SERVICE_EXECUTE" == "t" ]] || fail "service_role cannot execute the cleanup function"

ANON_EXECUTE="$("${PSQL[@]}" -At -c "
  select has_function_privilege(
    'anon',
    'public.delete_subscription_qa_provider_usage_events(uuid)',
    'EXECUTE'
  );")"
[[ "$ANON_EXECUTE" == "f" ]] || fail "anon can execute the cleanup function"

AUTH_EXECUTE="$("${PSQL[@]}" -At -c "
  select has_function_privilege(
    'authenticated',
    'public.delete_subscription_qa_provider_usage_events(uuid)',
    'EXECUTE'
  );")"
[[ "$AUTH_EXECUTE" == "f" ]] || fail "authenticated can execute the cleanup function"

TABLE_DELETE="$("${PSQL[@]}" -At -c "
  select has_table_privilege('service_role', 'public.provider_usage_events', 'DELETE');")"
[[ "$TABLE_DELETE" == "f" ]] || fail "service_role received broad provider telemetry deletion"

TABLE_UPDATE="$("${PSQL[@]}" -At -c "
  select has_table_privilege('service_role', 'public.provider_usage_events', 'UPDATE');")"
[[ "$TABLE_UPDATE" == "f" ]] || fail "service_role retained provider telemetry updates"

TABLE_TRUNCATE="$("${PSQL[@]}" -At -c "
  select has_table_privilege('service_role', 'public.provider_usage_events', 'TRUNCATE');")"
[[ "$TABLE_TRUNCATE" == "f" ]] || fail "service_role retained provider telemetry truncation"

TABLE_SELECT="$("${PSQL[@]}" -At -c "
  select has_table_privilege('service_role', 'public.provider_usage_events', 'SELECT');")"
[[ "$TABLE_SELECT" == "t" ]] || fail "service_role lost provider telemetry reads"

TABLE_INSERT="$("${PSQL[@]}" -At -c "
  select has_table_privilege('service_role', 'public.provider_usage_events', 'INSERT');")"
[[ "$TABLE_INSERT" == "t" ]] || fail "service_role lost provider telemetry writes"

DELETED="$("${PSQL[@]}" -At -c "
  set role service_role;
  select public.delete_subscription_qa_provider_usage_events('$QA_USER');")"
[[ "$DELETED" == "1" ]] || fail "expected one disposable QA event deletion, got '$DELETED'"

QA_REMAINING="$("${PSQL[@]}" -At -c "
  select count(*) from public.provider_usage_events where user_id = '$QA_USER';")"
[[ "$QA_REMAINING" == "0" ]] || fail "disposable QA telemetry remained"

REAL_REMAINING="$("${PSQL[@]}" -At -c "
  select count(*) from public.provider_usage_events where user_id = '$REAL_USER';")"
[[ "$REAL_REMAINING" == "1" ]] || fail "non-QA telemetry was deleted"

NON_QA_ERROR="$("${PSQL[@]}" -At -c "
  set role service_role;
  select public.delete_subscription_qa_provider_usage_events('$REAL_USER');" 2>&1 || true)"
case "$NON_QA_ERROR" in
  *subscription_qa_scope_required*) : ;;
  *) fail "non-QA cleanup was not rejected: $NON_QA_ERROR" ;;
esac

echo "subscription QA cleanup migration: passed"
