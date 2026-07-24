#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d "/tmp/hp-contact-type.XXXXXX")"
PG_DATA="$TEST_ROOT/data"
PG_SOCKET="$TEST_ROOT/socket"
PG_PORT="${HUMAN_PATH_CONTACT_TYPE_TEST_PORT:-55489}"
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
  create table public.contact_suggestions (
    id uuid primary key,
    contact_type text not null default 'unknown'
      check (
        contact_type in (
          'likely_hiring_manager',
          'functional_leader',
          'recruiter',
          'executive_sponsor',
          'referral_candidate',
          'unknown'
        )
      )
  );
" >/dev/null
"${PSQL[@]}" -f "$REPO_ROOT/supabase/migrations/20260724000100_human_path_other_useful_contact.sql" >/dev/null
"${PSQL[@]}" -f "$REPO_ROOT/supabase/migrations/20260724000100_human_path_other_useful_contact.sql" >/dev/null

"${PSQL[@]}" -c "
  insert into public.contact_suggestions (id, contact_type)
  values ('00000000-0000-0000-0000-000000000001', 'other_useful_contact');
" >/dev/null

if "${PSQL[@]}" -c "
  insert into public.contact_suggestions (id, contact_type)
  values ('00000000-0000-0000-0000-000000000002', 'unclassified_guess');
" >/dev/null 2>&1; then
  echo "Expected the contact type constraint to reject unsupported values"
  exit 1
fi

echo "human path contact type migration: passed"
