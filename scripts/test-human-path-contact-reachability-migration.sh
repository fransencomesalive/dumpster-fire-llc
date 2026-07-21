#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d "/tmp/hp-reach.XXXXXX")"
PG_DATA="$TEST_ROOT/data"
PG_SOCKET="$TEST_ROOT/socket"
PG_PORT="${CONTACT_REACHABILITY_TEST_PORT:-55485}"
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

"${PSQL[@]}" -c "create table public.contact_suggestions (id uuid primary key, linkedin_url text, email text);" >/dev/null
"${PSQL[@]}" -f "$REPO_ROOT/supabase/migrations/20260720000100_human_path_contact_reachability.sql" >/dev/null
"${PSQL[@]}" -f "$REPO_ROOT/supabase/migrations/20260720000100_human_path_contact_reachability.sql" >/dev/null

COLUMN_COUNT="$("${PSQL[@]}" -Atc "select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'contact_suggestions' and column_name in ('linkedin_url', 'professional_contact_url', 'email');")"
if [[ "$COLUMN_COUNT" != "3" ]]; then
  echo "Expected LinkedIn, professional contact, and legacy email columns; found $COLUMN_COUNT"
  exit 1
fi

echo "human path contact reachability migration: passed"
