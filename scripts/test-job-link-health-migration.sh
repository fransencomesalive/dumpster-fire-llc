#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d "/tmp/job-link-health.XXXXXX")"
PG_DATA="$TEST_ROOT/data"
PG_SOCKET="$TEST_ROOT/socket"
PG_PORT="${JOB_LINK_HEALTH_TEST_PORT:-55502}"
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
MIGRATION="$REPO_ROOT/supabase/migrations/20260805000100_job_link_health.sql"

"${PSQL[@]}" -c "
  create table public.jobs (
    id uuid primary key,
    source_url text not null
  );
  insert into public.jobs (id, source_url)
  values ('00000000-0000-0000-0000-000000000001', 'https://jobs.example/1');
" >/dev/null

"${PSQL[@]}" -f "$MIGRATION" >/dev/null
"${PSQL[@]}" -f "$MIGRATION" >/dev/null

DEFAULT_STATUS="$("${PSQL[@]}" -At -c "select link_status from public.jobs where id = '00000000-0000-0000-0000-000000000001';")"
[[ "$DEFAULT_STATUS" == "unknown" ]] || { echo "job link health migration: expected unknown default, got $DEFAULT_STATUS" >&2; exit 1; }

"${PSQL[@]}" -c "
  update public.jobs
  set link_status = 'gone',
      link_checked_at = now(),
      link_http_status = 404,
      link_health_reason = 'http_gone'
  where id = '00000000-0000-0000-0000-000000000001';
" >/dev/null

if "${PSQL[@]}" -c "update public.jobs set link_status = 'maybe';" >/dev/null 2>&1; then
  echo "job link health migration: invalid status passed the constraint" >&2
  exit 1
fi

if "${PSQL[@]}" -c "update public.jobs set link_http_status = 999;" >/dev/null 2>&1; then
  echo "job link health migration: invalid HTTP status passed the constraint" >&2
  exit 1
fi

INDEX_COUNT="$("${PSQL[@]}" -At -c "
  select count(*) from pg_indexes
  where schemaname = 'public' and indexname = 'jobs_link_status_checked_idx';
")"
[[ "$INDEX_COUNT" == "1" ]] || { echo "job link health migration: expected health index" >&2; exit 1; }

echo "job link health migration: passed"
