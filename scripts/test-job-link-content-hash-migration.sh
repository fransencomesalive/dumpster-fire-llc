#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d "/tmp/job-link-hash.XXXXXX")"
PG_DATA="$TEST_ROOT/data"
PG_SOCKET="$TEST_ROOT/socket"
PG_PORT="${JOB_LINK_HASH_TEST_PORT:-55491}"
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
  create schema auth;
  create table auth.users (id uuid primary key);
  create table public.jobs (
    id uuid primary key,
    source text not null,
    source_url text not null,
    owner_user_id uuid references auth.users(id),
    title text not null,
    company_name text not null
  );
" >/dev/null

MIGRATION="$REPO_ROOT/supabase/migrations/20260724000300_jobs_source_content_hash.sql"
"${PSQL[@]}" -f "$MIGRATION" >/dev/null
"${PSQL[@]}" -f "$MIGRATION" >/dev/null

"${PSQL[@]}" -c "
  insert into auth.users (id) values ('00000000-0000-0000-0000-000000000001');
  insert into public.jobs (
    id, source, source_url, owner_user_id, title, company_name, source_content_hash
  ) values
    (
      '00000000-0000-0000-0000-000000000011',
      'user_link',
      'https://example.com/one',
      '00000000-0000-0000-0000-000000000001',
      'One',
      'Example',
      repeat('a', 64)
    ),
    (
      '00000000-0000-0000-0000-000000000012',
      'user_link',
      'https://example.com/two',
      '00000000-0000-0000-0000-000000000001',
      'Two',
      'Example',
      repeat('a', 64)
    ),
    (
      '00000000-0000-0000-0000-000000000013',
      'mapped',
      'https://example.com/shared',
      null,
      'Shared',
      'Example',
      null
    );
" >/dev/null

COUNT="$("${PSQL[@]}" -At -c "select count(*) from public.jobs;")"
if [[ "$COUNT" != "3" ]]; then
  echo "Expected three compatible jobs rows, found $COUNT"
  exit 1
fi

INDEX_COUNT="$("${PSQL[@]}" -At -c "
  select count(*)
  from pg_indexes
  where schemaname = 'public'
    and indexname = 'jobs_owner_source_content_hash_idx';
")"
if [[ "$INDEX_COUNT" != "1" ]]; then
  echo "Expected owner/content-hash index"
  exit 1
fi

if "${PSQL[@]}" -c "
  insert into public.jobs (
    id, source, source_url, title, company_name, source_content_hash
  ) values (
    '00000000-0000-0000-0000-000000000014',
    'mapped',
    'https://example.com/invalid',
    'Invalid',
    'Example',
    'not-a-sha256'
  );
" >/dev/null 2>&1; then
  echo "Expected malformed source_content_hash to be rejected"
  exit 1
fi

echo "job link content hash migration: passed"
