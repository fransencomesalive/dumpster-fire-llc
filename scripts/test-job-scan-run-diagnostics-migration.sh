#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION="$REPO_ROOT/supabase/migrations/20260817000100_job_scan_run_diagnostics.sql"

if ! command -v pg_config >/dev/null 2>&1; then
  require_sql() {
    local expected="$1"
    if ! rg --fixed-strings --quiet "$expected" "$MIGRATION"; then
      echo "job scan run diagnostics migration: missing contract: $expected" >&2
      exit 1
    fi
  }

  require_sql "create table if not exists public.job_scan_runs"
  require_sql "create table if not exists public.job_scan_run_results"
  require_sql "foreign key (profile_id, user_id)"
  require_sql "started_at timestamptz not null"
  require_sql "completed_at timestamptz not null"
  require_sql "matcher_version text not null"
  require_sql "profile_context_hash text not null"
  require_sql "candidate_count integer not null"
  require_sql "eligible_count integer not null"
  require_sql "selected_count integer not null"
  require_sql "lane_counts jsonb not null"
  require_sql "target_counts jsonb not null"
  require_sql "exclusion_counts jsonb not null"
  require_sql "source_commit_sha text"
  require_sql "deployment_id text"
  require_sql "disposition text not null"
  require_sql "candidate_rank integer not null"
  require_sql "selected_rank integer"
  require_sql "score integer not null"
  require_sql "match_tier text not null"
  require_sql "match_tier in ('exact', 'core', 'stretch')"
  require_sql "cutoff_reason text"
  require_sql "alter table public.job_scan_runs enable row level security"
  require_sql "alter table public.job_scan_run_results enable row level security"
  require_sql "grant select on table public.job_scan_runs to authenticated"
  require_sql "grant select on table public.job_scan_run_results to authenticated"
  require_sql "grant select, insert on table public.job_scan_runs to service_role"
  require_sql "grant select, insert on table public.job_scan_run_results to service_role"
  require_sql "create policy job_scan_runs_owner_read"
  require_sql "create policy job_scan_run_results_owner_read"
  require_sql "create or replace function public.finalize_public_job_scan"
  require_sql "job scan diagnostics result count mismatch"
  require_sql "job scan selected result count mismatch"
  require_sql "insert into public.job_scan_results"
  require_sql "update public.job_scan_results"
  require_sql "'scanRunId', v_run_id"
  require_sql "revoke all on function public.finalize_public_job_scan(jsonb, jsonb, jsonb)"
  require_sql "grant execute on function public.finalize_public_job_scan(jsonb, jsonb, jsonb)"

  if rg --multiline --quiet \
    'grant[^;]*(update|delete)[^;]*(authenticated|service_role)' "$MIGRATION"; then
    echo "job scan run diagnostics migration: append-only roles received mutation privileges" >&2
    exit 1
  fi

  echo "job scan run diagnostics migration: static contract passed (PostgreSQL binaries unavailable)"
  exit 0
fi

TEST_ROOT="$(mktemp -d "/tmp/job-scan-run-diagnostics.XXXXXX")"
PG_DATA="$TEST_ROOT/data"
PG_SOCKET="$TEST_ROOT/socket"
PG_PORT="${JOB_SCAN_RUN_DIAGNOSTICS_TEST_PORT:-55512}"
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
  create role service_role nologin bypassrls;
  create extension pgcrypto;
  create schema auth;
  create function auth.uid() returns uuid
  language sql stable
  as \$\$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  \$\$;
  create table auth.users (id uuid primary key);
  create table public.candidate_profiles (
    id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade
  );
  create table public.jobs (id uuid primary key);
  create table public.job_scan_results (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    profile_id uuid not null references public.candidate_profiles(id) on delete cascade,
    job_id uuid not null references public.jobs(id) on delete cascade,
    status text not null default 'active' check (status in ('active', 'actioned', 'expired', 'dismissed')),
    scan_context jsonb not null default '{}'::jsonb,
    first_seen_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, job_id)
  );
" >/dev/null

"${PSQL[@]}" -f "$MIGRATION" >/dev/null
"${PSQL[@]}" -f "$MIGRATION" >/dev/null

"${PSQL[@]}" -c "
  insert into auth.users (id) values
    ('00000000-0000-0000-0000-000000000001'),
    ('00000000-0000-0000-0000-000000000002');
  insert into public.candidate_profiles (id, user_id) values
    ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001');
  insert into public.jobs (id) values
    ('30000000-0000-0000-0000-000000000001'),
    ('30000000-0000-0000-0000-000000000002'),
    ('30000000-0000-0000-0000-000000000003'),
    ('30000000-0000-0000-0000-000000000004');
  insert into public.job_scan_results (
    user_id, profile_id, job_id, status, scan_context
  ) values (
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'active',
    '{}'::jsonb
  );

  set role service_role;
  insert into public.job_scan_runs (
    id,
    user_id,
    profile_id,
    started_at,
    completed_at,
    matcher_version,
    source_commit_sha,
    deployment_id,
    profile_context_hash,
    candidate_count,
    eligible_count,
    selected_count,
    lane_counts,
    target_counts
  ) values (
    '20000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '2026-08-17 16:00:00+00',
    '2026-08-17 16:00:05+00',
    'public-job-matcher-v5',
    'abcdef1234567',
    'dpl_scan_diagnostics',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    120,
    90,
    1,
    '{"production":{"candidate":60,"eligible":45,"selected":1,"cutoff":44}}',
    '{"executive producer":{"candidate":10,"eligible":8,"selected":1,"cutoff":7}}'
  );

  insert into public.job_scan_run_results (
    scan_run_id,
    job_id,
    disposition,
    candidate_rank,
    selected_rank,
    score,
    lane,
    target_title,
    match_tier,
    cutoff_reason
  ) values
    (
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      'selected',
      1,
      1,
      94,
      'production',
      'Executive Producer',
      'exact',
      null
    ),
    (
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000002',
      'cutoff',
      76,
      null,
      72,
      'production',
      'Executive Producer',
      'core',
      'global_result_limit'
    );
  reset role;
" >/dev/null

ROW="$("${PSQL[@]}" -At -F '|' -c "
  select
    matcher_version,
    source_commit_sha,
    deployment_id,
    candidate_count,
    eligible_count,
    selected_count,
    lane_counts->'production'->>'selected',
    target_counts->'executive producer'->>'selected'
  from public.job_scan_runs
  where id = '20000000-0000-0000-0000-000000000001';
")"
[[ "$ROW" == "public-job-matcher-v5|abcdef1234567|dpl_scan_diagnostics|120|90|1|1|1" ]] || {
  echo "job scan run diagnostics migration: unexpected run row: $ROW" >&2
  exit 1
}

RESULTS="$("${PSQL[@]}" -At -F '|' -c "
  select disposition, candidate_rank, coalesce(selected_rank, 0), score, lane,
         target_title, match_tier, coalesce(cutoff_reason, '')
  from public.job_scan_run_results
  order by candidate_rank;
")"
EXPECTED_RESULTS=$'selected|1|1|94|production|Executive Producer|exact|\ncutoff|76|0|72|production|Executive Producer|core|global_result_limit'
[[ "$RESULTS" == "$EXPECTED_RESULTS" ]] || {
  echo "job scan run diagnostics migration: unexpected result rows: $RESULTS" >&2
  exit 1
}

FINALIZED_RUN="$("${PSQL[@]}" -At -c "
  set role service_role;
  select public.finalize_public_job_scan(
    '{
      \"user_id\": \"00000000-0000-0000-0000-000000000001\",
      \"profile_id\": \"10000000-0000-0000-0000-000000000001\",
      \"started_at\": \"2026-08-17T17:00:00Z\",
      \"completed_at\": \"2026-08-17T17:00:05Z\",
      \"matcher_version\": \"public-job-matcher-v5\",
      \"profile_context_hash\": \"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc\",
      \"candidate_count\": 2,
      \"eligible_count\": 2,
      \"selected_count\": 1,
      \"scan_context\": {\"providerMode\": \"normalized_public_jobs\"},
      \"lane_counts\": {},
      \"target_counts\": {}
    }'::jsonb,
    '[
      {\"job_id\":\"30000000-0000-0000-0000-000000000003\",\"disposition\":\"selected\",\"candidate_rank\":1,\"selected_rank\":1,\"score\":90,\"lane\":\"production\",\"target_title\":\"Executive Producer\",\"match_tier\":\"exact\",\"cutoff_reason\":null},
      {\"job_id\":\"30000000-0000-0000-0000-000000000004\",\"disposition\":\"cutoff\",\"candidate_rank\":2,\"selected_rank\":null,\"score\":80,\"lane\":\"production\",\"target_title\":\"Executive Producer\",\"match_tier\":\"core\",\"cutoff_reason\":\"family_balanced_result_limit\"}
    ]'::jsonb,
    '[{\"job_id\":\"30000000-0000-0000-0000-000000000003\"}]'::jsonb
  );
  reset role;
")"
[[ "$FINALIZED_RUN" =~ ^[0-9a-f-]{36}$ ]] || {
  echo "job scan run diagnostics migration: finalize RPC did not return a run id: $FINALIZED_RUN" >&2
  exit 1
}

FINALIZED_STATE="$("${PSQL[@]}" -At -F '|' -c "
  select job_id, status, coalesce(scan_context->>'providerMode', ''),
         coalesce(scan_context->>'matcherVersion', ''),
         scan_context ? 'scanRunId'
  from public.job_scan_results
  order by job_id;
")"
EXPECTED_FINALIZED_STATE=$'30000000-0000-0000-0000-000000000001|expired|||f\n30000000-0000-0000-0000-000000000003|active|normalized_public_jobs|public-job-matcher-v5|t'
[[ "$FINALIZED_STATE" == "$EXPECTED_FINALIZED_STATE" ]] || {
  echo "job scan run diagnostics migration: scan finalization did not persist selected result: $FINALIZED_STATE" >&2
  exit 1
}

RUN_COUNT_BEFORE="$("${PSQL[@]}" -At -c 'select count(*) from public.job_scan_runs;')"
SCAN_STATE_BEFORE="$("${PSQL[@]}" -At -F '|' -c 'select job_id, status from public.job_scan_results order by job_id;')"
if "${PSQL[@]}" -c "
  set role service_role;
  select public.finalize_public_job_scan(
    '{
      \"user_id\": \"00000000-0000-0000-0000-000000000001\",
      \"profile_id\": \"10000000-0000-0000-0000-000000000001\",
      \"started_at\": \"2026-08-17T18:00:00Z\",
      \"completed_at\": \"2026-08-17T18:00:05Z\",
      \"matcher_version\": \"public-job-matcher-v5\",
      \"profile_context_hash\": \"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd\",
      \"candidate_count\": 1,
      \"eligible_count\": 1,
      \"selected_count\": 1
    }'::jsonb,
    '[]'::jsonb,
    '[{\"job_id\":\"30000000-0000-0000-0000-000000000004\"}]'::jsonb
  );
" >/dev/null 2>&1; then
  echo "job scan run diagnostics migration: inconsistent atomic payload succeeded" >&2
  exit 1
fi
RUN_COUNT_AFTER="$("${PSQL[@]}" -At -c 'select count(*) from public.job_scan_runs;')"
SCAN_STATE_AFTER="$("${PSQL[@]}" -At -F '|' -c 'select job_id, status from public.job_scan_results order by job_id;')"
[[ "$RUN_COUNT_AFTER" == "$RUN_COUNT_BEFORE" ]] || {
  echo "job scan run diagnostics migration: failed finalization left a partial run" >&2
  exit 1
}
[[ "$SCAN_STATE_AFTER" == "$SCAN_STATE_BEFORE" ]] || {
  echo "job scan run diagnostics migration: failed finalization mutated scan results" >&2
  exit 1
}

SECURITY="$("${PSQL[@]}" -At -F '|' -c "
  select
    runs.relrowsecurity,
    results.relrowsecurity,
    has_table_privilege('authenticated', 'public.job_scan_runs', 'select'),
    has_table_privilege('authenticated', 'public.job_scan_runs', 'insert'),
    has_table_privilege('authenticated', 'public.job_scan_run_results', 'update'),
    has_table_privilege('service_role', 'public.job_scan_runs', 'insert'),
    has_table_privilege('service_role', 'public.job_scan_runs', 'update'),
    has_table_privilege('service_role', 'public.job_scan_run_results', 'insert'),
    has_table_privilege('service_role', 'public.job_scan_run_results', 'delete')
  from pg_class runs, pg_class results
  where runs.oid = 'public.job_scan_runs'::regclass
    and results.oid = 'public.job_scan_run_results'::regclass;
")"
[[ "$SECURITY" == "t|t|t|f|f|t|f|t|f" ]] || {
  echo "job scan run diagnostics migration: unexpected security posture: $SECURITY" >&2
  exit 1
}

OWNER_VIEW="$("${PSQL[@]}" -At -F '|' -c "
  set role authenticated;
  set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
  select
    (select count(*) from public.job_scan_runs),
    (select count(*) from public.job_scan_run_results);
  reset role;
")"
[[ "$OWNER_VIEW" == "2|4" ]] || {
  echo "job scan run diagnostics migration: owner RLS read failed: $OWNER_VIEW" >&2
  exit 1
}

OTHER_VIEW="$("${PSQL[@]}" -At -F '|' -c "
  set role authenticated;
  set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
  select
    (select count(*) from public.job_scan_runs),
    (select count(*) from public.job_scan_run_results);
  reset role;
")"
[[ "$OTHER_VIEW" == "0|0" ]] || {
  echo "job scan run diagnostics migration: cross-owner RLS leak: $OTHER_VIEW" >&2
  exit 1
}

if "${PSQL[@]}" -c "
  set role authenticated;
  set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
  update public.job_scan_runs set selected_count = 0;
" >/dev/null 2>&1; then
  echo "job scan run diagnostics migration: authenticated user updated immutable run" >&2
  exit 1
fi

if "${PSQL[@]}" -c "
  set role service_role;
  delete from public.job_scan_run_results;
" >/dev/null 2>&1; then
  echo "job scan run diagnostics migration: service role deleted immutable results" >&2
  exit 1
fi

if "${PSQL[@]}" -c "
  insert into public.job_scan_runs (
    user_id, profile_id, started_at, completed_at, matcher_version,
    profile_context_hash, candidate_count, eligible_count, selected_count
  ) values (
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '2026-08-17 16:00:05+00',
    '2026-08-17 16:00:00+00',
    'public-job-matcher-v5',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    1,
    1,
    1
  );
" >/dev/null 2>&1; then
  echo "job scan run diagnostics migration: reversed timestamps passed constraints" >&2
  exit 1
fi

if "${PSQL[@]}" -c "
  insert into public.job_scan_runs (
    user_id, profile_id, started_at, completed_at, matcher_version,
    profile_context_hash, candidate_count, eligible_count, selected_count
  ) values (
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    now(),
    now(),
    'public-job-matcher-v5',
    'not-a-sha256',
    1,
    1,
    1
  );
" >/dev/null 2>&1; then
  echo "job scan run diagnostics migration: invalid profile hash passed constraints" >&2
  exit 1
fi

if "${PSQL[@]}" -c "
  insert into public.job_scan_runs (
    user_id, profile_id, started_at, completed_at, matcher_version,
    profile_context_hash, candidate_count, eligible_count, selected_count
  ) values (
    '00000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    now(),
    now(),
    'public-job-matcher-v5',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    1,
    1,
    1
  );
" >/dev/null 2>&1; then
  echo "job scan run diagnostics migration: mismatched profile owner passed constraints" >&2
  exit 1
fi

if "${PSQL[@]}" -c "
  insert into public.job_scan_runs (
    user_id, profile_id, started_at, completed_at, matcher_version,
    profile_context_hash, candidate_count, eligible_count, selected_count
  ) values (
    '00000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    now(),
    now(),
    'public-job-matcher-v5',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    10,
    11,
    1
  );
" >/dev/null 2>&1; then
  echo "job scan run diagnostics migration: inconsistent counts passed constraints" >&2
  exit 1
fi

if "${PSQL[@]}" -c "
  insert into public.job_scan_run_results (
    scan_run_id, job_id, disposition, candidate_rank, selected_rank,
    score, lane, target_title, match_tier, cutoff_reason
  ) values (
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000003',
    'cutoff',
    2,
    null,
    80,
    'production',
    'Executive Producer',
    'stretch',
    null
  );
" >/dev/null 2>&1; then
  echo "job scan run diagnostics migration: cutoff without a reason passed constraints" >&2
  exit 1
fi

echo "job scan run diagnostics migration: passed"
