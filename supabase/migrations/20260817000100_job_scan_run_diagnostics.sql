-- Append-only diagnostics for reconstructing how a completed public job scan was selected.
-- Runs and candidate decisions are written once by the service role. Authenticated users may
-- read their own diagnostics, but cannot insert, update, or delete them.

create extension if not exists pgcrypto;

create unique index if not exists candidate_profiles_id_user_idx
  on public.candidate_profiles(id, user_id);

create table if not exists public.job_scan_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  matcher_version text not null check (btrim(matcher_version) <> ''),
  source_commit_sha text check (
    source_commit_sha is null
    or source_commit_sha ~ '^[0-9a-fA-F]{7,64}$'
  ),
  deployment_id text check (
    deployment_id is null
    or btrim(deployment_id) <> ''
  ),
  profile_context_hash text not null check (
    profile_context_hash ~ '^[0-9a-f]{64}$'
  ),
  candidate_count integer not null check (candidate_count >= 0),
  eligible_count integer not null check (
    eligible_count >= 0
    and eligible_count <= candidate_count
  ),
  selected_count integer not null check (
    selected_count >= 0
    and selected_count <= eligible_count
  ),
  lane_counts jsonb not null default '{}'::jsonb check (
    jsonb_typeof(lane_counts) = 'object'
  ),
  target_counts jsonb not null default '{}'::jsonb check (
    jsonb_typeof(target_counts) = 'object'
  ),
  exclusion_counts jsonb not null default '{}'::jsonb check (
    jsonb_typeof(exclusion_counts) = 'object'
  ),
  created_at timestamptz not null default now(),
  foreign key (profile_id, user_id)
    references public.candidate_profiles(id, user_id)
    on delete cascade,
  check (completed_at >= started_at)
);

comment on table public.job_scan_runs is
  'Append-only job scan metadata and aggregate selection diagnostics.';
comment on column public.job_scan_runs.lane_counts is
  'Per-lane candidate, eligible, selected, and cutoff counts captured by the matcher.';
comment on column public.job_scan_runs.target_counts is
  'Per-target candidate, eligible, selected, and cutoff counts captured by the matcher.';
comment on column public.job_scan_runs.exclusion_counts is
  'Aggregate matcher exclusion reasons for candidates that did not pass the decision gate.';

create index if not exists job_scan_runs_user_started_idx
  on public.job_scan_runs(user_id, started_at desc);

create index if not exists job_scan_runs_profile_started_idx
  on public.job_scan_runs(profile_id, started_at desc);

create table if not exists public.job_scan_run_results (
  id uuid primary key default gen_random_uuid(),
  scan_run_id uuid not null references public.job_scan_runs(id) on delete cascade,
  job_id uuid not null,
  disposition text not null check (disposition in ('selected', 'cutoff')),
  candidate_rank integer not null check (candidate_rank > 0),
  selected_rank integer check (selected_rank is null or selected_rank > 0),
  score integer not null check (score between 0 and 100),
  lane text not null check (btrim(lane) <> ''),
  target_title text not null check (btrim(target_title) <> ''),
  match_tier text not null check (match_tier in ('exact', 'core', 'stretch')),
  cutoff_reason text check (
    cutoff_reason is null
    or btrim(cutoff_reason) <> ''
  ),
  created_at timestamptz not null default now(),
  unique (scan_run_id, job_id),
  unique (scan_run_id, candidate_rank),
  check (
    (disposition = 'selected' and selected_rank is not null and cutoff_reason is null)
    or
    (disposition = 'cutoff' and selected_rank is null and cutoff_reason is not null)
  )
);

comment on table public.job_scan_run_results is
  'Append-only per-candidate ranking decisions for a job scan run. job_id is intentionally a historical identifier without a jobs foreign key.';

create unique index if not exists job_scan_run_results_selected_rank_idx
  on public.job_scan_run_results(scan_run_id, selected_rank)
  where selected_rank is not null;

create index if not exists job_scan_run_results_scan_lane_idx
  on public.job_scan_run_results(scan_run_id, lane, candidate_rank);

alter table public.job_scan_runs enable row level security;
alter table public.job_scan_run_results enable row level security;

revoke all on table public.job_scan_runs
  from public, anon, authenticated, service_role;
revoke all on table public.job_scan_run_results
  from public, anon, authenticated, service_role;

grant select on table public.job_scan_runs to authenticated;
grant select on table public.job_scan_run_results to authenticated;
grant select, insert on table public.job_scan_runs to service_role;
grant select, insert on table public.job_scan_run_results to service_role;

drop policy if exists job_scan_runs_owner_read on public.job_scan_runs;
create policy job_scan_runs_owner_read
  on public.job_scan_runs
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists job_scan_run_results_owner_read on public.job_scan_run_results;
create policy job_scan_run_results_owner_read
  on public.job_scan_run_results
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.job_scan_runs run
      where run.id = scan_run_id
        and run.user_id = auth.uid()
    )
  );

create or replace function public.finalize_public_job_scan(
  p_run jsonb,
  p_results jsonb,
  p_selected jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run_id uuid := gen_random_uuid();
  v_expected_results integer;
begin
  if jsonb_typeof(p_run) <> 'object'
    or jsonb_typeof(p_results) <> 'array'
    or jsonb_typeof(p_selected) <> 'array'
  then
    raise exception 'invalid job scan diagnostics payload';
  end if;

  v_expected_results := (p_run ->> 'eligible_count')::integer;
  if jsonb_array_length(p_results) <> v_expected_results then
    raise exception 'job scan diagnostics result count mismatch';
  end if;
  if jsonb_array_length(p_selected) <> (p_run ->> 'selected_count')::integer then
    raise exception 'job scan selected result count mismatch';
  end if;

  -- Recommendation replacement and immutable diagnostics are one transaction.
  -- A failed diagnostics write cannot leave a newly-mutated active result set
  -- without a corresponding scan-run record.
  insert into public.job_scan_results (
    user_id,
    profile_id,
    job_id,
    status,
    scan_context,
    first_seen_at,
    last_seen_at,
    created_at,
    updated_at
  )
  select
    (p_run ->> 'user_id')::uuid,
    (p_run ->> 'profile_id')::uuid,
    selected.job_id,
    'active',
    coalesce(p_run -> 'scan_context', '{}'::jsonb) || jsonb_build_object(
      'scanRunId', v_run_id,
      'matcherVersion', p_run ->> 'matcher_version'
    ),
    (p_run ->> 'started_at')::timestamptz,
    (p_run ->> 'started_at')::timestamptz,
    (p_run ->> 'started_at')::timestamptz,
    (p_run ->> 'started_at')::timestamptz
  from jsonb_to_recordset(p_selected) as selected(job_id uuid)
  on conflict (user_id, job_id) do update
  set
    profile_id = excluded.profile_id,
    status = 'active',
    scan_context = excluded.scan_context,
    last_seen_at = excluded.last_seen_at,
    updated_at = excluded.updated_at;

  update public.job_scan_results
  set
    status = 'expired',
    updated_at = (p_run ->> 'started_at')::timestamptz
  where user_id = (p_run ->> 'user_id')::uuid
    and status = 'active'
    and job_id not in (
      select selected.job_id
      from jsonb_to_recordset(p_selected) as selected(job_id uuid)
    );

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
    target_counts,
    exclusion_counts
  ) values (
    v_run_id,
    (p_run ->> 'user_id')::uuid,
    (p_run ->> 'profile_id')::uuid,
    (p_run ->> 'started_at')::timestamptz,
    (p_run ->> 'completed_at')::timestamptz,
    p_run ->> 'matcher_version',
    nullif(p_run ->> 'source_commit_sha', ''),
    nullif(p_run ->> 'deployment_id', ''),
    p_run ->> 'profile_context_hash',
    (p_run ->> 'candidate_count')::integer,
    v_expected_results,
    (p_run ->> 'selected_count')::integer,
    coalesce(p_run -> 'lane_counts', '{}'::jsonb),
    coalesce(p_run -> 'target_counts', '{}'::jsonb),
    coalesce(p_run -> 'exclusion_counts', '{}'::jsonb)
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
  )
  select
    v_run_id,
    result.job_id,
    result.disposition,
    result.candidate_rank,
    result.selected_rank,
    result.score,
    result.lane,
    result.target_title,
    result.match_tier,
    result.cutoff_reason
  from jsonb_to_recordset(p_results) as result(
    job_id uuid,
    disposition text,
    candidate_rank integer,
    selected_rank integer,
    score integer,
    lane text,
    target_title text,
    match_tier text,
    cutoff_reason text
  );

  return v_run_id;
end;
$$;

revoke all on function public.finalize_public_job_scan(jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.finalize_public_job_scan(jsonb, jsonb, jsonb)
  to service_role;
