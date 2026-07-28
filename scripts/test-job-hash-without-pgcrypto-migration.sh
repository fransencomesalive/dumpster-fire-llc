#!/usr/bin/env bash
# Regression harness for 20260727000100_job_hash_without_pgcrypto.sql.
#
# The 2026-07-24 hashing functions called pgcrypto's digest() while pinning
# `search_path = public, pg_temp`. Every existing harness installs pgcrypto into
# the default schema, so digest() resolved locally and the break only appeared in
# production, where Supabase keeps pgcrypto in the `extensions` schema. This
# harness installs pgcrypto the way production does: present, but unreachable
# from the functions' locked search_path. A hashing function that depends on
# pgcrypto fails here.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d "/tmp/job-hash-nopgcrypto.XXXXXX")"
PG_DATA="$TEST_ROOT/data"
PG_SOCKET="$TEST_ROOT/socket"
PG_PORT="${JOB_HASH_TEST_PORT:-55497}"
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

fail() {
  echo "job hash without pgcrypto migration: FAILED - $1" >&2
  exit 1
}

# Production shape: pgcrypto lives in `extensions`, never in `public`.
"${PSQL[@]}" -c "
  create schema extensions;
  create extension pgcrypto with schema extensions;
  create schema auth;
  create table auth.users (id uuid primary key);
  create table public.jobs (
    id uuid primary key default gen_random_uuid(),
    source text not null,
    source_url text not null,
    source_content_hash text,
    owner_user_id uuid references auth.users(id),
    title text not null,
    company_name text not null,
    description text,
    responsibilities text[],
    required_experience text[]
  );
" >/dev/null

"${PSQL[@]}" -f "$REPO_ROOT/supabase/migrations/20260724000400_posting_refinement_backoff.sql" >/dev/null 2>&1 || true
"${PSQL[@]}" -f "$REPO_ROOT/supabase/migrations/20260724000500_job_link_extraction_claims.sql" >/dev/null 2>&1 || true

# Applied twice: the fix must be idempotent.
FIX="$REPO_ROOT/supabase/migrations/20260727000100_job_hash_without_pgcrypto.sql"
"${PSQL[@]}" -f "$FIX" >/dev/null
"${PSQL[@]}" -f "$FIX" >/dev/null

USER_ID="00000000-0000-0000-0000-000000000001"
"${PSQL[@]}" -c "insert into auth.users (id) values ('$USER_ID');" >/dev/null

# 1. The insert that produced 42883 in production must now succeed.
"${PSQL[@]}" -c "
  insert into public.jobs (id, source, source_url, owner_user_id, title, company_name, description)
  values (
    '11111111-1111-1111-1111-111111111111',
    'user_link',
    'https://recruiterflow.com/db_x/jobs/370?source=Linkedin',
    '$USER_ID',
    'Creative Director / Producer',
    'Night',
    'YouTube Golf Channel, remote, part time.'
  );
" >/dev/null || fail "insert into public.jobs still fails without pgcrypto on the search_path"

STATE="$("${PSQL[@]}" -At -c "select refinement_state from public.jobs where id = '11111111-1111-1111-1111-111111111111';")"
[[ "$STATE" == "pending" ]] || fail "expected refinement_state pending on insert, got '$STATE'"

HASH_LEN="$("${PSQL[@]}" -At -c "select length(refinement_content_hash) from public.jobs where id = '11111111-1111-1111-1111-111111111111';")"
[[ "$HASH_LEN" == "64" ]] || fail "expected a 64 character sha256 hex hash, got length '$HASH_LEN'"

# 2. Stored hashes stay byte-identical to what pgcrypto produced, so no backfill.
COMPATIBLE="$("${PSQL[@]}" -At -c "
  select refinement_content_hash = encode(extensions.digest(
      coalesce(title, '') || chr(31) || coalesce(company_name, '') || chr(31) || coalesce(description, ''),
      'sha256'), 'hex')
  from public.jobs where id = '11111111-1111-1111-1111-111111111111';")"
[[ "$COMPATIBLE" == "t" ]] || fail "new hash does not match the pgcrypto digest of the same text"

# 3. Equivalence across empty, unicode, and long inputs.
MISMATCHES="$("${PSQL[@]}" -At -c "
  with samples(t) as (
    values (''), ('unicode: cafe 日本語 fire'), (repeat('long ', 500)), ('https://example.com/a?b=c')
  )
  select count(*) from samples
  where encode(extensions.digest(t, 'sha256'), 'hex') <> encode(sha256(convert_to(t, 'UTF8')), 'hex');")"
[[ "$MISMATCHES" == "0" ]] || fail "$MISMATCHES sample(s) hashed differently than pgcrypto"

# 4. Trigger still recomputes on UPDATE of a watched column.
"${PSQL[@]}" -c "update public.jobs set description = 'Changed.' where id = '11111111-1111-1111-1111-111111111111';" >/dev/null \
  || fail "update of a watched column still fails"

# 5. Completion logic preserved.
"${PSQL[@]}" -c "
  update public.jobs
  set responsibilities = array['Lead shoots'], required_experience = array['5 years']
  where id = '11111111-1111-1111-1111-111111111111';" >/dev/null
COMPLETE="$("${PSQL[@]}" -At -c "select refinement_state from public.jobs where id = '11111111-1111-1111-1111-111111111111';")"
[[ "$COMPLETE" == "complete" ]] || fail "expected refinement_state complete, got '$COMPLETE'"

# 6. finish_job_link_extraction resolves its hash without pgcrypto. A source_url
#    mismatch must still raise extraction_job_mismatch rather than 42883.
ERR="$("${PSQL[@]}" -At -c "
  do \$\$
  begin
    perform public.finish_job_link_extraction(
      '$USER_ID', repeat('a', 64), repeat('b', 64),
      '22222222-2222-2222-2222-222222222222', 'success',
      '11111111-1111-1111-1111-111111111111', '2026-07-27T12:00:00Z');
  exception when others then
    raise notice 'CAUGHT:%', sqlerrm;
  end
  \$\$;" 2>&1 || true)"
case "$ERR" in
  *"function digest"*) fail "finish_job_link_extraction still depends on pgcrypto: $ERR" ;;
  *extraction_job_mismatch*) : ;;
  *) fail "unexpected finish_job_link_extraction result: $ERR" ;;
esac

echo "job hash without pgcrypto migration: passed"
