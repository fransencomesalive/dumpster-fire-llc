#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d "/tmp/mapped-job-sources.XXXXXX")"
PG_DATA="$TEST_ROOT/data"
PG_SOCKET="$TEST_ROOT/socket"
PG_PORT="${MAPPED_JOB_SOURCES_TEST_PORT:-55486}"
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

"${PSQL[@]}" <<'SQL'
create extension if not exists pgcrypto;
create table public.job_sources (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  website_url text not null default '',
  careers_url text not null default '',
  ats_provider text not null,
  ats_board_token text not null default '',
  status text not null check (status in ('active', 'paused')),
  workday_variants text[] not null default '{}',
  last_scanned_at timestamptz,
  last_error text,
  owner_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index job_sources_owner_board_key
  on public.job_sources (owner_user_id, ats_provider, ats_board_token, careers_url)
  nulls not distinct;

insert into public.job_sources (company_name, careers_url, ats_provider, ats_board_token, status, owner_user_id) values
  ('Himalayas paused by admin', 'https://himalayas.app/jobs/api/search?q=ai%20enablement&sort=recent&page=1', 'html', '', 'paused', null),
  ('Unrelated existing board', '', 'greenhouse', 'unrelated-existing-board', 'active', null),
  ('Private Workable query', 'https://jobs.workable.com/api/v1/jobs?query=ai%20enablement&workplace=remote&location=United+States', 'html', '', 'active', gen_random_uuid());
SQL

"${PSQL[@]}" -f "$REPO_ROOT/supabase/migrations/20260721000100_restore_mapped_job_sources.sql" >/dev/null
"${PSQL[@]}" -f "$REPO_ROOT/supabase/migrations/20260721000100_restore_mapped_job_sources.sql" >/dev/null

GLOBAL_COUNT="$("${PSQL[@]}" -Atc "select count(*) from public.job_sources where owner_user_id is null;")"
ACTIVE_COUNT="$("${PSQL[@]}" -Atc "select count(*) from public.job_sources where owner_user_id is null and status = 'active';")"
PAUSED_COUNT="$("${PSQL[@]}" -Atc "select count(*) from public.job_sources where owner_user_id is null and status = 'paused';")"
PRIVATE_COUNT="$("${PSQL[@]}" -Atc "select count(*) from public.job_sources where owner_user_id is not null;")"
WORKDAY_VARIANTS="$("${PSQL[@]}" -Atc "select coalesce(min(cardinality(workday_variants)), 0) from public.job_sources where owner_user_id is null and ats_provider = 'workday';")"
ADZUNA_ACTIVE="$("${PSQL[@]}" -Atc "select count(*) from public.job_sources where owner_user_id is null and careers_url like 'https://api.adzuna.com/%' and status = 'active';")"
TARGETED_INSERTED="$("${PSQL[@]}" -Atc "select count(*) from public.job_sources where owner_user_id is null and company_name in ('Accenture','Anthropic','Apple Contingent Workforce','Autodesk','BGB Group','Block','Coinbase Contingent Workforce','DEPT','DoorDash','Episode1 Agency','Grow Therapy','Instacart','Jerry','JumpCloud','Liquid Death','Mob Entertainment','OpenAI','Perplexity','Publicis Groupe','space150','SRAM');")"

[[ "$GLOBAL_COUNT" == "70" ]] || { echo "Expected 69 broad mappings plus the unrelated existing board, found $GLOBAL_COUNT"; exit 1; }
[[ "$ACTIVE_COUNT" == "69" ]] || { echo "Expected 69 active global rows with the admin pause preserved, found $ACTIVE_COUNT"; exit 1; }
[[ "$PAUSED_COUNT" == "1" ]] || { echo "Expected only the preserved admin pause, found $PAUSED_COUNT"; exit 1; }
[[ "$PRIVATE_COUNT" == "1" ]] || { echo "Expected the private row to remain untouched, found $PRIVATE_COUNT"; exit 1; }
[[ "$WORKDAY_VARIANTS" == "0" ]] || { echo "Targeted Workday boards must not be restored globally"; exit 1; }
[[ "$ADZUNA_ACTIVE" == "20" ]] || { echo "Expected all 20 Adzuna mappings to be active, found $ADZUNA_ACTIVE"; exit 1; }
[[ "$TARGETED_INSERTED" == "0" ]] || { echo "Personal targeted mappings must not be inserted globally"; exit 1; }

echo "mapped job sources migration: passed"
