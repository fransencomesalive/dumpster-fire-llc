#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d "/tmp/remote-preference.XXXXXX")"
PG_DATA="$TEST_ROOT/data"
PG_SOCKET="$TEST_ROOT/socket"
PG_PORT="${REMOTE_PREFERENCE_TEST_PORT:-55501}"
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
MIGRATION="$REPO_ROOT/supabase/migrations/20260804000100_remote_preference_no_preference.sql"

"${PSQL[@]}" -c "
  create table public.candidate_profiles (
    id integer generated always as identity primary key,
    remote_preference text not null default 'remote_preferred'
      constraint candidate_profiles_remote_preference_check
      check (remote_preference in ('remote_only', 'remote_preferred', 'hybrid_ok', 'onsite_ok'))
  );
  insert into public.candidate_profiles (remote_preference)
  values ('remote_only'), ('remote_preferred'), ('hybrid_ok'), ('onsite_ok');
" >/dev/null

"${PSQL[@]}" -f "$MIGRATION" >/dev/null
"${PSQL[@]}" -f "$MIGRATION" >/dev/null
"${PSQL[@]}" -c "insert into public.candidate_profiles (remote_preference) values ('no_preference');" >/dev/null

COUNT="$("${PSQL[@]}" -At -c "select count(*) from public.candidate_profiles;")"
[[ "$COUNT" == "5" ]] || { echo "remote preference migration: expected 5 preserved rows, got $COUNT" >&2; exit 1; }

if "${PSQL[@]}" -c "insert into public.candidate_profiles (remote_preference) values ('anything');" >/dev/null 2>&1; then
  echo "remote preference migration: invalid value passed the constraint" >&2
  exit 1
fi

echo "remote preference migration: passed"
