#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d "/tmp/job-link-claims.XXXXXX")"
PG_DATA="$TEST_ROOT/data"
PG_SOCKET="$TEST_ROOT/socket"
PG_PORT="${JOB_LINK_CLAIMS_TEST_PORT:-55493}"
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
    source text not null,
    source_url text not null,
    source_content_hash text,
    owner_user_id uuid references auth.users(id),
    title text not null,
    company_name text not null
  );
" >/dev/null

MIGRATION="$REPO_ROOT/supabase/migrations/20260724000500_job_link_extraction_claims.sql"
"${PSQL[@]}" -f "$MIGRATION" >/dev/null
"${PSQL[@]}" -f "$MIGRATION" >/dev/null

USER_ID="00000000-0000-0000-0000-000000000001"
CONTENT_HASH="$(printf 'a%.0s' {1..64})"
URL="https://example.com/job"
URL_HASH="$("${PSQL[@]}" -At -c "select encode(digest('$URL', 'sha256'), 'hex');")"

"${PSQL[@]}" -c "insert into auth.users (id) values ('$USER_ID');" >/dev/null

FIRST="$("${PSQL[@]}" -At -F '|' -c "
  select claimed, claim_token, claim_state, attempt_count
  from public.claim_job_link_extraction(
    '$USER_ID', '$URL_HASH', '$CONTENT_HASH', '2026-07-24T12:00:00Z'
  );
")"
IFS='|' read -r FIRST_CLAIMED FIRST_TOKEN FIRST_STATE FIRST_COUNT <<< "$FIRST"
if [[ "$FIRST_CLAIMED" != "t" || "$FIRST_STATE" != "claimed" || "$FIRST_COUNT" != "1" ]]; then
  echo "Unexpected first extraction claim: $FIRST"
  exit 1
fi

BUSY="$("${PSQL[@]}" -At -F '|' -c "
  select claimed, claim_state, attempt_count
  from public.claim_job_link_extraction(
    '$USER_ID', '$URL_HASH', '$CONTENT_HASH', '2026-07-24T12:01:00Z'
  );
")"
if [[ "$BUSY" != "f|claimed|1" ]]; then
  echo "Expected second extraction claim to be busy: $BUSY"
  exit 1
fi

UNAVAILABLE="$("${PSQL[@]}" -At -F '|' -c "
  select applied, claim_state, last_outcome
  from public.finish_job_link_extraction(
    '$USER_ID', '$URL_HASH', '$CONTENT_HASH', '$FIRST_TOKEN',
    'unavailable', null, '2026-07-24T12:02:00Z'
  );
")"
if [[ "$UNAVAILABLE" != "t|retryable|unavailable" ]]; then
  echo "Unexpected unavailable finish: $UNAVAILABLE"
  exit 1
fi

RETRY_STATE="$("${PSQL[@]}" -At -F '|' -c "
  select state, attempt_count, no_fill_count
  from public.job_link_extraction_claims;
")"
if [[ "$RETRY_STATE" != "retryable|1|0" ]]; then
  echo "Provider unavailable incorrectly consumed no-fill count: $RETRY_STATE"
  exit 1
fi

"${PSQL[@]}" -f "$MIGRATION" >/dev/null
RETRY_STATE_AFTER="$("${PSQL[@]}" -At -F '|' -c "
  select state, attempt_count, no_fill_count
  from public.job_link_extraction_claims;
")"
if [[ "$RETRY_STATE_AFTER" != "$RETRY_STATE" ]]; then
  echo "Migration reapply changed extraction claim state"
  exit 1
fi

SECOND="$("${PSQL[@]}" -At -F '|' -c "
  select claimed, claim_token, attempt_count
  from public.claim_job_link_extraction(
    '$USER_ID', '$URL_HASH', '$CONTENT_HASH', '2026-07-24T12:18:00Z'
  );
")"
IFS='|' read -r SECOND_CLAIMED SECOND_TOKEN SECOND_COUNT <<< "$SECOND"
if [[ "$SECOND_CLAIMED" != "t" || "$SECOND_COUNT" != "2" || "$SECOND_TOKEN" == "$FIRST_TOKEN" ]]; then
  echo "Expected due retry with a fresh token: $SECOND"
  exit 1
fi

STALE="$("${PSQL[@]}" -At -c "
  select applied
  from public.finish_job_link_extraction(
    '$USER_ID', '$URL_HASH', '$CONTENT_HASH', '$FIRST_TOKEN',
    'error', null, '2026-07-24T12:19:00Z'
  );
")"
if [[ "$STALE" != "f" ]]; then
  echo "Expected stale extraction token to be rejected"
  exit 1
fi

"${PSQL[@]}" -c "
  insert into public.jobs (
    id, source, source_url, source_content_hash, owner_user_id, title, company_name
  ) values (
    '00000000-0000-0000-0000-000000000011',
    'user_link',
    '$URL',
    '$CONTENT_HASH',
    '$USER_ID',
    'Role',
    'Example'
  );
" >/dev/null

SUCCESS="$("${PSQL[@]}" -At -F '|' -c "
  select applied, claim_state, last_outcome
  from public.finish_job_link_extraction(
    '$USER_ID', '$URL_HASH', '$CONTENT_HASH', '$SECOND_TOKEN',
    'success', '00000000-0000-0000-0000-000000000011',
    '2026-07-24T12:19:00Z'
  );
")"
if [[ "$SUCCESS" != "t|succeeded|success" ]]; then
  echo "Unexpected successful extraction finish: $SUCCESS"
  exit 1
fi

CACHED="$("${PSQL[@]}" -At -F '|' -c "
  select claimed, claim_state
  from public.claim_job_link_extraction(
    '$USER_ID', '$URL_HASH', '$CONTENT_HASH', '2026-07-25T12:00:00Z'
  );
")"
if [[ "$CACHED" != "f|succeeded" ]]; then
  echo "Expected successful extraction claim to remain cached: $CACHED"
  exit 1
fi

NO_FILL_CONTENT_HASH="$(printf 'b%.0s' {1..64})"
NO_FILL_URL="https://example.com/no-fill"
NO_FILL_URL_HASH="$("${PSQL[@]}" -At -c "select encode(digest('$NO_FILL_URL', 'sha256'), 'hex');")"

NO_FILL_FIRST="$("${PSQL[@]}" -At -F '|' -c "
  select claimed, claim_token
  from public.claim_job_link_extraction(
    '$USER_ID', '$NO_FILL_URL_HASH', '$NO_FILL_CONTENT_HASH',
    '2026-07-24T13:00:00Z'
  );
")"
IFS='|' read -r NO_FILL_FIRST_CLAIMED NO_FILL_FIRST_TOKEN <<< "$NO_FILL_FIRST"
if [[ "$NO_FILL_FIRST_CLAIMED" != "t" ]]; then
  echo "Expected first no-fill extraction claim: $NO_FILL_FIRST"
  exit 1
fi
"${PSQL[@]}" -c "
  select applied
  from public.finish_job_link_extraction(
    '$USER_ID', '$NO_FILL_URL_HASH', '$NO_FILL_CONTENT_HASH',
    '$NO_FILL_FIRST_TOKEN', 'no_fill', null, '2026-07-24T13:01:00Z'
  );
" >/dev/null

NO_FILL_SECOND="$("${PSQL[@]}" -At -F '|' -c "
  select claimed, claim_token
  from public.claim_job_link_extraction(
    '$USER_ID', '$NO_FILL_URL_HASH', '$NO_FILL_CONTENT_HASH',
    '2026-07-24T13:16:00Z'
  );
")"
IFS='|' read -r NO_FILL_SECOND_CLAIMED NO_FILL_SECOND_TOKEN <<< "$NO_FILL_SECOND"
if [[ "$NO_FILL_SECOND_CLAIMED" != "t" ]]; then
  echo "Expected second no-fill extraction claim: $NO_FILL_SECOND"
  exit 1
fi
"${PSQL[@]}" -c "
  select applied
  from public.finish_job_link_extraction(
    '$USER_ID', '$NO_FILL_URL_HASH', '$NO_FILL_CONTENT_HASH',
    '$NO_FILL_SECOND_TOKEN', 'invalid', null, '2026-07-24T13:17:00Z'
  );
" >/dev/null

NO_FILL_THIRD="$("${PSQL[@]}" -At -F '|' -c "
  select claimed, claim_token
  from public.claim_job_link_extraction(
    '$USER_ID', '$NO_FILL_URL_HASH', '$NO_FILL_CONTENT_HASH',
    '2026-07-24T13:48:00Z'
  );
")"
IFS='|' read -r NO_FILL_THIRD_CLAIMED NO_FILL_THIRD_TOKEN <<< "$NO_FILL_THIRD"
if [[ "$NO_FILL_THIRD_CLAIMED" != "t" ]]; then
  echo "Expected third no-fill extraction claim: $NO_FILL_THIRD"
  exit 1
fi
NO_FILL_EXHAUSTED="$("${PSQL[@]}" -At -F '|' -c "
  select applied, claim_state
  from public.finish_job_link_extraction(
    '$USER_ID', '$NO_FILL_URL_HASH', '$NO_FILL_CONTENT_HASH',
    '$NO_FILL_THIRD_TOKEN', 'no_fill', null, '2026-07-24T13:49:00Z'
  );
")"
if [[ "$NO_FILL_EXHAUSTED" != "t|exhausted" ]]; then
  echo "Expected third no-fill result to exhaust retries: $NO_FILL_EXHAUSTED"
  exit 1
fi

EXHAUSTED="$("${PSQL[@]}" -At -F '|' -c "
  select claimed, claim_state
  from public.claim_job_link_extraction(
    '$USER_ID', '$NO_FILL_URL_HASH', '$NO_FILL_CONTENT_HASH',
    '2026-07-25T13:00:00Z'
  );
")"
EXHAUSTED_STATE="$("${PSQL[@]}" -At -F '|' -c "
  select state, attempt_count, no_fill_count
  from public.job_link_extraction_claims
  where user_id = '$USER_ID'
    and source_url_hash = '$NO_FILL_URL_HASH'
    and content_hash = '$NO_FILL_CONTENT_HASH';
")"
if [[ "$EXHAUSTED" != "f|exhausted" || "$EXHAUSTED_STATE" != "exhausted|3|3" ]]; then
  echo "Unexpected exhausted extraction state: $EXHAUSTED / $EXHAUSTED_STATE"
  exit 1
fi

MISMATCH_CONTENT_HASH="$(printf 'c%.0s' {1..64})"
MISMATCH_URL="https://example.com/mismatch"
MISMATCH_URL_HASH="$("${PSQL[@]}" -At -c "select encode(digest('$MISMATCH_URL', 'sha256'), 'hex');")"
MISMATCH_CLAIM="$("${PSQL[@]}" -At -F '|' -c "
  select claimed, claim_token
  from public.claim_job_link_extraction(
    '$USER_ID', '$MISMATCH_URL_HASH', '$MISMATCH_CONTENT_HASH',
    '2026-07-24T14:00:00Z'
  );
")"
IFS='|' read -r MISMATCH_CLAIMED MISMATCH_TOKEN <<< "$MISMATCH_CLAIM"
if [[ "$MISMATCH_CLAIMED" != "t" ]]; then
  echo "Expected mismatched-job extraction claim: $MISMATCH_CLAIM"
  exit 1
fi
if "${PSQL[@]}" -c "
  select applied
  from public.finish_job_link_extraction(
    '$USER_ID', '$MISMATCH_URL_HASH', '$MISMATCH_CONTENT_HASH',
    '$MISMATCH_TOKEN', 'success', '00000000-0000-0000-0000-000000000011',
    '2026-07-24T14:01:00Z'
  );
" >/dev/null 2>&1; then
  echo "Expected mismatched extraction job to be rejected"
  exit 1
fi

FORBIDDEN_COLUMNS="$("${PSQL[@]}" -At -c "
  select count(*)
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'job_link_extraction_claims'
    and column_name in (
      'source_url', 'page_text', 'raw_prompt', 'provider_response', 'extracted_posting'
    );
")"
if [[ "$FORBIDDEN_COLUMNS" != "0" ]]; then
  echo "Extraction claims table contains raw-content columns"
  exit 1
fi

SECURITY="$("${PSQL[@]}" -At -F '|' -c "
  select
    has_table_privilege('anon', 'public.job_link_extraction_claims', 'select'),
    has_function_privilege('authenticated', 'public.claim_job_link_extraction(uuid,text,text,timestamptz,interval)', 'execute'),
    has_function_privilege('service_role', 'public.finish_job_link_extraction(uuid,text,text,uuid,text,uuid,timestamptz)', 'execute');
")"
if [[ "$SECURITY" != "f|f|t" ]]; then
  echo "Unexpected extraction claim security posture: $SECURITY"
  exit 1
fi

echo "job link extraction claims migration: passed"
